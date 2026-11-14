// Everything the app works out for one pinned point. Site cards and the comparison view both
// use this, so they always show the same numbers; horizons are cached because they are the
// slow part.
import { useMemo } from 'react'
import { skyAt, type Ephem, type Sky } from '../lib/ephem'
import { upVector } from '../lib/geo'
import type { GlobalDem } from '../lib/globalDem'
import { computeHorizon, discVisibleFraction, horizonAt, type Horizon } from '../lib/horizon'
import { slopeAt, sourceHeight, terrainTier, type HeightSource, type Terrain } from '../lib/terrain'
import { horizonKey } from '../lib/assumptions'
import {
  changeAfter,
  computeSeries,
  eclipseFactor,
  hasComm,
  isSunlit,
  summarise,
  type NextChange,
  type Series,
  type Summary,
} from '../lib/windows'
import { useStore, type Pin } from '../store'

export const DAY = 86400000
export const WINDOW_DAYS = 60
const STEP_MS = 20 * 60000

export type Tier = 'crest' | 'patch' | 'fine' | 'coarse' | 'global' | 'none'

export interface SiteAnalysis {
  pin: Pin
  /** the Sun and Earth table the figures come from (for longer look-aheads) */
  ephem: Ephem
  /** metres above the reference sphere */
  hM: number
  /** degrees, NaN where no detailed terrain covers the point */
  slope: number
  tier: Tier
  horizon: Horizon
  series: Series
  summary: Summary
  /** at the selected time */
  sky: Sky
  sunFrac: number
  eclipse: number
  earthClear: number
  sunNext: NextChange
  commNext: NextChange
}

const horizons = new Map<string, Horizon>()

export function useSiteAnalysis(
  pin: Pin | null,
  ephem: Ephem,
  terrain: Terrain,
  /** the site's detailed patches, finest first (none for most free points) */
  patches: Terrain[],
  global: GlobalDem | null,
): SiteAnalysis | null {
  const tMs = useStore((s) => s.tMs)
  const windowStart = useStore((s) => s.windowStart)
  // The planner's assumptions: the sunlit and Earth-link rules, and the panel and antenna height.
  const criteria = useStore((s) => s.criteria)
  const observerM = useStore((s) => s.observerM)
  const lat = pin?.lat ?? 0
  const lon = pin?.lon ?? 0
  const has = pin !== null

  // Height lookup order: site patches (finest first), south-pole tiles, whole-Moon map.
  // The list is rebuilt by the caller on every render, so it is compared by the patches' ids.
  const patchKey = patches.map((p) => p.id ?? '?').join('+')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const source: HeightSource = useMemo(() => ({ terrains: [...patches, terrain], global }), [patchKey, terrain, global])
  const fixed = useMemo(() => {
    if (!has) return null
    const u = upVector(lat, lon)
    const h = sourceHeight(source, u[0], u[1], u[2])
    const patch = source.terrains.length > 1 ? source.terrains[0] : null
    const key = horizonKey(lat, lon, patchKey, !!global, observerM)
    let horizon = horizons.get(key)
    if (!horizon) {
      horizon = computeHorizon(source, lat, lon, { observerHeightM: observerM })
      if (horizons.size > 24) horizons.clear()
      horizons.set(key, horizon)
    }
    const s = patch ? slopeAt(patch, lat, lon) : NaN
    const polarTier = terrainTier(terrain, lat, lon)
    const tier: Tier = patch?.kind === 'crest20' ? 'crest' : patch ? 'patch' : polarTier !== 'none' ? polarTier : global ? 'global' : 'none'
    return { hM: Number.isNaN(h) ? 0 : h, horizon, slope: Number.isNaN(s) ? slopeAt(terrain, lat, lon) : s, tier }
  }, [has, lat, lon, source, patchKey, terrain, global, observerM])

  const series = useMemo(
    () => (fixed ? computeSeries(ephem, fixed.horizon, fixed.hM, windowStart, windowStart + WINDOW_DAYS * DAY, STEP_MS) : null),
    [ephem, fixed, windowStart],
  )
  const summary = useMemo(() => (series ? summarise(series, criteria) : null), [series, criteria])

  if (!pin || !fixed || !series || !summary) return null
  const sky = skyAt(ephem, tMs, lat, lon, fixed.hM + fixed.horizon.observerHeightM)
  const eclipse = eclipseFactor(sky)
  const sunFrac = discVisibleFraction(fixed.horizon, sky.sun.az, sky.sun.el, sky.sun.radius) * eclipse
  const earthClear = sky.earth.el - horizonAt(fixed.horizon, sky.earth.az)
  return {
    pin,
    ephem,
    ...fixed,
    series,
    summary,
    sky,
    eclipse,
    sunFrac,
    earthClear,
    // The state now is judged from the same two figures the card prints, by the same rules as the period.
    sunNext: changeAfter(series, tMs, sunFrac >= criteria.minSunFrac, (i) => isSunlit(series, i, criteria)),
    commNext: changeAfter(series, tMs, earthClear >= criteria.earthMaskDeg, (i) => hasComm(series, i, criteria)),
  }
}

/** Consecutive runs where `test` is true, as [startIndex, endIndex) pairs. */
export function runs(count: number, test: (i: number) => boolean): [number, number][] {
  const out: [number, number][] = []
  let start = -1
  for (let i = 0; i <= count; i++) {
    const on = i < count && test(i)
    if (on && start < 0) start = i
    if (!on && start >= 0) {
      out.push([start, i])
      start = -1
    }
  }
  return out
}
