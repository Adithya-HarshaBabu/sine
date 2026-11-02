import type { MouseEvent } from 'react'
import type { PlaybackState, Track } from '../types'
import { HeartIcon, HeartOutlineIcon, PlayIcon } from '../icons'

interface Props {
  tracks: Track[]
  state: PlaybackState
  saved: Record<string, boolean>
  canLike: boolean
  onPlay(index: number): void
  onToggleSaved(track: Track): void
}

const formatTime = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function TrackList({ tracks, state, saved, canLike, onPlay, onToggleSaved }: Props) {
  const now = state.track
  return (
    <ol className="tracks">
      {tracks.map((t, i) => {
        const playing = now !== null && (now.uri === t.uri || now.id === t.id)
        const isSaved = saved[t.uri]
        const heart = (e: MouseEvent) => {
          e.stopPropagation()
          onToggleSaved(t)
        }
        return (
          // The whole row plays on click; the artwork button is the keyboard-accessible control.
          <li key={`${t.id}-${i}`} className={`track ${playing ? 'playing' : ''}`} onClick={() => onPlay(i)}>
            <span className="num">{playing && state.isPlaying ? <span className="eq" /> : i + 1}</span>
            <button className="art-btn" aria-label={`Play ${t.title} by ${t.artist}`} onClick={(e) => (e.stopPropagation(), onPlay(i))}>
              {t.artwork ? <img src={t.artwork} alt="" loading="lazy" /> : <span className="ph" />}
              <span className="art-play">
                <PlayIcon width={18} height={18} />
              </span>
            </button>
            <span className="meta">
              <span className="title truncate">{t.title}</span>
              <span className="muted small truncate">{t.artist}</span>
            </span>
            <span className="album muted small truncate">{t.album}</span>
            <span className="row-end">
              {canLike && (
                <button
                  className={`heart small-heart ${isSaved ? 'on' : ''}`}
                  disabled={isSaved === undefined}
                  onClick={heart}
                  aria-pressed={!!isSaved}
                  aria-label={isSaved ? `Remove ${t.title} from liked songs` : `Add ${t.title} to liked songs`}
                >
                  {isSaved ? <HeartIcon width={16} height={16} /> : <HeartOutlineIcon width={16} height={16} />}
                </button>
              )}
              <span className="muted small dur">{formatTime(t.durationMs)}</span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}
