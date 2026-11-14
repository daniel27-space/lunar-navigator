// Elevation tiles (see docs/DATA_CONTRACT.md): the LOLA south-pole tiles and the 80 m patches
// around mission sites. Both are stereographic maps; they differ only in where the map is
// centred, which the `frame` records.
import { localFrame, spProject, upVector, type Vec3 } from './geo'
import { globalHeightAt, type GlobalDem } from './globalDem'

/** A stereographic map's axes in body-fixed coordinates: x axis, y axis and centre direction. */
export interface Frame {
  ax: Vec3
  ay: Vec3
  up: Vec3
}

/** The south-pole tiles: x towards 90E, y towards 0E, centred on the south pole. */
export const POLAR_FRAME: Frame = { ax: [0, 1, 0], ay: [1, 0, 0], up: [0, 0, -1] }

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
  /** coarse to fine: [L0 full extent, L1 central]; a site patch has one level */
  levels: Level[]
  frame: Frame
  /** patch id, absent for the south-pole tiles */
  id?: string
  /** 'crest20' for a 20 m crest patch */
  kind?: string
  /** false when the patch is used for numbers only and not drawn in 3D */
  render?: boolean
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

/** h_m = (R*256 + G) * scale + offset (0.5 and -10000 unless a patch says otherwise). Raw value 0 marks no data. */
export function decodeHeights(rgba: Uint8ClampedArray, n: number, scale = 0.5, offset = -10000): Float32Array {
  const h = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const raw = rgba[i * 4] * 256 + rgba[i * 4 + 1]
    h[i] = raw === 0 ? NaN : raw * scale + offset
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
  return { radiusM: meta.radius_m, levels, frame: POLAR_FRAME }
}

export interface PatchEntry {
  id: string
  lat: number
  lon: number
  file: string
  sites: string[]
  source: string
  /** shown to the user for patches that are not tied to a mission */
  name?: string
  /** 'crest20' for a 20 m crest patch */
  kind?: string
  render?: boolean
  /** per-patch overrides of the file-level grid and the default height encoding */
  size?: number
  pixel_m?: number
  height_scale_m?: number
  height_offset_m?: number
}
export interface PatchIndex {
  radiusM: number
  size: number
  pixelM: number
  patches: PatchEntry[]
}

/** The list of site patches, or an empty list if none are published. */
export async function loadPatchIndex(base: string): Promise<PatchIndex> {
  const r = await fetch(`${base}patches/patches.json`)
  if (!r.ok) return { radiusM: 1737400, size: 0, pixelM: 0, patches: [] }
  const j = await r.json()
  return { radiusM: j.radius_m, size: j.size, pixelM: j.pixel_m, patches: j.patches }
}

export function patchFrame(latDeg: number, lonDeg: number): Frame {
  const f = localFrame(latDeg, lonDeg)
  return { ax: f.e, ay: f.n, up: f.u }
}

const sizeOf = (index: PatchIndex, e: PatchEntry) => e.size ?? index.size
const pixelOf = (index: PatchIndex, e: PatchEntry) => e.pixel_m ?? index.pixelM

export function patchTerrain(index: PatchIndex, entry: PatchEntry, h: Float32Array): Terrain {
  const size = sizeOf(index, entry)
  const pixel = pixelOf(index, entry)
  const half = (size * pixel) / 2
  return {
    radiusM: index.radiusM,
    levels: [{ size, xMin: -half, xMax: half, yMin: -half, yMax: half, pixel, h }],
    frame: patchFrame(entry.lat, entry.lon),
    id: entry.id,
    kind: entry.kind,
    render: entry.render,
  }
}

/** Heights of a patch image, using the entry's own encoding if it has one. */
export function decodePatch(index: PatchIndex, entry: PatchEntry, rgba: Uint8ClampedArray): Float32Array {
  const size = sizeOf(index, entry)
  return decodeHeights(rgba, size * size, entry.height_scale_m ?? 0.5, entry.height_offset_m ?? -10000)
}

export async function loadPatch(base: string, index: PatchIndex, entry: PatchEntry): Promise<Terrain> {
  const img = await decodePng(`${base}patches/${entry.file}`)
  return patchTerrain(index, entry, decodePatch(index, entry, img.data))
}

/**
 * The patch whose map contains (lat, lon), keeping clear of its edge (2 km, or 30 % of the
 * half-width for a small patch). The finest patch wins, then the nearest centre.
 */
export function patchCovering(index: PatchIndex, latDeg: number, lonDeg: number): PatchEntry | null {
  const d = upVector(latDeg, lonDeg)
  let best: PatchEntry | null = null
  let bestC = 0
  let bestPixel = Infinity
  for (const p of index.patches) {
    const pixel = pixelOf(index, p)
    const full = (sizeOf(index, p) * pixel) / 2
    const half = full - Math.min(2000, full * 0.3)
    const f = patchFrame(p.lat, p.lon)
    const xy = frameProject(f, d[0], d[1], d[2], index.radiusM)
    if (!xy || Math.abs(xy[0]) > half || Math.abs(xy[1]) > half) continue
    const c = d[0] * f.up[0] + d[1] * f.up[1] + d[2] * f.up[2]
    if (pixel < bestPixel || (pixel === bestPixel && c > bestC)) {
      bestPixel = pixel
      bestC = c
      best = p
    }
  }
  return best
}

/** Map (x, y) of a body-fixed unit direction, or null on the far side from the map's centre. */
export function frameProject(f: Frame, dx: number, dy: number, dz: number, radius: number): [number, number] | null {
  const c = dx * f.up[0] + dy * f.up[1] + dz * f.up[2]
  if (c < 0.2) return null
  const k = (2 * radius) / (1 + c)
  return [k * (dx * f.ax[0] + dy * f.ax[1] + dz * f.ax[2]), k * (dx * f.ay[0] + dy * f.ay[1] + dz * f.ay[2])]
}

/** Body-fixed unit direction of map (x, y). No trig, exact at the centre. */
export function frameDirection(f: Frame, x: number, y: number, radius: number): Vec3 {
  const rho2 = (x * x + y * y) / (4 * radius * radius)
  const k = 1 / (1 + rho2)
  const a = (x / radius) * k
  const b = (y / radius) * k
  const c = (1 - rho2) * k
  return [a * f.ax[0] + b * f.ay[0] + c * f.up[0], a * f.ax[1] + b * f.ay[1] + c * f.up[1], a * f.ax[2] + b * f.ay[2] + c * f.up[2]]
}

/** Height in metres at a body-fixed unit direction; NaN where this terrain has no data. */
export function sampleDir(t: Terrain, dx: number, dy: number, dz: number): number {
  const f = t.frame
  const c = dx * f.up[0] + dy * f.up[1] + dz * f.up[2]
  if (c < 0.2) return NaN
  const k = (2 * t.radiusM) / (1 + c)
  return sampleXY(t, k * (dx * f.ax[0] + dy * f.ax[1] + dz * f.ax[2]), k * (dx * f.ay[0] + dy * f.ay[1] + dz * f.ay[2]))
}

/**
 * Where heights come from, in lookup order (docs/DATA_CONTRACT.md): the detailed terrains
 * first (a site patch, then the south-pole tiles), then the whole-Moon map, which never fails.
 */
export interface HeightSource {
  terrains: Terrain[]
  global: GlobalDem | null
}

const R2D = 180 / Math.PI

/** Height in metres at a body-fixed unit direction from the first source that has data; NaN if none. */
export function sourceHeight(src: HeightSource, dx: number, dy: number, dz: number): number {
  for (let i = 0; i < src.terrains.length; i++) {
    const h = sampleDir(src.terrains[i], dx, dy, dz)
    if (!Number.isNaN(h)) return h
  }
  if (!src.global) return NaN
  return globalHeightAt(src.global, Math.asin(Math.min(1, Math.max(-1, dz))) * R2D, Math.atan2(dy, dx) * R2D)
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
  const d = upVector(latDeg, lonDeg)
  return sampleDir(t, d[0], d[1], d[2])
}

export type TerrainTier = 'fine' | 'coarse' | 'none'

/** Which south-pole tile covers a point: the 80 m tile, only the ~300 m tile, or neither. */
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
  const u = upVector(latDeg, lonDeg)
  const xy = frameProject(t.frame, u[0], u[1], u[2], t.radiusM)
  if (!xy) return NaN
  const [x, y] = xy
  for (let k = t.levels.length - 1; k >= 0; k--) {
    const l = t.levels[k]
    const d = l.pixel
    const hx = sampleLevel(l, x + d, y) - sampleLevel(l, x - d, y)
    const hy = sampleLevel(l, x, y + d) - sampleLevel(l, x, y - d)
    if (Number.isNaN(hx) || Number.isNaN(hy)) continue
    // Stereographic map distance is stretched by 1 + rho^2 relative to the ground
    // (2 / (1 + sin|lat|) for the south-pole tiles).
    const scale = 1 + (x * x + y * y) / (4 * t.radiusM * t.radiusM)
    const ground = (2 * d) / scale
    return Math.atan(Math.hypot(hx, hy) / ground) * (180 / Math.PI)
  }
  return NaN
}
