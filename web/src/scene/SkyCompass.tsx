// Edge markers for the Sun and the Earth. Both are nearly always outside the main view, so a
// small chip at the edge of the view points to each one while it is off screen or behind the
// Moon, and goes away when the body itself can be seen.
//
// Two parts: the chips are plain DOM, drawn over the 3D view; the driver lives inside the
// Canvas, where the camera is, and moves the chips by writing their transforms directly on
// each rendered frame (no React state, so no extra renders and no frames of its own).
import { useEffect } from 'react'
import * as THREE from 'three'
import { invalidate, useFrame } from '@react-three/fiber'
import { R_KM, unit, type Vec3 } from '../lib/geo'
import { EARTH_AT_KM, SUN_AT_KM } from './SkyBodies'
import { boxReach, edgeMarker, sphereBlocks } from './skyCompassMath'
import './SkyCompass.css'

type Body = 'sun' | 'earth'

/** The chips' elements, shared between the two components. Set and cleared by ref callbacks. */
const els: { box: HTMLDivElement | null; sun: HTMLDivElement | null; earth: HTMLDivElement | null } = { box: null, sun: null, earth: null }

/** Gap between the pill and its wedge, px. */
const WEDGE_GAP = 2

const scratch = new THREE.Vector3()

function place(body: Body, dir: Vec3, atKm: number, camera: THREE.Camera, width: number, height: number) {
  const el = els[body]
  const box = els.box
  if (!el || !box) return
  const wedge = el.firstElementChild as HTMLElement | null
  const boxW = box.clientWidth
  const boxH = box.clientHeight
  if (!wedge || boxW === 0 || boxH === 0) return // not laid out (hidden by CSS)
  const pos: [number, number, number] = [dir[0] * atKm, dir[1] * atKm, dir[2] * atKm]
  const ndc = scratch.set(pos[0], pos[1], pos[2]).project(camera)
  const cam = camera.position
  const halfW = el.offsetWidth / 2
  const halfH = el.offsetHeight / 2
  const reach = Math.max(wedge.offsetWidth, wedge.offsetHeight) + WEDGE_GAP
  const m = edgeMarker({
    ndc,
    occluded: sphereBlocks([cam.x, cam.y, cam.z], pos, R_KM),
    width,
    height,
    rect: { left: box.offsetLeft, top: box.offsetTop, right: box.offsetLeft + boxW, bottom: box.offsetTop + boxH },
    half: { w: halfW + reach, h: halfH + reach },
  })
  if (!m.show) {
    el.dataset.on = 'false'
    return
  }
  // Whole pixels, so the text stays sharp. Positions are relative to the box.
  const x = Math.round(m.x - box.offsetLeft - halfW)
  const y = Math.round(m.y - box.offsetTop - halfH)
  el.style.transform = `translate(${x}px, ${y}px)`
  const out = boxReach(halfW, halfH, m.angle) + WEDGE_GAP + wedge.offsetWidth / 2
  wedge.style.transform = `translate(-50%, -50%) rotate(${m.angle.toFixed(4)}rad) translateX(${out.toFixed(1)}px)`
  el.dataset.on = 'true'
}

interface DriverProps {
  /** Moon-centred vectors to the Sun and the Earth, body-fixed (any length) */
  sun: Vec3
  earth: Vec3
}

/** Goes inside the Canvas, after the camera rig so it sees the camera where this frame has put it. */
export function SkyCompassDriver({ sun, earth }: DriverProps) {
  const sunDir = unit(sun)
  const earthDir = unit(earth)
  // The view is drawn on demand: ask for a frame when the bodies move, and on mount.
  useEffect(() => {
    invalidate()
  }, [sunDir[0], sunDir[1], sunDir[2], earthDir[0], earthDir[1], earthDir[2]]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(
    () => () => {
      if (els.sun) els.sun.dataset.on = 'false'
      if (els.earth) els.earth.dataset.on = 'false'
    },
    [],
  )
  useFrame(({ camera, size }) => {
    if (!els.box) return
    camera.updateMatrixWorld()
    place('sun', sunDir, SUN_AT_KM, camera, size.width, size.height)
    place('earth', earthDir, EARTH_AT_KM, camera, size.width, size.height)
  })
  return null
}

const setBox = (el: HTMLDivElement | null) => {
  els.box = el
}
const setSun = (el: HTMLDivElement | null) => {
  els.sun = el
}
const setEarth = (el: HTMLDivElement | null) => {
  els.earth = el
}

/** Goes in the DOM over the 3D view (inside `.viewport`, after the Canvas). */
export function SkyCompassChips() {
  // The free area changes with the window, the panels and the phone sheet; none of those
  // makes the 3D view draw a frame by itself, so ask for one.
  useEffect(() => {
    invalidate()
    const box = els.box
    if (!box || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => invalidate())
    ro.observe(box)
    return () => ro.disconnect()
  }, [])
  return (
    <div className="sky-compass" ref={setBox} aria-hidden="true">
      <div className="sky-chip" data-body="sun" data-on="false" ref={setSun}>
        <span className="sky-chip-wedge" />
        <span className="sky-chip-disc" />
        Sun
      </div>
      <div className="sky-chip" data-body="earth" data-on="false" ref={setEarth}>
        <span className="sky-chip-wedge" />
        <span className="sky-chip-disc" />
        Earth
      </div>
    </div>
  )
}
