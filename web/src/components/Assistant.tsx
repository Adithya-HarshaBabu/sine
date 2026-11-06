import { useEffect, useRef, useState, type FormEvent } from 'react'
import { PauseIcon, PlayIcon } from '../icons'
import type { AssistantState, Draft, Found } from '../lib/useAssistant'
import type { PlaybackState, Playlist, Track } from '../types'

interface Player {
  state: PlaybackState
  onPlay(tracks: Track[], index: number): void
  onTogglePlay(): void
}

interface Props extends Player {
  assistant: AssistantState
  needsReconnect: boolean
  onReconnect(): void
  onOpenPlaylist(playlist: Playlist): void
}

const EXAMPLES = [
  'Play Raat Ki Rani by Seedhe Maut',
  'Make a playlist called Road Trip with Raat Ki Rani by Seedhe Maut and Blinding Lights',
  'A 15-song playlist for late-night coding',
]

const songName = (s: Found['missing'][number]) => [s.title, s.artist].filter(Boolean).join(' by ')

function PlayButton({ tracks, index, state, onPlay, onTogglePlay }: Player & { tracks: Track[]; index: number }) {
  const track = tracks[index]
  const current = state.track?.uri === track.uri
  const playing = current && state.isPlaying
  return (
    <button
      className={`row-play ${current ? 'on' : ''}`}
      // Resume in place if this song is already loaded, rather than restarting it.
      onClick={() => (current ? onTogglePlay() : onPlay(tracks, index))}
      aria-label={`${playing ? 'Pause' : 'Play'} ${track.title}`}
    >
      {playing ? <PauseIcon width={18} height={18} /> : <PlayIcon width={18} height={18} />}
    </button>
  )
}

function FoundSongs({ found, player }: { found: Found; player: Player }) {
  return (
    <div className="draft">
      {found.tracks.length > 0 && (
        <ol className="draft-tracks">
          {found.tracks.map((t, i) => (
            <li key={t.uri}>
              {t.artwork ? <img src={t.artwork} alt="" loading="lazy" /> : <span className="ph" />}
              <span className="meta">
                <span className="truncate">{t.title}</span>
                <span className="muted small truncate">{t.artist}</span>
              </span>
              <PlayButton tracks={found.tracks} index={i} {...player} />
            </li>
          ))}
        </ol>
      )}
      {found.missing.length > 0 && (
        <p className="muted small draft-missing">Not found on Spotify: {found.missing.map(songName).join(', ')}</p>
      )}
    </div>
  )
}

function DraftCard({
  draft,
  index,
  latest,
  assistant,
  player,
  onOpenPlaylist,
}: {
  draft: Draft
  index: number
  latest: boolean
  assistant: AssistantState
  player: Player
  onOpenPlaylist(playlist: Playlist): void
}) {
  // Older drafts are superseded, so only the latest can still be edited and created.
  const editable = latest && !draft.created && !draft.creating
  return (
    <div className="draft">
      {editable && !draft.empty ? (
        <input
          className="draft-name"
          value={draft.name}
          maxLength={100}
          onChange={(e) => assistant.updateDraft(index, (d) => ({ ...d, name: e.target.value }))}
          aria-label="Playlist name"
        />
      ) : (
        <div className="draft-name">{draft.name}</div>
      )}
      <div className="muted small">
        {draft.tracks.length} {draft.tracks.length === 1 ? 'song' : 'songs'} · private playlist
      </div>

      <ol className="draft-tracks">
        {draft.tracks.map((t, i) => (
          <li key={t.uri}>
            {t.artwork ? <img src={t.artwork} alt="" loading="lazy" /> : <span className="ph" />}
            <span className="meta">
              <span className="truncate">{t.title}</span>
              <span className="muted small truncate">{t.artist}</span>
            </span>
            <PlayButton tracks={draft.tracks} index={i} {...player} />
            {editable && (
              <button
                onClick={() =>
                  assistant.updateDraft(index, (d) => ({ ...d, tracks: d.tracks.filter((x) => x.uri !== t.uri) }))
                }
                aria-label={`Remove ${t.title}`}
              >
                ×
              </button>
            )}
          </li>
        ))}
      </ol>

      {draft.missing.length > 0 && (
        <p className="muted small draft-missing">Not found on Spotify: {draft.missing.map(songName).join(', ')}</p>
      )}
      {draft.error && (
        <p className="draft-error small" role="alert">
          {draft.error}
        </p>
      )}

      {draft.created ? (
        <button className="primary" onClick={() => onOpenPlaylist(draft.created!)}>
          Open playlist
        </button>
      ) : (
        latest && (
          <button
            className="primary"
            disabled={!editable || !draft.name.trim() || draft.tracks.length === 0}
            onClick={() => assistant.create(index, draft)}
          >
            {draft.creating ? 'Creating…' : draft.empty ? 'Add songs again' : 'Create playlist'}
          </button>
        )
      )}
    </div>
  )
}

export function Assistant({ assistant, needsReconnect, onReconnect, onOpenPlaylist, state, onPlay, onTogglePlay }: Props) {
  const { entries, busy, send, retry, clear } = assistant
  const player = { state, onPlay, onTogglePlay }
  const [text, setText] = useState('')
  const end = useRef<HTMLDivElement>(null)

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [entries.length, busy])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const message = text.trim()
    if (!message || busy) return
    setText('')
    send(message)
  }

  const latestDraft = entries.reduce((last, e, i) => (e.role === 'assistant' && e.draft ? i : last), -1)

  return (
    <div className="assistant">
      <header className="assistant-head">
        <div>
          <h1>Assistant</h1>
          <p className="muted small">Ask for a song to play, or for a playlist to review and save.</p>
        </div>
        {entries.length > 0 && (
          <button className="link-btn" onClick={clear}>
            New chat
          </button>
        )}
      </header>

      {needsReconnect && (
        <div className="notice">
          Reconnect Spotify so Sine can create playlists for you.
          <button onClick={onReconnect}>Reconnect</button>
        </div>
      )}

      <div className="chat" aria-live="polite">
        {entries.length === 0 && (
          <div className="chat-examples">
            {EXAMPLES.map((example) => (
              <button key={example} disabled={!!busy} onClick={() => send(example)}>
                {example}
              </button>
            ))}
          </div>
        )}
        {entries.map((entry, i) =>
          entry.role === 'user' ? (
            <div key={i} className="bubble user">
              {entry.text}
            </div>
          ) : entry.role === 'error' ? (
            <div key={i} className="error" role="alert">
              {entry.text}
              <button className="retry-btn" onClick={retry}>
                Try again
              </button>
            </div>
          ) : (
            <div key={i} className="bubble">
              {entry.text}
              {entry.found && <FoundSongs found={entry.found} player={player} />}
              {entry.draft && (
                <DraftCard
                  draft={entry.draft}
                  index={i}
                  latest={i === latestDraft}
                  assistant={assistant}
                  player={player}
                  onOpenPlaylist={onOpenPlaylist}
                />
              )}
            </div>
          ),
        )}
        {busy && (
          <div className="bubble muted" role="status">
            {busy === 'matching' ? 'Finding your songs on Spotify…' : 'Asking Gemini…'}
          </div>
        )}
      </div>

      <form className="chat-form" onSubmit={submit}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={2000}
          placeholder="Ask for a song or a playlist…"
          aria-label="Message the assistant"
        />
        <button className="primary" disabled={!!busy || !text.trim()}>
          Send
        </button>
      </form>
      <p className="muted small chat-note">
        Your messages go to Google Gemini, which can make mistakes. Google may use them to improve its products and people
        may review them, so don't share anything personal.
      </p>
      <div ref={end} />
    </div>
  )
}
