import Foundation
import Observation
import UIKit

enum RepeatMode: String {
    case off, context, track
    var next: RepeatMode { self == .off ? .context : self == .context ? .track : .off }
}

/// Mirrors Spotify Connect playback. Spotify doesn't let iOS apps stream audio themselves, so Sine
/// controls a Spotify device: the Spotify app on this phone, Sine in a desktop browser, a speaker…
@MainActor
@Observable
final class PlayerModel {
    private let api: SpotifyAPI

    private(set) var track: Track?
    private(set) var isPlaying = false
    private(set) var progressMs = 0
    private(set) var durationMs = 0
    private(set) var shuffle = false
    private(set) var repeatMode = RepeatMode.off
    private(set) var device: Device?
    private(set) var devices: [Device] = []
    /// When `progressMs` was read, so views can interpolate the playhead between polls.
    private(set) var updatedAt = Date()

    /// Set when playback needs a device and none is available; the UI shows the device picker.
    var needsDevice = false
    var error: String?

    /// Retried after the user picks a device or opens Spotify.
    private var pendingPlay: [String: Any]?
    private var polling: Task<Void, Never>?

    private var preferredDeviceName: String? {
        get { UserDefaults.standard.string(forKey: "preferredDevice") }
        set { UserDefaults.standard.set(newValue, forKey: "preferredDevice") }
    }

    init(api: SpotifyAPI) {
        self.api = api
    }

    func progress(at date: Date) -> Int {
        guard isPlaying else { return progressMs }
        return min(durationMs, progressMs + Int(date.timeIntervalSince(updatedAt) * 1000))
    }

    // MARK: Polling

    func startPolling() {
        guard polling == nil else { return }
        polling = Task { [weak self] in
            while !Task.isCancelled {
                await self?.refresh()
                let playing = self?.isPlaying ?? false
                try? await Task.sleep(for: .seconds(playing ? 2 : 4))
            }
        }
    }

    func stopPolling() {
        polling?.cancel()
        polling = nil
    }

    func refresh() async {
        do {
            guard let state = try await api.playerState() else {
                isPlaying = false
                device = nil
                return
            }
            if let item = state.item?.track { track = item }
            isPlaying = state.isPlaying
            progressMs = state.progressMs ?? 0
            durationMs = state.item?.durationMs ?? durationMs
            shuffle = state.shuffleState ?? false
            repeatMode = RepeatMode(rawValue: state.repeatState ?? "off") ?? .off
            device = state.device
            updatedAt = Date()
        } catch {
            // Polling errors are transient; actions surface their own errors.
        }
    }

    func loadDevices() async {
        devices = (try? await api.devices()) ?? []
    }

    // MARK: Playing

    func play(_ tracks: [Track], at index: Int, playlistID: String? = nil) async {
        if let playlistID {
            await start(["context_uri": "spotify:playlist:\(playlistID)", "offset": ["uri": tracks[index].uri]])
        } else {
            // The play endpoint takes at most 100 URIs; keep a window containing the chosen track.
            let begin = index < 100 ? 0 : index
            let window = tracks[begin..<min(begin + 100, tracks.count)].map(\.uri)
            await start(["uris": window, "offset": ["position": index - begin]])
        }
        if let chosen = tracks[safe: index] { optimistic(chosen) }
    }

    func playPlaylist(_ playlist: Playlist) async {
        await start(["context_uri": "spotify:playlist:\(playlist.id)"])
    }

    private func start(_ body: [String: Any]) async {
        error = nil
        do {
            guard let deviceID = try await targetDevice() else {
                pendingPlay = body
                needsDevice = true
                return
            }
            try await api.play(deviceID: deviceID, body: body)
            await refreshSoon()
        } catch {
            self.error = error.localizedDescription
        }
    }

    /// The device to play on: the active one, else the last one the user chose, else any available.
    private func targetDevice() async throws -> String? {
        if let device, device.isActive, let id = device.id { return id }
        await loadDevices()
        let pick = devices.first { $0.name == preferredDeviceName && $0.id != nil }
            ?? devices.first { $0.isActive && $0.id != nil }
            ?? (devices.count == 1 ? devices.first : nil)
        return pick?.id
    }

    func choose(_ device: Device) async {
        guard let id = device.id else { return }
        preferredDeviceName = device.name
        needsDevice = false
        do {
            if let body = pendingPlay {
                pendingPlay = nil
                try await api.play(deviceID: id, body: body)
            } else {
                try await api.transfer(to: id, play: isPlaying)
            }
            await refreshSoon()
        } catch {
            self.error = error.localizedDescription
        }
    }

    /// Opens the Spotify app so this phone shows up as a Connect device.
    func openSpotifyApp() {
        UIApplication.shared.open(URL(string: "spotify:")!) { opened in
            if !opened {
                Task { @MainActor in
                    self.error = "The Spotify app isn't installed. Install it, or open Sine in a desktop browser to play there."
                }
            }
        }
    }

    // MARK: Controls

    func togglePlay() async {
        if track == nil, device == nil { return }
        isPlaying.toggle()
        updatedAt = Date()
        await run(isPlaying ? "play" : "pause")
    }

    func next() async { await run("next", method: "POST") }
    func previous() async { await run("previous", method: "POST") }

    func seek(to ms: Int) async {
        progressMs = ms
        updatedAt = Date()
        await run("seek", query: ["position_ms": "\(ms)"])
    }

    func toggleShuffle() async {
        shuffle.toggle()
        await run("shuffle", query: ["state": "\(shuffle)"])
    }

    func cycleRepeat() async {
        repeatMode = repeatMode.next
        await run("repeat", query: ["state": repeatMode.rawValue])
    }

    func setVolume(_ percent: Int) async {
        await run("volume", query: ["volume_percent": "\(percent)"])
    }

    func queue() async -> [Track] {
        (try? await api.queue()) ?? []
    }

    private func run(_ path: String, method: String = "PUT", query: [String: String] = [:]) async {
        do {
            var query = query
            if let id = device?.id { query["device_id"] = id }
            try await api.command(path, method: method, query: query)
            await refreshSoon()
        } catch let apiError as APIError where apiError.status == 404 {
            needsDevice = true
            await loadDevices()
        } catch {
            self.error = error.localizedDescription
            await refresh()
        }
    }

    private func refreshSoon() async {
        try? await Task.sleep(for: .milliseconds(400))
        await refresh()
    }

    private func optimistic(_ chosen: Track) {
        track = chosen
        durationMs = chosen.durationMs
        progressMs = 0
        isPlaying = true
        updatedAt = Date()
    }
}

extension Array {
    subscript(safe index: Int) -> Element? { indices.contains(index) ? self[index] : nil }
}
