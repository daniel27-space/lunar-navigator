import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { earthColour, earthOrientation, landAt } from './earth'

describe('Earth in the mission view', () => {
  it('has land and sea where they are', () => {
    const land: [string, number, number][] = [
      ['Sahara', 22, 10],
      ['Amazon', -5, -60],
      ['Siberia', 62, 100],
      ['Australia', -25, 135],
      ['Antarctica', -85, 0],
      ['central USA', 40, -100],
    ]
    const sea: [string, number, number][] = [
      ['mid Pacific', 0, -150],
      ['mid Atlantic', 0, -25],
      ['Indian Ocean', -30, 80],
      ['Southern Ocean', -55, 150],
      ['North Pacific', 40, -170],
    ]
    for (const [name, lat, lon] of land) expect(landAt(lat, lon), name).toBeGreaterThan(0.5)
    for (const [name, lat, lon] of sea) expect(landAt(lat, lon), name).toBeLessThan(0.5)
  })

  it('wraps in longitude without a seam', () => {
    expect(landAt(65, 179.9)).toBeCloseTo(landAt(65, -179.9), 1)
    expect(earthColour(10, 180)).toEqual(earthColour(10, -180))
  })

  it('is mostly blue, with white at the poles', () => {
    let blue = 0
    let n = 0
    for (let lat = -55; lat <= 55; lat += 10) for (let lon = -175; lon < 180; lon += 10) {
      const [r, , b] = earthColour(lat, lon)
      if (b > r) blue++
      n++
    }
    expect(blue / n).toBeGreaterThan(0.55)
    const pole = earthColour(-88, 40)
    expect(Math.min(...pole)).toBeGreaterThan(200)
  })

  it('turns the globe so north points where asked and the chosen meridian faces the viewer', () => {
    const north = new THREE.Vector3(0.2, 0.9, -0.4).normalize()
    const p = new THREE.Vector3(1200, 300, -2500)
    const q = earthOrientation(north, p, 20)
    expect(new THREE.Vector3(0, 1, 0).applyQuaternion(q).distanceTo(north)).toBeLessThan(1e-9)
    // The point at latitude 0, longitude 20E on the sphere, in three.js's own convention.
    const lon = (20 * Math.PI) / 180
    const out = new THREE.Vector3(Math.cos(lon), 0, -Math.sin(lon)).applyQuaternion(q)
    const toViewer = p.clone().negate().normalize()
    // It lies in the plane of the axis and the viewer, on the viewer's side.
    const inPlane = toViewer.clone().addScaledVector(north, -toViewer.dot(north)).normalize()
    expect(out.distanceTo(inPlane)).toBeLessThan(1e-9)
  })
})
