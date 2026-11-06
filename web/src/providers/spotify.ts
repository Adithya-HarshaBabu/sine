import { createEmitter } from './emitter'
import { emptyState, type Artist, type MusicProvider, type PlaybackState, type Playlist, type RepeatMode, type Track } from '../types'

// Client IDs are public (PKCE uses no client secret), so Sine's own ID is the default.
// Set VITE_SPOTIFY_CLIENT_ID to use a different Spotify app.
const DEFAULT_CLIENT_ID = 'ec55e1a63d84406aa4206319e543ffa7'
const CLIENT_ID = (import.meta.env.VITE_SPOTIFY_CLIENT_ID as string | undefined) || DEFAULT_CLIENT_ID
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

const SESSION_ENDED = 'Your Spotify session has ended. Connect again to keep listening.'
const UNREACHABLE = "Can't reach Spotify. Check your connection and try again."
const REQUEST_TIMEOUT_MS = 15_000
// Waits longer than this are reported rather than sat through with no feedback.
const MAX_RETRY_WAIT_S = 10

const states = createEmitter<PlaybackState>()
const errors = createEmitter<string | null>()
const sessionEnded = createEmitter<string>()
// Dev-only: lets the UI be previewed with a fake playback state in browsers that can't stream.
if (import.meta.env.DEV) Object.assign(window, { __sineEmitState: states.emit })
let player: Spotify.Player | null = null
let playerStarting: Promise<void> | null = null
let deviceId: Promise<string> | null = null
let resolveDevice: ((id: string) => void) | null = null
let playerOffline = false
let sdkLoading: Promise<void> | null = null
let pollTimer: number | undefined
let restoring: Promise<boolean> | null = null
let refreshing: Promise<Token> | null = null
let userId: Promise<string> | null = null

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// fetch rejects with a bare "Failed to fetch" offline and can hang forever on a bad network.
async function request(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
  } catch {
    throw new Error(UNREACHABLE)
  }
}

function clearSession() {
  clearInterval(pollTimer)
  player?.disconnect()
  player = null
  playerStarting = null
  deviceId = null
  resolveDevice = null
  playerOffline = false
  restoring = null
  userId = null
  localStorage.removeItem(TOKEN_KEY)
  states.emit(emptyState)
}

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
  const res = await request('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID!, ...params }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const detail = body.error_description ?? body.error ?? `error ${res.status}`
    throw Object.assign(new Error(`Spotify sign-in failed: ${detail}`), { status: res.status })
  }
  const token: Token = {
    access_token: body.access_token,
    refresh_token: body.refresh_token ?? previous?.refresh_token,
    expires_at: Date.now() + body.expires_in * 1000,
    scope: body.scope ?? previous?.scope,
  }
  localStorage.setItem(TOKEN_KEY, JSON.stringify(token))
  return token
}

async function refreshToken(token: Token): Promise<Token> {
  try {
    return await tokenRequest({ grant_type: 'refresh_token', refresh_token: token.refresh_token }, token)
  } catch (e) {
    const status = (e as { status?: number }).status
    // Network and server errors are temporary, so the sign-in is kept. Only Spotify rejecting it ends the session.
    if (status !== 400 && status !== 401) throw e
    // Refresh tokens rotate: another tab may have just used this one and saved its replacement.
    const latest = loadToken()
    if (latest && latest.refresh_token !== token.refresh_token) return latest
    clearSession()
    sessionEnded.emit(SESSION_ENDED)
    throw new Error(SESSION_ENDED)
  }
}

async function accessToken(forceRefresh = false): Promise<string> {
  const token = loadToken()
  if (!token) throw new Error(SESSION_ENDED)
  if (!forceRefresh && token.expires_at - 60_000 > Date.now()) return token.access_token
  refreshing ??= refreshToken(token).finally(() => (refreshing = null))
  return (await refreshing).access_token
}

async function finishRedirect(): Promise<void> {
  const params = new URLSearchParams(location.search)
  const code = params.get('code')
  const error = params.get('error')
  if (!code && !error) return
  history.replaceState(null, '', location.pathname)
  if (error) throw new Error(error === 'access_denied' ? 'Spotify sign-in was cancelled.' : `Spotify sign-in failed (${error}).`)
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

/** Sends a Web API request, recovering from an expired token, rate limiting and brief server errors. */
async function send(path: string, init: RequestInit): Promise<Response> {
  let forceRefresh = false
  let refreshed = false
  for (let attempt = 0; ; attempt++) {
    const token = await accessToken(forceRefresh)
    forceRefresh = false
    const res = await request(`${API}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init.headers },
    })
    if (attempt >= 2) return res
    if (res.status === 401 && !refreshed) {
      forceRefresh = refreshed = true
    } else if (res.status === 429) {
      const wait = Number(res.headers.get('Retry-After')) || 2
      if (wait > MAX_RETRY_WAIT_S) throw new Error(`Spotify is limiting requests. Try again in ${wait} seconds.`)
      await sleep(wait * 1000)
    } else if (res.status >= 500 && (init.method ?? 'GET') === 'GET') {
      // Only reads: repeating a write that may have gone through could skip or restart a song.
      await sleep(1000)
    } else {
      return res
    }
  }
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await send(path, init)
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

interface ApiPlaylist {
  id: string
  name: string
  collaborative: boolean
  owner: { id: string }
  images: { url: string }[] | null
  items?: { total: number }
  tracks?: { total: number }
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
  sdkLoading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    const fail = () => {
      clearTimeout(timer)
      script.remove()
      sdkLoading = null
      reject(new Error("Couldn't load Spotify's player. Check your connection or content blocker, then try playing again."))
    }
    const timer = setTimeout(fail, REQUEST_TIMEOUT_MS)
    window.onSpotifyWebPlaybackSDKReady = () => {
      clearTimeout(timer)
      resolve()
    }
    script.onerror = fail
    script.src = 'https://sdk.scdn.co/spotify-player.js'
    document.body.append(script)
  })
  return sdkLoading
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

// Resolves once the player is set up; deviceId says when it's ready to play.
function startPlayer(): Promise<void> {
  playerStarting ??= createPlayer().catch((e) => {
    playerStarting = null
    throw e
  })
  return playerStarting
}

const awaitDevice = () => {
  deviceId = new Promise((resolve) => (resolveDevice = resolve))
}

async function createPlayer(): Promise<void> {
  await loadSdk()
  if (!loadToken()) return // disconnected while the SDK was loading
  player = new Spotify.Player({
    name: 'Sine (web)',
    getOAuthToken: (cb) => void accessToken().then(cb, (e) => errors.emit(e.message)),
    volume: 0.7,
  })
  awaitDevice()
  // The device id can change when the player reconnects, so always keep the latest.
  player.addListener('ready', ({ device_id }) => {
    resolveDevice?.(device_id)
    deviceId = Promise.resolve(device_id)
    if (playerOffline) {
      playerOffline = false
      errors.emit(null)
    }
  })
  player.addListener('not_ready', () => {
    if (!player) return // our own disconnect, not a dropout
    playerOffline = true
    awaitDevice()
    errors.emit('Spotify player went offline. Reconnecting…')
  })
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
      // A cancelled or failed sign-in shouldn't cost an existing session (e.g. backing out of a reconnect).
      await finishRedirect().catch((e) => errors.emit(e.message))
      if (!loadToken()) return false
      // The library works without the player, so a blocked or slow SDK mustn't hold up the app.
      startPlayer().catch((e) => errors.emit(e.message))
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
    clearSession()
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
    const fetchAll = async () => {
      const items: ApiPlaylist[] = []
      for (let offset = 0; ; offset += 50) {
        const page = await api<{ items: ApiPlaylist[]; next: string | null }>(`/me/playlists?limit=50&offset=${offset}`)
        items.push(...page.items)
        if (!page.next || !page.items.length) return items
      }
    }
    const [items, me] = await Promise.all([fetchAll(), myId()])
    return items.filter(Boolean).map<Playlist>((p) => ({
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
  onSessionEnded: sessionEnded.on,
}
