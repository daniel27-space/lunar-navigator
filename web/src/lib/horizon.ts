// Terrain horizon seen from a point: for each azimuth, the highest elevation angle that any
// terrain reaches. Rays follow great circles on the sphere and elevation angles are computed
// in 3D, so the curvature of the Moon is included (no flat-map shortcut).
import { D2R, localFrame, R2D, upVector } from './geo'
import { sampleXY, type Terrain } from './terrain'

export interface Horizon {
  lat: number
  lon: number
  /** observer height above the local surface, metres */
  observerHeightM: number
  azStepDeg: number
  /** elevation of the terrain horizon in degrees, index i is azimuth i * azStepDeg */
  elevDeg: Float32Array
  /** distance in km to the terrain that sets the horizon at each azimuth */
  distKm: Float32Array
}

export interface HorizonOptions {
  observerHeightM?: number
  azStepDeg?: number
  maxRangeKm?: number
}

const FIRST_STEP_M = 40
const GROWTH = 0.01

export function computeHorizon(
  t: Terrain,
  latDeg: number,
  lonDeg: number,
  opts: HorizonOptions = {},
): Horizon {
  const observerHeightM = opts.observerHeightM ?? 2
  const azStepDeg = opts.azStepDeg ?? 0.5
  const maxRangeM = (opts.maxRangeKm ?? 300) * 1000
  const R = t.radiusM
  const up = upVector(latDeg, lonDeg)
  const f = localFrame(latDeg, lonDeg)
  const rho = 2 * R
  const ground = sampleXY(t, (rho / (1 - up[2])) * up[1], (rho / (1 - up[2])) * up[0])
  const rp = R + (Number.isNaN(ground) ? 0 : ground) + observerHeightM

  const n = Math.round(360 / azStepDeg)
  const elevDeg = new Float32Array(n)
  const distKm = new Float32Array(n)
  // Smooth-sphere horizon: the dip below horizontal for an observer at radius rp.
  const dip = -Math.acos(Math.min(1, R / rp)) * R2D

  for (let i = 0; i < n; i++) {
    const az = i * azStepDeg * D2R
    const ca = Math.cos(az)
    const sa = Math.sin(az)
    // Horizontal unit vector pointing along this azimuth.
    const hx = f.n[0] * ca + f.e[0] * sa
    const hy = f.n[1] * ca + f.e[1] * sa
    const hz = f.n[2] * ca + f.e[2] * sa
    let best = -Infinity
    let bestD = 0
    let seen = false
    for (let d = FIRST_STEP_M; d <= maxRangeM; d += Math.max(FIRST_STEP_M, d * GROWTH)) {
      const th = d / R
      const c = Math.cos(th)
      const s = Math.sin(th)
      const dx = up[0] * c + hx * s
      const dy = up[1] * c + hy * s
      const dz = up[2] * c + hz * s
      const k = rho / (1 - dz)
      const h = sampleXY(t, k * dy, k * dx)
      if (Number.isNaN(h)) {
        if (seen) break // ran off the edge of the elevation data
        continue
      }
      seen = true
      const rq = R + h
      // Elevation of the terrain point above the observer's horizontal plane.
      const el = Math.atan2(rq * c - rp, rq * s)
      if (el > best) {
        best = el
        bestD = d
      }
    }
    elevDeg[i] = seen ? best * R2D : dip
    distKm[i] = bestD / 1000
  }
  return { lat: latDeg, lon: lonDeg, observerHeightM, azStepDeg, elevDeg, distKm }
}

/** Horizon elevation in degrees at any azimuth, linearly interpolated. */
export function horizonAt(h: Horizon, azDeg: number): number {
  const n = h.elevDeg.length
  const f = (((azDeg % 360) + 360) % 360) / h.azStepDeg
  const i = Math.floor(f) % n
  const w = f - Math.floor(f)
  return h.elevDeg[i] * (1 - w) + h.elevDeg[(i + 1) % n] * w
}

/**
 * Fraction (0..1) of a disc of angular radius `radiusDeg` centred at (az, el) that is above
 * the terrain horizon. The disc is cut into vertical strips and each strip is compared with
 * the horizon at its own azimuth, so a notch or a peak in front of the disc is handled.
 */
export function discVisibleFraction(
  h: Horizon,
  azDeg: number,
  elDeg: number,
  radiusDeg: number,
  strips = 15,
): number {
  // Quick exits when the disc is far from the horizon.
  const centre = horizonAt(h, azDeg)
  if (elDeg - centre > radiusDeg * 4) return 1
  if (centre - elDeg > radiusDeg * 4 + 2) return 0
  const cosEl = Math.max(Math.cos(elDeg * D2R), 1e-6)
  let visible = 0
  let total = 0
  for (let k = 0; k < strips; k++) {
    const x = (-1 + (2 * (k + 0.5)) / strips) * radiusDeg
    const half = Math.sqrt(radiusDeg * radiusDeg - x * x)
    const hz = horizonAt(h, azDeg + x / cosEl)
    visible += Math.min(Math.max(elDeg + half - hz, 0), 2 * half)
    total += 2 * half
  }
  return visible / total
}
