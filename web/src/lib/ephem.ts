// Sun and Earth positions from the precomputed SPICE table (see docs/DATA_CONTRACT.md).
import {
  azEl,
  EARTH_RADIUS_KM,
  localFrame,
  norm,
  R2D,
  sitePosKm,
  SUN_RADIUS_KM,
  type Vec3,
} from './geo'

export interface Ephem {
  t0Ms: number
  stepS: number
  count: number
  /** count records of [sun xyz unit, sun dist km, earth xyz unit, earth dist km] */
  data: Float32Array
  kernels: string[]
}

export async function loadEphem(base: string): Promise<Ephem> {
  const meta = await (await fetch(`${base}ephem/ephem.json`)).json()
  const buf = await (await fetch(`${base}ephem/ephem.bin`)).arrayBuffer()
  const data = new Float32Array(buf)
  if (data.length !== meta.count * 8) throw new Error('ephem.bin size does not match ephem.json')
  return {
    t0Ms: Date.parse(meta.t0_utc),
    stepS: meta.step_s,
    count: meta.count,
    data,
    kernels: meta.kernels ?? [],
  }
}

export const ephemStartMs = (e: Ephem) => e.t0Ms
export const ephemEndMs = (e: Ephem) => e.t0Ms + (e.count - 1) * e.stepS * 1000

/**
 * Dates the app's clock may take. Every site card looks up to 60 days ahead of the clock and
 * 2 days behind it, so the clock stops that far short of each end of the ephemeris; nothing is
 * ever computed from positions the table does not hold.
 */
export function clockRange(e: Ephem): [number, number] {
  const DAY = 86400000
  return [ephemStartMs(e) + 3 * DAY, ephemEndMs(e) - 61 * DAY]
}

export interface BodyVectors {
  /** km, Moon centre to Sun centre, body-fixed */
  sun: Vec3
  /** km, Moon centre to Earth centre, body-fixed */
  earth: Vec3
}

/** Moon-centred Sun and Earth vectors in km at a UTC time, linearly interpolated. */
export function bodyVectors(e: Ephem, tMs: number): BodyVectors {
  const f = (tMs - e.t0Ms) / (e.stepS * 1000)
  const i = Math.min(Math.max(Math.floor(f), 0), e.count - 2)
  const w = Math.min(Math.max(f - i, 0), 1)
  const d = e.data
  const a = i * 8
  const b = a + 8
  const lerp = (k: number) => d[a + k] * (1 - w) + d[b + k] * w
  const vec = (o: number): Vec3 => {
    const x = lerp(o)
    const y = lerp(o + 1)
    const z = lerp(o + 2)
    const n = Math.hypot(x, y, z)
    const dist = lerp(o + 3)
    return [(x / n) * dist, (y / n) * dist, (z / n) * dist]
  }
  return { sun: vec(0), earth: vec(4) }
}

export interface BodySky {
  az: number
  el: number
  /** angular radius of the disc, degrees */
  radius: number
  distKm: number
}

export interface Sky {
  sun: BodySky
  earth: BodySky
}

/** Sun and Earth as seen from a surface site (topocentric: the site offset is subtracted). */
export function skyAt(e: Ephem, tMs: number, latDeg: number, lonDeg: number, hM: number): Sky {
  const bv = bodyVectors(e, tMs)
  const site = sitePosKm(latDeg, lonDeg, hM)
  const frame = localFrame(latDeg, lonDeg)
  const one = (v: Vec3, bodyRadiusKm: number): BodySky => {
    const t: Vec3 = [v[0] - site[0], v[1] - site[1], v[2] - site[2]]
    const dist = norm(t)
    const ae = azEl(t, frame)
    return { az: ae.az, el: ae.el, radius: Math.asin(bodyRadiusKm / dist) * R2D, distKm: dist }
  }
  return { sun: one(bv.sun, SUN_RADIUS_KM), earth: one(bv.earth, EARTH_RADIUS_KM) }
}
