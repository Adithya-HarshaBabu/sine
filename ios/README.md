# Sine for iOS

A SwiftUI companion to the Sine web player. It browses your Spotify library and controls playback through
**Spotify Connect**: Spotify doesn't let third-party iPhone apps stream audio, so Sine plays on a Spotify
device (the Spotify app on the phone, Sine in a desktop browser, a speaker…).

## Run it
Open `Sine.xcodeproj` in Xcode and run on a simulator or your iPhone (pick your team under
Signing & Capabilities for a real device). From the command line:

```bash
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild -project Sine.xcodeproj -scheme Sine \
  -destination 'generic/platform=iOS Simulator' -derivedDataPath build CODE_SIGN_IDENTITY=- build
```

## How it fits together
- `App/Config.swift` – Spotify Client ID (shared with the web app), scopes, loopback port
- `Spotify/SpotifyAuth.swift` + `LoopbackServer.swift` – PKCE sign-in via ASWebAuthenticationSession. Spotify
  redirects to `http://127.0.0.1:43821/`; a tiny local server bounces that to `sine://callback`, which closes the
  sheet. Spotify ignores the port for loopback redirects, so the web app's `http://127.0.0.1:5173/` registration covers it.
- `Spotify/SpotifyAPI.swift` – Web API calls (February 2026 development-mode endpoints)
- `Player/PlayerModel.swift` – Connect playback state (polled), device choice and controls
- `Player/ArtworkTint.swift`, `Player/Lyrics.swift` – album-colour theming and LRCLIB synced lyrics
- `Features/` – Home, Search, Library, playlists, mini player, Now Playing, device picker
