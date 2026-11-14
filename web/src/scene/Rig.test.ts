// Camera moves must never pass through a zero-length or flipped "up" (the cause of the
// glitch when going from the south pole to the whole Moon), and must end where they should.
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { R_KM } from '../lib/geo'
import { APPROACH_KM, horizontal, POLE_POSE, poseFor, slerpUnit, surfaceSlide, upAt } from './Rig'

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

  it('the site pose is unchanged: 26 km up and 48 km out, a two-second move with the usual arc', () => {
    const cam = cameraAt(POLE_POSE.pos, POLE_POSE.up)
    const pose = poseFor({ kind: 'site', lat: 26.13, lon: 3.63, hM: -1900, seq: 1 }, cam, new THREE.Vector3(0, 0, -R_KM))
    const off = pose.pos.clone().sub(pose.target)
    expect(off.dot(pose.up)).toBeCloseTo(26, 6)
    expect(off.length()).toBeCloseTo(Math.hypot(26, 48), 6)
    expect(pose.minDistance).toBe(4)
    expect(pose.seconds).toBeUndefined()
    expect(pose.lift).toBeUndefined()
  })

  it('the approach ends a few km out and low, on the same side as the site pose, looking at the site', () => {
    for (const [lat, lon, hM] of [
      [26.13, 3.63, -1900],
      [-89.45, -137.2, 1200],
      [-43.3, -11.4, 0],
    ]) {
      const cam = cameraAt(POLE_POSE.pos, POLE_POSE.up)
      const site = poseFor({ kind: 'site', lat, lon, hM, seq: 1 }, cam, new THREE.Vector3(0, 0, -R_KM))
      const near = poseFor({ kind: 'approach', lat, lon, hM, seq: 2 }, cam, new THREE.Vector3(0, 0, -R_KM))
      // Same target and the same up as the site pose.
      expect(near.target.distanceTo(site.target)).toBeLessThan(1e-9)
      expect(near.up.distanceTo(site.up)).toBeLessThan(1e-9)
      const off = near.pos.clone().sub(near.target)
      const siteOff = site.pos.clone().sub(site.target)
      // A few km away, above the local horizon but lower in the sky than the site pose.
      expect(off.length()).toBeCloseTo(Math.hypot(APPROACH_KM.out, APPROACH_KM.up), 6)
      expect(off.length()).toBeLessThan(6)
      const height = off.dot(near.up)
      expect(height).toBeCloseTo(APPROACH_KM.up, 6)
      expect(height / off.length()).toBeLessThan(siteOff.dot(site.up) / siteOff.length())
      // Same compass side of the site: the level parts of the two offsets point the same way.
      const level = (v: THREE.Vector3) => v.clone().addScaledVector(near.up, -v.dot(near.up)).normalize()
      expect(level(off).dot(level(siteOff))).toBeCloseTo(1, 9)
      expect(near.minDistance).toBeLessThan(site.minDistance)
    }
  })

  it('the approach is a short straight descent from the site pose, and a longer arc from far away', () => {
    const goal = { kind: 'approach', lat: 26.13, lon: 3.63, hM: -1900, seq: 2 } as const
    const far = cameraAt(POLE_POSE.pos, POLE_POSE.up)
    const site = poseFor({ kind: 'site', lat: 26.13, lon: 3.63, hM: -1900, seq: 1 }, far, new THREE.Vector3(0, 0, -R_KM))
    const fromSite = poseFor(goal, cameraAt(site.pos.toArray(), site.up.toArray()), site.target)
    expect(fromSite.seconds).toBeLessThan(2)
    expect(fromSite.lift).toBe(0)
    // Every point of that descent is closer to the site than the one before, and stays above the ground.
    let last = Infinity
    for (let i = 0; i <= 50; i++) {
      const k = i / 50
      const dir = slerpUnit(site.pos.clone().normalize(), fromSite.pos.clone().normalize(), k)
      const p = dir.multiplyScalar(THREE.MathUtils.lerp(site.pos.length(), fromSite.pos.length(), k))
      const d = p.distanceTo(site.target)
      expect(d).toBeLessThanOrEqual(last + 1e-9)
      expect(p.length()).toBeGreaterThan(site.target.length())
      last = d
    }
    const fromFar = poseFor(goal, far, new THREE.Vector3(0, 0, -R_KM))
    expect(fromFar.seconds).toBeGreaterThan(2)
    expect(fromFar.lift).toBeGreaterThan(0)
    expect(fromFar.pos.distanceTo(fromSite.pos)).toBeLessThan(1e-9)
    expect(horizontal(fromFar.via).length()).toBeCloseTo(1, 9)
  })

  it('wheel-hold drag keeps the height above the surface and moves the ground with the pointer', () => {
    const cam = cameraAt(POLE_POSE.pos, POLE_POSE.up)
    cam.fov = 40
    const target = new THREE.Vector3(0, 0, -R_KM)
    cam.lookAt(target)
    cam.updateMatrixWorld()
    const height = cam.position.length()
    const distance = cam.position.distanceTo(target)
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0)
    // Many small drags to the right, 100 px in all, on an 800 px high view.
    let moved = new THREE.Vector3()
    const start = cam.position.clone()
    for (let i = 0; i < 100; i++) {
      const q = surfaceSlide(cam, target, 1, 0, 800)
      cam.position.applyQuaternion(q)
      target.applyQuaternion(q)
      cam.up.applyQuaternion(q)
      cam.lookAt(target)
      cam.updateMatrixWorld()
    }
    moved = cam.position.clone().sub(start)
    // Same distance from the Moon's centre, same distance to the ground looked at.
    expect(cam.position.length()).toBeCloseTo(height, 6)
    expect(target.length()).toBeCloseTo(R_KM, 6)
    expect(cam.position.distanceTo(target)).toBeCloseTo(distance, 6)
    // The camera went left (the ground followed the pointer to the right) by about 100 px of ground.
    const kmPerPx = (2 * distance * Math.tan((40 * Math.PI) / 360)) / 800
    expect(moved.dot(right)).toBeLessThan(0)
    expect(target.distanceTo(new THREE.Vector3(0, 0, -R_KM))).toBeCloseTo(100 * kmPerPx, 0)
  })

  it('over the whole Moon the slide is an orbit at constant distance', () => {
    const cam = cameraAt([0, -5000, 1000], [0, 0, 1])
    const target = new THREE.Vector3()
    cam.lookAt(target)
    cam.updateMatrixWorld()
    const d = cam.position.length()
    const q = surfaceSlide(cam, target, 40, -25, 800)
    cam.position.applyQuaternion(q)
    expect(cam.position.length()).toBeCloseTo(d, 6)
    expect(target.length()).toBe(0)
  })
})
