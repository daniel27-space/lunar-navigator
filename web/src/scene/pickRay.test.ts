import { describe, expect, it } from 'vitest'
import { heightfieldHit, sphereHit } from './pickRay'

const R = 1737.4
const unit = (x: number, y: number, z: number) => {
  const n = Math.hypot(x, y, z)
  return { x: x / n, y: y / n, z: z / n }
}

describe('pointer ray against the ground', () => {
  it('meets a sphere on its near side, and misses when aimed past it', () => {
    expect(sphereHit({ x: 0, y: 0, z: -3000 }, { x: 0, y: 0, z: 1 }, R)).toBeCloseTo(3000 - R, 9)
    expect(sphereHit({ x: 0, y: 0, z: -3000 }, unit(1, 0, 0.2), R)).toBeNull()
    expect(sphereHit({ x: 0, y: 0, z: -3000 }, { x: 0, y: 0, z: -1 }, R)).toBeNull()
  })

  it('meets flat ground at its height, above or below the reference sphere', () => {
    const o = { x: 0, y: 0, z: -(R + 300) }
    for (const h of [0, -3.2, 4.5]) {
      const t = heightfieldHit(o, { x: 0, y: 0, z: 1 }, R, () => h)!
      expect(t).toBeCloseTo(300 - h, 3)
    }
  })

  it('finds the true surface on a slanted view, not the reference sphere', () => {
    // Ground 3 km below the sphere, looked at from 60 degrees off the vertical.
    const o = { x: 400, y: 0, z: -(R + 200) }
    const d = unit(-1, 0, 0.55)
    const t = heightfieldHit(o, d, R, () => -3)!
    const p = { x: o.x + d.x * t, y: o.y + d.y * t, z: o.z + d.z * t }
    expect(Math.hypot(p.x, p.y, p.z)).toBeCloseTo(R - 3, 2)
    // further along the ray than the sphere itself
    expect(t).toBeGreaterThan(sphereHit(o, d, R)!)
  })

  it('does not step over a narrow ridge', () => {
    // A 4 km wall 0.5 km thick standing across the path of a low, nearly level ray.
    const wall = (ux: number, _uy: number, uz: number) => (uz < 0 && Math.abs(ux * R - 40) < 0.25 ? 4 : 0)
    const o = { x: 0, y: 0, z: -(R + 1) }
    const d = unit(1, 0, 0.012)
    const t = heightfieldHit(o, d, R, wall)!
    const x = o.x + d.x * t
    expect(x).toBeGreaterThan(39.5)
    expect(x).toBeLessThan(40.3)
  })

  it('returns nothing where the map has no data, or when the ray leaves the Moon', () => {
    expect(heightfieldHit({ x: 0, y: 0, z: -3000 }, { x: 0, y: 0, z: 1 }, R, () => NaN)).toBeNull()
    expect(heightfieldHit({ x: 0, y: 0, z: -3000 }, unit(1, 0, 0.1), R, () => 0)).toBeNull()
  })
})
