export type ProviderId = 'spotify'

export interface Track {
  id: string
  /** What the provider needs to play it: a Spotify URI. */
  uri: string
  title: string
  artist: string
  album: string
  artwork?: string
  durationMs: number
  provider: ProviderId
}

export interface Playlist {
  id: string
  name: string
  artwork?: string
  count?: number
  /** Whether the provider will list this playlist's tracks (Spotify only shares them for playlists you own or collaborate on). */
  readable: boolean
}

export interface Artist {
  id: string
  name: string
  image?: string
}

export interface Home {
  recent: Track[]
  topArtists: Artist[]
}

export interface Page {
  tracks: Track[]
  total: number
}

export type RepeatMode = 'off' | 'context' | 'track'

export interface PlaybackState {
  track: Track | null
  isPlaying: boolean
  positionMs: number
  durationMs: number
  shuffle: boolean
  repeat: RepeatMode
  /** Date.now() when positionMs was read, so the UI can interpolate between updates. */
  updatedAt: number
}

export const emptyState: PlaybackState = {
  track: null,
  isPlaying: false,
  positionMs: 0,
  durationMs: 0,
  shuffle: false,
  repeat: 'off',
  updatedAt: 0,
}

export interface Account {
  name: string
  image?: string
}

export interface MusicProvider {
  id: ProviderId
  name: string
  /** True when the required env var is set. */
  configured: boolean
  /** Restores a previous session (and finishes an OAuth redirect). Resolves to whether the user is signed in. */
  restore(): Promise<boolean>
  /** Goes to the provider's sign-in page. chooseAccount lets someone switch from the account the provider remembers. */
  connect(options?: { chooseAccount?: boolean }): Promise<void>
  disconnect(): Promise<void>
  /** Who is signed in. */
  account(): Promise<Account>
  /** A current sign-in token, so Sine's own server can check who is calling. */
  authToken(): Promise<string>
  /** The best match for a song, or null if there isn't one. */
  findTrack(title: string, artist: string): Promise<Track | null>
  /** Creates an empty private playlist in the user's library. */
  createPlaylist(name: string, description: string): Promise<Playlist>
  /** Adds up to 100 tracks to a playlist. */
  addTracks(playlistId: string, tracks: Track[]): Promise<void>
  search(query: string): Promise<Track[]>
  playlists(): Promise<Playlist[]>
  playlistTracks(id: string, offset: number): Promise<Page>
  savedTracks(offset: number): Promise<Page>
  /** Plays tracks[index]; pass playlistId to play inside that playlist so the queue continues through it. */
  play(tracks: Track[], index: number, playlistId?: string): Promise<void>
  playPlaylist(id: string): Promise<void>
  /** True when the saved sign-in predates permissions the app now asks for, so the user should reconnect. */
  needsReconnect(): boolean
  home(): Promise<Home>
  /** Whether each track is in the user's liked songs (same order as the input). */
  isSaved(tracks: Track[]): Promise<boolean[]>
  setSaved(track: Track, saved: boolean): Promise<void>
  /** Upcoming tracks in the player's queue (what plays after the current track). */
  queue(): Promise<Track[]>
  /** An official embeddable player for a playlist, for when its track list can't be read. */
  playlistEmbedUrl?(id: string): string
  togglePlay(): Promise<void>
  next(): Promise<void>
  previous(): Promise<void>
  seek(ms: number): Promise<void>
  setVolume(volume: number): Promise<void>
  setShuffle(on: boolean): Promise<void>
  setRepeat(mode: RepeatMode): Promise<void>
  onState(cb: (state: PlaybackState) => void): () => void
  /** Fires with a message to show, or null when the problem it reported has cleared. */
  onError(cb: (message: string | null) => void): () => void
  /** Fires when the sign-in can no longer be used (revoked or expired), with a message to show. */
  onSessionEnded(cb: (message: string) => void): () => void
}
