import Foundation

enum Config {
    /// Same Spotify app as the web player. Client IDs aren't secret (PKCE needs no client secret).
    static let spotifyClientID = "ec55e1a63d84406aa4206319e543ffa7"

    /// Sign-in uses a loopback redirect (RFC 8252). Spotify matches loopback URIs on host and path but
    /// lets the port vary, so this lines up with the web app's registered `http://127.0.0.1:5173/`.
    static let loopbackPort: UInt16 = 43821
    static var redirectURI: String { "http://127.0.0.1:\(loopbackPort)/" }

    /// The loopback page bounces back into the app on this scheme so the sign-in sheet can close.
    static let callbackScheme = "sine"

    static let scopes = [
        "user-read-private",
        "user-read-playback-state",
        "user-modify-playback-state",
        "user-read-currently-playing",
        "user-library-read",
        "user-library-modify",
        "user-read-recently-played",
        "user-top-read",
        "playlist-read-private",
        "playlist-read-collaborative",
    ]
}
