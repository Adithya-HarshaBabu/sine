import Foundation

// MARK: - App models

struct Track: Identifiable, Hashable {
    var id: String { uri }
    let uri: String
    let title: String
    let artist: String
    let album: String
    let artworkURL: URL?
    let durationMs: Int
}

struct Playlist: Identifiable, Hashable {
    let id: String
    let name: String
    let artworkURL: URL?
    let count: Int?
    /// Spotify only lists tracks for playlists you own or collaborate on (development-mode rule).
    let readable: Bool
}

struct Artist: Identifiable, Hashable {
    let id: String
    let name: String
    let imageURL: URL?
}

struct Device: Identifiable, Hashable, Decodable {
    let id: String?
    let name: String
    let type: String
    let isActive: Bool
    let volumePercent: Int?

    var symbol: String {
        switch type.lowercased() {
        case "smartphone": "iphone"
        case "computer": "laptopcomputer"
        case "speaker": "hifispeaker"
        case "tv": "tv"
        case "tablet": "ipad"
        default: "speaker.wave.2"
        }
    }
}

struct Page<T> {
    var items: [T]
    var total: Int
}

// MARK: - Web API payloads

struct APIImage: Decodable { let url: URL }
struct APINamed: Decodable { let name: String }
struct APIAlbum: Decodable {
    let name: String
    let images: [APIImage]?
}

struct APITrack: Decodable {
    let uri: String
    let name: String
    let type: String?
    let durationMs: Int
    let artists: [APINamed]
    let album: APIAlbum?

    /// Episodes and local files lack album art; skip them.
    var track: Track? {
        guard (type ?? "track") == "track", let album else { return nil }
        return Track(
            uri: uri,
            title: name,
            artist: artists.map(\.name).joined(separator: ", "),
            album: album.name,
            artworkURL: album.images?.first?.url,
            durationMs: durationMs
        )
    }
}

struct APIPlaylist: Decodable {
    struct Owner: Decodable { let id: String }
    struct Count: Decodable { let total: Int }
    let id: String
    let name: String
    let collaborative: Bool
    let owner: Owner
    let images: [APIImage]?
    let items: Count?
    let tracks: Count?
}

struct APIPlayerState: Decodable {
    struct Context: Decodable { let uri: String }
    let device: Device?
    let progressMs: Int?
    let isPlaying: Bool
    let item: APITrack?
    let shuffleState: Bool?
    let repeatState: String?
    let context: Context?
}
