// LOLA south-pole elevation tiles (see docs/DATA_CONTRACT.md).
import { spProject } from './geo'

export interface Level {
  size: number
  xMin: number
  xMax: number
  yMin: number
  yMax: number
  pixel: number
  /** metres above the reference sphere, row 0 = max y; NaN where there is no data */
  h: Float32Array
}

export interface Terrain {
  radiusM: number
  /** coarse to fine: [L0 full extent, L1 central] */
  levels: Level[]
}

export async function decodePng(url: string): Promise<ImageData> {
  const blob = await (await fetch(url)).blob()
  const bmp = await createImageBitmap(blob, {
    colorSpaceConversion: 'none',
    premultiplyAlpha: 'none',
  })
  const canvas = new OffscreenCanvas(bmp.width, bmp.height)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(bmp, 0, 0)
  return ctx.getImageData(0, 0, bmp.width, bmp.height)
}

/** h_m = (R*256 + G) * 0.5 - 10000. Raw value 0 marks no data. */
export function decodeHeights(rgba: Uint8ClampedArray, n: number): Float32Array {
  const h = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const raw = rgba[i * 4] * 256 + rgba[i * 4 + 1]
    h[i] = raw === 0 ? NaN : raw * 0.5 - 10000
  }
  return h
}

export async function loadTerrain(base: string): Promise<Terrain> {
  const meta = await (await fetch(`${base}terrain/sp_meta.json`)).json()
  const levels: Level[] = []
  for (const l of meta.levels) {
    const img = await decodePng(`${base}terrain/${l.file}`)
    levels.push({
      size: l.size,
      xMin: l.x_min_m,
      xMax: l.x_max_m,
      yMin: l.y_min_m,
      yMax: l.y_max_m,
      pixel: l.pixel_m,
      h: decodeHeights(img.data, l.size * l.size),
    })
  }
  return { radiusM: meta.radius_m, levels }
}

/** Bilinear height in metres at projected (x, y) metres, or NaN outside the level. */
export function sampleLevel(l: Level, x: number, y: number): number {
  // Pixel centres sit at xMin + (c + 0.5) * pixel and yMax - (r + 0.5) * pixel.
  const fc = (x - l.xMin) / l.pixel - 0.5
  const fr = (l.yMax - y) / l.pixel - 0.5
  if (fc < 0 || fr < 0 || fc > l.size - 1 || fr > l.size - 1) return NaN
  const c0 = Math.min(Math.floor(fc), l.size - 2)
  const r0 = Math.min(Math.floor(fr), l.size - 2)
  const wc = fc - c0
  const wr = fr - r0
  const i = r0 * l.size + c0
  const h = l.h
  return (
    (h[i] * (1 - wc) + h[i + 1] * wc) * (1 - wr) +
    (h[i + l.size] * (1 - wc) + h[i + l.size + 1] * wc) * wr
  )
}

/** Height from the finest level that covers (x, y); NaN if none does. */
export function sampleXY(t: Terrain, x: number, y: number): number {
  for (let k = t.levels.length - 1; k >= 0; k--) {
    const v = sampleLevel(t.levels[k], x, y)
    if (!Number.isNaN(v)) return v
  }
  return NaN
}

export function heightAt(t: Terrain, latDeg: number, lonDeg: number): number {
  const [x, y] = spProject(latDeg, lonDeg, t.radiusM)
  return sampleXY(t, x, y)
}

export type TerrainTier = 'fine' | 'coarse' | 'none'

/** Which elevation data covers a point: the 80 m tile, only the ~300 m tile, or nothing. */
export function terrainTier(t: Terrain, latDeg: number, lonDeg: number): TerrainTier {
  const [x, y] = spProject(latDeg, lonDeg, t.radiusM)
  if (latDeg > -60) return 'none'
  for (let k = t.levels.length - 1; k >= 0; k--) {
    if (!Number.isNaN(sampleLevel(t.levels[k], x, y))) return k === 0 ? 'coarse' : 'fine'
  }
  return 'none'
}

/** Surface slope in degrees at a point, by central differences on the finest tile there. */
export function slopeAt(t: Terrain, latDeg: number, lonDeg: number): number {
  const [x, y] = spProject(latDeg, lonDeg, t.radiusM)
  for (let k = t.levels.length - 1; k >= 0; k--) {
    const l = t.levels[k]
    const d = l.pixel
    const hx = sampleLevel(l, x + d, y) - sampleLevel(l, x - d, y)
    const hy = sampleLevel(l, x, y + d) - sampleLevel(l, x, y - d)
    if (Number.isNaN(hx) || Number.isNaN(hy)) continue
    // Stereographic map distance is stretched by 2 / (1 + sin|lat|) relative to the ground.
    const scale = 2 / (1 + Math.sin(Math.abs(latDeg) * (Math.PI / 180)))
    const ground = (2 * d) / scale
    return Math.atan(Math.hypot(hx, hy) / ground) * (180 / Math.PI)
  }
  return NaN
}
