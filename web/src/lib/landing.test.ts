import { describe, expect, it } from 'vitest'
import { fitScore, leader, rankWindows, windowStats } from './landing'
import type { Series } from './windows'

const H = 3600000
const T0 = Date.UTC(2027, 0, 1)

/** A 1-hour series from per-sample flags: lit[i] -> Sun's disc fully up, link[i] -> Earth above terrain. */
function series(lit: boolean[], link: boolean[] = lit.map(() => true), sunEl: number[] = lit.map(() => 5)): Series {
  const n = lit.length
  return {
    t0Ms: T0,
    stepMs: H,
    count: n,
    sunEl: Float32Array.from(sunEl),
    sunAz: new Float32Array(n),
    sunFrac: Float32Array.from(lit.map((v) => (v ? 1 : 0))),
    earthEl: new Float32Array(n),
    earthAz: new Float32Array(n),
    earthFrac: new Float32Array(n),
    earthClear: Float32Array.from(link.map((v) => (v ? 2 : -2))),
  }
}
const days = (n: number, v: boolean) => Array.from({ length: n * 24 }, () => v)
const solar = { sunHigh: true, earthHigh: true }

describe('windowStats', () => {
  it('is exact on a hand-made pattern', () => {
    // one day: 6 h lit, 12 h dark, 6 h lit; Earth hidden for hours 2..4
    const lit = [...Array(6).fill(true), ...Array(12).fill(false), ...Array(6).fill(true)]
    const link = lit.map((_, i) => !(i >= 2 && i <= 4))
    const el = lit.map((_, i) => (i < 6 ? 2 : i < 18 ? -3 : 4))
    const w = windowStats(series(lit, link, el), T0, 1)!
    expect(w).toEqual({ startMs: T0, days: 1, sunShare: 0.5, commShare: 21 / 24, longestDarkH: 12, longestNoCommH: 3, meanSunElLit: 3, minSunElLit: 2 })
  })

  it('reports no Sun height when the stay is dark, and null outside the data', () => {
    const s = series(days(2, false))
    const w = windowStats(s, T0, 1)!
    expect(w.sunShare).toBe(0)
    expect(w.longestDarkH).toBe(24)
    expect(w.meanSunElLit).toBeNaN()
    expect(w.minSunElLit).toBeNaN()
    expect(windowStats(s, T0 + 30 * H, 1)).toBeNull()
    expect(windowStats(s, T0 - H, 1)).toBeNull()
    expect(windowStats(s, T0 + 24 * H, 1)).not.toBeNull()
  })
})

describe('rankWindows', () => {
  // 10 days dark, 4 days lit, 10 days dark
  const s = series([...days(10, false), ...days(4, true), ...days(10, false)])

  it('picks the fully lit stay, earliest first among equals', () => {
    const r = rankWindows(s, 2, solar)
    expect(r[0].stats.startMs).toBe(T0 + 10 * 24 * H)
    expect(r[0].stats.sunShare).toBe(1)
    expect(r[0].score).toBe(1)
    expect(r.map((x) => x.score)).toEqual([...r.map((x) => x.score)].sort((a, b) => b - a))
  })

  it('flips when the mission wants darkness', () => {
    const r = rankWindows(s, 2, { sunHigh: false, earthHigh: true })
    expect(r[0].stats.startMs).toBe(T0)
    expect(r[0].stats.sunShare).toBe(0)
  })

  it('weighs sunlight 0.6 and Earth view 0.4', () => {
    // days 0-1: lit, no Earth (0.6); days 2-3: dark, Earth (0.4); days 4-5: both (1.0)
    const lit = [...days(2, true), ...days(2, false), ...days(2, true)]
    const link = [...days(2, false), ...days(2, true), ...days(2, true)]
    const r = rankWindows(series(lit, link), 2, solar, { top: 3 })
    expect(r.map((x) => [x.stats.startMs, Number(x.score.toFixed(3))])).toEqual([
      [T0 + 4 * 24 * H, 1],
      [T0 + 3 * 24 * H, 0.7],
      [T0, 0.6],
    ])
  })

  it('scores every ranked stay with the published rule', () => {
    const lit = [...days(2, true), ...days(2, false), ...days(2, true)]
    const link = [...days(2, false), ...days(2, true), ...days(2, true)]
    for (const wants of [solar, { sunHigh: false, earthHigh: true }, { sunHigh: true, earthHigh: false }])
      for (const x of rankWindows(series(lit, link), 2, wants, { top: 4 })) expect(x.score).toBeCloseTo(fitScore(x.stats, wants), 12)
  })

  it('returns stays at least half a stay apart, at most the number asked for', () => {
    const r = rankWindows(s, 2, solar, { top: 5 })
    expect(r).toHaveLength(5)
    for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) expect(Math.abs(r[i].stats.startMs - r[j].stats.startMs)).toBeGreaterThanOrEqual(24 * H)
    expect(rankWindows(s, 2, solar, { top: 2 })).toHaveLength(2)
  })

  it('never lets a stay run past the data, and returns nothing when the series is too short', () => {
    const end = T0 + s.count * H
    for (const x of rankWindows(s, 7, { sunHigh: false, earthHigh: true }, { top: 20 })) expect(x.stats.startMs + 7 * 24 * H).toBeLessThanOrEqual(end)
    expect(rankWindows(series(days(3, true)), 7, solar)).toEqual([])
    expect(rankWindows(series(days(7, true)), 7, solar)).toHaveLength(1)
  })

  it('does not fail when no stay has sunlight', () => {
    const r = rankWindows(series(days(20, false)), 7, solar)
    expect(r[0].stats.sunShare).toBe(0)
    expect(r[0].stats.startMs).toBe(T0)
  })
})

describe('leader', () => {
  it('needs a clear lead and known values', () => {
    expect(leader([50, 80, 60], true, 3)).toBe(1)
    expect(leader([50, 80, 79], true, 3)).toBe(-1)
    expect(leader([5, 2, 9], false, 0.5)).toBe(1)
    expect(leader([5, NaN], true, 1)).toBe(-1)
    expect(leader([5], true, 1)).toBe(-1)
  })
})

describe('landing times the clock can reach', () => {
  it('never offers a landing after the latest time the clock allows', () => {
    // Dark for 20 days, then lit: the best 5-day stays all start after day 20.
    const lit = Array.from({ length: 40 * 24 }, (_, i) => i >= 20 * 24)
    const s = series(lit)
    const free = rankWindows(s, 5, { sunHigh: true, earthHigh: true })
    expect(free[0].stats.startMs).toBeGreaterThanOrEqual(T0 + 20 * 24 * H)
    // With the clock limited to day 10, every offered stay starts by day 10, even though better ones exist later.
    const latest = T0 + 10 * 24 * H
    const limited = rankWindows(s, 5, { sunHigh: true, earthHigh: true }, { latestStartMs: latest })
    expect(limited.length).toBeGreaterThan(0)
    for (const w of limited) expect(w.stats.startMs).toBeLessThanOrEqual(latest)
  })

  it('never offers a landing before the earliest time allowed, and is unchanged without one', () => {
    // Lit for the first 10 days, then dark: the best 5-day stays all start in the first days.
    const lit = Array.from({ length: 40 * 24 }, (_, i) => i < 10 * 24)
    const s = series(lit)
    const free = rankWindows(s, 5, { sunHigh: true, earthHigh: true })
    expect(free[0].stats.startMs).toBe(T0)
    expect(rankWindows(s, 5, { sunHigh: true, earthHigh: true }, { earliestStartMs: -Infinity })).toEqual(free)
    const earliest = T0 + 8 * 24 * H
    const slipped = rankWindows(s, 5, { sunHigh: true, earthHigh: true }, { earliestStartMs: earliest })
    expect(slipped.length).toBeGreaterThan(0)
    for (const w of slipped) expect(w.stats.startMs).toBeGreaterThanOrEqual(earliest)
    // the scoring itself is the same: the stay starting on day 8 gets the score it had before
    expect(slipped[0].stats.startMs).toBe(earliest)
    expect(slipped[0].stats.sunShare).toBeCloseTo(2 / 5, 9)
  })
})
