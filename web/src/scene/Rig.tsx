// Camera moves: the south-pole overview, the whole Moon, or a fly-in to one site.
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { localFrame, R_KM, sitePosKm, upVector } from '../lib/geo'
import { useStore, type ViewGoal } from '../store'

interface Pose {
  pos: THREE.Vector3
  target: THREE.Vector3
  up: THREE.Vector3
  minDistance: number
}

export const POLE_POSE = {
  pos: [260, -180, -(R_KM + 330)] as [number, number, number],
  up: [0, 0, -1] as [number, number, number],
}

function poseFor(goal: ViewGoal, current: THREE.Vector3): Pose {
  if (goal.kind === 'pole') {
    return {
      pos: new THREE.Vector3(...POLE_POSE.pos),
      target: new THREE.Vector3(0, 0, -R_KM),
      up: new THREE.Vector3(...POLE_POSE.up),
      minDistance: 8,
    }
  }
  if (goal.kind === 'globe') {
    // Look at the Moon's centre from above the requested point, or from where we already are.
    const dir =
      goal.lat !== undefined && goal.lon !== undefined
        ? new THREE.Vector3(...upVector(goal.lat, goal.lon))
        : current.clone().normalize().setZ(Math.max(current.clone().normalize().z, -0.5)).normalize()
    return {
      pos: dir.multiplyScalar(R_KM * 3.2),
      target: new THREE.Vector3(0, 0, 0),
      up: new THREE.Vector3(0, 0, 1),
      minDistance: R_KM + 120,
    }
  }
  // Fly-in: stop a few tens of km out, looking at the site from the equator side.
  const site = new THREE.Vector3(...sitePosKm(goal.lat, goal.lon, goal.hM))
  const f = localFrame(goal.lat, goal.lon)
  const north = new THREE.Vector3(...f.n)
  const up = new THREE.Vector3(...f.u)
  return {
    pos: site.clone().addScaledVector(up, 26).addScaledVector(north, 48),
    target: site,
    up: new THREE.Vector3(0, 0, -1),
    minDistance: 4,
  }
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

export function Rig() {
  const camera = useThree((s) => s.camera)
  const controls = useRef<OrbitControlsImpl>(null)
  const goal = useStore((s) => s.view)
  const anim = useRef<{ t: number; from: Pose; to: Pose } | null>(null)

  useEffect(() => {
    const c = controls.current
    if (!c || goal.seq === 0) return
    const to = poseFor(goal, camera.position)
    anim.current = {
      t: 0,
      from: { pos: camera.position.clone(), target: c.target.clone(), up: camera.up.clone(), minDistance: 0 },
      to,
    }
    c.minDistance = 0 // limits are applied when the move finishes
    c.enabled = false
  }, [goal, camera])

  useFrame((_, dt) => {
    const a = anim.current
    const c = controls.current
    if (!a || !c) return
    a.t = Math.min(1, a.t + dt / 1.8)
    const k = ease(a.t)
    // Interpolate direction and distance separately so the path arcs around the Moon
    // instead of cutting through it.
    const r = THREE.MathUtils.lerp(a.from.pos.length(), a.to.pos.length(), k)
    const lift = Math.sin(Math.PI * k) * 0.25 * a.from.pos.distanceTo(a.to.pos)
    const dir = a.from.pos.clone().normalize().lerp(a.to.pos.clone().normalize(), k).normalize()
    camera.position.copy(dir.multiplyScalar(r + lift))
    c.target.lerpVectors(a.from.target, a.to.target, k)
    camera.up.lerpVectors(a.from.up, a.to.up, k).normalize()
    camera.lookAt(c.target)
    if (a.t >= 1) {
      camera.up.copy(a.to.up)
      c.minDistance = a.to.minDistance
      c.enabled = true
      c.update()
      anim.current = null
    }
  })

  return (
    <OrbitControls
      ref={controls}
      target={[0, 0, -R_KM]}
      minDistance={8}
      maxDistance={9000}
      enableDamping
      dampingFactor={0.08}
      rotateSpeed={0.5}
    />
  )
}
