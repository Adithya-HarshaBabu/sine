import Foundation

/// Time-synced lyrics from LRCLIB (https://lrclib.net). Spotify's API doesn't expose lyrics.
struct Lyrics {
    struct Line: Hashable {
        let timeMs: Int
        let text: String
    }
    let synced: [Line]?
    let plain: String?
    let instrumental: Bool
}

@MainActor
enum LyricsService {
    private struct Record: Decodable {
        let duration: Double
        let instrumental: Bool
        let plainLyrics: String?
        let syncedLyrics: String?
    }

    private static var cache: [String: Lyrics?] = [:]

    static func lyrics(for track: Track) async -> Lyrics? {
        if let cached = cache[track.uri] { return cached }
        let result = await lookup(track)
        cache[track.uri] = result
        return result
    }

    private static func lookup(_ track: Track) async -> Lyrics? {
        let artist = track.artist.components(separatedBy: ", ").first ?? track.artist
        let duration = track.durationMs / 1000
        if let record: Record = await fetch("get", [
            "artist_name": artist, "track_name": track.title, "album_name": track.album, "duration": "\(duration)",
        ]) {
            return convert(record)
        }
        guard let results: [Record] = await fetch("search", ["artist_name": artist, "track_name": cleanTitle(track.title)]) else {
            return nil
        }
        let close = results.filter { abs($0.duration - Double(duration)) <= 4 }
        guard let best = close.first(where: { $0.syncedLyrics != nil }) ?? close.first(where: { $0.plainLyrics != nil }) ?? close.first else {
            return nil
        }
        return convert(best)
    }

    private static func fetch<T: Decodable>(_ endpoint: String, _ params: [String: String]) async -> T? {
        var components = URLComponents(string: "https://lrclib.net/api/\(endpoint)")!
        components.queryItems = params.map { URLQueryItem(name: $0.key, value: $0.value) }
        var request = URLRequest(url: components.url!)
        request.setValue("Sine iOS", forHTTPHeaderField: "User-Agent")
        guard let (data, response) = try? await URLSession.shared.data(for: request),
              (response as? HTTPURLResponse)?.statusCode == 200 else { return nil }
        let decoder = JSONDecoder()
        return try? decoder.decode(T.self, from: data)
    }

    private static func convert(_ r: Record) -> Lyrics {
        Lyrics(synced: r.syncedLyrics.map(parse), plain: r.plainLyrics, instrumental: r.instrumental)
    }

    private static func parse(_ lrc: String) -> [Lyrics.Line] {
        let stamp = /\[(\d+):(\d+(?:\.\d+)?)\]/
        var lines: [Lyrics.Line] = []
        for raw in lrc.split(separator: "\n") {
            let text = raw.replacing(/\[[^\]]*\]/, with: "").trimmingCharacters(in: .whitespaces)
            for match in raw.matches(of: stamp) {
                let ms = (Double(match.1)! * 60 + Double(match.2)!) * 1000
                lines.append(.init(timeMs: Int(ms), text: text))
            }
        }
        return lines.sorted { $0.timeMs < $1.timeMs }
    }

    /// "Song - Remastered 2011" / "Song (feat. X)" → "Song"
    private static func cleanTitle(_ title: String) -> String {
        let base = title.components(separatedBy: " - ").first ?? title
        return base.replacing(/\s*[\(\[](feat|with|ft)\.?[^\)\]]*[\)\]]/.ignoresCase(), with: "")
            .trimmingCharacters(in: .whitespaces)
    }
}
