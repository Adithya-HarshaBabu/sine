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

## Assistant
Describe a playlist in chat and Sine proposes one using Google Gemini, matches the songs on Spotify, and creates it as a private playlist once you confirm. `api/assistant.ts` is a Vercel function that keeps the API key on the server.

1. Create a free key in [Google AI Studio](https://aistudio.google.com) and add it to the Vercel project's environment variables as `GEMINI_API_KEY`, then redeploy. Don't enable billing on the project if you want to stay on the free tier.
2. Optionally set `ASSISTANT_ALLOWED_USERS` to a comma-separated list of Spotify user IDs. Any valid Spotify sign-in can use the assistant without it. Everyone shares one free quota, shown in AI Studio.
3. To run it locally, use `vercel dev --listen 127.0.0.1:5173` with the key in `.env.local`. `npm run dev` doesn't serve `api/`.

The free tier has conditions. Google may use chats to improve its products and people may review them, so the app warns users not to share personal details. Google's terms also allow only paid services for apps available to users in the EEA, UK or Switzerland, and describe the API as being for professional or business use.

## Layout
- `src/types.ts` – the `MusicProvider` interface (lets another service be added later)
- `src/providers/spotify.ts` – PKCE auth, Web API, Web Playback SDK
- `src/App.tsx` – UI (search, liked songs, playlists, player bar)
