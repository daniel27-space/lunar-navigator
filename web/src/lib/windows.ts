// Sunlight and Earth-visibility time series for one site, and the events planners ask about.
import { skyAt, type Ephem } from './ephem'
import { discVisibleFraction, type Horizon } from './horizon'

export interface Series {
  t0Ms: number
  stepMs: number
  count: number
  sunEl: Float32Array
  sunAz: Float32Array
  /** fraction of the solar disc above the terrain horizon, 0..1 */
  sunFrac: Float32Array
  earthEl: Float32Array
  earthAz: Float32Array
  /** fraction of Earth's disc above the terrain horizon, 0..1 */
  earthFrac: Float32Array
  /** Earth-centre elevation above the terrain horizon at Earth's azimuth, degrees */
  earthClear: Float32Array
}

export function computeSeries(
  e: Ephem,
  h: Horizon,
  hM: number,
  t0Ms: number,
  t1Ms: number,
  stepMs: number,
): Series {
  const count = Math.floor((t1Ms - t0Ms) / stepMs) + 1
  const s: Series = {
    t0Ms,
    stepMs,
    count,
    sunEl: new Float32Array(count),
    sunAz: new Float32Array(count),
    sunFrac: new Float32Array(count),
    earthEl: new Float32Array(count),
    earthAz: new Float32Array(count),
    earthFrac: new Float32Array(count),
    earthClear: new Float32Array(count),
  }
  const elevM = hM + h.observerHeightM
  for (let i = 0; i < count; i++) {
    const sky = skyAt(e, t0Ms + i * stepMs, h.lat, h.lon, elevM)
    s.sunEl[i] = sky.sun.el
    s.sunAz[i] = sky.sun.az
    s.sunFrac[i] = discVisibleFraction(h, sky.sun.az, sky.sun.el, sky.sun.radius)
    s.earthEl[i] = sky.earth.el
    s.earthAz[i] = sky.earth.az
    s.earthFrac[i] = discVisibleFraction(h, sky.earth.az, sky.earth.el, sky.earth.radius)
    s.earthClear[i] = sky.earth.el - interpHorizon(h, sky.earth.az)
  }
  return s
}

function interpHorizon(h: Horizon, az: number): number {
  const f = (((az % 360) + 360) % 360) / h.azStepDeg
  const n = h.elevDeg.length
  const i = Math.floor(f) % n
  const w = f - Math.floor(f)
  return h.elevDeg[i] * (1 - w) + h.elevDeg[(i + 1) % n] * w
}

export interface Criteria {
  /** minimum fraction of the solar disc that counts as "in sunlight" */
  minSunFrac: number
  /** minimum clearance of Earth's centre above the terrain, degrees, for a comm link */
  earthMaskDeg: number
}

export const DEFAULT_CRITERIA: Criteria = { minSunFrac: 0.5, earthMaskDeg: 0 }

export const isSunlit = (s: Series, i: number, c: Criteria) => s.sunFrac[i] >= c.minSunFrac
export const hasComm = (s: Series, i: number, c: Criteria) => s.earthClear[i] >= c.earthMaskDeg

export interface Summary {
  /** fraction of the period in sunlight / with Earth in view, 0..1 */
  sunShare: number
  commShare: number
  bothShare: number
  longestSunH: number
  longestDarkH: number
  longestCommH: number
  longestNoCommH: number
  maxSunEl: number
}

function longestRun(count: number, stepH: number, test: (i: number) => boolean): number {
  let best = 0
  let run = 0
  for (let i = 0; i < count; i++) {
    run = test(i) ? run + 1 : 0
    if (run > best) best = run
  }
  return best * stepH
}

export function summarise(s: Series, c: Criteria = DEFAULT_CRITERIA): Summary {
  const stepH = s.stepMs / 3600000
  let sun = 0
  let comm = 0
  let both = 0
  let maxSunEl = -90
  for (let i = 0; i < s.count; i++) {
    const a = isSunlit(s, i, c)
    const b = hasComm(s, i, c)
    if (a) sun++
    if (b) comm++
    if (a && b) both++
    if (s.sunEl[i] > maxSunEl) maxSunEl = s.sunEl[i]
  }
  return {
    sunShare: sun / s.count,
    commShare: comm / s.count,
    bothShare: both / s.count,
    longestSunH: longestRun(s.count, stepH, (i) => isSunlit(s, i, c)),
    longestDarkH: longestRun(s.count, stepH, (i) => !isSunlit(s, i, c)),
    longestCommH: longestRun(s.count, stepH, (i) => hasComm(s, i, c)),
    longestNoCommH: longestRun(s.count, stepH, (i) => !hasComm(s, i, c)),
    maxSunEl,
  }
}

export interface NextChange {
  /** state at the query time */
  now: boolean
  /** hours until the state flips, or null if it does not flip within the series */
  inHours: number | null
}

/** From time tMs, how long until `test` changes value. */
export function nextChange(s: Series, tMs: number, test: (i: number) => boolean): NextChange {
  const i0 = Math.min(Math.max(Math.round((tMs - s.t0Ms) / s.stepMs), 0), s.count - 1)
  const now = test(i0)
  for (let i = i0 + 1; i < s.count; i++) {
    if (test(i) !== now) return { now, inHours: ((i - i0) * s.stepMs) / 3600000 }
  }
  return { now, inHours: null }
}
