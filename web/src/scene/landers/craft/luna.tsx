// The Soviet Luna landers: the Luna 9 / 13 capsule and the Luna 16 to 24 sample-return lander.
// Each is drawn 1 unit tall with its lowest point at y = 0 (see ../parts).
import { useMemo } from 'react'
import * as THREE from 'three'
import { Ball, Cyl, DARK, METAL, PAINT, Strut, type V3 } from '../parts'

// Local materials. Metalness stays low because the scene has no environment map.
const TANK = { color: '#c8c5ba', metalness: 0.2, roughness: 0.6 } // painted propellant tanks
const QUILT = { color: '#cfcabc', metalness: 0.12, roughness: 0.8 } // quilted insulation blanket
const POLISHED = { color: '#cdd0d6', metalness: 0.4, roughness: 0.3 } // bare polished shell
const PANEL = { color: '#8d9096', metalness: 0.3, roughness: 0.55 } // inset face of a petal
const CHARRED = { color: '#4b4136', metalness: 0.1, roughness: 0.85 } // heat shield of the return capsule
const BRASS = { color: '#a8946a', metalness: 0.3, roughness: 0.5 } // engine and fittings

type Mat = typeof METAL

/** A ring lying flat (its axis is y). */
function Ring({ y, R, tube, mat, seg = 32 }: { y: number; R: number; tube: number; mat: Mat; seg?: number }) {
  return (
    <mesh position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
      <torusGeometry args={[R, tube, 10, seg]} />
      <meshStandardMaterial {...mat} />
    </mesh>
  )
}

// ---------------------------------------------------------------------------------------------
// Luna 9 / Luna 13
// ---------------------------------------------------------------------------------------------

const L9_R = 0.275 // radius of the capsule at its widest
// Height of the widest point above the ground. The capsule is egg-shaped, heavy and shallow below
// and taller above, so it rights itself; the petal hinges sit at this level.
const L9_HINGE_Y = 0.23
const PETAL_LEN = 0.47
const PETAL_HALF_W = 0.18
// A petal is hinged at the capsule's widest point and its tip rests on the ground, so it slopes down.
const PETAL_DROOP = Math.asin(L9_HINGE_Y / PETAL_LEN)

/**
 * One petal as a shallow tongue-shaped tray: x runs from the hinge to the tip, z across, and the
 * side edges curl up a little (the petals were segments of the capsule's upper shell).
 * `u0..u1` and `v0..v1` cut out a part of it, used for the inset panel.
 */
function petalGeometry(u0: number, u1: number, v0: number, v1: number, lift: number) {
  const NU = 10
  const NV = 6
  const pos: number[] = []
  const idx: number[] = []
  for (let i = 0; i <= NU; i++) {
    const u = u0 + ((u1 - u0) * i) / NU
    const half = PETAL_HALF_W * Math.sqrt(Math.max(0, 1 - Math.pow(u, 2.6)))
    for (let j = 0; j <= NV; j++) {
      const v = v0 + ((v1 - v0) * j) / NV
      const z = v * half
      pos.push(u * PETAL_LEN, lift + (0.3 * z * z) / PETAL_HALF_W, z)
    }
  }
  for (let i = 0; i < NU; i++) {
    for (let j = 0; j < NV; j++) {
      const a = i * (NV + 1) + j
      const b = a + NV + 1
      idx.push(a, a + 1, b, a + 1, b + 1, b)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

export function Luna9() {
  const petal = useMemo(() => petalGeometry(0, 1, -1, 1, 0), [])
  const panel = useMemo(() => petalGeometry(0.1, 0.78, -0.72, 0.72, 0.004), [])
  const quarter = [0, 1, 2, 3]
  return (
    <group>
      {/* lower half of the capsule, under its insulation blanket; it sits on the ground */}
      <mesh position={[0, L9_HINGE_Y, 0]} scale={[1, L9_HINGE_Y / L9_R, 1]} castShadow receiveShadow>
        <sphereGeometry args={[L9_R, 28, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} />
        <meshStandardMaterial {...QUILT} />
      </mesh>
      {/* the collar at the equator that carries the petal hinges and the antennas */}
      <Cyl p={[0, L9_HINGE_Y + 0.012, 0]} rTop={0.262} rBot={L9_R} h={0.03} seg={28} mat={METAL} />
      <Ring y={L9_HINGE_Y} R={L9_R} tube={0.012} mat={METAL} />
      {/* upper dome, uncovered once the petals opened; a little smaller than the lower half */}
      <mesh position={[0, L9_HINGE_Y + 0.02, 0]} scale={[1, 1.1, 1]} castShadow receiveShadow>
        <sphereGeometry args={[0.245, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial {...POLISHED} />
      </mesh>
      {/* round instrument ports on the dome */}
      {quarter.map((k) => {
        const a = (k / 4) * Math.PI * 2 + 0.3
        const e = 0.75 // elevation on the dome
        const r = 0.243
        return <Ball key={k} p={[r * Math.cos(e) * Math.cos(a), L9_HINGE_Y + 0.02 + 1.1 * r * Math.sin(e), r * Math.cos(e) * Math.sin(a)]} r={0.028} mat={METAL} />
      })}
      {/* the panoramic camera turret on top, with its window band */}
      <Cyl p={[0, 0.525, 0]} rTop={0.05} rBot={0.058} h={0.02} seg={16} mat={METAL} />
      <Cyl p={[0, 0.58, 0]} rTop={0.036} h={0.1} seg={16} mat={DARK} />
      <Cyl p={[0, 0.595, 0]} rTop={0.038} h={0.022} seg={16} mat={{ color: '#15171b', metalness: 0.3, roughness: 0.3 }} />
      <Cyl p={[0, 0.635, 0]} rTop={0.03} rBot={0.038} h={0.012} seg={16} mat={METAL} />

      {/* four petals, sprung open; hinged at the widest point, tips resting on the ground */}
      {quarter.map((k) => {
        const a = (k / 4) * Math.PI * 2
        return (
          <group key={k} position={[L9_R * Math.cos(a), L9_HINGE_Y, L9_R * Math.sin(a)]} rotation={[0, -a, -PETAL_DROOP]}>
            <mesh geometry={petal} castShadow receiveShadow>
              <meshStandardMaterial {...QUILT} color="#bfc1c4" side={THREE.DoubleSide} />
            </mesh>
            <mesh geometry={panel} receiveShadow>
              <meshStandardMaterial {...PANEL} side={THREE.DoubleSide} />
            </mesh>
            {/* hinge barrel */}
            <Cyl p={[0, 0.004, 0]} rTop={0.012} h={0.2} seg={8} mat={METAL} rot={[Math.PI / 2, 0, 0]} />
          </group>
        )
      })}

      {/* four whip antennas between the petals, each with a brightness target hanging from it */}
      {quarter.map((k) => {
        const a = (k / 4) * Math.PI * 2 + Math.PI / 4 + 0.2
        const c = Math.cos(a)
        const s = Math.sin(a)
        const base: V3 = [0.265 * c, 0.255, 0.265 * s]
        const tip: V3 = [0.5 * c, 0.995, 0.5 * s]
        // a point two thirds of the way up, where the target hangs
        const hang: V3 = [0.42 * c, 0.76, 0.42 * s]
        return (
          <group key={k}>
            <Ball p={base} r={0.016} mat={METAL} />
            <Strut a={base} b={tip} r={0.005} mat={PANEL} />
            <Strut a={hang} b={[hang[0], hang[1] - 0.1, hang[2]]} r={0.002} mat={DARK} />
            <mesh position={[hang[0], hang[1] - 0.115, hang[2]]} rotation={[0, -a, 0]} castShadow>
              <boxGeometry args={[0.004, 0.035, 0.03]} />
              <meshStandardMaterial {...PAINT} />
            </mesh>
          </group>
        )
      })}

      {/* Luna 13's two folding instrument arms, each setting an instrument down on the soil */}
      {[0, 1].map((k) => {
        const a = k * Math.PI + Math.PI / 4 - 0.22
        const c = Math.cos(a)
        const s = Math.sin(a)
        const at = (r: number, y: number): V3 => [r * c, y, r * s]
        return (
          <group key={k}>
            <Strut a={at(0.27, 0.25)} b={at(0.6, 0.36)} r={0.007} />
            <Ball p={at(0.6, 0.36)} r={0.012} mat={METAL} />
            <Strut a={at(0.6, 0.36)} b={at(0.9, 0.06)} r={0.007} />
            {/* the soil penetrometer on one arm, the density meter on the other */}
            {k === 0 ? (
              <Cyl p={at(0.9, 0.04)} rTop={0.022} rBot={0.03} h={0.08} seg={12} mat={PAINT} />
            ) : (
              <Cyl p={at(0.9, 0.0125)} rTop={0.045} h={0.025} seg={14} mat={PAINT} />
            )}
          </group>
        )
      })}
    </group>
  )
}

// ---------------------------------------------------------------------------------------------
// Luna 16 / 20 / 23 / 24
// ---------------------------------------------------------------------------------------------

const FOOT_R = 0.56 // how far out the footpads stand
const TANK_R = 0.125
const TANK_RING = 0.2 // distance of the descent tanks' centres from the axis
const TANK_Y = 0.245

/** One landing leg, drawn pointing along +x: a shock strut from the upper frame and a V of two braces from the lower frame, meeting at a round pad. */
function LunaLeg() {
  return (
    <group>
      <Strut a={[0.26, 0.4, 0]} b={[FOOT_R - 0.01, 0.035, 0]} r={0.009} />
      {/* the fatter upper half is the shock absorber's cylinder */}
      <Strut a={[0.26, 0.4, 0]} b={[0.4, 0.23, 0]} r={0.016} />
      <Strut a={[0.2, 0.12, 0.13]} b={[FOOT_R - 0.02, 0.04, 0.008]} r={0.007} />
      <Strut a={[0.2, 0.12, -0.13]} b={[FOOT_R - 0.02, 0.04, -0.008]} r={0.007} />
      <Ball p={[FOOT_R - 0.01, 0.035, 0]} r={0.016} mat={METAL} />
      <Cyl p={[FOOT_R, 0.01, 0]} rTop={0.045} rBot={0.055} h={0.02} seg={16} mat={METAL} />
    </group>
  )
}

export function LunaLander() {
  const quarter = [0, 1, 2, 3]
  return (
    <group>
      {/* ---- descent stage ---- */}
      {/* four spherical propellant tanks round the engine */}
      {quarter.map((k) => {
        const a = Math.PI / 4 + (k / 4) * Math.PI * 2
        return (
          <mesh key={k} position={[TANK_RING * Math.cos(a), TANK_Y, TANK_RING * Math.sin(a)]} castShadow receiveShadow>
            <sphereGeometry args={[TANK_R, 24, 16]} />
            <meshStandardMaterial {...TANK} />
          </mesh>
        )
      })}
      {/* the central body between the tanks and the main engine under it */}
      <Cyl p={[0, 0.26, 0]} rTop={0.085} h={0.28} seg={16} mat={METAL} />
      <Cyl p={[0, 0.105, 0]} rTop={0.035} rBot={0.075} h={0.09} seg={20} mat={BRASS} />
      <Cyl p={[0, 0.062, 0]} rTop={0.077} h={0.006} seg={20} mat={DARK} />
      {/* upper and lower frames that tie the tanks together and carry the legs */}
      <Ring y={0.4} R={0.26} tube={0.008} mat={METAL} />
      <Ring y={0.12} R={0.2} tube={0.007} mat={METAL} seg={24} />
      {quarter.map((k) => (
        <group key={k} rotation={[0, -(k / 4) * Math.PI * 2, 0]}>
          <LunaLeg />
          {/* bracket from the upper frame in to the instrument ring */}
          <Strut a={[0.26, 0.4, 0]} b={[0.19, 0.44, 0]} r={0.008} />
          <Strut a={[0.26, 0.4, 0]} b={[0.085, 0.36, 0]} r={0.006} />
        </group>
      ))}
      {/* small gas bottles tucked between the tanks */}
      {[1, 3].map((k) => {
        const a = (k / 4) * Math.PI * 2
        return <Ball key={k} p={[0.17 * Math.cos(a), 0.31, 0.17 * Math.sin(a)]} r={0.038} mat={METAL} />
      })}

      {/* the ring-shaped pressurised instrument compartment on top of the descent stage */}
      <mesh position={[0, 0.47, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
        <torusGeometry args={[0.16, 0.06, 14, 36]} />
        <meshStandardMaterial {...PAINT} />
      </mesh>
      {/* two camera housings on the ring, looking at the drilling spot */}
      {[2.9, 4.0].map((a) => (
        <Cyl key={a} p={[0.235 * Math.cos(a), 0.445, 0.235 * Math.sin(a)]} rTop={0.018} h={0.07} seg={10} mat={DARK} />
      ))}
      {/* cone antenna on a short boom */}
      <Strut a={[0.2, 0.5, 0.07]} b={[0.33, 0.6, 0.12]} r={0.006} />
      <mesh position={[0.33, 0.625, 0.12]} castShadow>
        <coneGeometry args={[0.035, 0.06, 14, 1, true]} />
        <meshStandardMaterial {...PAINT} side={THREE.DoubleSide} />
      </mesh>

      {/* the drill arm, swung down from the ring so the drill head stands on the soil */}
      <group rotation={[0, -3.5, 0]}>
        <Cyl p={[0.235, 0.45, 0]} rTop={0.022} h={0.05} seg={10} mat={METAL} rot={[Math.PI / 2, 0, 0]} />
        <Strut a={[0.235, 0.45, 0]} b={[0.63, 0.15, 0]} r={0.012} />
        <Cyl p={[0.645, 0.09, 0]} rTop={0.036} h={0.18} seg={16} mat={PAINT} />
        <Cyl p={[0.645, 0.135, 0]} rTop={0.038} h={0.014} seg={16} mat={DARK} />
        <Cyl p={[0.645, 0.05, 0]} rTop={0.038} h={0.014} seg={16} mat={DARK} />
      </group>

      {/* ---- ascent stage, standing on the descent stage ---- */}
      {/* its engine hangs into the hole of the instrument ring */}
      <Cyl p={[0, 0.5, 0]} rTop={0.02} rBot={0.045} h={0.07} seg={14} mat={BRASS} />
      <Cyl p={[0, 0.54, 0]} rTop={0.11} h={0.012} seg={20} mat={METAL} />
      {/* three spherical tanks */}
      {[0, 1, 2].map((k) => {
        const a = (k / 3) * Math.PI * 2 + 0.5
        return <Ball key={k} p={[0.083 * Math.cos(a), 0.615, 0.083 * Math.sin(a)]} r={0.07} mat={TANK} />
      })}
      {/* the cylindrical instrument compartment above the tanks */}
      <Cyl p={[0, 0.76, 0]} rTop={0.068} h={0.18} seg={20} mat={PAINT} />
      <Cyl p={[0, 0.7, 0]} rTop={0.072} h={0.016} seg={20} mat={METAL} />
      <Cyl p={[0, 0.815, 0]} rTop={0.072} h={0.016} seg={20} mat={METAL} />
      {/* four rod antennas reaching out sideways from it */}
      {quarter.map((k) => {
        const a = Math.PI / 4 + (k / 4) * Math.PI * 2
        const c = Math.cos(a)
        const s = Math.sin(a)
        return <Strut key={k} a={[0.066 * c, 0.815, 0.066 * s]} b={[0.26 * c, 0.84, 0.26 * s]} r={0.004} mat={DARK} />
      })}
      {/* the spherical return capsule at the very top, held down by two straps */}
      <Ball p={[0, 0.915, 0]} r={0.065} mat={CHARRED} />
      {[0, Math.PI / 2].map((ry) => (
        <mesh key={ry} position={[0, 0.915, 0]} rotation={[0, ry, 0]} castShadow>
          <torusGeometry args={[0.067, 0.004, 6, 28]} />
          <meshStandardMaterial {...METAL} />
        </mesh>
      ))}
      <Cyl p={[0, 0.99, 0]} rTop={0.012} h={0.02} seg={10} mat={METAL} />
    </group>
  )
}
