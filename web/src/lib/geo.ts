// Geometry on the lunar reference sphere. Conventions are fixed by docs/DATA_CONTRACT.md:
// MOON_ME body-fixed frame, R = 1737.4 km, east-positive longitude, azimuth clockwise from north.

export const R_KM = 1737.4
export const D2R = Math.PI / 180
export const R2D = 180 / Math.PI
export const SUN_RADIUS_KM = 695700
export const EARTH_RADIUS_KM = 6378.137

export type Vec3 = [number, number, number]

export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const norm = (a: Vec3) => Math.hypot(a[0], a[1], a[2])
export const unit = (a: Vec3): Vec3 => {
  const n = norm(a)
  return [a[0] / n, a[1] / n, a[2] / n]
}

/** Unit vector from the Moon's centre through (lat, lon). */
export function upVector(latDeg: number, lonDeg: number): Vec3 {
  const la = latDeg * D2R
  const lo = lonDeg * D2R
  return [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)]
}

/** Body-fixed position in km of a site at elevation hM metres above the reference sphere. */
export function sitePosKm(latDeg: number, lonDeg: number, hM: number): Vec3 {
  const u = upVector(latDeg, lonDeg)
  const r = R_KM + hM / 1000
  return [u[0] * r, u[1] * r, u[2] * r]
}

export interface LocalFrame {
  e: Vec3
  n: Vec3
  u: Vec3
}

/** East, North, Up unit vectors at (lat, lon) on the sphere. */
export function localFrame(latDeg: number, lonDeg: number): LocalFrame {
  const la = latDeg * D2R
  const lo = lonDeg * D2R
  const sl = Math.sin(la)
  const cl = Math.cos(la)
  const so = Math.sin(lo)
  const co = Math.cos(lo)
  return { e: [-so, co, 0], n: [-sl * co, -sl * so, cl], u: [cl * co, cl * so, sl] }
}

export interface AzEl {
  /** degrees clockwise from north, 0..360 */
  az: number
  /** degrees above the local horizontal plane */
  el: number
}

/** Azimuth and elevation of a body-fixed direction (any length) in a local frame. */
export function azEl(v: Vec3, f: LocalFrame): AzEl {
  const E = dot(v, f.e)
  const N = dot(v, f.n)
  const U = dot(v, f.u)
  let az = Math.atan2(E, N) * R2D
  if (az < 0) az += 360
  return { az, el: Math.atan2(U, Math.hypot(E, N)) * R2D }
}

/** Body-fixed unit direction for an azimuth/elevation in a local frame. */
export function dirFromAzEl(azDeg: number, elDeg: number, f: LocalFrame): Vec3 {
  const a = azDeg * D2R
  const e = elDeg * D2R
  const ce = Math.cos(e)
  const E = Math.sin(a) * ce
  const N = Math.cos(a) * ce
  const U = Math.sin(e)
  return [
    E * f.e[0] + N * f.n[0] + U * f.u[0],
    E * f.e[1] + N * f.n[1] + U * f.u[1],
    E * f.e[2] + N * f.n[2] + U * f.u[2],
  ]
}

/** Latitude and longitude (degrees, lon in -180..180) of a body-fixed vector. */
export function latLonOf(p: Vec3): { lat: number; lon: number } {
  const r = norm(p)
  return { lat: Math.asin(p[2] / r) * R2D, lon: Math.atan2(p[1], p[0]) * R2D }
}

// South polar stereographic, true scale at the pole (the LOLA polar product projection).
// x = r sin(lon), y = r cos(lon), r = 2R tan((90 + lat) / 2). Units follow radius.

export function spProject(latDeg: number, lonDeg: number, radius: number): [number, number] {
  const r = 2 * radius * Math.tan(((90 + latDeg) / 2) * D2R)
  const lo = lonDeg * D2R
  return [r * Math.sin(lo), r * Math.cos(lo)]
}

export function spUnproject(x: number, y: number, radius: number): { lat: number; lon: number } {
  const r = Math.hypot(x, y)
  return { lat: 2 * Math.atan(r / (2 * radius)) * R2D - 90, lon: Math.atan2(x, y) * R2D }
}

/** Body-fixed unit vector for a south polar stereographic (x, y). No trig, exact at the pole. */
export function spDirection(x: number, y: number, radius: number): Vec3 {
  const rho2 = (x * x + y * y) / (4 * radius * radius)
  const k = 1 / (1 + rho2)
  return [(y / radius) * k, (x / radius) * k, -(1 - rho2) * k]
}
