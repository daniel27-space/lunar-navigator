import { describe, expect, it } from 'vitest'
import { boxReach, edgeMarker, sphereBlocks } from './skyCompassMath'

const view = { width: 1000, height: 800, rect: { left: 0, top: 100, right: 1000, bottom: 700 }, half: { w: 40, h: 20 } }

describe('edgeMarker', () => {
  it('shows nothing for a body in view', () => {
    expect(edgeMarker({ ...view, ndc: { x: 0.3, y: -0.2, z: 0.9 }, occluded: false }).show).toBe(false)
  })

  it('puts the marker on the right edge, pointing right, for a body off to the right', () => {
    const m = edgeMarker({ ...view, ndc: { x: 3, y: 0, z: 0.9 }, occluded: false })
    expect(m.show).toBe(true)
    expect(m.x).toBeCloseTo(960)
    expect(m.y).toBeCloseTo(400)
    expect(m.angle).toBeCloseTo(0)
  })

  it('keeps the marker inside the free part of the view for a body above', () => {
    const m = edgeMarker({ ...view, ndc: { x: 0, y: 5, z: 0.9 }, occluded: false })
    expect(m.y).toBeCloseTo(120)
    expect(m.angle).toBeCloseTo(-Math.PI / 2)
  })

  it('flips a body behind the camera, so the wedge points the way to turn', () => {
    // Behind the camera and really up and to the right: it projects down and to the left.
    const m = edgeMarker({ ...view, ndc: { x: -0.2, y: -0.1, z: 1.4 }, occluded: false })
    expect(m.show).toBe(true)
    expect(m.x).toBeCloseTo(960)
    expect(m.y).toBeLessThan(400)
    expect(Math.cos(m.angle)).toBeGreaterThan(0)
    expect(Math.sin(m.angle)).toBeLessThan(0)
  })

  it('still gives a place for a body straight behind the camera', () => {
    const m = edgeMarker({ ...view, ndc: { x: 0, y: 0, z: 1.2 }, occluded: false })
    expect(m.show).toBe(true)
    expect(Number.isFinite(m.x) && Number.isFinite(m.y) && Number.isFinite(m.angle)).toBe(true)
  })

  it('shows the marker for a body in frame but behind the Moon', () => {
    const m = edgeMarker({ ...view, ndc: { x: -0.4, y: 0, z: 0.9 }, occluded: true })
    expect(m.show).toBe(true)
    expect(m.x).toBeCloseTo(40)
    expect(Math.abs(m.angle)).toBeCloseTo(Math.PI)
  })
})

describe('sphereBlocks', () => {
  it('is true when the Moon is between the camera and the body', () => {
    expect(sphereBlocks([0, 0, 5000], [0, 0, -13000], 1737.4)).toBe(true)
  })
  it('is false when the line passes beside the Moon', () => {
    expect(sphereBlocks([0, 0, 5000], [9000, 0, -13000], 1737.4)).toBe(false)
  })
  it('is false when the Moon is behind the camera', () => {
    expect(sphereBlocks([0, 0, 5000], [0, 0, 13000], 1737.4)).toBe(false)
  })
})

describe('boxReach', () => {
  it('reaches the side, the top and the corner of a box', () => {
    expect(boxReach(30, 12, 0)).toBeCloseTo(30)
    expect(boxReach(30, 12, Math.PI / 2)).toBeCloseTo(12)
    expect(boxReach(30, 12, Math.atan2(12, 30))).toBeCloseTo(Math.hypot(30, 12))
  })
})
