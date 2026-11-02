# Sine

A web music player that streams from your **Spotify** account using the Web Playback SDK.

```bash
cp .env.example .env.local   # add your Spotify Client ID
npm install
npm run dev                  # http://127.0.0.1:5173 (use the IP, not localhost)
```

## Spotify
1. Create an app at <https://developer.spotify.com/dashboard>, enable **Web API** and **Web Playback SDK**.
2. Add `http://127.0.0.1:5173/` as a Redirect URI.
3. Put the Client ID in `.env.local` as `VITE_SPOTIFY_CLIENT_ID`.

Requires Spotify Premium. Development-mode apps allow up to 5 test users, search returns at most 10 results per page, and track lists only load for playlists you own or collaborate on (the playlist **Play** button streams any playlist).

## Layout
- `src/types.ts` – the `MusicProvider` interface (lets another service be added later)
- `src/providers/spotify.ts` – PKCE auth, Web API, Web Playback SDK
- `src/App.tsx` – UI (search, liked songs, playlists, player bar)
