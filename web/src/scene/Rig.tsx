// Camera moves: the south-pole overview, the whole Moon, or a fly-in to one site.
//
// "Up" differs between views (south-up over the pole, north-up for the whole Moon, local
// vertical at a site), so each move turns the up direction smoothly along with the position,
// and the orbit controls are rebuilt at the end of a move so they orbit about the new up.
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { invalidate, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { localFrame, R_KM, sitePosKm, upVector } from '../lib/geo'
import { useStore, type ViewGoal } from '../store'

interface Pose {
  pos: THREE.Vector3
  target: THREE.Vector3
  up: THREE.Vector3
  minDistance: number
  /** direction the up vector swings through when it has to turn right over */
  via: THREE.Vector3
  /** how long the move to this pose takes, seconds (default 2) */
  seconds?: number
  /** how far the path rises above the straight line mid-way, as a share of its length (default 0.25) */
  lift?: number
}

/** The approach to a site: how far out and how high the camera ends, km. */
export const APPROACH_KM = { out: 4, up: 1.2 }

export const POLE_POSE = {
  pos: [260, -180, -(R_KM + 330)] as [number, number, number],
  up: [0, 0, -1] as [number, number, number],
}
const POLE_TARGET = new THREE.Vector3(0, 0, -R_KM)
const POLE_OFFSET_KM = Math.hypot(POLE_POSE.pos[0], POLE_POSE.pos[1])

const X = new THREE.Vector3(1, 0, 0)

/** Unit horizontal (equatorial-plane) part of v, or the x axis if v is vertical. */
export function horizontal(v: THREE.Vector3): THREE.Vector3 {
  const h = new THREE.Vector3(v.x, v.y, 0)
  return h.lengthSq() < 1e-9 ? X.clone() : h.normalize()
}

/** Great-circle interpolation between two unit vectors. */
export function slerpUnit(a: THREE.Vector3, b: THREE.Vector3, k: number): THREE.Vector3 {
  const q = new THREE.Quaternion().setFromUnitVectors(a, b)
  return a.clone().applyQuaternion(new THREE.Quaternion().slerp(q, k))
}

/** Up vector part-way through a move. Nearly opposite ups turn through `via`, never through zero. */
export function upAt(from: THREE.Vector3, to: THREE.Vector3, via: THREE.Vector3, k: number): THREE.Vector3 {
  if (from.dot(to) > -0.9) return slerpUnit(from, to, k)
  return k < 0.5 ? slerpUnit(from, via, k * 2) : slerpUnit(via, to, k * 2 - 1)
}

/** What the top of the screen points at: the camera's up, at right angles to the view direction. */
function screenUp(camera: THREE.Camera, target: THREE.Vector3): THREE.Vector3 {
  const view = target.clone().sub(camera.position).normalize()
  return camera.up.clone().addScaledVector(view, -camera.up.dot(view)).normalize()
}

export function poseFor(goal: ViewGoal, camera: THREE.Camera, target: THREE.Vector3): Pose {
  const northUp = camera.up.z > 0
  if (goal.kind === 'pole') {
    // From the whole-Moon view, arrive just past the pole so the flight needs no roll.
    const side = horizontal(camera.position)
    const pos = northUp
      ? new THREE.Vector3(-side.x * POLE_OFFSET_KM, -side.y * POLE_OFFSET_KM, POLE_POSE.pos[2])
      : new THREE.Vector3(...POLE_POSE.pos)
    return { pos, target: POLE_TARGET.clone(), up: new THREE.Vector3(...POLE_POSE.up), minDistance: 8, via: side }
  }
  if (goal.kind === 'globe') {
    let dir: THREE.Vector3
    if (goal.lat !== undefined && goal.lon !== undefined) {
      dir = new THREE.Vector3(...upVector(goal.lat, goal.lon))
    } else if (northUp) {
      // Already looking at the whole Moon: keep the viewpoint, just reset the distance.
      dir = camera.position.clone().normalize()
    } else {
      // Pull back the way the top of the screen points, to 30 degrees south.
      const ahead = horizontal(screenUp(camera, target))
      dir = new THREE.Vector3(ahead.x * Math.cos(Math.PI / 6), ahead.y * Math.cos(Math.PI / 6), -0.5)
    }
    return {
      pos: dir.clone().multiplyScalar(R_KM * 3.2),
      target: new THREE.Vector3(0, 0, 0),
      up: new THREE.Vector3(0, 0, 1),
      minDistance: R_KM + 120,
      via: horizontal(dir),
    }
  }
  if (goal.kind === 'approach') {
    // The last leg down to a mission's ground-level view: a few km out and low, on the same
    // side as the site pose so the camera only sinks and closes in, without swinging round.
    const site = new THREE.Vector3(...sitePosKm(goal.lat, goal.lon, goal.hM))
    const f = localFrame(goal.lat, goal.lon)
    const pos = site.clone().addScaledVector(new THREE.Vector3(...f.u), APPROACH_KM.up).addScaledVector(new THREE.Vector3(...f.n), APPROACH_KM.out)
    // From close by it is a short descent; from far away (no detailed terrain, whole-Moon view) allow longer.
    const near = camera.position.distanceTo(site) < 200
    return { pos, target: site, up: new THREE.Vector3(...f.u), minDistance: 1, via: horizontal(pos), seconds: near ? 1.4 : 2.4, lift: near ? 0 : 0.25 }
  }
  // Fly-in: stop a few tens of km out, looking at the site from the equator side, with the
  // site's own vertical as up.
  const site = new THREE.Vector3(...sitePosKm(goal.lat, goal.lon, goal.hM))
  const f = localFrame(goal.lat, goal.lon)
  const pos = site.clone().addScaledVector(new THREE.Vector3(...f.u), 26).addScaledVector(new THREE.Vector3(...f.n), 48)
  return { pos, target: site, up: new THREE.Vector3(...f.u), minDistance: 4, via: horizontal(pos) }
}

const NO_ACTION = -1 as unknown as THREE.MOUSE

/**
 * The turn about the Moon's centre that slides the view by (dx, dy) screen pixels, so that the
 * ground under the pointer follows the pointer. Distance from the centre is unchanged by a
 * rotation, so the camera keeps its height above the surface.
 */
export function surfaceSlide(
  camera: THREE.PerspectiveCamera,
  target: THREE.Vector3,
  dx: number,
  dy: number,
  viewportHeightPx: number,
): THREE.Quaternion {
  const wholeMoon = target.length() < 1
  // Direction from the centre to the ground in view, and how far away that ground is.
  const ground = (wholeMoon ? camera.position : target).clone().normalize()
  const distance = wholeMoon ? Math.max(camera.position.length() - R_KM, 1) : camera.position.distanceTo(target)
  const radius = wholeMoon ? R_KM : Math.max(target.length(), 1)
  const kmPerPx = (2 * distance * Math.tan((camera.fov * Math.PI) / 360)) / viewportHeightPx
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0)
  const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1)
  // Dragging right moves the camera left over the ground; dragging down moves it up.
  const axisH = right.clone().cross(ground)
  const axisV = ground.clone().cross(up)
  const q = new THREE.Quaternion()
  if (axisH.lengthSq() > 1e-12) q.setFromAxisAngle(axisH.normalize(), (dx * kmPerPx) / radius)
  if (axisV.lengthSq() > 1e-12) q.multiply(new THREE.Quaternion().setFromAxisAngle(axisV.normalize(), (dy * kmPerPx) / radius))
  return q
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

interface Move {
  /** the request this move answers, reported to the store when it ends */
  seq: number
  t: number
  fromPos: THREE.Vector3
  fromTarget: THREE.Vector3
  fromUp: THREE.Vector3
  to: Pose
}

/** The camera is kept at least this far above the ground beneath it, km. */
export const CLEARANCE_KM = 0.06

/**
 * The camera position moved straight up, if needed, so that it is at least `CLEARANCE_KM`
 * above the ground beneath it. `surfaceKm` is the surface's distance from the Moon's centre
 * under that position.
 */
export function aboveGround(position: THREE.Vector3, surfaceKm: number): THREE.Vector3 {
  const least = surfaceKm + CLEARANCE_KM
  return position.length() < least ? position.clone().setLength(least) : position
}

/** Near clipping distance for a camera this high above the ground: close enough not to cut into it. */
export function nearFor(heightKm: number): number {
  return Math.min(Math.max(heightKm * 0.2, 0.01), 1)
}

interface RigProps {
  /** elevation in metres above the 1737.4 km sphere at a latitude and longitude */
  elevation?: (lat: number, lon: number) => number
}

export function Rig({ elevation }: RigProps) {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const controls = useRef<OrbitControlsImpl>(null)
  const goal = useStore((s) => s.view)
  const move = useRef<Move | null>(null)
  // The controls read the camera's up only when created, so each move ends by creating new ones.
  const [ctl, setCtl] = useState({ key: 0, target: POLE_TARGET.toArray(), minDistance: 8 })

  useEffect(() => {
    const c = controls.current
    if (!c || goal.seq === 0) return
    move.current = {
      seq: goal.seq,
      t: 0,
      fromPos: camera.position.clone(),
      fromTarget: c.target.clone(),
      fromUp: camera.up.clone().normalize(),
      to: poseFor(goal, camera, c.target),
    }
    c.enabled = false
    invalidate() // the view only redraws on demand; start the move
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goal, camera])

  // Holding the wheel (or the right button) and dragging slides the view over the Moon: the
  // camera and the point it looks at both turn about the Moon's centre, so the height above
  // the surface stays the same however far you go.
  useEffect(() => {
    const el = gl.domElement
    let last: { x: number; y: number } | null = null
    const down = (e: PointerEvent) => {
      if ((e.button !== 1 && e.button !== 2) || move.current || !controls.current) return
      e.preventDefault()
      last = { x: e.clientX, y: e.clientY }
      el.setPointerCapture(e.pointerId)
      controls.current.enabled = false
    }
    const drag = (e: PointerEvent) => {
      const c = controls.current
      if (!last || !c) return
      const dx = e.clientX - last.x
      const dy = e.clientY - last.y
      last = { x: e.clientX, y: e.clientY }
      const q = surfaceSlide(camera as THREE.PerspectiveCamera, c.target, dx, dy, el.clientHeight)
      const wholeMoon = c.target.length() < 1
      camera.position.applyQuaternion(q)
      c.target.applyQuaternion(q)
      // Looking at the whole Moon, north stays up; over the surface, up turns with the ground.
      if (!wholeMoon) camera.up.applyQuaternion(q).normalize()
      camera.lookAt(c.target)
      invalidate()
    }
    const up = (e: PointerEvent) => {
      const c = controls.current
      if (!last || !c) return
      last = null
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
      const target = c.target.toArray()
      // New controls, so they orbit about the up direction the slide ended with.
      setCtl((k) => ({ key: k.key + 1, target, minDistance: k.minDistance }))
    }
    const noMenu = (e: Event) => e.preventDefault()
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', drag)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    el.addEventListener('contextmenu', noMenu)
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', drag)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      el.removeEventListener('contextmenu', noMenu)
    }
  }, [gl, camera])

  // Free roam: after the controls have moved the camera, lift it clear of the ground if it has
  // gone into it, and bring the near clipping distance in as it gets low, so the ground close
  // to the camera is not cut away.
  useFrame(() => {
    if (move.current) return
    const p = camera.position
    const lat = Math.asin(Math.min(Math.max(p.z / p.length(), -1), 1)) * (180 / Math.PI)
    const lon = Math.atan2(p.y, p.x) * (180 / Math.PI)
    const surface = R_KM + (elevation ? elevation(lat, lon) : 0) / 1000
    const lifted = aboveGround(p, surface)
    if (lifted !== p) {
      p.copy(lifted)
      camera.lookAt(controls.current ? controls.current.target : new THREE.Vector3())
      invalidate()
    }
    const cam = camera as THREE.PerspectiveCamera
    const near = nearFor(p.length() - surface)
    if (Math.abs(near - cam.near) > cam.near * 0.05) {
      cam.near = near
      cam.updateProjectionMatrix()
      invalidate()
    }
  })

  useFrame((_, dt) => {
    const m = move.current
    if (!m) return
    m.t = Math.min(1, m.t + Math.min(dt, 0.05) / (m.to.seconds ?? 2.0))
    const k = ease(m.t)
    // Direction and distance are interpolated separately, so the path arcs around the Moon
    // instead of cutting through it.
    const fromLen = m.fromPos.length()
    const toLen = m.to.pos.length()
    const dir = slerpUnit(m.fromPos.clone().normalize(), m.to.pos.clone().normalize(), k)
    const lift = Math.sin(Math.PI * k) * (m.to.lift ?? 0.25) * m.fromPos.distanceTo(m.to.pos)
    camera.position.copy(dir.multiplyScalar(THREE.MathUtils.lerp(fromLen, toLen, k) + lift))
    const target = m.fromTarget.clone().lerp(m.to.target, k)
    camera.up.copy(upAt(m.fromUp, m.to.up, m.to.via, k))
    camera.lookAt(target)
    invalidate() // keep drawing until the move ends
    if (m.t >= 1) {
      camera.position.copy(m.to.pos)
      camera.up.copy(m.to.up)
      camera.lookAt(m.to.target)
      move.current = null
      setCtl((c) => ({ key: c.key + 1, target: m.to.target.toArray(), minDistance: m.to.minDistance }))
      // Tell the interface this move is over (the mission view continues from here).
      useStore.getState().setArrived(m.seq)
    }
  })

  return (
    <OrbitControls
      key={ctl.key}
      ref={controls}
      target={ctl.target}
      minDistance={ctl.minDistance}
      // Over the surface the camera cannot swing below the level of the point it looks at
      // (it would be looking up through the ground). Looking at the whole Moon there is no such limit.
      maxPolarAngle={ctl.target.every((v) => Math.abs(v) < 1) ? Math.PI : (87 * Math.PI) / 180}
      maxDistance={9000}
      enableDamping
      dampingFactor={0.08}
      rotateSpeed={0.5}
      // Left drag orbits and the wheel zooms. Holding the wheel or the right button is handled
      // above (it slides over the surface), so the controls ignore those buttons.
      mouseButtons={{ LEFT: THREE.MOUSE.ROTATE, MIDDLE: NO_ACTION, RIGHT: NO_ACTION }}
    />
  )
}
