import { useEffect, useRef, useState } from 'react'
import { fetchLyrics, type Lyrics } from '../lib/lyrics'
import type { PlaybackState } from '../types'
import { WaveProgress } from './WaveProgress'
import {
  ChevronDownIcon,
  HeartIcon,
  HeartOutlineIcon,
  LyricsIcon,
  NextIcon,
  PauseIcon,
  PlayIcon,
  PrevIcon,
  RepeatIcon,
  RepeatOneIcon,
  ShuffleIcon,
} from '../icons'

interface Props {
  state: PlaybackState
  positionMs: number
  saved: boolean | undefined
  showLyrics: boolean
  onShowLyrics(show: boolean): void
  onClose(): void
  onTogglePlay(): void
  onNext(): void
  onPrevious(): void
  onShuffle(): void
  onRepeat(): void
  onToggleSaved(): void
  onScrub(ms: number): void
  onCommit(): void
  onSeek(ms: number): void
}

const formatTime = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function NowPlaying(props: Props) {
  const { state, positionMs, saved, showLyrics } = props
  const track = state.track
  const [lyrics, setLyrics] = useState<{ uri: string; data: Lyrics | null } | null>(null)
  const linesRef = useRef<HTMLOListElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [props])

  useEffect(() => {
    if (!track || !showLyrics) return
    let cancelled = false
    fetchLyrics(track).then((data) => !cancelled && setLyrics({ uri: track.uri, data }))
    return () => {
      cancelled = true
    }
  }, [track, showLyrics])

  const current = lyrics && track && lyrics.uri === track.uri ? lyrics.data : undefined
  const synced = current?.synced
  // Index of the line being sung: the last line whose timestamp has passed.
  let active = -1
  if (synced) for (let i = 0; i < synced.length && synced[i].timeMs <= positionMs + 250; i++) active = i

  // Keep the sung line centred by scrolling only the lyrics panel (scrollIntoView would move the whole sheet).
  useEffect(() => {
    const list = linesRef.current
    const el = list?.children[active] as HTMLElement | undefined
    const panel = list?.parentElement
    if (!el || !panel) return
    panel.scrollTo({
      top: el.offsetTop - panel.clientHeight / 2 + el.clientHeight / 2,
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    })
  }, [active])

  if (!track) return null

  return (
    <div className="np" role="dialog" aria-modal="true" aria-label="Now playing">
      <div className="np-backdrop" style={{ backgroundImage: track.artwork ? `url(${track.artwork})` : undefined }} />
      <div className="np-top">
        <button onClick={props.onClose} aria-label="Close now playing">
          <ChevronDownIcon />
        </button>
        <span className="small">Now playing</span>
        <button
          className={showLyrics ? 'on' : ''}
          onClick={() => props.onShowLyrics(!showLyrics)}
          aria-pressed={showLyrics}
          aria-label="Lyrics"
        >
          <LyricsIcon />
        </button>
      </div>

      <div className={`np-body ${showLyrics ? 'with-lyrics' : ''}`}>
        <div className="np-main">
          {track.artwork ? (
            <img key={track.artwork} className="np-art fade-img" src={track.artwork} alt="" />
          ) : (
            <span className="np-art ph" />
          )}
          <div className="np-meta">
            <div>
              <h2 key={track.uri} className="fade-in">
                {track.title}
              </h2>
              <div className="np-artist">{track.artist}</div>
            </div>
            <button
              className={`heart ${saved ? 'on' : ''}`}
              disabled={saved === undefined}
              onClick={props.onToggleSaved}
              aria-pressed={!!saved}
              aria-label={saved ? 'Remove from liked songs' : 'Add to liked songs'}
            >
              {saved ? <HeartIcon /> : <HeartOutlineIcon />}
            </button>
          </div>
          <WaveProgress
            size="large"
            positionMs={positionMs}
            durationMs={state.durationMs}
            playing={state.isPlaying}
            onScrub={props.onScrub}
            onCommit={props.onCommit}
          />
          <div className="np-times small">
            <span>{formatTime(positionMs)}</span>
            <span>{formatTime(state.durationMs)}</span>
          </div>
          <div className="np-controls">
            <button className={`mode ${state.shuffle ? 'on' : ''}`} onClick={props.onShuffle} aria-label="Shuffle" aria-pressed={state.shuffle}>
              <ShuffleIcon />
            </button>
            <button onClick={props.onPrevious} aria-label="Previous">
              <PrevIcon width={28} height={28} />
            </button>
            <button className="np-play" onClick={props.onTogglePlay} aria-label={state.isPlaying ? 'Pause' : 'Play'}>
              {state.isPlaying ? <PauseIcon width={30} height={30} /> : <PlayIcon width={30} height={30} />}
            </button>
            <button onClick={props.onNext} aria-label="Next">
              <NextIcon width={28} height={28} />
            </button>
            <button className={`mode ${state.repeat !== 'off' ? 'on' : ''}`} onClick={props.onRepeat} aria-label={`Repeat: ${state.repeat}`}>
              {state.repeat === 'track' ? <RepeatOneIcon /> : <RepeatIcon />}
            </button>
          </div>
        </div>

        {showLyrics && (
          <section className="np-lyrics" aria-label="Lyrics">
            {current === undefined ? (
              <p className="np-lyrics-note">Finding lyrics…</p>
            ) : current === null ? (
              <p className="np-lyrics-note">No lyrics found for this song.</p>
            ) : current.instrumental ? (
              <p className="np-lyrics-note">♪ Instrumental ♪</p>
            ) : synced?.length ? (
              <ol ref={linesRef} className="np-lines">
                {synced.map((line, i) => (
                  <li key={i} className={i === active ? 'active' : i < active ? 'past' : ''}>
                    <button onClick={() => props.onSeek(line.timeMs)}>{line.text || '♪'}</button>
                  </li>
                ))}
              </ol>
            ) : (
              <>
                <p className="np-lyrics-note small">These lyrics aren't time-synced.</p>
                <pre className="np-plain">{current.plain}</pre>
              </>
            )}
            <p className="np-credit small">Lyrics from LRCLIB</p>
          </section>
        )}
      </div>
    </div>
  )
}
