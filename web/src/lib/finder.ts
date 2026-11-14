// Site finder: turn "what I need from a landing site" into a suitability map and a ranked
// shortlist. Everything is computed on the 2048 x 2048 south-pole grid (about 300 m cells) from
// the published layers: slope (LOLA), long-term sunlight and Earth visibility and permanent
// shadow (NASA GSFC, Mazarico et al. 2011).
//
// Two steps, as in multi-criteria site selection generally:
//   1. eliminate - every hard limit must hold, or the cell is out;
//   2. rank - among the cells left, score how well each meets the stated preferences.
import { spUnproject } from './geo'
import { decodePng } from './terrain'

export interface FinderGrid {
  size: number
  pixelM: number
  xMin: number
  yMax: number
  radiusM: number
  /** degrees; inside the 80 m tile the steepest 80 m slope in the cell, outside it the cell average */
  slope: Float32Array
  /** long-term share of time the Sun is visible, 0..1; NaN where NASA's map has no value */
  sun: Float32Array
  /** long-term share of time Earth is visible, 0..1; NaN where there is no value */
  earth: Float32Array
  /** 1 where permanently shadowed */
  psr: Uint8Array
  /** km to the nearest permanently shadowed cell (0 inside one) */
  psrKm: Float32Array
}

export type Prefer = 'high' | 'low' | 'none'

export interface FinderCriteria {
  /** hard limit, degrees */
  maxSlopeDeg: number
  /** hard limits on the long-term share of time in sunlight, 0..1 */
  sunMin: number
  sunMax: number
  /** among eligible cells: more sunlight is better, less is better, or it does not matter */
  sunPrefer: Prefer
  /** hard limits on the long-term share of time with Earth in view, 0..1 */
  earthMin: number
  earthMax: number
  earthPrefer: Prefer
  /** permanent shadow: no requirement, must be inside, or must be outside */
  psr: 'any' | 'inside' | 'outside'
  /** hard limit: at most this far from permanent shadow (ice access); null = no requirement */
  maxPsrKm: number | null
}

export interface Preset {
  id: string
  label: string
  /** used to name pinned candidates, e.g. "Solar #1" */
  short: string
  blurb: string
  criteria: FinderCriteria
}

export const PRESETS: Preset[] = [
  {
    id: 'solar',
    label: 'Solar-powered lander',
    short: 'Solar',
    blurb: 'Flat ground with as much sunlight as possible and a radio link to Earth.',
    criteria: { maxSlopeDeg: 10, sunMin: 0.35, sunMax: 1, sunPrefer: 'high', earthMin: 0.5, earthMax: 1, earthPrefer: 'high', psr: 'outside', maxPsrKm: null },
  },
  {
    id: 'ice',
    label: 'Ice prospecting',
    short: 'Ice',
    blurb: 'Ground that almost never sees the Sun, cold enough to keep ice, but still in touch with Earth.',
    criteria: { maxSlopeDeg: 10, sunMin: 0, sunMax: 0.05, sunPrefer: 'low', earthMin: 0.5, earthMax: 1, earthPrefer: 'high', psr: 'any', maxPsrKm: null },
  },
  {
    id: 'base',
    label: 'Base next to ice',
    short: 'Base',
    blurb: 'Sunlit, flat ground within a short drive of permanent shadow.',
    criteria: { maxSlopeDeg: 8, sunMin: 0.35, sunMax: 1, sunPrefer: 'high', earthMin: 0.5, earthMax: 1, earthPrefer: 'high', psr: 'outside', maxPsrKm: 5 },
  },
  {
    id: 'quiet',
    label: 'Radio-quiet site',
    short: 'Quiet',
    blurb: 'Hidden from Earth (and its radio noise) with sunlight for power.',
    criteria: { maxSlopeDeg: 8, sunMin: 0.35, sunMax: 1, sunPrefer: 'high', earthMin: 0, earthMax: 0.05, earthPrefer: 'low', psr: 'outside', maxPsrKm: null },
  },
]

export interface Candidate {
  rank: number
  lat: number
  lon: number
  /** 0..1, how well the spot meets the preferences (its 900 m neighbourhood, not one cell) */
  score: number
  slopeDeg: number
  sun: number
  earth: number
  psrKm: number
  inPsr: boolean
}

export interface FinderResult {
  /** per cell: 0 = eliminated, 1..255 = eligible, brighter is better */
  score: Uint8Array
  eligibleKm2: number
  /** lowest and highest preference value among eligible cells, 0..1 (used to stretch the map colours) */
  minPref: number
  maxPref: number
  /** share of the mapped area that passes each limit on its own, 0..1: shows which limit bites */
  passAlone: { slope: number; sun: number; earth: number; psr: number }
  candidates: Candidate[]
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

/** Distance in cells to the nearest set cell (two-pass 3-4 chamfer, within a few percent of true distance). */
export function distanceToMask(mask: Uint8Array, size: number): Float32Array {
  const BIG = 1e9
  const d = new Float32Array(size * size)
  for (let i = 0; i < d.length; i++) d[i] = mask[i] ? 0 : BIG
  const A = 1
  const B = Math.SQRT2
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const i = r * size + c
      let v = d[i]
      if (c > 0) v = Math.min(v, d[i - 1] + A)
      if (r > 0) {
        v = Math.min(v, d[i - size] + A)
        if (c > 0) v = Math.min(v, d[i - size - 1] + B)
        if (c < size - 1) v = Math.min(v, d[i - size + 1] + B)
      }
      d[i] = v
    }
  }
  for (let r = size - 1; r >= 0; r--) {
    for (let c = size - 1; c >= 0; c--) {
      const i = r * size + c
      let v = d[i]
      if (c < size - 1) v = Math.min(v, d[i + 1] + A)
      if (r < size - 1) {
        v = Math.min(v, d[i + size] + A)
        if (c < size - 1) v = Math.min(v, d[i + size + 1] + B)
        if (c > 0) v = Math.min(v, d[i + size - 1] + B)
      }
      d[i] = v
    }
  }
  return d
}

function limits(g: FinderGrid, c: FinderCriteria, i: number) {
  const sun = g.sun[i]
  const earth = g.earth[i]
  const known = !Number.isNaN(sun) && !Number.isNaN(earth) && !Number.isNaN(g.slope[i])
  return {
    known,
    slope: g.slope[i] <= c.maxSlopeDeg,
    sun: sun >= c.sunMin && sun <= c.sunMax,
    earth: earth >= c.earthMin && earth <= c.earthMax,
    psr:
      (c.psr === 'any' || (c.psr === 'inside') === (g.psr[i] === 1)) &&
      (c.maxPsrKm === null || g.psrKm[i] <= c.maxPsrKm),
  }
}

/** 0..1 for an eligible cell: the mean of the preference terms that are switched on. */
function preference(g: FinderGrid, c: FinderCriteria, i: number): number {
  let sum = 0
  let n = 0
  // Flatter is always better.
  sum += 1 - clamp01(g.slope[i] / Math.max(c.maxSlopeDeg, 1e-6))
  n++
  const span = (v: number, lo: number, hi: number, p: Prefer) => {
    if (p === 'none') return
    const t = hi > lo ? clamp01((v - lo) / (hi - lo)) : 1
    sum += p === 'high' ? t : 1 - t
    n++
  }
  span(g.sun[i], c.sunMin, c.sunMax, c.sunPrefer)
  span(g.earth[i], c.earthMin, c.earthMax, c.earthPrefer)
  if (c.maxPsrKm !== null && c.psr !== 'inside') {
    sum += 1 - clamp01(g.psrKm[i] / Math.max(c.maxPsrKm, 1e-6))
    n++
  }
  return sum / n
}

export function runFinder(
  g: FinderGrid,
  c: FinderCriteria,
  opts: { maxCandidates?: number; minSeparationKm?: number } = {},
): FinderResult {
  const n = g.size * g.size
  const score = new Uint8Array(n)
  const pref = new Float32Array(n)
  const pass = { slope: 0, sun: 0, earth: 0, psr: 0 }
  let known = 0
  let eligibleM2 = 0
  let maxPref = 0
  let minPref = 1
  const R4 = 4 * g.radiusM * g.radiusM
  for (let i = 0; i < n; i++) {
    const l = limits(g, c, i)
    if (!l.known) continue
    known++
    if (l.slope) pass.slope++
    if (l.sun) pass.sun++
    if (l.earth) pass.earth++
    if (l.psr) pass.psr++
    if (!(l.slope && l.sun && l.earth && l.psr)) continue
    const p = preference(g, c, i)
    pref[i] = p
    if (p > maxPref) maxPref = p
    if (p < minPref) minPref = p
    score[i] = 1 + Math.round(254 * p)
    // Ground area of a map cell: the stereographic map is stretched by (1 + rho^2).
    const x = g.xMin + ((i % g.size) + 0.5) * g.pixelM
    const y = g.yMax - (Math.floor(i / g.size) + 0.5) * g.pixelM
    const k = 1 + (x * x + y * y) / R4
    eligibleM2 += (g.pixelM * g.pixelM) / (k * k)
  }

  // Shortlist: best 3 x 3 neighbourhoods (about 900 m across, eliminated cells count as zero),
  // kept apart so the list is a set of distinct places rather than one hill eight times.
  const size = g.size
  const area = new Float32Array(n)
  for (let r = 1; r < size - 1; r++) {
    for (let col = 1; col < size - 1; col++) {
      const i = r * size + col
      if (!score[i]) continue
      let s = 0
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) s += pref[i + dr * size + dc] * (score[i + dr * size + dc] ? 1 : 0)
      // Small bonus so a fully eligible neighbourhood beats a lone good cell.
      area[i] = s / 9 + 1e-3
    }
  }
  const sep = Math.max(1, Math.round(((opts.minSeparationKm ?? 8) * 1000) / g.pixelM))
  const candidates: Candidate[] = []
  const max = opts.maxCandidates ?? 8
  while (candidates.length < max) {
    let best = -1
    let bestV = 0
    for (let i = 0; i < n; i++) {
      if (area[i] > bestV) {
        bestV = area[i]
        best = i
      }
    }
    if (best < 0) break
    const r0 = Math.floor(best / size)
    const c0 = best % size
    const x = g.xMin + (c0 + 0.5) * g.pixelM
    const y = g.yMax - (r0 + 0.5) * g.pixelM
    const ll = spUnproject(x, y, g.radiusM)
    candidates.push({
      rank: candidates.length + 1,
      lat: ll.lat,
      lon: ll.lon,
      score: Math.min(bestV, 1),
      slopeDeg: g.slope[best],
      sun: g.sun[best],
      earth: g.earth[best],
      psrKm: g.psrKm[best],
      inPsr: g.psr[best] === 1,
    })
    for (let r = Math.max(0, r0 - sep); r <= Math.min(size - 1, r0 + sep); r++) {
      for (let col = Math.max(0, c0 - sep); col <= Math.min(size - 1, c0 + sep); col++) {
        if ((r - r0) * (r - r0) + (col - c0) * (col - c0) <= sep * sep) area[r * size + col] = 0
      }
    }
  }

  const share = (v: number) => (known ? v / known : 0)
  return {
    score,
    eligibleKm2: eligibleM2 / 1e6,
    minPref: Math.min(minPref, maxPref),
    maxPref,
    passAlone: { slope: share(pass.slope), sun: share(pass.sun), earth: share(pass.earth), psr: share(pass.psr) },
    candidates,
  }
}

/**
 * Slope per coarse cell: the coarse tile's value, replaced inside the fine tile by the steepest
 * fine-tile slope that falls in the cell (a landing has to survive the worst of it).
 */
export function mergeSlope(
  coarse: Float32Array,
  size0: number,
  x0Min: number,
  y0Max: number,
  pixel0: number,
  fine: Float32Array,
  size1: number,
  x1Min: number,
  y1Max: number,
  pixel1: number,
): Float32Array {
  const out = coarse.slice()
  const seen = new Uint8Array(coarse.length)
  for (let r = 0; r < size1; r++) {
    const y = y1Max - (r + 0.5) * pixel1
    const r0 = Math.floor((y0Max - y) / pixel0)
    if (r0 < 0 || r0 >= size0) continue
    for (let c = 0; c < size1; c++) {
      const v = fine[r * size1 + c]
      if (Number.isNaN(v)) continue
      const c0 = Math.floor((x1Min + (c + 0.5) * pixel1 - x0Min) / pixel0)
      if (c0 < 0 || c0 >= size0) continue
      const i = r0 * size0 + c0
      if (!seen[i] || v > out[i]) out[i] = v
      seen[i] = 1
    }
  }
  return out
}

interface LevelMeta {
  size: number
  x_min_m: number
  y_max_m: number
  pixel_m: number
}

/** Assemble the grid from decoded 8-bit layers (first channel of each RGBA image). */
export function buildGrid(
  radiusM: number,
  l0: LevelMeta,
  l1: LevelMeta,
  slope0: Uint8ClampedArray,
  slope1: Uint8ClampedArray,
  sun: Uint8ClampedArray,
  earth: Uint8ClampedArray,
  psr: Uint8ClampedArray,
): FinderGrid {
  const n = l0.size * l0.size
  const first = (rgba: Uint8ClampedArray, count: number, f: (v: number) => number) => {
    const out = new Float32Array(count)
    for (let i = 0; i < count; i++) out[i] = f(rgba[i * 4])
    return out
  }
  const frac = (v: number) => (v > 250 ? NaN : v / 250)
  const psrMask = new Uint8Array(n)
  for (let i = 0; i < n; i++) psrMask[i] = psr[i * 4] > 127 ? 1 : 0
  const cells = distanceToMask(psrMask, l0.size)
  const psrKm = new Float32Array(n)
  for (let i = 0; i < n; i++) psrKm[i] = (cells[i] * l0.pixel_m) / 1000
  return {
    size: l0.size,
    pixelM: l0.pixel_m,
    xMin: l0.x_min_m,
    yMax: l0.y_max_m,
    radiusM,
    slope: mergeSlope(
      first(slope0, n, (v) => v * 0.25),
      l0.size,
      l0.x_min_m,
      l0.y_max_m,
      l0.pixel_m,
      first(slope1, l1.size * l1.size, (v) => v * 0.25),
      l1.size,
      l1.x_min_m,
      l1.y_max_m,
      l1.pixel_m,
    ),
    sun: first(sun, n, frac),
    earth: first(earth, n, frac),
    psr: psrMask,
    psrKm,
  }
}

export async function loadFinderGrid(base: string): Promise<FinderGrid> {
  const meta = await (await fetch(`${base}terrain/sp_meta.json`)).json()
  const [s0, s1, sun, earth, psr] = await Promise.all(
    ['terrain/sp_slope_L0.png', 'terrain/sp_slope_L1.png', 'layers/sun_avg.png', 'layers/earth_avg.png', 'layers/psr.png'].map((f) =>
      decodePng(`${base}${f}`),
    ),
  )
  return buildGrid(meta.radius_m, meta.levels[0], meta.levels[1], s0.data, s1.data, sun.data, earth.data, psr.data)
}
