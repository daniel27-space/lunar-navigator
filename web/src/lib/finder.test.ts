import { readFileSync } from 'node:fs'
import { PNG } from 'pngjs'
import { describe, expect, it } from 'vitest'
import { buildGrid, distanceToMask, mergeSlope, PRESETS, runFinder, type FinderCriteria, type FinderGrid } from './finder'

const open: FinderCriteria = { maxSlopeDeg: 90, sunMin: 0, sunMax: 1, sunPrefer: 'none', earthMin: 0, earthMax: 1, earthPrefer: 'none', psr: 'any', maxPsrKm: null }

/** A 40 x 40 grid of 300 m cells: flat, half lit, Earth always visible, unless overridden. */
function grid(edit: (g: FinderGrid, i: number, r: number, c: number) => void = () => {}): FinderGrid {
  const size = 40
  const n = size * size
  const g: FinderGrid = {
    size,
    pixelM: 300,
    xMin: -6000,
    yMax: 6000,
    radiusM: 1737400,
    slope: new Float32Array(n).fill(2),
    sun: new Float32Array(n).fill(0.5),
    earth: new Float32Array(n).fill(1),
    psr: new Uint8Array(n),
    psrKm: new Float32Array(n).fill(99),
  }
  for (let i = 0; i < n; i++) edit(g, i, Math.floor(i / size), i % size)
  return g
}

describe('site finder', () => {
  it('eliminates every cell that breaks a hard limit and keeps the rest', () => {
    const g = grid((g, i, r) => {
      if (r < 10) g.slope[i] = 20
      if (r >= 30) g.earth[i] = 0.2
    })
    const res = runFinder(g, { ...open, maxSlopeDeg: 10, earthMin: 0.5 })
    for (let i = 0; i < res.score.length; i++) {
      const r = Math.floor(i / g.size)
      expect(res.score[i] > 0).toBe(r >= 10 && r < 30)
    }
    // 20 of 40 rows of 300 m cells, 12 km wide: 6 km x 12 km (map stretch is negligible this close to the pole).
    expect(res.eligibleKm2).toBeCloseTo(72, 1)
    expect(res.passAlone.slope).toBeCloseTo(0.75, 6)
    expect(res.passAlone.earth).toBeCloseTo(0.75, 6)
    expect(res.passAlone.sun).toBe(1)
  })

  it('ranks by the stated preference, in the stated direction', () => {
    const g = grid((g, i, _r, c) => {
      g.sun[i] = c / 39
    })
    const high = runFinder(g, { ...open, sunPrefer: 'high' }, { maxCandidates: 1 })
    const low = runFinder(g, { ...open, sunPrefer: 'low' }, { maxCandidates: 1 })
    expect(high.candidates[0].sun).toBeGreaterThan(0.9)
    expect(low.candidates[0].sun).toBeLessThan(0.1)
    // Brighter on the map where it is better.
    expect(high.score[20 * 40 + 38]).toBeGreaterThan(high.score[20 * 40 + 2])
    expect(low.score[20 * 40 + 2]).toBeGreaterThan(low.score[20 * 40 + 38])
  })

  it('never lists an eliminated spot, and keeps candidates apart', () => {
    const g = grid((g, i, r, c) => {
      g.sun[i] = 0.5 + 0.5 * Math.exp(-((r - 20) ** 2 + (c - 20) ** 2) / 50)
      if (c > 30) g.slope[i] = 30
    })
    const res = runFinder(g, { ...open, maxSlopeDeg: 10, sunPrefer: 'high' }, { maxCandidates: 5, minSeparationKm: 3 })
    expect(res.candidates.length).toBeGreaterThan(1)
    expect(res.candidates[0].rank).toBe(1)
    for (const a of res.candidates) {
      expect(a.slopeDeg).toBeLessThanOrEqual(10)
      for (const b of res.candidates) {
        if (a === b) continue
        const km = Math.hypot(a.lat - b.lat, 0) * 30.3 // 1 degree of latitude is about 30.3 km
        const dLon = Math.abs(a.lon - b.lon)
        expect(km > 0 || dLon > 0).toBe(true)
      }
    }
    for (let i = 1; i < res.candidates.length; i++) expect(res.candidates[i].score).toBeLessThanOrEqual(res.candidates[i - 1].score)
  })

  it('returns nothing when the limits contradict each other', () => {
    const res = runFinder(grid(), { ...open, sunMin: 0.9 })
    expect(res.candidates).toHaveLength(0)
    expect(res.eligibleKm2).toBe(0)
    expect(res.passAlone.sun).toBe(0)
  })

  it('handles permanent shadow: inside, outside and within a distance', () => {
    const g = grid((g, i, r, c) => {
      g.psr[i] = r >= 18 && r < 22 && c >= 18 && c < 22 ? 1 : 0
    })
    const d = distanceToMask(g.psr, g.size)
    for (let i = 0; i < d.length; i++) g.psrKm[i] = (d[i] * g.pixelM) / 1000
    expect(d[20 * 40 + 20]).toBe(0)
    expect(d[20 * 40 + 25]).toBeCloseTo(4, 6) // four cells east of the shadow's edge
    expect(d[14 * 40 + 14]).toBeCloseTo(4 * Math.SQRT2, 5)
    const inside = runFinder(g, { ...open, psr: 'inside' })
    expect(inside.eligibleKm2).toBeCloseTo(16 * 0.09, 3)
    const near = runFinder(g, { ...open, psr: 'outside', maxPsrKm: 0.6 })
    for (let i = 0; i < near.score.length; i++) expect(near.score[i] > 0).toBe(g.psr[i] === 0 && g.psrKm[i] <= 0.6)
    expect(near.candidates[0].psrKm).toBeLessThanOrEqual(0.6)
    expect(near.candidates[0].inPsr).toBe(false)
  })

  it('takes the steepest fine slope inside a coarse cell', () => {
    // 2 x 2 coarse cells of 300 m; fine tile of 4 x 4 cells of 100 m covering the top-left coarse cell and a bit more.
    const coarse = new Float32Array([1, 2, 3, 4])
    const fine = new Float32Array(16).fill(0.5)
    fine[0] = 9 // inside coarse cell (0, 0)
    fine[3] = 7 // x = 350 m: coarse cell (0, 1)
    const out = mergeSlope(coarse, 2, 0, 600, 300, fine, 4, 0, 600, 100)
    expect(Array.from(out)).toEqual([9, 7, 0.5, 0.5])
  })
})

describe('how much each thing counts in the ranking', () => {
  // Sunnier ground is steeper: flatness and sunlight pull opposite ways.
  const g = grid((g, i, _r, c) => {
    g.sun[i] = c / 39
    g.slope[i] = (c / 39) * 10
  })
  const base: FinderCriteria = { ...open, maxSlopeDeg: 10, sunPrefer: 'high' }

  it('ranks exactly as before when no weights are given, or when all are 1', () => {
    const plain = runFinder(g, base)
    const ones = runFinder(g, { ...base, weights: { slope: 1, sun: 1, earth: 1, psr: 1 } })
    expect(ones.score).toEqual(plain.score)
    expect(ones.candidates).toEqual(plain.candidates)
    // a weight that is not a usable number counts as 1 too
    expect(runFinder(g, { ...base, weights: { slope: NaN, sun: -3 } }).score).toEqual(plain.score)
  })

  it('moves the best spot towards what counts for more', () => {
    const sunny = runFinder(g, { ...base, weights: { sun: 2 } }, { maxCandidates: 1 })
    const flat = runFinder(g, { ...base, weights: { slope: 2 } }, { maxCandidates: 1 })
    const flat2 = runFinder(g, { ...base, weights: { sun: 0.5 } }, { maxCandidates: 1 })
    expect(sunny.candidates[0].sun).toBeGreaterThan(0.9)
    expect(flat.candidates[0].slopeDeg).toBeLessThan(1)
    expect(flat2.candidates[0].slopeDeg).toBeLessThan(1)
  })

  it('changes the order only: the same ground passes whatever the weights', () => {
    const plain = runFinder(g, base)
    const weighted = runFinder(g, { ...base, weights: { slope: 0.5, sun: 2 } })
    expect(weighted.eligibleKm2).toBe(plain.eligibleKm2)
    expect(Array.from(weighted.score, (v) => v > 0)).toEqual(Array.from(plain.score, (v) => v > 0))
  })

  it('does not fail when every weight is nothing', () => {
    const r = runFinder(g, { ...base, weights: { slope: 0, sun: 0 } })
    expect(r.candidates.length).toBeGreaterThan(0)
    expect(r.candidates[0].score).toBeLessThanOrEqual(1)
  })
})

describe('site finder on the published layers', () => {
  const dir = new URL('../../public/data/', import.meta.url)
  const rgba = (f: string) => {
    const p = PNG.sync.read(readFileSync(new URL(f, dir)))
    return new Uint8ClampedArray(p.data.buffer, p.data.byteOffset, p.data.length)
  }
  const meta = JSON.parse(readFileSync(new URL('terrain/sp_meta.json', dir), 'utf8'))
  const g = buildGrid(
    meta.radius_m,
    meta.levels[0],
    meta.levels[1],
    rgba('terrain/sp_slope_L0.png'),
    rgba('terrain/sp_slope_L1.png'),
    rgba('layers/sun_avg.png'),
    rgba('layers/earth_avg.png'),
    rgba('layers/psr.png'),
  )
  for (const p of PRESETS) {
    it(`${p.label}: every shortlisted spot meets every limit`, () => {
      const res = runFinder(g, p.criteria)
      console.log(`${p.label}: ${res.eligibleKm2.toFixed(0)} km2 eligible, ${res.candidates.length} candidates`, res.candidates[0])
      expect(res.candidates.length).toBeGreaterThan(0)
      for (const c of res.candidates) {
        expect(c.slopeDeg).toBeLessThanOrEqual(p.criteria.maxSlopeDeg)
        expect(c.sun).toBeGreaterThanOrEqual(p.criteria.sunMin)
        expect(c.sun).toBeLessThanOrEqual(p.criteria.sunMax)
        expect(c.earth).toBeGreaterThanOrEqual(p.criteria.earthMin)
        expect(c.earth).toBeLessThanOrEqual(p.criteria.earthMax)
        // Every suggestion is inside the search area: within 160 km of the pole.
        expect(c.lat).toBeLessThan(-84.7)
        if (p.criteria.maxPsrKm !== null) expect(c.psrKm).toBeLessThanOrEqual(p.criteria.maxPsrKm)
        if (p.criteria.psr === 'outside') expect(c.inPsr).toBe(false)
      }
    })
  }
})
