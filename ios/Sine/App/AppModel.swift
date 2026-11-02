import Foundation
import Observation

/// Shared app state: auth, API, player, liked-song flags and the current album tint.
@MainActor
@Observable
final class AppModel {
    let auth = SpotifyAuth()
    let api: SpotifyAPI
    let player: PlayerModel
    let tint = ArtworkTint()

    private(set) var saved: [String: Bool] = [:]
    var error: String?
    var showNowPlaying = false

    init() {
        api = SpotifyAPI(auth: auth)
        player = PlayerModel(api: api)
    }

    var canLike: Bool { auth.isSignedIn && !auth.missingScopes }

    func signIn() async {
        do {
            try await auth.signIn()
            player.startPolling()
        } catch AuthError.cancelled {
        } catch {
            self.error = error.localizedDescription
        }
    }

    func signOut() {
        player.stopPolling()
        auth.signOut()
        saved = [:]
    }

    /// Fetches liked status for tracks we haven't checked yet.
    func checkSaved(_ tracks: [Track]) async {
        guard canLike else { return }
        var seen = Set<String>()
        let unknown = tracks.filter { saved[$0.uri] == nil && seen.insert($0.uri).inserted }
        guard !unknown.isEmpty, let flags = try? await api.isSaved(unknown) else { return }
        for (track, flag) in zip(unknown, flags) { saved[track.uri] = flag }
    }

    func markSaved(_ tracks: [Track]) {
        for track in tracks { saved[track.uri] = true }
    }

    func toggleSaved(_ track: Track) async {
        let next = !(saved[track.uri] ?? false)
        saved[track.uri] = next
        do {
            try await api.setSaved(track, next)
        } catch {
            saved[track.uri] = !next
            self.error = error.localizedDescription
        }
    }
}
