// Checks the browser's Sun/Earth angles against JPL Horizons values (an independent source).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { clockRange, ephemEndMs, ephemStartMs, skyAt, type Ephem } from './ephem'
import { eclipseFactor } from './windows'

const dir = new URL('../../public/data/ephem/', import.meta.url)
const meta = JSON.parse(readFileSync(new URL('ephem.json', dir), 'utf8'))
const bin = readFileSync(new URL('ephem.bin', dir))
const ephem: Ephem = {
  t0Ms: Date.parse(meta.t0_utc),
  stepS: meta.step_s,
  count: meta.count,
  data: new Float32Array(bin.buffer, bin.byteOffset, bin.byteLength / 4),
  kernels: meta.kernels,
}
const vectors: {
  site: string
  lat: number
  lon: number
  h_m: number
  utc: string
  sun_az: number
  sun_el: number
  earth_az: number
  earth_el: number
}[] = JSON.parse(readFileSync(new URL('validation_vectors.json', dir), 'utf8'))

/** Great-circle separation in degrees between two az/el directions. */
function separation(az1: number, el1: number, az2: number, el2: number): number {
  const r = Math.PI / 180
  const c =
    Math.sin(el1 * r) * Math.sin(el2 * r) +
    Math.cos(el1 * r) * Math.cos(el2 * r) * Math.cos((az1 - az2) * r)
  return Math.acos(Math.min(1, c)) / r
}

describe('Sun and Earth angles vs JPL Horizons', () => {
  it('has validation vectors', () => expect(vectors.length).toBeGreaterThanOrEqual(30))

  it('matches Horizons to better than 0.02 degrees on the sky', () => {
    let worst = 0
    for (const v of vectors) {
      const s = skyAt(ephem, Date.parse(v.utc), v.lat, v.lon, v.h_m)
      worst = Math.max(
        worst,
        separation(s.sun.az, s.sun.el, v.sun_az, v.sun_el),
        separation(s.earth.az, s.earth.el, v.earth_az, v.earth_el),
      )
    }
    console.log(`worst angular difference vs Horizons: ${worst.toFixed(5)} deg`)
    expect(worst).toBeLessThan(0.02)
  })
})

describe('eclipse of the Sun by Earth', () => {
  // Total lunar eclipse of 14 March 2025 (greatest eclipse about 06:59 UTC), which the
  // Blue Ghost lander watched from Mare Crisium (18.56N, 61.81E).
  it('hides the Sun at mid-eclipse and not a day earlier', () => {
    const mid = skyAt(ephem, Date.parse('2025-03-14T06:59:00Z'), 18.56, 61.81, 0)
    expect(eclipseFactor(mid)).toBe(0)
    const before = skyAt(ephem, Date.parse('2025-03-13T06:59:00Z'), 18.56, 61.81, 0)
    expect(eclipseFactor(before)).toBe(1)
  })
  it('is partial around first contact', () => {
    const partial = skyAt(ephem, Date.parse('2025-03-14T05:40:00Z'), 18.56, 61.81, 0)
    const f = eclipseFactor(partial)
    expect(f).toBeGreaterThan(0)
    expect(f).toBeLessThan(1)
  })
})

describe('supported dates', () => {
  it('the clock range leaves room for the 60-day analysis window inside the ephemeris', () => {
    const [lo, hi] = clockRange(ephem)
    const DAY = 86400000
    expect(lo - 2 * DAY).toBeGreaterThanOrEqual(ephemStartMs(ephem))
    expect(hi + 60 * DAY).toBeLessThanOrEqual(ephemEndMs(ephem))
    expect(new Date(lo).toISOString().slice(0, 10)).toBe('2024-01-04')
    expect(new Date(hi).toISOString().slice(0, 10)).toBe('2035-11-01')
  })

  it('inside the range the Sun keeps moving: a mid-latitude site has day and night', () => {
    // The bug this guards against: past the end of the table the last position was reused,
    // so the Sun stood still and a site showed 100 % sunlight for ever.
    const [, hi] = clockRange(ephem)
    let up = 0
    let n = 0
    for (let t = hi; t < hi + 60 * 86400000; t += 6 * 3600000) {
      if (skyAt(ephem, t, -45.456, 177.589, 0).sun.el > 0) up++
      n++
    }
    expect(up / n).toBeGreaterThan(0.35)
    expect(up / n).toBeLessThan(0.65)
  })
})
