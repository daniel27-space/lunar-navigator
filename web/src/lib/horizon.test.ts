import { describe, expect, it } from 'vitest'
import { R2D, spProject } from './geo'
import { computeHorizon, discVisibleFraction, horizonAt } from './horizon'
import type { Terrain } from './terrain'

const R = 1737400

/** A synthetic south-pole terrain from a height function of projected (x, y) metres. */
function synthetic(fn: (x: number, y: number) => number, size = 1024, half = 310000): Terrain {
  const pixel = (2 * half) / size
  const h = new Float32Array(size * size)
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++) h[r * size + c] = fn(-half + (c + 0.5) * pixel, half - (r + 0.5) * pixel)
  return { radiusM: R, levels: [{ size, xMin: -half, xMax: half, yMin: -half, yMax: half, pixel, h }] }
}

describe('terrain horizon', () => {
  it('on a smooth sphere equals the geometric dip for the observer height', () => {
    const t = synthetic(() => 0)
    const hz = computeHorizon(t, -88, 40, { observerHeightM: 2, azStepDeg: 30 })
    const dip = -Math.acos(R / (R + 2)) * R2D
    expect(dip).toBeCloseTo(-0.0869, 3)
    for (const e of hz.elevDeg) expect(Math.abs(e - dip)).toBeLessThan(0.01)
  })

  it('sees a tall mesa at the angle curvature predicts, at the right azimuth', () => {
    // Observer at the pole. A 3 km mesa centred 60 km away towards lon 90E (which is +x).
    const [mx, my] = spProject(-90 + (60000 / R) * R2D, 90, R)
    const t = synthetic((x, y) => (Math.hypot(x - mx, y - my) < 8000 ? 3000 : 0))
    const hz = computeHorizon(t, -90, 0, { observerHeightM: 2, azStepDeg: 1 })
    // At the pole with lon 0, "north" points along lon 0 (+y) and east along lon 90 (+x).
    // The mesa is symmetric about azimuth 90, so the horizon there is at (or within grid
    // noise of) the maximum, and mirror azimuths agree.
    expect(Math.max(...hz.elevDeg) - hz.elevDeg[90]).toBeLessThan(0.03)
    expect(Math.abs(hz.elevDeg[86] - hz.elevDeg[94])).toBeLessThan(0.03)
    expect(hz.elevDeg[0]).toBeLessThan(0)
    // Near edge of the mesa at 52 km: angle of a point 3 km high at arc distance d.
    // The synthetic grid has ~605 m pixels, so bilinear sampling only reaches the full 3 km
    // one pixel inside the edge, and the march step at this range is ~520 m. The result must
    // therefore lie between the exact angles at 52 km and at 52 km + pixel + step.
    const angleAt = (d: number) => {
      const th = d / R
      return Math.atan2((R + 3000) * Math.cos(th) - (R + 2), (R + 3000) * Math.sin(th)) * R2D
    }
    expect(hz.elevDeg[90]).toBeLessThanOrEqual(angleAt(52000))
    expect(hz.elevDeg[90]).toBeGreaterThanOrEqual(angleAt(52000 + 605 + 520))
    // Away from the mesa the horizon is the smooth-sphere dip.
    expect(hz.elevDeg[270]).toBeLessThan(0)
  })
})

describe('disc visibility', () => {
  const flat = {
    lat: -89,
    lon: 0,
    observerHeightM: 2,
    azStepDeg: 0.5,
    elevDeg: new Float32Array(720).fill(1),
    distKm: new Float32Array(720),
  }
  it('is 0, 0.5 and 1 for a disc below, on and above a flat horizon', () => {
    expect(discVisibleFraction(flat, 100, 0.5, 0.266)).toBe(0)
    expect(discVisibleFraction(flat, 100, 1.0, 0.266)).toBeCloseTo(0.5, 2)
    expect(discVisibleFraction(flat, 100, 1.5, 0.266)).toBe(1)
  })
  it('interpolates the horizon across the 360 wrap', () => {
    const h = { ...flat, elevDeg: new Float32Array(720).fill(0) }
    h.elevDeg[0] = 2
    expect(horizonAt(h, 359.75)).toBeCloseTo(1, 6)
    expect(horizonAt(h, -0.25)).toBeCloseTo(1, 6)
  })
})
