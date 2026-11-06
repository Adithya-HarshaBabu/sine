import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { AssistantState, Draft } from '../lib/useAssistant'
import type { Playlist } from '../types'

interface Props {
  assistant: AssistantState
  needsReconnect: boolean
  onReconnect(): void
  onOpenPlaylist(playlist: Playlist): void
}

const EXAMPLES = [
  'Make a playlist called Road Trip with Raat Ki Rani by Seedhe Maut and Blinding Lights',
  'A 15-song playlist for late-night coding',
]

function DraftCard({
  draft,
  index,
  latest,
  assistant,
  onOpenPlaylist,
}: {
  draft: Draft
  index: number
  latest: boolean
  assistant: AssistantState
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
        {draft.tracks.map((t) => (
          <li key={t.uri}>
            {t.artwork ? <img src={t.artwork} alt="" loading="lazy" /> : <span className="ph" />}
            <span className="meta">
              <span className="truncate">{t.title}</span>
              <span className="muted small truncate">{t.artist}</span>
            </span>
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
        <p className="muted small draft-missing">
          Not found on Spotify: {draft.missing.map((s) => [s.title, s.artist].filter(Boolean).join(' by ')).join(', ')}
        </p>
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

export function Assistant({ assistant, needsReconnect, onReconnect, onOpenPlaylist }: Props) {
  const { entries, busy, send, retry, clear } = assistant
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
          <p className="muted small">Name some songs or describe a mood. You'll review the playlist before it's created.</p>
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
              {entry.draft && (
                <DraftCard
                  draft={entry.draft}
                  index={i}
                  latest={i === latestDraft}
                  assistant={assistant}
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
          placeholder="Ask for a playlist…"
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
