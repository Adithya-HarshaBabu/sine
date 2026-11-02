import { useEffect, useState } from 'react'

export interface Tint {
  /** Vivid version of the artwork's main colour, readable on the dark theme. */
  vivid: string
  /** Deep version for dark-mode backgrounds. */
  dark: string
  /** Pale version for light-mode backgrounds. */
  light: string
}

const cache = new Map<string, Tint | null>()

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h * 60, s, l]
}

/** Picks the most prominent vivid colour by averaging pixels weighted by saturation. */
async function extract(url: string): Promise<Tint | null> {
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.src = url
  await img.decode()
  const size = 32
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.drawImage(img, 0, 0, size, size)
  const data = ctx.getImageData(0, 0, size, size).data

  // Bucket by hue so one dominant hue wins instead of averaging into grey-brown.
  const buckets = new Map<number, { w: number; s: number; h: number }>()
  for (let i = 0; i < data.length; i += 4) {
    const [h, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2])
    if (l < 0.08 || l > 0.95) continue
    const weight = 0.15 + s * s * (1 - Math.abs(l - 0.5))
    const key = Math.round(h / 24)
    const b = buckets.get(key) ?? { w: 0, s: 0, h: 0 }
    b.w += weight
    b.s += s * weight
    b.h += h * weight
    buckets.set(key, b)
  }
  const best = [...buckets.values()].sort((a, b) => b.w - a.w)[0]
  if (!best) return null
  const hue = Math.round(best.h / best.w)
  const sat = Math.min(1, best.s / best.w)
  const vividSat = Math.round(Math.max(0.45, sat) * 100)
  return {
    vivid: `hsl(${hue} ${vividSat}% 62%)`,
    dark: `hsl(${hue} ${Math.round(Math.min(0.55, sat) * 100)}% 20%)`,
    light: `hsl(${hue} ${Math.round(Math.min(0.6, sat) * 100)}% 88%)`,
  }
}

export function useArtworkTint(url: string | undefined): Tint | null {
  const [tint, setTint] = useState<Tint | null>(() => (url ? (cache.get(url) ?? null) : null))
  useEffect(() => {
    if (!url) return
    if (cache.has(url)) {
      setTint(cache.get(url)!)
      return
    }
    let cancelled = false
    extract(url)
      .catch(() => null)
      .then((t) => {
        cache.set(url, t)
        if (!cancelled) setTint(t)
      })
    return () => {
      cancelled = true
    }
  }, [url])
  return url ? tint : null
}
