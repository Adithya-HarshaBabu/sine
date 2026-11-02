import Foundation

struct APIError: LocalizedError {
    let status: Int
    let message: String
    var errorDescription: String? { message }
}

/// Thin async wrapper over the Spotify Web API (with the February 2026 development-mode endpoints).
@MainActor
final class SpotifyAPI {
    private let auth: SpotifyAuth
    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        return d
    }()
    private var userID: String?

    init(auth: SpotifyAuth) {
        self.auth = auth
    }

    // MARK: Core

    @discardableResult
    private func raw(_ path: String, method: String = "GET", query: [String: String] = [:], body: [String: Any]? = nil) async throws -> Data? {
        var components = URLComponents(string: "https://api.spotify.com/v1\(path)")!
        if !query.isEmpty {
            components.queryItems = (components.queryItems ?? []) + query.map { URLQueryItem(name: $0.key, value: $0.value) }
        }
        var request = URLRequest(url: components.url!)
        request.httpMethod = method
        request.setValue("Bearer \(try await auth.accessToken())", forHTTPHeaderField: "Authorization")
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        } else if method != "GET" {
            request.setValue("0", forHTTPHeaderField: "Content-Length")
        }
        let (data, response) = try await URLSession.shared.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
            let message = (json?["error"] as? [String: Any])?["message"] as? String ?? "Spotify error \(status)"
            throw APIError(status: status, message: message)
        }
        // 204/202 and some player endpoints (shuffle, repeat) reply with no or non-JSON bodies.
        return data.isEmpty ? nil : data
    }

    private func get<T: Decodable>(_ type: T.Type, _ path: String, query: [String: String] = [:]) async throws -> T {
        guard let data = try await raw(path, query: query) else {
            throw APIError(status: 204, message: "Spotify returned no data")
        }
        return try decoder.decode(T.self, from: data)
    }

    // MARK: Library & browsing

    func myID() async throws -> String {
        if let userID { return userID }
        struct Me: Decodable { let id: String }
        let id = try await get(Me.self, "/me").id
        userID = id
        return id
    }

    func search(_ query: String) async throws -> [Track] {
        struct Result: Decodable {
            struct Tracks: Decodable { let items: [APITrack?] }
            let tracks: Tracks
        }
        // Development mode caps search at 10 per request, so fetch two pages and drop repeats.
        async let first = get(Result.self, "/search", query: ["q": query, "type": "track", "limit": "10", "offset": "0"])
        async let second = get(Result.self, "/search", query: ["q": query, "type": "track", "limit": "10", "offset": "10"])
        var seen = Set<String>()
        return try await (first.tracks.items + second.tracks.items)
            .compactMap { $0?.track }
            .filter { seen.insert($0.uri).inserted }
    }

    func playlists() async throws -> [Playlist] {
        struct Result: Decodable { let items: [APIPlaylist?] }
        async let result = get(Result.self, "/me/playlists", query: ["limit": "50"])
        async let me = myID()
        let (list, id) = try await (result, me)
        return list.items.compactMap { $0 }.map { p in
            Playlist(
                id: p.id,
                name: p.name,
                artworkURL: p.images?.first?.url,
                count: p.items?.total ?? p.tracks?.total,
                readable: p.owner.id == id || p.collaborative
            )
        }
    }

    func playlistTracks(_ id: String, offset: Int) async throws -> Page<Track> {
        struct Result: Decodable {
            struct Item: Decodable {
                let item: APITrack?
                let track: APITrack?
            }
            let total: Int
            let items: [Item]
        }
        let r = try await get(Result.self, "/playlists/\(id)/items", query: ["limit": "100", "offset": "\(offset)"])
        return Page(items: r.items.compactMap { ($0.item ?? $0.track)?.track }, total: r.total)
    }

    func savedTracks(offset: Int) async throws -> Page<Track> {
        struct Result: Decodable {
            struct Item: Decodable { let track: APITrack }
            let total: Int
            let items: [Item]
        }
        let r = try await get(Result.self, "/me/tracks", query: ["limit": "50", "offset": "\(offset)"])
        return Page(items: r.items.compactMap { $0.track.track }, total: r.total)
    }

    func recentlyPlayed() async throws -> [Track] {
        struct Result: Decodable {
            struct Item: Decodable { let track: APITrack }
            let items: [Item]
        }
        var seen = Set<String>()
        return try await get(Result.self, "/me/player/recently-played", query: ["limit": "30"]).items
            .compactMap { $0.track.track }
            .filter { seen.insert($0.uri).inserted }
            .prefix(12)
            .map { $0 }
    }

    func topArtists() async throws -> [Artist] {
        struct Result: Decodable {
            struct Item: Decodable {
                let id: String
                let name: String
                let images: [APIImage]?
            }
            let items: [Item]
        }
        return try await get(Result.self, "/me/top/artists", query: ["limit": "12", "time_range": "short_term"]).items
            .map { Artist(id: $0.id, name: $0.name, imageURL: $0.images?.first?.url) }
    }

    func isSaved(_ tracks: [Track]) async throws -> [Bool] {
        var result: [Bool] = []
        // The library endpoint checks at most 40 URIs at a time.
        for start in stride(from: 0, to: tracks.count, by: 40) {
            let uris = tracks[start..<min(start + 40, tracks.count)].map(\.uri).joined(separator: ",")
            result += try await get([Bool].self, "/me/library/contains", query: ["uris": uris])
        }
        return result
    }

    func setSaved(_ track: Track, _ saved: Bool) async throws {
        try await raw("/me/library", method: saved ? "PUT" : "DELETE", query: ["uris": track.uri])
    }

    // MARK: Player (Spotify Connect)

    func playerState() async throws -> APIPlayerState? {
        guard let data = try await raw("/me/player") else { return nil }
        return try decoder.decode(APIPlayerState.self, from: data)
    }

    func devices() async throws -> [Device] {
        struct Result: Decodable { let devices: [Device] }
        return try await get(Result.self, "/me/player/devices").devices
    }

    func queue() async throws -> [Track] {
        struct Result: Decodable { let queue: [APITrack?] }
        return try await get(Result.self, "/me/player/queue").queue.compactMap { $0?.track }
    }

    func play(deviceID: String, body: [String: Any]) async throws {
        try await raw("/me/player/play", method: "PUT", query: ["device_id": deviceID], body: body)
    }

    func transfer(to deviceID: String, play: Bool) async throws {
        try await raw("/me/player", method: "PUT", body: ["device_ids": [deviceID], "play": play])
    }

    func command(_ path: String, method: String = "PUT", query: [String: String] = [:]) async throws {
        try await raw("/me/player/\(path)", method: method, query: query)
    }
}
