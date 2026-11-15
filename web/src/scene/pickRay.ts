// Where a ray from the pointer meets the ground, worked out directly.
//
// The stock test checks the ray against every triangle of a mesh (over a million for the
// detailed terrain), and it runs on every pointer move, so it made turning and clicking stall.
// The ground is a height map, so the meeting point can be found by walking along the ray and
// asking the map for the height: a few dozen look-ups, and it is also the true surface, not
// the triangles drawn for it.

type V = { x: number; y: number; z: number }

/** Distance along the ray to the near side of a sphere about the origin, or null if it misses (or is behind). */
export function sphereHit(o: V, d: V, radius: number): number | null {
  const b = o.x * d.x + o.y * d.y + o.z * d.z
  const c = o.x * o.x + o.y * o.y + o.z * o.z - radius * radius
  const disc = b * b - c
  if (disc < 0) return null
  const s = Math.sqrt(disc)
  const t = -b - s > 0 ? -b - s : -b + s
  return t > 0 ? t : null
}

/** Highest ground above the reference sphere that a ray needs to allow for, km (the Moon's highest point is about 10.8 km). */
const CEILING_KM = 12

/**
 * Distance along the ray (unit direction `d`) to the ground of a height map wrapped on a sphere
 * of `radiusKm`, or null if it never meets it. `heightKm` gives the height above the sphere in
 * a unit direction, or NaN where the map has no data (the ray is then over someone else's ground).
 */
export function heightfieldHit(o: V, d: V, radiusKm: number, heightKm: (ux: number, uy: number, uz: number) => number): number | null {
  const enter = sphereHit(o, d, radiusKm + CEILING_KM)
  if (enter === null) return null
  const inside = Math.hypot(o.x, o.y, o.z) <= radiusKm + CEILING_KM
  let t = inside ? 0 : enter
  // The far side of the shell: past it the ray has left the Moon.
  const b = o.x * d.x + o.y * d.y + o.z * d.z
  const exit = -b + Math.sqrt(Math.max(b * b - (o.x * o.x + o.y * o.y + o.z * o.z - (radiusKm + CEILING_KM) ** 2), 0))
  let above = NaN // height of the ray over the ground at the last step that had data
  let tAbove = t
  for (let i = 0; i < 400 && t <= exit; i++) {
    const x = o.x + d.x * t
    const y = o.y + d.y * t
    const z = o.z + d.z * t
    const r = Math.hypot(x, y, z)
    const h = heightKm(x / r, y / r, z / r)
    if (Number.isNaN(h)) {
      // No data here: step on and keep looking, the ray may come over this map further along.
      above = NaN
      t += 1
      continue
    }
    const gap = r - (radiusKm + h)
    if (gap <= 0) {
      if (Number.isNaN(above)) return t // already under the surface where the data starts
      // Crossed the surface between the last step and this one: close in on the crossing.
      let lo = tAbove
      let hi = t
      for (let k = 0; k < 14; k++) {
        const m = (lo + hi) / 2
        const mx = o.x + d.x * m
        const my = o.y + d.y * m
        const mz = o.z + d.z * m
        const mr = Math.hypot(mx, my, mz)
        const mh = heightKm(mx / mr, my / mr, mz / mr)
        if (Number.isNaN(mh) || mr - (radiusKm + mh) > 0) lo = m
        else hi = m
      }
      return hi
    }
    above = gap
    tAbove = t
    // Steps shrink as the ray nears the ground, so a ridge is not stepped over.
    t += Math.max(0.03, gap * 0.4)
  }
  return null
}
