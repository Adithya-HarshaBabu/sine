import { useMemo, useState } from 'react'
import { ChevronDownIcon, SearchIcon } from '../icons'
import { readPref, writePref } from '../lib/prefs'
import type { Playlist } from '../types'

interface Props {
  /** null while loading. */
  playlists: Playlist[] | null
  error: string | null
  currentId?: string
  onOpen(playlist: Playlist): void
  onRetry(): void
}

// Short libraries don't need a filter box taking up space.
const FILTER_THRESHOLD = 8

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()

export function PlaylistNav({ playlists, error, currentId, onOpen, onRetry }: Props) {
  const [filter, setFilter] = useState('')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => readPref('collapsedPlaylistGroups', {}))

  const list = playlists ?? []
  const groups = useMemo(
    () => [
      { id: 'yours', label: 'Your playlists', items: list.filter((p) => p.readable) },
      { id: 'following', label: 'Following', items: list.filter((p) => !p.readable) },
    ],
    [list], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const query = fold(filter.trim())
  const matches = query ? list.filter((p) => fold(p.name).includes(query)) : []
  // A single group needs no heading of its own: the "Playlists" label already covers it.
  const grouped = groups.every((g) => g.items.length > 0)

  const toggleGroup = (id: string) => {
    const next = { ...collapsed, [id]: !collapsed[id] }
    setCollapsed(next)
    writePref('collapsedPlaylistGroups', next)
  }

  const row = (p: Playlist) => (
    <button key={p.id} className={currentId === p.id ? 'current' : ''} onClick={() => onOpen(p)}>
      {p.artwork ? <img src={p.artwork} alt="" loading="lazy" /> : <span className="ph" />}
      <span className="pl-meta">
        <span className="truncate">{p.name}</span>
        <span className="small muted truncate">{p.readable ? `${p.count ?? 0} songs` : 'Following'}</span>
      </span>
    </button>
  )

  return (
    <div className="library">
      {list.length > FILTER_THRESHOLD && (
        <div className="pl-filter">
          <SearchIcon width={16} height={16} />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setFilter('')}
            placeholder="Filter playlists"
            aria-label="Filter playlists"
          />
          {filter && (
            <button onClick={() => setFilter('')} aria-label="Clear filter">
              ×
            </button>
          )}
        </div>
      )}
      <div className="playlists">
        {error ? (
          <div className="muted small pl-note">
            Couldn't load your playlists.
            <button className="retry-btn" onClick={onRetry}>
              Try again
            </button>
          </div>
        ) : !playlists ? (
          <div className="muted small pl-note">Loading playlists…</div>
        ) : list.length === 0 ? (
          <div className="muted small pl-note">No playlists yet</div>
        ) : query ? (
          matches.length > 0 ? (
            matches.map(row)
          ) : (
            <div className="muted small pl-note">No playlists match “{filter.trim()}”</div>
          )
        ) : grouped ? (
          groups.map((g) => (
            <section key={g.id} className="pl-group">
              <button
                className="pl-group-head"
                aria-expanded={!collapsed[g.id]}
                onClick={() => toggleGroup(g.id)}
              >
                <ChevronDownIcon width={16} height={16} />
                <span className="truncate">{g.label}</span>
                <span className="pl-count">{g.items.length}</span>
              </button>
              {!collapsed[g.id] && g.items.map(row)}
            </section>
          ))
        ) : (
          list.map(row)
        )}
      </div>
    </div>
  )
}
