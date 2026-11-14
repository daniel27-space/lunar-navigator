// Camera moves must never pass through a zero-length or flipped "up" (the cause of the
// glitch when going from the south pole to the whole Moon), and must end where they should.
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { R_KM } from '../lib/geo'
import { POLE_POSE, poseFor, slerpUnit, upAt } from './Rig'

const cameraAt = (pos: number[], up: number[]) => {
  const c = new THREE.PerspectiveCamera()
  c.position.set(pos[0], pos[1], pos[2])
  c.up.set(up[0], up[1], up[2])
  return c
}

describe('camera moves', () => {
  it('turns up from south to north without shrinking or jumping', () => {
    const from = new THREE.Vector3(0, 0, -1)
    const to = new THREE.Vector3(0, 0, 1)
    const via = new THREE.Vector3(0.6, -0.8, 0)
    let prev = upAt(from, to, via, 0)
    let biggestStep = 0
    for (let i = 1; i <= 100; i++) {
      const u = upAt(from, to, via, i / 100)
      expect(Math.abs(u.length() - 1)).toBeLessThan(1e-9)
      biggestStep = Math.max(biggestStep, u.angleTo(prev))
      prev = u
    }
    expect(prev.distanceTo(to)).toBeLessThan(1e-9)
    // 180 degrees in 100 steps: no step may be more than a little over 1.8 degrees.
    expect(biggestStep).toBeLessThan((2 * Math.PI) / 180)
    expect(upAt(from, to, via, 0.5).distanceTo(via)).toBeLessThan(1e-9)
  })

  it('slerps along the great circle', () => {
    const a = new THREE.Vector3(1, 0, 0)
    const b = new THREE.Vector3(0, 1, 0)
    const mid = slerpUnit(a, b, 0.5)
    expect(mid.x).toBeCloseTo(Math.SQRT1_2, 9)
    expect(mid.y).toBeCloseTo(Math.SQRT1_2, 9)
  })

  it('from the pole view, the whole-Moon view ends north-up on the far side of the pole', () => {
    const cam = cameraAt(POLE_POSE.pos, POLE_POSE.up)
    const pose = poseFor({ kind: 'globe', seq: 1 }, cam, new THREE.Vector3(0, 0, -R_KM))
    expect(pose.up.z).toBe(1)
    expect(pose.pos.length()).toBeCloseTo(R_KM * 3.2, 6)
    // Opposite side of the pole from where the camera started, 30 degrees south.
    expect(pose.pos.x * POLE_POSE.pos[0] + pose.pos.y * POLE_POSE.pos[1]).toBeLessThan(0)
    expect(pose.pos.z / pose.pos.length()).toBeCloseTo(-0.5, 9)
    // Every frame of the move has a usable up: unit length and not along the view direction.
    const fromDir = cam.position.clone().normalize()
    for (let i = 0; i <= 100; i++) {
      const k = i / 100
      const pos = slerpUnit(fromDir, pose.pos.clone().normalize(), k)
      const target = new THREE.Vector3(0, 0, -R_KM).lerp(pose.target, k)
      const view = target.clone().sub(pos.multiplyScalar(R_KM * 2)).normalize()
      const up = upAt(cam.up, pose.up, pose.via, k)
      expect(Math.abs(up.dot(view))).toBeLessThan(0.97)
    }
  })

  it('from the whole-Moon view, the pole view arrives just past the pole', () => {
    const cam = cameraAt([3000, 4000, -2000], [0, 0, 1])
    const pose = poseFor({ kind: 'pole', seq: 1 }, cam, new THREE.Vector3())
    expect(pose.up.z).toBe(-1)
    expect(pose.pos.x).toBeLessThan(0)
    expect(pose.pos.y).toBeLessThan(0)
    expect(pose.pos.z).toBe(POLE_POSE.pos[2])
  })

  it('a site view uses the local vertical as up', () => {
    const cam = cameraAt(POLE_POSE.pos, POLE_POSE.up)
    const pose = poseFor({ kind: 'site', lat: -85, lon: 30, hM: 0, seq: 1 }, cam, new THREE.Vector3(0, 0, -R_KM))
    expect(pose.up.dot(pose.target.clone().normalize())).toBeCloseTo(1, 9)
    // The camera is above the site's local horizon.
    expect(pose.pos.clone().sub(pose.target).dot(pose.up)).toBeGreaterThan(0)
  })
})
