// "When to land": compare landing dates at one site. A stay is a fixed number of days starting
// at a landing time; each stay is summarised and scored from the site's sunlight / Earth series.
import { DEFAULT_CRITERIA, hasComm, isSunlit, type Criteria, type Series } from './windows'

const DAY_MS = 86400000

export interface WindowStats {
  startMs: number
  days: number
  /** fraction of the stay in sunlight / with Earth in view, 0..1 */
  sunShare: number
  commShare: number
  /** longest unbroken stretch without sunlight / without Earth, hours */
  longestDarkH: number
  longestNoCommH: number
  /** Sun elevation while sunlit, degrees; NaN when the stay has no sunlight */
  meanSunElLit: number
  minSunElLit: number
}

/** What the mission wants; same meaning as in lib/verdict.ts. */
export interface Wants {
  sunHigh: boolean
  earthHigh: boolean
}

export interface RankedWindow {
  stats: WindowStats
  /** 0..1: 0.6 x sunlight fit + 0.4 x Earth fit */
  score: number
}

/** How well a stay fits the mission, 0..1: 0.6 x sunlight fit + 0.4 x Earth fit (the ranking rule). */
export function fitScore(w: WindowStats, wants: Wants): number {
  return 0.6 * (wants.sunHigh ? w.sunShare : 1 - w.sunShare) + 0.4 * (wants.earthHigh ? w.commShare : 1 - w.commShare)
}

/** First sample and sample count of a stay, or null when it is not wholly inside the series. */
function span(s: Series, startMs: number, days: number): [number, number] | null {
  const i0 = Math.round((startMs - s.t0Ms) / s.stepMs)
  const n = Math.round((days * DAY_MS) / s.stepMs)
  return n > 0 && i0 >= 0 && i0 + n <= s.count ? [i0, n] : null
}

/** Summary of the stay [startMs, startMs + days); null when the series does not cover all of it. */
export function windowStats(s: Series, startMs: number, days: number, c: Criteria = DEFAULT_CRITERIA): WindowStats | null {
  const at = span(s, startMs, days)
  if (!at) return null
  const [i0, n] = at
  const stepH = s.stepMs / 3600000
  let sun = 0
  let comm = 0
  let dark = 0
  let longestDark = 0
  let silent = 0
  let longestSilent = 0
  let elSum = 0
  let elMin = Infinity
  for (let i = i0; i < i0 + n; i++) {
    if (isSunlit(s, i, c)) {
      sun++
      dark = 0
      elSum += s.sunEl[i]
      if (s.sunEl[i] < elMin) elMin = s.sunEl[i]
    } else if (++dark > longestDark) longestDark = dark
    if (hasComm(s, i, c)) {
      comm++
      silent = 0
    } else if (++silent > longestSilent) longestSilent = silent
  }
  return {
    startMs: s.t0Ms + i0 * s.stepMs,
    days,
    sunShare: sun / n,
    commShare: comm / n,
    longestDarkH: longestDark * stepH,
    longestNoCommH: longestSilent * stepH,
    meanSunElLit: sun ? elSum / sun : NaN,
    minSunElLit: sun ? elMin : NaN,
  }
}

export interface RankOptions {
  /** how many stays to return (default 5) */
  top?: number
  /** spacing of the landing times that are tried, hours (default 6) */
  everyH?: number
  criteria?: Criteria
}

/**
 * The best landing times for a stay of `days`, best first. Every landing time `everyH` apart is
 * scored (prefix sums, so one pass over the series); equal scores go to the earlier date; the
 * stays returned start at least half a stay apart. Stays running past the series are not tried.
 */
export function rankWindows(s: Series, days: number, wants: Wants, opts: RankOptions = {}): RankedWindow[] {
  const { top = 5, everyH = 6, criteria = DEFAULT_CRITERIA } = opts
  const n = Math.round((days * DAY_MS) / s.stepMs)
  if (n <= 0 || n > s.count) return []
  const sun = new Uint32Array(s.count + 1)
  const comm = new Uint32Array(s.count + 1)
  for (let i = 0; i < s.count; i++) {
    sun[i + 1] = sun[i] + (isSunlit(s, i, criteria) ? 1 : 0)
    comm[i + 1] = comm[i] + (hasComm(s, i, criteria) ? 1 : 0)
  }
  const stride = Math.max(1, Math.round((everyH * 3600000) / s.stepMs))
  const scored: [score: number, i0: number][] = []
  for (let i0 = 0; i0 + n <= s.count; i0 += stride) {
    const sunShare = (sun[i0 + n] - sun[i0]) / n
    const commShare = (comm[i0 + n] - comm[i0]) / n
    scored.push([0.6 * (wants.sunHigh ? sunShare : 1 - sunShare) + 0.4 * (wants.earthHigh ? commShare : 1 - commShare), i0])
  }
  scored.sort((a, b) => b[0] - a[0] || a[1] - b[1])
  const picked: [number, number][] = []
  for (const k of scored) {
    if (picked.length >= top) break
    if (picked.every((p) => Math.abs(p[1] - k[1]) >= n / 2)) picked.push(k)
  }
  return picked.map(([score, i0]) => ({ score, stats: windowStats(s, s.t0Ms + i0 * s.stepMs, days, criteria)! }))
}

/**
 * Index of the best value, or -1 when a value is unknown or the lead over the runner-up is
 * smaller than `threshold` (the same rule as the site comparison).
 */
export function leader(values: number[], higherIsBetter: boolean, threshold: number): number {
  if (values.length < 2 || values.some((v) => !Number.isFinite(v))) return -1
  const sign = higherIsBetter ? 1 : -1
  const order = values.map((v, i) => [v * sign, i]).sort((a, b) => b[0] - a[0])
  return order[0][0] - order[1][0] >= threshold ? order[0][1] : -1
}
