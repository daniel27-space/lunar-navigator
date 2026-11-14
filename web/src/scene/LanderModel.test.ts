// Lighting of the mission view's ground scene: level ground must stay visible for every Sun
// height at which the app calls a site sunlit, and never jump.
import { describe, expect, it } from 'vitest'
import { sceneLight } from './LanderModel'

const ground = (elDeg: number) => {
  const l = sceneLight(elDeg)
  return l.sun * Math.sin((l.elDeg * Math.PI) / 180)
}

describe('ground-scene light', () => {
  it('keeps level ground lit from a grazing Sun to an overhead one', () => {
    for (let el = 0; el <= 90; el += 0.5) {
      expect(ground(el)).toBeGreaterThan(0.55)
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

  it('never lowers the light below 5 degrees, and gives shadows more fill when the ground is bright', () => {
    expect(sceneLight(0.3).elDeg).toBe(5)
    expect(sceneLight(40).elDeg).toBe(40)
    expect(sceneLight(30).bounce).toBeGreaterThan(sceneLight(5).bounce)
    expect(sceneLight(5).bounce).toBeGreaterThan(0.55)
  })
})
