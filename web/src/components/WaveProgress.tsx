import { useEffect, useRef } from 'react'

interface Props {
  positionMs: number
  durationMs: number
  playing: boolean
  disabled?: boolean
  /** Bigger wave for the full-screen view. */
  size?: 'small' | 'large'
  onScrub(ms: number): void
  onCommit(): void
}

const WAVELENGTH = 26

/**
 * A seek bar drawn as a sine wave: the played part ripples while music plays and
 * settles into a flat line when paused. A transparent range input on top handles
 * dragging and keyboard seeking.
 */
export function WaveProgress({ positionMs, durationMs, playing, disabled, size = 'small', onScrub, onCommit }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // Values the animation loop reads without restarting.
  const live = useRef({ fraction: 0, playing: false })
  live.current.fraction = durationMs ? Math.min(1, positionMs / durationMs) : 0
  live.current.playing = playing

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
    const maxAmp = size === 'large' ? 6 : 3.5
    let amp = 0
    let phase = 0
    let colors = { played: '#fff', rest: '#444' }
    let lastColorRead = 0
    let frame = 0
    let last = performance.now()

    const draw = (now: number) => {
      const dt = Math.min(64, now - last)
      last = now
      if (now - lastColorRead > 500) {
        const style = getComputedStyle(canvas)
        colors = { played: style.getPropertyValue('--wave').trim() || '#fff', rest: style.getPropertyValue('--line').trim() }
        lastColorRead = now
      }
      const dpr = devicePixelRatio || 1
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr)
        canvas.height = Math.round(h * dpr)
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)

      const target = live.current.playing ? maxAmp : 0
      amp += (target - amp) * Math.min(1, dt / 220)
      if (live.current.playing && !reduceMotion) phase += dt * 0.004

      const mid = h / 2
      const x = Math.max(0, Math.min(w, live.current.fraction * w))
      const lineWidth = size === 'large' ? 3 : 2.5
      ctx.lineCap = 'round'

      ctx.strokeStyle = colors.rest
      ctx.lineWidth = lineWidth
      ctx.beginPath()
      ctx.moveTo(x, mid)
      ctx.lineTo(w, mid)
      ctx.stroke()

      if (x > 0) {
        ctx.strokeStyle = colors.played
        ctx.beginPath()
        for (let px = 0; px <= x; px += 1) {
          // Taper the wave into the playhead so it meets the flat line smoothly.
          const taper = Math.min(1, (x - px) / 12, px / 12)
          const y = mid + Math.sin((px / WAVELENGTH) * Math.PI * 2 - phase) * amp * taper
          if (px === 0) ctx.moveTo(px, y)
          else ctx.lineTo(px, y)
        }
        ctx.stroke()
        ctx.fillStyle = colors.played
        ctx.beginPath()
        ctx.arc(x, mid, size === 'large' ? 6 : 5, 0, Math.PI * 2)
        ctx.fill()
      }

      // Keep animating only while something is moving.
      if (live.current.playing || Math.abs(amp - target) > 0.05) frame = requestAnimationFrame(draw)
      else frame = 0
    }

    const kick = () => {
      if (!frame) {
        last = performance.now()
        frame = requestAnimationFrame(draw)
      }
    }
    kick()
    const resize = new ResizeObserver(kick)
    resize.observe(canvas)
    canvas.addEventListener('wave:redraw', kick)
    return () => {
      cancelAnimationFrame(frame)
      resize.disconnect()
      canvas.removeEventListener('wave:redraw', kick)
    }
  }, [size])

  // Redraw when paused state or position changes while the loop is idle.
  useEffect(() => {
    canvasRef.current?.dispatchEvent(new Event('wave:redraw'))
  }, [positionMs, durationMs, playing])

  return (
    <div className={`wave wave-${size} ${disabled ? 'disabled' : ''}`}>
      <canvas ref={canvasRef} aria-hidden="true" />
      <input
        type="range"
        min={0}
        max={durationMs || 1}
        value={positionMs}
        disabled={disabled}
        onChange={(e) => onScrub(Number(e.target.value))}
        onPointerUp={onCommit}
        onKeyUp={onCommit}
        aria-label="Seek"
      />
    </div>
  )
}
