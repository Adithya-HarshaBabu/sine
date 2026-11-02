import type { Track } from '../types'

// Time-synced lyrics from LRCLIB (https://lrclib.net), a free, open lyrics database.
// Spotify's API doesn't expose lyrics, so matching is by title, artist, album and duration.

export interface LyricLine {
  timeMs: number
  text: string
}

export interface Lyrics {
  synced: LyricLine[] | null
  plain: string | null
  instrumental: boolean
}

interface LrclibRecord {
  duration: number
  instrumental: boolean
  plainLyrics: string | null
  syncedLyrics: string | null
}

const cache = new Map<string, Promise<Lyrics | null>>()

function parseLrc(lrc: string): LyricLine[] {
  const lines: LyricLine[] = []
  for (const raw of lrc.split('\n')) {
    const stamps = [...raw.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)]
    const text = raw.replace(/\[[^\]]*\]/g, '').trim()
    for (const [, m, s] of stamps) lines.push({ timeMs: (Number(m) * 60 + Number(s)) * 1000, text })
  }
  return lines.sort((a, b) => a.timeMs - b.timeMs)
}

const toLyrics = (r: LrclibRecord): Lyrics => ({
  synced: r.syncedLyrics ? parseLrc(r.syncedLyrics) : null,
  plain: r.plainLyrics,
  instrumental: r.instrumental,
})

// "Song - Remastered 2011" / "Song (feat. X)" → "Song"
const cleanTitle = (title: string) => title.split(' - ')[0].replace(/\s*[([](feat|with|ft)\.?[^)\]]*[)\]]/i, '').trim()

async function lookup(track: Track): Promise<Lyrics | null> {
  const artist = track.artist.split(', ')[0]
  const duration = Math.round(track.durationMs / 1000)
  const exact = await fetch(
    `https://lrclib.net/api/get?${new URLSearchParams({
      artist_name: artist,
      track_name: track.title,
      album_name: track.album,
      duration: String(duration),
    })}`,
  )
  if (exact.ok) return toLyrics(await exact.json())

  const search = await fetch(
    `https://lrclib.net/api/search?${new URLSearchParams({ artist_name: artist, track_name: cleanTitle(track.title) })}`,
  )
  if (!search.ok) return null
  const results: LrclibRecord[] = await search.json()
  const close = results.filter((r) => Math.abs(r.duration - duration) <= 4)
  const best = close.find((r) => r.syncedLyrics) ?? close.find((r) => r.plainLyrics) ?? close[0]
  return best ? toLyrics(best) : null
}

export function fetchLyrics(track: Track): Promise<Lyrics | null> {
  let pending = cache.get(track.uri)
  if (!pending) {
    pending = lookup(track).catch(() => null)
    cache.set(track.uri, pending)
  }
  return pending
}
