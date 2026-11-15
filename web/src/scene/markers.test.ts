import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { insideDisc, MARKER, overMarker } from './markers'

const hit = (marker: boolean, u = 0.5, v = 0.5, visible = true) => {
  const object = new THREE.Object3D()
  if (marker) object.userData = MARKER
  object.visible = visible
  return { object, uv: new THREE.Vector2(u, v) }
}

describe('marker clicks', () => {
  it('the ground gives way when a marker is anywhere under the pointer, even behind the ground', () => {
    expect(overMarker([hit(false), hit(true)])).toBe(true)
    expect(overMarker([hit(false)])).toBe(false)
  })
  it('only the round disc counts, not the corners of its square, and not a hidden marker', () => {
    expect(insideDisc(hit(true, 0.5, 0.95))).toBe(true)
    expect(overMarker([hit(false), hit(true, 0.95, 0.95)])).toBe(false)
    expect(overMarker([hit(false), hit(true, 0.5, 0.5, false)])).toBe(false)
  })
})
