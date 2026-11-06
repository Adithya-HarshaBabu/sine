import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { spotify } from './providers/spotify'
import { useArtworkTint } from './lib/artworkColor'
import { readPref, writePref } from './lib/prefs'
import { useAssistant } from './lib/useAssistant'
import { Assistant } from './components/Assistant'
import { Home } from './components/Home'
import { Login } from './components/Login'
import { NowPlaying } from './components/NowPlaying'
import { PlaylistNav } from './components/PlaylistNav'
import { TrackList } from './components/TrackList'
import { WaveProgress } from './components/WaveProgress'
import {
  emptyState,
  type Account,
  type Home as HomeData,
  type MusicProvider,
  type Page,
  type PlaybackState,
  type Playlist,
  type RepeatMode,
  type Track,
} from './types'
import {
  ExpandIcon,
  HeartIcon,
  HeartOutlineIcon,
  HomeIcon,
  LyricsIcon,
  NextIcon,
  NoteIcon,
  PauseIcon,
  PlayIcon,
  PrevIcon,
  QueueIcon,
  RepeatIcon,
  RepeatOneIcon,
  SearchIcon,
  ShuffleIcon,
  SineIcon,
  SparkIcon,
  VolumeIcon,
} from './icons'

// Every service implements MusicProvider, so another one can be added later without touching the UI.
const provider: MusicProvider = spotify

type View =
  | { kind: 'home' }
  | { kind: 'search' }
  | { kind: 'saved' }
  | { kind: 'playlists' }
  | { kind: 'playlist'; playlist: Playlist }
  | { kind: 'assistant' }

const SETUP_STEPS = [
  'Create an app at developer.spotify.com/dashboard and enable “Web API” and “Web Playback SDK”.',
  'Add http://127.0.0.1:5173/ as a Redirect URI (Spotify rejects “localhost”).',
  'Copy the Client ID into .env.local as VITE_SPOTIFY_CLIENT_ID, then restart npm run dev.',
  'Playback in the browser needs Spotify Premium.',
]

const NEXT_REPEAT: Record<RepeatMode, RepeatMode> = { off: 'context', context: 'track', track: 'off' }

const formatTime = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e))

export default function App() {
  const [connected, setConnected] = useState(false)
  const [restored, setRestored] = useState(false)
  const [account, setAccount] = useState<Account | null>(null)
  const [view, setView] = useState<View>({ kind: 'home' })
  const [query, setQuery] = useState('')
  const [tracks, setTracks] = useState<Track[]>([])
  const [total, setTotal] = useState(0)
  const [playlists, setPlaylists] = useState<Playlist[] | null>(null)
  const [playlistsError, setPlaylistsError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [listFailed, setListFailed] = useState(false)
  const [moreFailed, setMoreFailed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [state, setState] = useState<PlaybackState>(emptyState)
  const [volume, setVolume] = useState(() => readPref('volume', 0.7))
  const [scrub, setScrub] = useState<number | null>(null)
  const [queueOpen, setQueueOpen] = useState(() => readPref('queueOpen', false))
  const [queue, setQueue] = useState<Track[] | null>(null)
  const [now, setNow] = useState(Date.now())
  const [home, setHome] = useState<HomeData | null>(null)
  const [homeError, setHomeError] = useState<string | null>(null)
  const [homeAttempt, setHomeAttempt] = useState(0)
  const [saved, setSaved] = useState<Record<string, boolean>>({})
  const [nowOpen, setNowOpen] = useState(false)
  const [showLyrics, setShowLyrics] = useState(() => readPref('showLyrics', true))

  // The current list's page fetcher, and a counter so slow responses for an old view or query are ignored.
  const pager = useRef<((offset: number) => Promise<Page>) | null>(null)
  const request = useRef(0)
  const sentinel = useRef<HTMLDivElement>(null)

  const onPlaylistCreated = useCallback(
    (playlist: Playlist) => setPlaylists((prev) => (prev ? [playlist, ...prev] : prev)),
    [],
  )
  const assistant = useAssistant(provider, onPlaylistCreated)
  const clearAssistant = assistant.clear

  const showView = useCallback((next: View) => {
    request.current++
    pager.current = null
    setView(next)
    setTracks([])
    setTotal(0)
    setListFailed(false)
    setMoreFailed(false)
  }, [])

  const leaveSession = useCallback(() => {
    setConnected(false)
    setAccount(null)
    setQuery('')
    setPlaylists(null)
    setPlaylistsError(null)
    setHome(null)
    setHomeError(null)
    setSaved({})
    setQueue(null)
    setNowOpen(false)
    clearAssistant() // the next person on this browser shouldn't see this chat
    showView({ kind: 'home' })
  }, [showView, clearAssistant])

  // Restore the session (this also completes the OAuth redirect) and subscribe to player events.
  useEffect(() => {
    const unsubs = [
      provider.onState(setState),
      provider.onError(setError),
      provider.onSessionEnded((message) => {
        leaveSession()
        setError(message)
      }),
    ]
    provider
      .restore()
      .then(setConnected, (e) => setError(errorMessage(e)))
      .finally(() => setRestored(true))
    return () => unsubs.forEach((u) => u())
  }, [leaveSession])

  const loadPlaylists = useCallback(() => {
    setPlaylists(null)
    setPlaylistsError(null)
    provider.playlists().then(setPlaylists, (e) => setPlaylistsError(errorMessage(e)))
  }, [])

  useEffect(() => {
    if (connected) loadPlaylists()
  }, [connected, loadPlaylists])

  useEffect(() => {
    if (connected) provider.account().then(setAccount, () => {}) // only a label: the app works without it
  }, [connected])

  const needsReconnect = connected && provider.needsReconnect()

  useEffect(() => {
    if (!connected || needsReconnect || view.kind !== 'home') return
    provider.home().then(
      (data) => {
        setHome(data)
        setHomeError(null)
      },
      (e) => setHomeError(errorMessage(e)),
    )
  }, [connected, needsReconnect, view.kind, homeAttempt])

  // Look up liked status for any visible track we haven't checked yet.
  useEffect(() => {
    if (!connected || needsReconnect) return
    if (view.kind === 'saved') {
      setSaved((prev) => ({ ...prev, ...Object.fromEntries(tracks.map((t) => [t.uri, true])) }))
      return
    }
    const visible = [...tracks, ...(home?.recent ?? []), ...(state.track ? [state.track] : [])]
    const unknown = [...new Map(visible.filter((t) => saved[t.uri] === undefined).map((t) => [t.uri, t])).values()]
    if (!unknown.length) return
    provider.isSaved(unknown).then(
      (flags) => setSaved((prev) => ({ ...prev, ...Object.fromEntries(unknown.map((t, i) => [t.uri, flags[i]])) })),
      () => {},
    )
  }, [connected, needsReconnect, tracks, home, state.track?.uri, view.kind]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleSaved = (track: Track) => {
    const next = !saved[track.uri]
    setSaved((prev) => ({ ...prev, [track.uri]: next }))
    provider.setSaved(track, next).catch((e) => {
      setSaved((prev) => ({ ...prev, [track.uri]: !next }))
      setError(errorMessage(e))
    })
  }

  const loadFirst = useCallback(async (fetchPage: (offset: number) => Promise<Page>) => {
    const id = ++request.current
    pager.current = fetchPage
    setLoading(true)
    setListFailed(false)
    setMoreFailed(false)
    setError(null)
    try {
      const page = await fetchPage(0)
      if (id !== request.current) return
      setTracks(page.tracks)
      setTotal(page.total)
    } catch (e) {
      if (id === request.current) {
        setTracks([])
        setListFailed(true)
        setError(errorMessage(e))
      }
    } finally {
      if (id === request.current) setLoading(false)
    }
  }, [])

  const loadMore = useCallback(async () => {
    const fetchPage = pager.current
    // After a failure, wait for "Try again": the observer below would otherwise refire in a tight loop.
    if (!fetchPage || loading || loadingMore || moreFailed || tracks.length >= total) return
    const id = request.current
    setLoadingMore(true)
    try {
      const page = await fetchPage(tracks.length)
      if (id === request.current) setTracks((prev) => [...prev, ...page.tracks])
    } catch (e) {
      if (id === request.current) {
        setMoreFailed(true)
        setError(errorMessage(e))
      }
    } finally {
      setLoadingMore(false)
    }
  }, [loading, loadingMore, moreFailed, tracks.length, total])

  // Fetch the list for the current view; search runs as you type, after a short pause.
  useEffect(() => {
    if (!connected) return
    if (view.kind === 'saved') {
      loadFirst((offset) => provider.savedTracks(offset))
      return
    }
    if (view.kind === 'playlist') {
      if (view.playlist.readable) loadFirst((offset) => provider.playlistTracks(view.playlist.id, offset))
      return
    }
    if (view.kind !== 'search') return
    const q = query.trim()
    if (!q) return
    const timer = setTimeout(
      () =>
        loadFirst(async () => {
          const results = await provider.search(q)
          return { tracks: results, total: results.length }
        }),
      300,
    )
    return () => clearTimeout(timer)
  }, [view, connected, query, loadFirst])

  // Infinite scroll: fetch the next page when the end of the list comes into view.
  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const observer = new IntersectionObserver((entries) => entries[0].isIntersecting && loadMore(), {
      rootMargin: '400px',
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [loadMore])

  const position = state.isPlaying
    ? Math.min(state.positionMs + (now - state.updatedAt), state.durationMs)
    : state.positionMs

  useEffect(() => {
    if (!state.isPlaying) return
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [state.isPlaying])

  const run = useCallback(async (fn: () => Promise<unknown>) => {
    try {
      await fn()
    } catch (e) {
      setError(errorMessage(e))
    }
  }, [])

  const start = (fn: () => Promise<void>) =>
    run(async () => {
      setError(null)
      await fn()
      await provider.setVolume(volume)
    })

  const playTrack = (index: number) =>
    start(() => provider.play(tracks, index, view.kind === 'playlist' ? view.playlist.id : undefined))
  const playPlaylist = (p: Playlist) => start(() => provider.playPlaylist(p.id))
  const playList = (list: Track[], index: number) => start(() => provider.play(list, index))

  const seekTo = useCallback(
    (ms: number) => {
      setState((s) => ({ ...s, positionMs: ms, updatedAt: Date.now() }))
      run(() => provider.seek(ms))
    },
    [run],
  )

  // Seek once the slider is released, not on every pixel of the drag.
  const commitScrub = () => {
    if (scrub === null) return
    seekTo(scrub)
    setScrub(null)
  }

  const updateShowLyrics = (show: boolean) => {
    setShowLyrics(show)
    writePref('showLyrics', show)
  }
  const openNowPlaying = (lyrics?: boolean) => {
    if (lyrics !== undefined) updateShowLyrics(lyrics)
    setNowOpen(true)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || !connected || (e.target as HTMLElement).closest('input, button, textarea')) return
      e.preventDefault()
      run(() => provider.togglePlay())
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [connected, run])

  // Media keys, headphone buttons and the OS "now playing" widget.
  const nowTrack = state.track
  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    navigator.mediaSession.metadata = nowTrack
      ? new MediaMetadata({
          title: nowTrack.title,
          artist: nowTrack.artist,
          album: nowTrack.album,
          artwork: nowTrack.artwork ? [{ src: nowTrack.artwork, sizes: '640x640' }] : [],
        })
      : null
    document.title = nowTrack ? `${nowTrack.title} · ${nowTrack.artist}` : 'Sine'
  }, [nowTrack?.uri]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    navigator.mediaSession.playbackState = nowTrack ? (state.isPlaying ? 'playing' : 'paused') : 'none'
  }, [nowTrack, state.isPlaying])

  useEffect(() => {
    if (!('mediaSession' in navigator) || !connected) return
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ['play', () => run(() => provider.togglePlay())],
      ['pause', () => run(() => provider.togglePlay())],
      ['nexttrack', () => run(() => provider.next())],
      ['previoustrack', () => run(() => provider.previous())],
      ['seekto', (d) => d.seekTime !== undefined && seekTo(d.seekTime * 1000)],
    ]
    handlers.forEach(([action, handler]) => navigator.mediaSession.setActionHandler(action, handler))
    return () => handlers.forEach(([action]) => navigator.mediaSession.setActionHandler(action, null))
  }, [connected, run, seekTo])

  // Up next: refetch when the panel opens and whenever the track changes.
  useEffect(() => {
    if (!queueOpen || !connected) return
    let cancelled = false
    // Spotify updates the queue a beat after the track changes.
    const timer = setTimeout(
      () =>
        provider.queue().then(
          (q) => !cancelled && setQueue(q),
          () => !cancelled && setQueue([]),
        ),
      nowTrack ? 600 : 0,
    )
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [queueOpen, connected, nowTrack?.uri]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleQueue = () => {
    setQueueOpen((open) => {
      writePref('queueOpen', !open)
      return !open
    })
  }

  const onSearch = (e: FormEvent) => e.preventDefault()

  const onQuery = (value: string) => {
    setQuery(value)
    if (!value.trim()) {
      request.current++
      setTracks([])
      setLoading(false)
    }
  }

  const onVolume = (v: number) => {
    setVolume(v)
    writePref('volume', v)
    if (connected) run(() => provider.setVolume(v))
  }

  const logOut = () =>
    run(async () => {
      await provider.disconnect()
      setError(null)
      leaveSession()
    })

  // Signing in again asks Spotify for any permissions added since the last sign-in.
  const reconnect = () => run(() => provider.connect())

  const shownPosition = scrub ?? position
  const unreadablePlaylist = view.kind === 'playlist' && !view.playlist.readable
  const canLike = connected && !needsReconnect
  const nowSaved = nowTrack && canLike ? saved[nowTrack.uri] : undefined

  // Album-colour theming: the current artwork's main colour tints the whole app.
  const tint = useArtworkTint(nowTrack?.artwork)
  const tintStyle = (
    tint ? { '--tint': tint.vivid, '--tint-dark': tint.dark, '--tint-light': tint.light } : {}
  ) as CSSProperties

  if (provider.configured && !connected)
    return (
      <Login
        providerName={provider.name}
        restoring={!restored}
        error={error}
        onLogin={() => provider.connect({ chooseAccount: true })}
        onError={setError}
      />
    )

  return (
    <div className="app" data-provider={provider.id} data-queue={queueOpen && connected} data-tinted={!!tint} style={tintStyle}>
      <aside className="sidebar">
        <div className="brand">
          <SineIcon /> Sine
        </div>

        {connected && (
          <nav className="nav">
            <button className={view.kind === 'home' ? 'current' : ''} onClick={() => showView({ kind: 'home' })}>
              <HomeIcon /> Home
            </button>
            <button className={view.kind === 'search' ? 'current' : ''} onClick={() => showView({ kind: 'search' })}>
              <SearchIcon /> Search
            </button>
            <button className={view.kind === 'saved' ? 'current' : ''} onClick={() => showView({ kind: 'saved' })}>
              <HeartIcon /> Liked songs
            </button>
            <button className={view.kind === 'assistant' ? 'current' : ''} onClick={() => showView({ kind: 'assistant' })}>
              <SparkIcon /> Assistant
            </button>
            {/* On narrow screens the sidebar list is hidden, so playlists get their own view. */}
            <button
              className={`narrow-only ${view.kind === 'playlists' || view.kind === 'playlist' ? 'current' : ''}`}
              onClick={() => showView({ kind: 'playlists' })}
            >
              <NoteIcon /> Playlists
            </button>
            <div className="nav-label">Playlists</div>
            <PlaylistNav
              playlists={playlists}
              error={playlistsError}
              currentId={view.kind === 'playlist' ? view.playlist.id : undefined}
              onOpen={(p) => showView({ kind: 'playlist', playlist: p })}
              onRetry={loadPlaylists}
            />
          </nav>
        )}

        {connected && (
          <div className="account">
            {account?.image ? <img src={account.image} alt="" /> : <span className="ph" />}
            <span className="truncate small" title={account?.name}>
              {account?.name ?? `${provider.name} account`}
            </span>
            <button className="link-btn" onClick={logOut}>
              Log out
            </button>
          </div>
        )}
      </aside>

      <main className="main">
        {error && (
          <div className="error" role="alert">
            {error}
            <button onClick={() => setError(null)} aria-label="Dismiss">
              ×
            </button>
          </div>
        )}

        {!provider.configured ? (
          <section className="empty setup">
            <h1>Set up {provider.name}</h1>
            <p className="muted">
              Add <code>VITE_SPOTIFY_CLIENT_ID</code> to <code>.env.local</code> to enable sign-in.
            </p>
            <ol>
              {SETUP_STEPS.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          </section>
        ) : (
          <div key={view.kind === 'playlist' ? view.playlist.id : view.kind} className="view fade-in">
            {needsReconnect && view.kind !== 'home' && view.kind !== 'assistant' && (
              <div className="notice">
                Reconnect Spotify to turn on Home, likes and your listening history.
                <button onClick={reconnect}>Reconnect</button>
              </div>
            )}
            {view.kind === 'home' ? (
              <Home
                data={home}
                error={homeError}
                needsReconnect={needsReconnect}
                state={state}
                onReconnect={reconnect}
                onRetry={() => {
                  setHomeError(null)
                  setHomeAttempt((n) => n + 1)
                }}
                onPlayRecent={playList}
                onArtist={(a) => {
                  showView({ kind: 'search' })
                  setQuery(a.name)
                }}
              />
            ) : view.kind === 'assistant' ? (
              <Assistant
                assistant={assistant}
                needsReconnect={needsReconnect}
                onReconnect={reconnect}
                onOpenPlaylist={(p) => showView({ kind: 'playlist', playlist: p })}
              />
            ) : (
            <>
            <header className="header">
              {view.kind === 'playlist' ? (
                <div className="playlist-head">
                  {view.playlist.artwork ? <img src={view.playlist.artwork} alt="" /> : <span className="ph" />}
                  <div>
                    <div className="muted small">{view.playlist.readable ? 'Playlist' : 'Following'}</div>
                    <h1>{view.playlist.name}</h1>
                    {view.playlist.count !== undefined && (
                      <div className="muted small">{view.playlist.count} songs</div>
                    )}
                  </div>
                  <button className="primary round" onClick={() => playPlaylist(view.playlist)} aria-label="Play playlist">
                    <PlayIcon />
                  </button>
                </div>
              ) : view.kind === 'playlists' ? (
                <h1>Playlists</h1>
              ) : view.kind === 'saved' ? (
                <div>
                  <h1>Liked songs</h1>
                  {total > 0 && <div className="muted small">{total} songs</div>}
                </div>
              ) : (
                <form className="search" onSubmit={onSearch}>
                  <SearchIcon />
                  <input
                    autoFocus
                    value={query}
                    onChange={(e) => onQuery(e.target.value)}
                    placeholder={`Search ${provider.name}`}
                    aria-label="Search"
                  />
                </form>
              )}
            </header>

            {view.kind === 'playlists' ? (
              playlistsError ? (
                <div className="load-failed muted">
                  <p>Couldn't load your playlists.</p>
                  <button className="retry-btn" onClick={loadPlaylists}>
                    Try again
                  </button>
                </div>
              ) : (
              <ul className="playlist-grid">
                {(playlists ?? []).map((p) => (
                  <li key={p.id}>
                    <button onClick={() => showView({ kind: 'playlist', playlist: p })}>
                      {p.artwork ? <img src={p.artwork} alt="" loading="lazy" /> : <span className="ph" />}
                      <span className="truncate">{p.name}</span>
                      <span className="small muted">{p.readable ? `${p.count ?? 0} songs` : 'Following'}</span>
                    </button>
                  </li>
                ))}
              </ul>
              )
            ) : unreadablePlaylist ? (
              <div className="embed">
                <p className="muted small">
                  Spotify doesn't share this playlist's tracks with apps in development mode, so here's Spotify's own
                  player. Press the green play button above to stream it in Sine; songs clicked inside the embed
                  play there instead (full length if you're signed in to open.spotify.com, otherwise a preview).
                </p>
                {provider.playlistEmbedUrl && (
                  <iframe
                    key={view.playlist.id}
                    title={`${view.playlist.name} on ${provider.name}`}
                    src={provider.playlistEmbedUrl(view.playlist.id)}
                    allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                    loading="lazy"
                  />
                )}
              </div>
            ) : loading ? (
              <ol className="tracks" aria-busy="true" aria-label="Loading">
                {Array.from({ length: 8 }, (_, i) => (
                  <li key={i} className="track skeleton">
                    <span />
                    <span className="ph" />
                    <span className="meta">
                      <span className="bar-ph" style={{ width: `${55 - (i % 3) * 10}%` }} />
                      <span className="bar-ph short" />
                    </span>
                    <span className="bar-ph album" />
                    <span />
                  </li>
                ))}
              </ol>
            ) : listFailed ? (
              <div className="load-failed muted">
                <p>This list didn't load.</p>
                <button className="retry-btn" onClick={() => pager.current && loadFirst(pager.current)}>
                  Try again
                </button>
              </div>
            ) : tracks.length === 0 ? (
              <div className="empty muted">
                {view.kind === 'search'
                  ? query.trim()
                    ? 'No results.'
                    : 'Search for a song, artist or album.'
                  : 'Nothing here yet.'}
              </div>
            ) : (
              <>
                <TrackList
                  tracks={tracks}
                  state={state}
                  saved={saved}
                  canLike={canLike}
                  onPlay={playTrack}
                  onToggleSaved={toggleSaved}
                />
                <div ref={sentinel} className="more muted small">
                  {loadingMore && 'Loading more…'}
                  {moreFailed && (
                    <button className="retry-btn" onClick={() => setMoreFailed(false)}>
                      Try loading more again
                    </button>
                  )}
                </div>
              </>
            )}
            </>
            )}
          </div>
        )}
      </main>

      {queueOpen && connected && (
        <aside className="queue" aria-label="Up next">
          <div className="queue-head">
            <h2>Up next</h2>
            <button onClick={toggleQueue} aria-label="Close up next">
              ×
            </button>
          </div>
          {nowTrack && (
            <>
              <div className="nav-label">Now playing</div>
              <div className="queue-item current">
                {nowTrack.artwork ? <img src={nowTrack.artwork} alt="" /> : <span className="ph" />}
                <span className="meta">
                  <span className="title truncate">{nowTrack.title}</span>
                  <span className="muted small truncate">{nowTrack.artist}</span>
                </span>
              </div>
            </>
          )}
          <div className="nav-label">Next</div>
          {queue === null ? (
            <div className="muted small queue-note">Loading…</div>
          ) : queue.length === 0 ? (
            <div className="muted small queue-note">
              {nowTrack ? 'Nothing queued after this track.' : 'Start playing something to see what comes next.'}
            </div>
          ) : (
            <ol className="queue-list">
              {queue.map((t, i) => (
                <li key={`${t.uri}-${i}`} className="queue-item">
                  {t.artwork ? <img src={t.artwork} alt="" loading="lazy" /> : <span className="ph" />}
                  <span className="meta">
                    <span className="truncate">{t.title}</span>
                    <span className="muted small truncate">{t.artist}</span>
                  </span>
                  <span className="muted small">{formatTime(t.durationMs)}</span>
                </li>
              ))}
            </ol>
          )}
        </aside>
      )}

      <footer className="bar">
        <div className="now">
          <button className="now-art" disabled={!nowTrack} onClick={() => openNowPlaying()} aria-label="Open now playing">
            {nowTrack?.artwork ? (
              <img key={nowTrack.artwork} className="fade-img" src={nowTrack.artwork} alt="" />
            ) : (
              <span className="ph" />
            )}
            {nowTrack && (
              <span className="now-expand">
                <ExpandIcon width={16} height={16} />
              </span>
            )}
          </button>
          <div className="meta">
            <div key={nowTrack?.uri} className="title truncate fade-in">
              {nowTrack?.title ?? 'Nothing playing'}
            </div>
            <div className="muted small truncate">{nowTrack ? nowTrack.artist : 'Pick a song to start'}</div>
          </div>
          {nowTrack && canLike && (
            <button
              className={`heart ${nowSaved ? 'on' : ''}`}
              disabled={nowSaved === undefined}
              onClick={() => toggleSaved(nowTrack)}
              aria-pressed={!!nowSaved}
              aria-label={nowSaved ? 'Remove from liked songs' : 'Add to liked songs'}
            >
              {nowSaved ? <HeartIcon width={18} height={18} /> : <HeartOutlineIcon width={18} height={18} />}
            </button>
          )}
        </div>

        <div className="transport">
          <div className="buttons">
            <button
              className={`mode ${state.shuffle ? 'on' : ''}`}
              disabled={!nowTrack}
              onClick={() => run(() => provider.setShuffle(!state.shuffle))}
              aria-label="Shuffle"
              aria-pressed={state.shuffle}
            >
              <ShuffleIcon width={18} height={18} />
            </button>
            <button disabled={!nowTrack} onClick={() => run(() => provider.previous())} aria-label="Previous">
              <PrevIcon />
            </button>
            <button
              className="play"
              disabled={!nowTrack}
              onClick={() => run(() => provider.togglePlay())}
              aria-label={state.isPlaying ? 'Pause' : 'Play'}
            >
              {state.isPlaying ? <PauseIcon /> : <PlayIcon />}
            </button>
            <button disabled={!nowTrack} onClick={() => run(() => provider.next())} aria-label="Next">
              <NextIcon />
            </button>
            <button
              className={`mode ${state.repeat !== 'off' ? 'on' : ''}`}
              disabled={!nowTrack}
              onClick={() => run(() => provider.setRepeat(NEXT_REPEAT[state.repeat]))}
              aria-label={`Repeat: ${state.repeat}`}
            >
              {state.repeat === 'track' ? <RepeatOneIcon width={18} height={18} /> : <RepeatIcon width={18} height={18} />}
            </button>
          </div>
          <div className="progress">
            <span className="small muted">{formatTime(shownPosition)}</span>
            <WaveProgress
              positionMs={shownPosition}
              durationMs={state.durationMs}
              playing={state.isPlaying && scrub === null}
              disabled={!nowTrack}
              onScrub={setScrub}
              onCommit={commitScrub}
            />
            <span className="small muted">{formatTime(state.durationMs)}</span>
          </div>
        </div>

        <div className="volume">
          <button
            className={`queue-toggle ${nowOpen && showLyrics ? 'on' : ''}`}
            disabled={!nowTrack}
            onClick={() => openNowPlaying(true)}
            aria-label="Lyrics"
          >
            <LyricsIcon width={18} height={18} />
          </button>
          <button
            className={`queue-toggle ${queueOpen ? 'on' : ''}`}
            disabled={!connected}
            onClick={toggleQueue}
            aria-label="Up next"
            aria-pressed={queueOpen}
          >
            <QueueIcon width={18} height={18} />
          </button>
          <VolumeIcon className="vol-control" />
          <input
            className="vol-control"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(e) => onVolume(Number(e.target.value))}
            aria-label="Volume"
            style={{ '--pct': `${volume * 100}%` } as CSSProperties}
          />
        </div>
      </footer>

      {nowOpen && nowTrack && (
        <NowPlaying
          state={state}
          positionMs={shownPosition}
          saved={nowSaved}
          showLyrics={showLyrics}
          onShowLyrics={updateShowLyrics}
          onClose={() => setNowOpen(false)}
          onTogglePlay={() => run(() => provider.togglePlay())}
          onNext={() => run(() => provider.next())}
          onPrevious={() => run(() => provider.previous())}
          onShuffle={() => run(() => provider.setShuffle(!state.shuffle))}
          onRepeat={() => run(() => provider.setRepeat(NEXT_REPEAT[state.repeat]))}
          onToggleSaved={() => toggleSaved(nowTrack)}
          onScrub={setScrub}
          onCommit={commitScrub}
          onSeek={seekTo}
        />
      )}
    </div>
  )
}
