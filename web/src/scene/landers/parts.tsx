// Building blocks for the simplified craft models (scene/landers/craft): a few neutral
// materials and the primitive shapes they are assembled from. A model is drawn 1 unit tall with
// its feet at y = 0, y up, and is scaled to the real craft's height where it is used.
import { useMemo } from 'react'
import * as THREE from 'three'

// A few neutral materials: foil, bare metal, white paint, dark parts, solar cells, ground.
export const FOIL = { color: '#b09a66', metalness: 0.3, roughness: 0.55 }
export const METAL = { color: '#b9bdc4', metalness: 0.35, roughness: 0.45 }
export const PAINT = { color: '#d8d8d4', metalness: 0.1, roughness: 0.7 }
export const DARK = { color: '#3a3d44', metalness: 0.2, roughness: 0.6 }
export const CELLS = { color: '#232c40', metalness: 0.3, roughness: 0.4 }
export const ROCK = { color: '#7a7773', metalness: 0, roughness: 1 }

export type V3 = [number, number, number]

/** A round strut between two points. */
export function Strut({ a, b, r = 0.012, mat = METAL }: { a: V3; b: V3; r?: number; mat?: typeof METAL }) {
  const { pos, quat, len } = useMemo(() => {
    const A = new THREE.Vector3(...a)
    const B = new THREE.Vector3(...b)
    const d = B.clone().sub(A)
    return {
      pos: A.clone().add(B).multiplyScalar(0.5),
      quat: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()),
      len: d.length(),
    }
  }, [a, b])
  return (
    <mesh position={pos} quaternion={quat} castShadow>
      <cylinderGeometry args={[r, r, len, 8]} />
      <meshStandardMaterial {...mat} />
    </mesh>
  )
}

/** `count` landing legs round the body: a main strut, a brace and a foot pad each. */
export function Legs({ count, top, low, foot, bodyR, start = 0, r = 0.014 }: { count: number; top: number; low: number; foot: number; bodyR: number; start?: number; r?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, k) => {
        const t = start + (k / count) * Math.PI * 2
        const c = Math.cos(t)
        const s = Math.sin(t)
        return (
          <group key={k}>
            <Strut a={[bodyR * c, top, bodyR * s]} b={[foot * c, 0.02, foot * s]} r={r} />
            <Strut a={[bodyR * c, low, bodyR * s]} b={[foot * 0.86 * c, 0.1, foot * 0.86 * s]} r={r * 0.7} />
            <mesh position={[foot * c, 0.01, foot * s]} castShadow>
              <cylinderGeometry args={[r * 3.6, r * 3.6, 0.02, 16]} />
              <meshStandardMaterial {...METAL} />
            </mesh>
          </group>
        )
      })}
    </>
  )
}

export function Box({ p, s, mat, rot }: { p: V3; s: V3; mat: typeof METAL; rot?: V3 }) {
  return (
    <mesh position={p} rotation={rot} castShadow receiveShadow>
      <boxGeometry args={s} />
      <meshStandardMaterial {...mat} />
    </mesh>
  )
}

export function Cyl({ p, rTop, rBot, h, seg = 24, mat, rot }: { p: V3; rTop: number; rBot?: number; h: number; seg?: number; mat: typeof METAL; rot?: V3 }) {
  return (
    <mesh position={p} rotation={rot} castShadow receiveShadow>
      <cylinderGeometry args={[rTop, rBot ?? rTop, h, seg]} />
      <meshStandardMaterial {...mat} flatShading={seg <= 8} />
    </mesh>
  )
}

export function Ball({ p, r, mat }: { p: V3; r: number; mat: typeof METAL }) {
  return (
    <mesh position={p} castShadow>
      <sphereGeometry args={[r, 20, 14]} />
      <meshStandardMaterial {...mat} />
    </mesh>
  )
}

/** A dish antenna: a shallow cone on a short stem, facing `rot`. */
export function Dish({ p, r, rot = [0, 0, 0] }: { p: V3; r: number; rot?: V3 }) {
  return (
    <group position={p} rotation={rot}>
      <mesh castShadow>
        <coneGeometry args={[r, r * 0.35, 24, 1, true]} />
        <meshStandardMaterial {...PAINT} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

/** Wheels along both sides of a rover body. */
export function Wheels({ perSide, length, halfWidth, y, r }: { perSide: number; length: number; halfWidth: number; y: number; r: number }) {
  return (
    <>
      {[-1, 1].flatMap((side) =>
        Array.from({ length: perSide }, (_, k) => (
          <Cyl key={`${side}${k}`} p={[side * halfWidth, y, -length / 2 + (k / (perSide - 1)) * length]} rTop={r} h={r * 0.7} seg={14} mat={DARK} rot={[0, 0, Math.PI / 2]} />
        )),
      )}
    </>
  )
}
