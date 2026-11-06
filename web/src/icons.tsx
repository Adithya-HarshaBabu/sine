import type { SVGProps } from 'react'

const Icon = ({ d, ...props }: SVGProps<SVGSVGElement> & { d: string }) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true" {...props}>
    <path d={d} />
  </svg>
)

export const PlayIcon = (p: SVGProps<SVGSVGElement>) => <Icon d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86A1 1 0 0 0 8 5.14Z" {...p} />
export const PauseIcon = (p: SVGProps<SVGSVGElement>) => <Icon d="M7 4h3.5v16H7zM13.5 4H17v16h-3.5z" {...p} />
export const NextIcon = (p: SVGProps<SVGSVGElement>) => <Icon d="M5 5.5v13a1 1 0 0 0 1.53.85L15 14.2V18h3V6h-3v3.8L6.53 4.65A1 1 0 0 0 5 5.5Z" {...p} />
export const PrevIcon = (p: SVGProps<SVGSVGElement>) => <Icon d="M19 5.5v13a1 1 0 0 1-1.53.85L9 14.2V18H6V6h3v3.8l8.47-5.15A1 1 0 0 1 19 5.5Z" {...p} />
export const SearchIcon = (p: SVGProps<SVGSVGElement>) => <Icon d="M10.5 3a7.5 7.5 0 0 1 5.96 12.05l4.25 4.24-1.42 1.42-4.24-4.25A7.5 7.5 0 1 1 10.5 3Zm0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Z" {...p} />
export const HeartIcon = (p: SVGProps<SVGSVGElement>) => <Icon d="M12 20.5 10.6 19.2C5.4 14.5 2 11.4 2 7.6 2 4.5 4.4 2 7.5 2c1.7 0 3.4.8 4.5 2.1A6 6 0 0 1 16.5 2C19.6 2 22 4.5 22 7.6c0 3.8-3.4 6.9-8.6 11.6L12 20.5Z" {...p} />
export const VolumeIcon = (p: SVGProps<SVGSVGElement>) => <Icon d="M4 9h4l5-4v14l-5-4H4V9Zm12.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4Z" {...p} />
export const NoteIcon = (p: SVGProps<SVGSVGElement>) => <Icon d="M9 3v10.55A4 4 0 1 0 11 17V7h6V3H9Z" {...p} />
export const ShuffleIcon = (p: SVGProps<SVGSVGElement>) => <Icon d="M17 3l4 4-4 4V8h-2.2l-3.1 4 3.1 4H17v-3l4 4-4 4v-3h-3.2l-3.4-4.4L7 18H3v-2h3l3.1-4L6 8H3V6h4l3.4 4.4L13.8 6H17V3Z" {...p} />
export const RepeatIcon = (p: SVGProps<SVGSVGElement>) => <Icon d="M7 7h10v3l4-4-4-4v3H5v6h2V7Zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4Z" {...p} />
export const RepeatOneIcon = (p: SVGProps<SVGSVGElement>) => <Icon d="M7 7h10v3l4-4-4-4v3H5v6h2V7Zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4Zm-4-2V9h-1l-2 1v1h1.5v4H13Z" {...p} />
export const QueueIcon = (p: SVGProps<SVGSVGElement>) => <Icon d="M3 5h13v2H3V5Zm0 6h13v2H3v-2Zm0 6h8v2H3v-2Zm12 0v-4l6 3-6 3v-2Z" {...p} />
export const SparkIcon = (p: SVGProps<SVGSVGElement>) => <Icon d="M11 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6Zm8 12 .9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15Z" {...p} />
export const SineIcon =(p: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true" {...p}>
    <path d="M2 12c2.5-8 5.5-8 8 0s5.5 8 8 0 3-4 4-4" />
  </svg>
)
export const HeartOutlineIcon = (p: SVGProps<SVGSVGElement>) => <Icon d="M16.5 3A5.5 5.5 0 0 1 22 8.5c0 3.8-3.4 6.9-8.6 11.6L12 21.4l-1.4-1.3C5.4 15.4 2 12.3 2 8.5A5.5 5.5 0 0 1 7.5 3c1.7 0 3.4.8 4.5 2.1A6 6 0 0 1 16.5 3Zm-4.4 15.1c4.8-4.3 7.9-7.1 7.9-9.6A3.5 3.5 0 0 0 16.5 5c-1.5 0-3 1-3.6 2.4h-1.8C10.5 6 9 5 7.5 5A3.5 3.5 0 0 0 4 8.5c0 2.5 3.1 5.3 7.9 9.6l.1.1.1-.1Z" {...p} />
export const LyricsIcon = (p: SVGProps<SVGSVGElement>) => <Icon d="M4 4h12a2 2 0 0 1 2 2v3h-2V6H4v12h6v2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm2 4h8v2H6V8Zm0 4h5v2H6v-2Zm13 0a3 3 0 0 1 3 3 3 3 0 0 1-2 2.83V22h-2v-4.17A3 3 0 0 1 16 15a3 3 0 0 1 3-3Z" {...p} />
export const ChevronDownIcon = (p: SVGProps<SVGSVGElement>) => <Icon d="M6.4 8.6 12 14.2l5.6-5.6L19 10l-7 7-7-7 1.4-1.4Z" {...p} />
export const HomeIcon = (p: SVGProps<SVGSVGElement>) => <Icon d="M12 3 2 11h3v9h6v-6h2v6h6v-9h3L12 3Z" {...p} />
export const ExpandIcon = (p: SVGProps<SVGSVGElement>) => <Icon d="M4 4h6v2H7.4l3.3 3.3-1.4 1.4L6 7.4V10H4V4Zm10 0h6v6h-2V7.4l-3.3 3.3-1.4-1.4L16.6 6H14V4ZM4 14h2v2.6l3.3-3.3 1.4 1.4L7.4 18H10v2H4v-6Zm16 0v6h-6v-2h2.6l-3.3-3.3 1.4-1.4 3.3 3.3V14h2Z" {...p} />
