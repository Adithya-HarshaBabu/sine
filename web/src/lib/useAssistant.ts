import { useCallback, useRef, useState } from 'react'
import type { MusicProvider, Playlist, Track } from '../types'

export interface Draft {
  name: string
  description: string
  tracks: Track[]
  /** Songs the assistant proposed that weren't found on the service. */
  missing: { title: string; artist: string }[]
  created?: Playlist
  /** The playlist already exists but its songs haven't been added, so a retry must not create another. */
  empty?: Playlist
  creating?: boolean
  error?: string
}

export interface Found {
  tracks: Track[]
  missing: { title: string; artist: string }[]
}

export type Entry =
  | { role: 'user'; text: string }
  | { role: 'assistant'; text: string; draft?: Draft; found?: Found }
  | { role: 'error'; text: string }

interface Proposal {
  reply: string
  songs: { title: string; artist: string }[]
  playlist: { name: string; description: string; songs: { title: string; artist: string }[] } | null
}

const asSongs = (tracks: Track[] = []) => tracks.map((t) => ({ title: t.title, artist: t.artist }))

const MAX_SONGS = 100
const MAX_HISTORY = 30
const SEARCHES_AT_ONCE = 4

async function findAll(provider: MusicProvider, songs: { title: string; artist: string }[]): Promise<Found> {
  const results = new Array<Track | null>(songs.length).fill(null)
  let next = 0
  const worker = async () => {
    while (next < songs.length) {
      const i = next++
      results[i] = await provider.findTrack(songs[i].title, songs[i].artist).catch(() => null)
    }
  }
  await Promise.all(Array.from({ length: SEARCHES_AT_ONCE }, worker))

  const seen = new Set<string>()
  const tracks = results.filter((t): t is Track => !!t && !seen.has(t.uri) && !!seen.add(t.uri))
  return { tracks, missing: songs.filter((_, i) => !results[i]) }
}

/** What the model sees: the conversation, with each draft as it stands now, including any songs the user removed. */
function toHistory(entries: Entry[]) {
  const history = entries.flatMap((e): { role: 'user' | 'assistant'; content: string }[] => {
    if (e.role === 'error') return []
    if (e.role === 'user') return [{ role: 'user', content: e.text }]
    const { draft } = e
    const playlist = draft && {
      name: draft.name,
      description: draft.description,
      songs: asSongs(draft.tracks),
    }
    const content = JSON.stringify({ reply: e.text, songs: asSongs(e.found?.tracks), playlist: playlist ?? null })
    return [{ role: 'assistant', content }]
  })
  const recent = history.slice(-MAX_HISTORY)
  return recent.slice(recent.findIndex((m) => m.role === 'user'))
}

// Lives above the view, so the chat survives moving around the app and can be cleared when someone logs out.
export function useAssistant(provider: MusicProvider, onCreated: (playlist: Playlist) => void) {
  const [entries, setEntries] = useState<Entry[]>([])
  const [busy, setBusy] = useState<false | 'asking' | 'matching'>(false)
  const conversation = useRef(0) // ignores replies to a chat that has since been cleared
  const creating = useRef(false)

  const request = useCallback(
    async (history: Entry[]) => {
      const id = conversation.current
      setBusy('asking')
      try {
        const res = await fetch('/api/assistant', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await provider.authToken()}` },
          body: JSON.stringify({ messages: toHistory(history) }),
          signal: AbortSignal.timeout(60_000),
        })
        const body = await res.json().catch(() => null)
        if (!res.ok || !body) throw new Error(body?.error ?? "The assistant isn't available right now.")
        const { reply, songs, playlist } = body as Proposal
        const wanted = playlist?.songs ?? songs
        if (wanted.length && id === conversation.current) setBusy('matching')
        const matched = await findAll(provider, wanted.slice(0, MAX_SONGS))
        const draft = playlist ? { name: playlist.name, description: playlist.description, ...matched } : undefined
        const found = !playlist && wanted.length ? matched : undefined
        if (id === conversation.current) setEntries([...history, { role: 'assistant', text: reply, draft, found }])
      } catch (e) {
        const timedOut = e instanceof DOMException
        const text = timedOut ? "The assistant didn't respond in time." : e instanceof TypeError ? "Can't reach the assistant. Check your connection." : (e as Error).message
        if (id === conversation.current) setEntries([...history, { role: 'error', text }])
      } finally {
        if (id === conversation.current) setBusy(false)
      }
    },
    [provider],
  )

  const send = (text: string) => {
    const history: Entry[] = [...entries.filter((e) => e.role !== 'error'), { role: 'user', text }]
    setEntries(history)
    void request(history)
  }

  const retry = () => {
    const history = entries.filter((e) => e.role !== 'error')
    setEntries(history)
    void request(history)
  }

  const updateDraft = useCallback((index: number, change: (draft: Draft) => Draft) => {
    setEntries((all) =>
      all.map((e, i) => (i === index && e.role === 'assistant' && e.draft ? { ...e, draft: change(e.draft) } : e)),
    )
  }, [])

  const create = async (index: number, draft: Draft) => {
    if (creating.current) return // a second click must not make a second playlist
    creating.current = true
    updateDraft(index, (d) => ({ ...d, creating: true, error: undefined }))
    let playlist = draft.empty
    try {
      if (!playlist) {
        playlist = await provider.createPlaylist(draft.name.trim(), draft.description)
        const empty = playlist
        updateDraft(index, (d) => ({ ...d, empty }))
      }
      await provider.addTracks(playlist.id, draft.tracks)
      const created = { ...playlist, count: draft.tracks.length }
      updateDraft(index, (d) => ({ ...d, created, creating: false }))
      onCreated(created)
    } catch (e) {
      const reason = (e as Error).message
      const error = playlist ? `“${playlist.name}” was created, but its songs couldn't be added. ${reason}` : reason
      updateDraft(index, (d) => ({ ...d, creating: false, error }))
    } finally {
      creating.current = false
    }
  }

  const clear = useCallback(() => {
    conversation.current++
    setEntries([])
    setBusy(false)
  }, [])

  return { entries, busy, send, retry, updateDraft, create, clear }
}

export type AssistantState = ReturnType<typeof useAssistant>
