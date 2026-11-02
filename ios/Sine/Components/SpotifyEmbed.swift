import SwiftUI
import WebKit

/// Spotify's official embedded player, used for followed playlists whose track lists the API won't share.
struct SpotifyEmbed: UIViewRepresentable {
    let playlistID: String

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        let view = WKWebView(frame: .zero, configuration: config)
        view.isOpaque = false
        view.backgroundColor = .clear
        view.scrollView.backgroundColor = .clear
        view.load(URLRequest(url: URL(string: "https://open.spotify.com/embed/playlist/\(playlistID)?theme=0")!))
        return view
    }

    func updateUIView(_ view: WKWebView, context: Context) {}
}
