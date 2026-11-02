# Sine

A Spotify music player with a sine-wave soul, for the web and iPhone.

- **[web/](web/)** – React + TypeScript (Vite). Streams in the browser with the Spotify Web Playback SDK.
- **[ios/](ios/)** – SwiftUI. Browses your library and plays through Spotify Connect.

Features: search as you type, Home (recently played, top artists), liked songs, playlists, an animated
sine-wave seek bar, album-colour theming, full-screen Now Playing, time-synced lyrics (via
[LRCLIB](https://lrclib.net)), Up next, shuffle/repeat and likes.

## Spotify setup
1. Create an app at <https://developer.spotify.com/dashboard> with **Web API** and **Web Playback SDK** enabled.
2. Add the redirect URIs:
   - `http://127.0.0.1:5173/` for local development (the iOS app uses this too)
   - your deployed URL, e.g. `https://sine.vercel.app/`
3. Development-mode apps work for the owner plus up to 5 users added under **User Management**.
   Browser playback needs Spotify Premium.

## Run locally
```bash
cd web
cp .env.example .env.local   # add VITE_SPOTIFY_CLIENT_ID
npm install
npm run dev                  # http://127.0.0.1:5173
```
For iOS, open `ios/Sine.xcodeproj` in Xcode (see [ios/README.md](ios/README.md)).

## Deploy
The web app deploys to Vercel: import the repo, set **Root Directory** to `web` (Vercel then detects
Vite), and add the `VITE_SPOTIFY_CLIENT_ID` environment variable.
