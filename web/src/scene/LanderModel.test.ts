// Lighting of the mission view's ground scene: level ground must stay visible for every Sun
// height at which the app calls a site sunlit, and never jump.
import { describe, expect, it } from 'vitest'
import { daylight, LOW_SUN_DEG, sceneLight } from './LanderModel'

const ground = (elDeg: number) => {
  const l = sceneLight(elDeg)
  return l.sun * Math.sin((l.elDeg * Math.PI) / 180)
}

describe('ground-scene light', () => {
  it('keeps level ground lit from a grazing Sun to an overhead one', () => {
    for (let el = 0; el <= 90; el += 0.5) {
      // steady down to 5 degrees; below that it may dim to about half, never to black
      expect(ground(el)).toBeGreaterThan(el >= 5 ? 0.55 : 0.34)
      expect(ground(el)).toBeLessThan(3.1)
    }
  })

  it('holds a steady brightness across the heights seen near the pole and at mid-latitudes', () => {
    for (let el = 15; el <= 34; el += 1) expect(ground(el)).toBeCloseTo(1.7, 6)
  })

  it('changes smoothly with the Sun: no step larger than 10 % per half degree', () => {
    // steepest just above 5 degrees, where the light is at its cap and ground brightness follows the sine
    for (let el = 0.5; el <= 90; el += 0.5) expect(Math.abs(ground(el) - ground(el - 0.5)) / ground(el)).toBeLessThan(0.1)
  })

  it('uses the real Sun height for the shadows, down to a grazing floor', () => {
    expect(sceneLight(0.3).elDeg).toBe(LOW_SUN_DEG)
    expect(sceneLight(1.6).elDeg).toBe(1.6)
    expect(sceneLight(40).elDeg).toBe(40)
    expect(sceneLight(30).bounce).toBeGreaterThan(sceneLight(5).bounce)
    expect(sceneLight(5).bounce).toBeGreaterThan(0.55)
  })
})

describe('daylight share', () => {
  const sky = (el: number, up: boolean, horizon: Float32Array | null = null) => ({ sun: { az: 90, el, radius: 0.27, up }, horizon, azStepDeg: 0.5 })
  it('is full by day, zero at night and gradual while the disc crosses a level skyline', () => {
    expect(daylight(sky(10, true))).toBe(1)
    expect(daylight(sky(-3, false))).toBe(0)
    expect(daylight(sky(0, true))).toBeCloseTo(0.5, 6)
    expect(daylight(sky(0.135, true))).toBeCloseTo(0.75, 6)
    expect(daylight(sky(-0.135, false))).toBeCloseTo(0.25, 6)
  })
  it('measures against the skyline in the direction of the Sun', () => {
    const hills = new Float32Array(720).fill(2)
    expect(daylight(sky(1, false, hills))).toBe(0)
    expect(daylight(sky(2.27, true, hills))).toBe(1)
  })
  it("goes dark when the app says so although the disc is clear (Earth in front of the Sun)", () => {
    expect(daylight(sky(10, false))).toBe(0)
  })
})
