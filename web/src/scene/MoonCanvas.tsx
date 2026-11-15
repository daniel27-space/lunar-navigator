// The main 3D canvas. It is its own small component so that the switch between sharp frames (at
// rest) and cheaper frames (while the view is moving or the clock is running) redraws only this,
// not the whole app: redrawing the app at the start of every drag caused a visible hitch.
import type { ReactNode } from 'react'
import { Canvas } from '@react-three/fiber'
import { DETAIL, useStore, type Quality } from '../store'
import { POLE_POSE } from './Rig'

/** The most device pixels per CSS pixel drawn while the view is moving. */
const MOVING_DPR = 1

/** True while frames should be drawn more cheaply: the view is moving, or the clock is running. */
export const useBusy = () => useStore((s) => s.moving || s.playing)

export function MoonCanvas({ quality, children }: { quality: Quality; children: ReactNode }) {
  const busy = useBusy()
  const full = DETAIL[quality].dpr
  return (
    <Canvas
      frameloop="demand"
      camera={{ position: POLE_POSE.pos, up: POLE_POSE.up, near: 1, far: 30000, fov: 40 }}
      gl={{ antialias: quality !== 'low', powerPreference: 'high-performance' }}
      dpr={[1, busy ? Math.min(full, MOVING_DPR) : full]}
    >
      {children}
    </Canvas>
  )
}
