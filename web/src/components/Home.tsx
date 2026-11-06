import type { Artist, Home as HomeData, PlaybackState, Track } from '../types'
import { PlayIcon } from '../icons'

interface Props {
  data: HomeData | null
  error: string | null
  needsReconnect: boolean
  state: PlaybackState
  onReconnect(): void
  onRetry(): void
  onPlayRecent(tracks: Track[], index: number): void
  onArtist(artist: Artist): void
}

const greeting = () => {
  const h = new Date().getHours()
  return h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

export function Home({ data, error, needsReconnect, state, onReconnect, onRetry, onPlayRecent, onArtist }: Props) {
  return (
    <div className="home fade-in">
      <h1>{greeting()}</h1>
      {needsReconnect ? (
        <div className="reconnect">
          <p>Sine has new features that need one more Spotify permission, so please reconnect to turn them on.</p>
          <button className="primary" onClick={onReconnect}>
            Reconnect Spotify
          </button>
        </div>
      ) : error && !data ? (
        <div className="load-failed muted">
          <p>{error}</p>
          <button className="retry-btn" onClick={onRetry}>
            Try again
          </button>
        </div>
      ) : !data ? (
        <div className="card-grid">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="card skeleton">
              <span className="ph card-art" />
              <span className="bar-ph" />
            </div>
          ))}
        </div>
      ) : (
        <>
          {data.recent.length > 0 && (
            <section>
              <h2>Recently played</h2>
              <ul className="card-grid">
                {data.recent.map((t, i) => {
                  const playing = state.track?.uri === t.uri && state.isPlaying
                  return (
                    <li key={t.uri}>
                      <button className={`card ${playing ? 'playing' : ''}`} onClick={() => onPlayRecent(data.recent, i)}>
                        <span className="card-art-wrap">
                          {t.artwork ? <img className="card-art" src={t.artwork} alt="" loading="lazy" /> : <span className="ph card-art" />}
                          <span className="card-play">
                            <PlayIcon />
                          </span>
                        </span>
                        <span className="truncate card-title">{t.title}</span>
                        <span className="muted small truncate">{t.artist}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}
          {data.topArtists.length > 0 && (
            <section>
              <h2>Your top artists lately</h2>
              <ul className="card-grid artists">
                {data.topArtists.map((a) => (
                  <li key={a.id}>
                    <button className="card artist" onClick={() => onArtist(a)} aria-label={`Search ${a.name}`}>
                      {a.image ? <img className="card-art" src={a.image} alt="" loading="lazy" /> : <span className="ph card-art" />}
                      <span className="truncate card-title">{a.name}</span>
                      <span className="muted small">Artist</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {data.recent.length === 0 && data.topArtists.length === 0 && (
            <p className="muted">Play some music and your recent songs and favourite artists will show up here.</p>
          )}
        </>
      )}
    </div>
  )
}
