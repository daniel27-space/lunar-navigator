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
}

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
  // Fly-in: stop a few tens of km out, looking at the site from the equator side, with the
  // site's own vertical as up.
  const site = new THREE.Vector3(...sitePosKm(goal.lat, goal.lon, goal.hM))
  const f = localFrame(goal.lat, goal.lon)
  const pos = site.clone().addScaledVector(new THREE.Vector3(...f.u), 26).addScaledVector(new THREE.Vector3(...f.n), 48)
  return { pos, target: site, up: new THREE.Vector3(...f.u), minDistance: 4, via: horizontal(pos) }
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

interface Move {
  t: number
  fromPos: THREE.Vector3
  fromTarget: THREE.Vector3
  fromUp: THREE.Vector3
  to: Pose
}

export function Rig() {
  const camera = useThree((s) => s.camera)
  const controls = useRef<OrbitControlsImpl>(null)
  const goal = useStore((s) => s.view)
  const move = useRef<Move | null>(null)
  // The controls read the camera's up only when created, so each move ends by creating new ones.
  const [ctl, setCtl] = useState({ key: 0, target: POLE_TARGET.toArray(), minDistance: 8 })

  useEffect(() => {
    const c = controls.current
    if (!c || goal.seq === 0) return
    move.current = {
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

  useFrame((_, dt) => {
    const m = move.current
    if (!m) return
    m.t = Math.min(1, m.t + Math.min(dt, 0.05) / 2.0)
    const k = ease(m.t)
    // Direction and distance are interpolated separately, so the path arcs around the Moon
    // instead of cutting through it.
    const fromLen = m.fromPos.length()
    const toLen = m.to.pos.length()
    const dir = slerpUnit(m.fromPos.clone().normalize(), m.to.pos.clone().normalize(), k)
    const lift = Math.sin(Math.PI * k) * 0.25 * m.fromPos.distanceTo(m.to.pos)
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
    }
  })

  return (
    <OrbitControls
      key={ctl.key}
      ref={controls}
      target={ctl.target}
      minDistance={ctl.minDistance}
      maxDistance={9000}
      enableDamping
      dampingFactor={0.08}
      rotateSpeed={0.5}
      // Left drag orbits, wheel zooms, holding the wheel (or right button) and dragging slides the view.
      mouseButtons={{ LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN }}
    />
  )
}
