// Notes in the store while the view is moving, so frames can be drawn more cheaply then
// (fewer pixels in MoonCanvas, shorter shadow tracing in MoonTerrain).
//
// Shading the ground costs the same for every pixel on screen, and a sharp screen has four
// times as many. While the view is turning, zooming or flying nobody can see that sharpness,
// so moving frames are drawn at a lower resolution and stay smooth; a moment after the view
// comes to rest one frame is drawn at full sharpness.
import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useStore } from '../store'

/** How long the view must be still before it is drawn sharp again, ms. */
const REST_MS = 160

export function MovingDetail() {
  const onMoving = useStore((s) => s.setMoving)
  const last = useRef(new Float32Array(16))
  const moving = useRef(false)
  const timer = useRef(0)
  useEffect(() => () => clearTimeout(timer.current), [])
  useFrame(({ camera }) => {
    const e = camera.matrixWorld.elements
    let changed = false
    for (let i = 0; i < 16; i++) {
      if (Math.abs(e[i] - last.current[i]) > 1e-7 * Math.max(1, Math.abs(e[i]))) changed = true
      last.current[i] = e[i]
    }
    if (!changed) return
    if (!moving.current) {
      moving.current = true
      onMoving(true)
    }
    clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      moving.current = false
      onMoving(false)
    }, REST_MS)
  })
  return null
}
