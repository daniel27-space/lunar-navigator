// SLIM (JAXA), as it actually came to rest on 19 Jan 2024: on its nose, main engines pointing
// up, leaning, with its solar cells facing west. The tiny LEV-2 (SORA-Q) rover that took the
// famous photograph sits on the ground a little way off.
// Drawn 1 unit tall with its lowest point at y = 0 (see ../parts).
import * as THREE from 'three'
import { Box, CELLS, Cyl, DARK, FOIL, METAL, PAINT, Strut, type V3 } from '../parts'

const SILVER = { color: '#c6c8cc', metalness: 0.3, roughness: 0.5 }
const GRID = { color: '#8a6f6a', metalness: 0.2, roughness: 0.6 }
// The main engine nozzles are a brown ceramic, not metal.
const CERAMIC = { color: '#5b4638', metalness: 0.15, roughness: 0.65 }
const YELLOW = { color: '#b3963f', metalness: 0.1, roughness: 0.7 }

// The craft is laid out in its own frame, in metres: y runs along the body from the nose (down)
// to the engines (up), -x is the solar cell face, +x is the face that carries the landing feet,
// z is the width. In the scene east is +x and north is -z, so the cells already face west.
const HX = 0.65
const HY = 0.75
const HZ = 0.85
const NOZZLE_TOP = 1.62
const NOZZLE_R = 0.2
const NOSE_R = 0.55
const NOSE_SQUASH = 0.3
const FOOT_R = 0.13
const FEET: [number, number][] = [[0.5, 0.7], [0.5, -0.7], [-0.5, 0.7], [-0.5, -0.7], [-0.62, 0]]
const FOOT_X = HX + 0.3

// How it lies: tipped a little to the east and to the north, then turned slightly. Yaw is
// applied last so the lean stays the same whichever way it is turned.
const TILT = new THREE.Euler(0.13, 0.12, -0.21, 'YXZ')

// Nothing here can measure itself (no effects), so the height of the tilted craft is worked out
// from its outermost points: the body corners, the squashed nose, the nozzle rims and the feet.
// That gives the scale that makes it 1 unit tall and the lift that puts its lowest point on 0.
const { SCALE, LIFT } = (() => {
  const pts: THREE.Vector3[] = []
  for (const x of [-HX, HX]) for (const y of [-HY, HY]) for (const z of [-HZ, HZ]) pts.push(new THREE.Vector3(x, y, z))
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2
    for (const z0 of [-0.32, 0.32]) pts.push(new THREE.Vector3(NOZZLE_R * Math.cos(a), NOZZLE_TOP, z0 + NOZZLE_R * Math.sin(a)))
    for (const t of [0.3, 0.6, 0.9, 1.2]) {
      pts.push(new THREE.Vector3(NOSE_R * Math.sin(t) * Math.cos(a), -HY - NOSE_R * NOSE_SQUASH * Math.cos(t), NOSE_R * Math.sin(t) * Math.sin(a)))
    }
  }
  pts.push(new THREE.Vector3(0, -HY - NOSE_R * NOSE_SQUASH, 0))
  let lo = Infinity
  let hi = -Infinity
  for (const p of pts) {
    const y = p.applyEuler(TILT).y
    lo = Math.min(lo, y)
    hi = Math.max(hi, y)
  }
  // The feet are balls, so their reach is the same in every direction.
  for (const [fy, fz] of FEET) {
    const y = new THREE.Vector3(FOOT_X, fy, fz).applyEuler(TILT).y
    lo = Math.min(lo, y - FOOT_R)
    hi = Math.max(hi, y + FOOT_R)
  }
  const s = 1 / (hi - lo)
  return { SCALE: s, LIFT: -lo * s }
})()

/** Solar cells in the panel's own XY plane, facing +z, with the reddish cell joins. */
function Cells({ p, w, h, cols, rows }: { p: V3; w: number; h: number; cols: number; rows: number }) {
  return (
    <group position={p}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[w, h, 0.03]} />
        <meshStandardMaterial {...CELLS} />
      </mesh>
      {Array.from({ length: cols + 1 }, (_, k) => (
        <mesh key={`c${k}`} position={[w * (k / cols - 0.5), 0, 0.016]}>
          <boxGeometry args={[0.018, h, 0.004]} />
          <meshStandardMaterial {...GRID} />
        </mesh>
      ))}
      {Array.from({ length: rows + 1 }, (_, k) => (
        <mesh key={`r${k}`} position={[0, h * (k / rows - 0.5), 0.016]}>
          <boxGeometry args={[w, 0.018, 0.004]} />
          <meshStandardMaterial {...GRID} />
        </mesh>
      ))}
    </group>
  )
}

/** LEV-2 (SORA-Q): a ball that splits into two wheel halves with the camera body between. */
function Lev2({ p, r }: { p: V3; r: number }) {
  return (
    <group position={p} rotation={[0, 0.9, 0]}>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * r * 0.75, r, 0]} rotation={[0, 0, (-side * Math.PI) / 2]} castShadow>
          <sphereGeometry args={[r, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial {...METAL} side={THREE.DoubleSide} />
        </mesh>
      ))}
      <Box p={[0, r, 0]} s={[r * 1.3, r * 0.9, r * 0.9]} mat={YELLOW} />
      <Box p={[0, r * 0.35, -r * 1.1]} s={[r * 0.7, r * 0.12, r * 1.4]} mat={METAL} />
    </group>
  )
}

export function Slim() {
  return (
    <group>
      <group position={[0, LIFT, 0]} rotation={TILT} scale={SCALE}>
        {/* Body: a foil wrapped box, narrower at the engine end, with the squashed nose under it. */}
        <Box p={[0, 0, 0]} s={[HX * 2, HY * 2, HZ * 2]} mat={FOIL} />
        <Box p={[0, HY + 0.2, 0]} s={[1.1, 0.4, 1.36]} mat={FOIL} />
        <mesh position={[0, -HY, 0]} scale={[1, NOSE_SQUASH, 1]} castShadow>
          <sphereGeometry args={[NOSE_R, 20, 12]} />
          <meshStandardMaterial {...FOIL} />
        </mesh>
        {/* Foil seams, so the big faces do not read as one flat slab. */}
        <Box p={[0, 0.15, 0]} s={[HX * 2 + 0.02, 0.03, HZ * 2 + 0.02]} mat={SILVER} />
        <Box p={[0, -HY + 0.02, 0]} s={[HX * 2 + 0.03, 0.05, HZ * 2 + 0.03]} mat={SILVER} />

        {/* The two main engines, now pointing at the sky. */}
        {[-0.32, 0.32].map((z) => (
          <group key={z}>
            <Cyl p={[0, HY + 0.44, z]} rTop={0.1} h={0.1} seg={14} mat={METAL} />
            <mesh position={[0, (HY + 0.48 + NOZZLE_TOP) / 2, z]} castShadow>
              <cylinderGeometry args={[NOZZLE_R, 0.07, NOZZLE_TOP - HY - 0.48, 20, 1, true]} />
              <meshStandardMaterial {...CERAMIC} side={THREE.DoubleSide} />
            </mesh>
          </group>
        ))}

        {/* Small attitude thrusters round the engine end. */}
        {[[-0.45, -0.58], [-0.45, 0], [-0.45, 0.58], [0.45, -0.58], [0.45, 0], [0.45, 0.58], [0, -0.6], [0, 0.6]].map(([x, z]) => (
          <group key={`${x}${z}`}>
            <Strut a={[x, HY + 0.4, z]} b={[x, HY + 0.47, z]} r={0.015} />
            <Cyl p={[x, HY + 0.52, z]} rTop={0.055} rBot={0.02} h={0.11} seg={10} mat={METAL} />
          </group>
        ))}

        {/* The west face: solar cells, a white radiator beside them, two more cells higher up. */}
        <group rotation={[0, -Math.PI / 2, 0]}>
          <Cells p={[0.22, -0.05, HX + 0.02]} w={1.16} h={1.3} cols={5} rows={4} />
          <Cells p={[0.3, HY + 0.2, 0.55 + 0.02]} w={0.56} h={0.32} cols={2} rows={1} />
          <Box p={[-0.6, -0.25, HX + 0.012]} s={[0.4, 0.62, 0.03]} mat={PAINT} />
        </group>

        {/* The east face: five crushable lattice feet, now sticking out sideways, and the flat
            antennas of the landing radar between them. */}
        {FEET.map(([y, z]) => (
          <group key={`${y}${z}`}>
            <Strut a={[HX, y, z * 0.92]} b={[FOOT_X - 0.02, y, z]} r={0.035} />
            <mesh position={[FOOT_X, y, z]} rotation={[0, 0, -Math.PI / 2]} castShadow>
              <sphereGeometry args={[FOOT_R, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
              <meshStandardMaterial {...METAL} side={THREE.DoubleSide} />
            </mesh>
          </group>
        ))}
        <Box p={[HX + 0.02, 0.1, 0.25]} s={[0.04, 0.4, 0.34]} mat={PAINT} />
        <Box p={[HX + 0.02, 0.1, -0.25]} s={[0.04, 0.4, 0.34]} mat={PAINT} />

        {/* Side faces: a small antenna and the navigation camera housings. */}
        <Cyl p={[0.1, 0.35, HZ + 0.07]} rTop={0.02} rBot={0.07} h={0.14} seg={12} mat={PAINT} rot={[Math.PI / 2, 0, 0]} />
        <Box p={[-0.2, -0.3, HZ + 0.04]} s={[0.22, 0.18, 0.08]} mat={DARK} />
        <Box p={[0.25, -0.3, HZ + 0.012]} s={[0.5, 0.7, 0.03]} mat={SILVER} />
        <Box p={[-0.15, -0.25, -HZ - 0.012]} s={[0.6, 0.8, 0.03]} mat={PAINT} />
        <Cyl p={[-0.1, 0.3, -HZ - 0.07]} rTop={0.02} rBot={0.07} h={0.14} seg={12} mat={PAINT} rot={[-Math.PI / 2, 0, 0]} />
        <Box p={[0.3, 0.4, -HZ - 0.04]} s={[0.2, 0.2, 0.08]} mat={DARK} />
      </group>

      {/* LEV-2 really is this small next to the lander: a ball about 8 cm across. */}
      <Lev2 p={[-0.5, 0, 0.62]} r={0.022} />
    </group>
  )
}
