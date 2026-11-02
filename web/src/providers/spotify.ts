import { createEmitter } from './emitter'
import { emptyState, type Artist, type MusicProvider, type PlaybackState, type Playlist, type RepeatMode, type Track } from '../types'

const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID as string | undefined
const REDIRECT_URI = (import.meta.env.VITE_SPOTIFY_REDIRECT_URI as string | undefined) ?? `${location.origin}/`
const SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-library-read',
  'user-library-modify',
  'user-read-recently-played',
  'user-top-read',
  'playlist-read-private',
  'playlist-read-collaborative',
].join(' ')
const API = 'https://api.spotify.com/v1'
const TOKEN_KEY = 'spotify.token'
const VERIFIER_KEY = 'spotify.verifier'
const STATE_KEY = 'spotify.state'

interface Token {
  access_token: string
  refresh_token: string
  expires_at: number
  /** Space-separated scopes Spotify actually granted. */
  scope?: string
}

const states = createEmitter<PlaybackState>()
const errors = createEmitter<string>()
// Dev-only: lets the UI be previewed with a fake playback state in browsers that can't stream.
if (import.meta.env.DEV) Object.assign(window, { __sineEmitState: states.emit })
let player: Spotify.Player | null = null
let deviceId: Promise<string> | null = null
let pollTimer: number | undefined
let restoring: Promise<boolean> | null = null
let refreshing: Promise<Token> | null = null
let userId: Promise<string> | null = null

// ---------- auth (Authorization Code + PKCE, no backend needed) ----------

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const randomString = () => b64url(crypto.getRandomValues(new Uint8Array(48)))

function loadToken(): Token | null {
  try {
    return JSON.parse(localStorage.getItem(TOKEN_KEY) ?? 'null')
  } catch {
    return null
  }
}

async function tokenRequest(params: Record<string, string>, previous?: Token): Promise<Token> {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID!, ...params }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(`Spotify sign-in failed: ${body.error_description ?? body.error}`)
  const token: Token = {
    access_token: body.access_token,
    refresh_token: body.refresh_token ?? previous?.refresh_token,
    expires_at: Date.now() + body.expires_in * 1000,
    scope: body.scope ?? previous?.scope,
  }
  localStorage.setItem(TOKEN_KEY, JSON.stringify(token))
  return token
}

async function accessToken(): Promise<string> {
  const token = loadToken()
  if (!token) throw new Error('Not signed in to Spotify')
  if (token.expires_at - 60_000 > Date.now()) return token.access_token
  refreshing ??= tokenRequest({ grant_type: 'refresh_token', refresh_token: token.refresh_token }, token).finally(
    () => (refreshing = null),
  )
  return (await refreshing).access_token
}

async function finishRedirect(): Promise<void> {
  const params = new URLSearchParams(location.search)
  const code = params.get('code')
  const error = params.get('error')
  if (!code && !error) return
  history.replaceState(null, '', location.pathname)
  if (error) throw new Error(`Spotify sign-in was cancelled (${error})`)
  if (params.get('state') !== sessionStorage.getItem(STATE_KEY)) throw new Error('Spotify sign-in state mismatch')
  await tokenRequest({
    grant_type: 'authorization_code',
    code: code!,
    redirect_uri: REDIRECT_URI,
    code_verifier: sessionStorage.getItem(VERIFIER_KEY) ?? '',
  })
  sessionStorage.removeItem(STATE_KEY)
  sessionStorage.removeItem(VERIFIER_KEY)
}

// ---------- Web API ----------

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json', ...init.headers },
  })
  if (res.status === 204 || res.status === 202) return undefined as T
  // Some player endpoints (shuffle, repeat) reply 200 with a plain-text id instead of JSON.
  const text = await res.text()
  let body
  try {
    body = text ? JSON.parse(text) : undefined
  } catch {
    body = undefined
  }
  if (!res.ok) {
    const err = new Error(body?.error?.message ?? `Spotify API error ${res.status}`) as Error & { status: number }
    err.status = res.status
    throw err
  }
  return body as T
}

interface ApiTrack {
  id: string
  uri: string
  name: string
  type?: string
  duration_ms: number
  artists: { name: string }[]
  album: { name: string; images: { url: string }[] }
}

const toTrack = (t: ApiTrack | Spotify.Track): Track => ({
  id: t.id ?? t.uri,
  uri: t.uri,
  title: t.name,
  artist: t.artists.map((a) => a.name).join(', '),
  album: t.album.name,
  artwork: t.album.images[0]?.url,
  durationMs: t.duration_ms,
  provider: 'spotify',
})

// ---------- Web Playback SDK (turns this browser tab into a Spotify Connect device) ----------

function loadSdk(): Promise<void> {
  if (window.Spotify) return Promise.resolve()
  return new Promise((resolve) => {
    window.onSpotifyWebPlaybackSDKReady = () => resolve()
    const script = document.createElement('script')
    script.src = 'https://sdk.scdn.co/spotify-player.js'
    document.body.append(script)
  })
}

// Spotify streams are DRM-protected; browsers without Widevine (e.g. some embedded webviews) can't play them.
async function hasWidevine(): Promise<boolean> {
  try {
    await navigator.requestMediaKeySystemAccess('com.widevine.alpha', [
      { initDataTypes: ['cenc'], audioCapabilities: [{ contentType: 'audio/mp4; codecs="mp4a.40.2"' }] },
    ])
    return true
  } catch {
    return false
  }
}

function emitState(s: Spotify.PlaybackState | null) {
  const current = s?.track_window.current_track
  states.emit(
    s && current
      ? {
          track: toTrack(current),
          isPlaying: !s.paused,
          positionMs: s.position,
          durationMs: s.duration,
          shuffle: s.shuffle,
          repeat: (['off', 'context', 'track'] as const)[s.repeat_mode] ?? 'off',
          updatedAt: Date.now(),
        }
      : emptyState,
  )
  // The SDK only fires on changes, so poll while playing to keep the clock honest after seeks/drift.
  clearInterval(pollTimer)
  if (s && !s.paused) pollTimer = window.setInterval(() => player?.getCurrentState().then(emitState), 5000)
}

async function startPlayer(): Promise<void> {
  if (player) return
  await loadSdk()
  player = new Spotify.Player({
    name: 'Sine (web)',
    getOAuthToken: (cb) => void accessToken().then(cb, (e) => errors.emit(e.message)),
    volume: 0.7,
  })
  deviceId = new Promise((resolve) => player!.addListener('ready', ({ device_id }) => resolve(device_id)))
  player.addListener('not_ready', () => errors.emit('Spotify player went offline. Reconnecting…'))
  player.addListener('player_state_changed', emitState)
  player.addListener('initialization_error', async ({ message }) =>
    errors.emit(
      (await hasWidevine())
        ? `Spotify player failed to start: ${message}`
        : "This browser can't stream Spotify (it lacks Widevine DRM). Open the app in Chrome, Edge or Firefox to play music.",
    ),
  )
  player.addListener('authentication_error', ({ message }) => errors.emit(`Spotify auth error: ${message}`))
  player.addListener('account_error', () => errors.emit('Spotify playback in the browser requires a Premium account.'))
  player.addListener('playback_error', ({ message }) => errors.emit(`Spotify playback error: ${message}`))
  await player.connect()
}

async function readyDevice(): Promise<string> {
  await startPlayer()
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Spotify player did not become ready. Is your account Premium?')), 10_000),
  )
  return Promise.race([deviceId!, timeout])
}

const myId = () => (userId ??= api<{ id: string }>('/me').then((me) => me.id))

async function startPlayback(body: object): Promise<void> {
  const id = await readyDevice()
  await player!.activateElement() // satisfies browser autoplay rules; we're inside a click handler
  // A freshly registered device can 404 for a moment before Spotify's backend sees it.
  for (let attempt = 0; ; attempt++) {
    try {
      return await api(`/me/player/play?device_id=${id}`, { method: 'PUT', body: JSON.stringify(body) })
    } catch (e) {
      if ((e as { status?: number }).status !== 404 || attempt >= 2) throw e
      await new Promise((r) => setTimeout(r, 1000))
    }
  }
}

// ---------- provider ----------

export const spotify: MusicProvider = {
  id: 'spotify',
  name: 'Spotify',
  configured: Boolean(CLIENT_ID),

  restore() {
    restoring ??= (async () => {
      if (!CLIENT_ID) return false
      await finishRedirect()
      if (!loadToken()) return false
      await startPlayer()
      return true
    })()
    return restoring
  },

  async connect() {
    const verifier = randomString()
    const state = randomString()
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)))
    sessionStorage.setItem(VERIFIER_KEY, verifier)
    sessionStorage.setItem(STATE_KEY, state)
    const params = new URLSearchParams({
      client_id: CLIENT_ID!,
      response_type: 'code',
      redirect_uri: REDIRECT_URI,
      code_challenge_method: 'S256',
      code_challenge: b64url(digest),
      scope: SCOPES,
      state,
    })
    location.assign(`https://accounts.spotify.com/authorize?${params}`)
  },

  async disconnect() {
    clearInterval(pollTimer)
    player?.disconnect()
    player = null
    deviceId = null
    restoring = null
    userId = null
    localStorage.removeItem(TOKEN_KEY)
    states.emit(emptyState)
  },

  async search(query) {
    // Development-mode apps are capped at 10 results per request, so fetch two pages.
    const pages = await Promise.all(
      [0, 10].map((offset) =>
        api<{ tracks: { items: ApiTrack[] } }>(
          `/search?${new URLSearchParams({ q: query, type: 'track', limit: '10', offset: String(offset) })}`,
        ),
      ),
    )
    // Spotify's pages can overlap, so drop repeats.
    const seen = new Set<string>()
    return pages
      .flatMap((p) => p.tracks.items)
      .filter((t) => t && !seen.has(t.uri) && seen.add(t.uri))
      .map(toTrack)
  },

  async playlists() {
    const [res, me] = await Promise.all([
      api<{
        items: {
          id: string
          name: string
          collaborative: boolean
          owner: { id: string }
          images: { url: string }[] | null
          items?: { total: number }
          tracks?: { total: number }
        }[]
      }>('/me/playlists?limit=50'),
      myId(),
    ])
    return res.items.filter(Boolean).map<Playlist>((p) => ({
      id: p.id,
      name: p.name,
      artwork: p.images?.at(-1)?.url ?? p.images?.[0]?.url,
      count: p.items?.total ?? p.tracks?.total,
      readable: p.owner.id === me || p.collaborative,
    }))
  },

  async playlistTracks(id, offset) {
    try {
      const res = await api<{ total: number; items: { item?: ApiTrack | null; track?: ApiTrack | null }[] }>(
        `/playlists/${id}/items?limit=100&offset=${offset}`,
      )
      const tracks = res.items
        .map((i) => i.item ?? i.track)
        .filter((t): t is ApiTrack => Boolean(t && (t.type ?? 'track') === 'track' && t.album))
        .map(toTrack)
      return { tracks, total: res.total }
    } catch (e) {
      if ((e as { status?: number }).status === 403)
        throw new Error("Spotify only lists tracks for playlists you own or collaborate on. Use Play to stream it anyway.")
      throw e
    }
  },

  async savedTracks(offset) {
    const res = await api<{ total: number; items: { track: ApiTrack }[] }>(`/me/tracks?limit=50&offset=${offset}`)
    return { tracks: res.items.map((i) => toTrack(i.track)), total: res.total }
  },

  async play(tracks, index, playlistId) {
    if (playlistId)
      return startPlayback({ context_uri: `spotify:playlist:${playlistId}`, offset: { uri: tracks[index].uri } })
    // The play endpoint accepts at most 100 URIs; keep a window that contains the chosen track.
    const start = index < 100 ? 0 : index
    await startPlayback({ uris: tracks.slice(start, start + 100).map((t) => t.uri), offset: { position: index - start } })
  },

  async playPlaylist(id) {
    await startPlayback({ context_uri: `spotify:playlist:${id}` })
  },

  needsReconnect() {
    const token = loadToken()
    if (!token) return false
    const granted = new Set((token.scope ?? '').split(' '))
    return SCOPES.split(' ').some((s) => !granted.has(s))
  },

  async home() {
    const [recent, top] = await Promise.all([
      api<{ items: { track: ApiTrack }[] }>('/me/player/recently-played?limit=30'),
      api<{ items: { id: string; name: string; images?: { url: string }[] }[] }>(
        '/me/top/artists?limit=12&time_range=short_term',
      ),
    ])
    const seen = new Set<string>()
    return {
      recent: recent.items
        .map((i) => i.track)
        .filter((t) => t && !seen.has(t.uri) && seen.add(t.uri))
        .slice(0, 12)
        .map(toTrack),
      topArtists: top.items.map<Artist>((a) => ({ id: a.id, name: a.name, image: a.images?.[0]?.url })),
    }
  },

  async isSaved(tracks) {
    // The library endpoint checks at most 40 URIs per request.
    const chunks: Track[][] = []
    for (let i = 0; i < tracks.length; i += 40) chunks.push(tracks.slice(i, i + 40))
    const results = await Promise.all(
      chunks.map((c) => api<boolean[]>(`/me/library/contains?uris=${c.map((t) => t.uri).join(',')}`)),
    )
    return results.flat()
  },

  async setSaved(track, saved) {
    await api(`/me/library?uris=${track.uri}`, { method: saved ? 'PUT' : 'DELETE' })
  },

  async queue() {
    const res = await api<{ queue: (ApiTrack | null)[] } | undefined>('/me/player/queue')
    return (res?.queue ?? [])
      .filter((t): t is ApiTrack => Boolean(t && (t.type ?? 'track') === 'track' && t.album))
      .map(toTrack)
  },

  playlistEmbedUrl: (id) => `https://open.spotify.com/embed/playlist/${id}?theme=0`,

  async togglePlay() {
    await player?.togglePlay()
  },
  async next() {
    await player?.nextTrack()
  },
  async previous() {
    await player?.previousTrack()
  },
  async seek(ms) {
    await player?.seek(Math.round(ms))
    player?.getCurrentState().then(emitState)
  },
  async setVolume(volume) {
    await player?.setVolume(volume)
  },
  async setShuffle(on) {
    await api(`/me/player/shuffle?state=${on}&device_id=${await readyDevice()}`, { method: 'PUT' })
  },
  async setRepeat(mode: RepeatMode) {
    await api(`/me/player/repeat?state=${mode}&device_id=${await readyDevice()}`, { method: 'PUT' })
  },

  onState: states.on,
  onError: errors.on,
}
