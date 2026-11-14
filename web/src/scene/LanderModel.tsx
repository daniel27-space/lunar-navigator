// The mission showcase's own small 3D view: one craft standing on a disc of regolith, lit by a
// single light from the real Sun direction at its site, with a slow turn of the camera.
// It is a separate view (not part of the Moon scene) because a 3-7 m lander is invisible at
// true scale next to 80 m terrain cells.
//
// A craft is either a real model file (glTF binary) or a simplified stand-in built here from
// primitives, one per "archetype" in docs/DATA_CONTRACT.md. Stand-ins are drawn 1 unit tall and
// scaled to the real craft's height.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

export const ARCHETYPES = ['apollo-lm', 'surveyor', 'luna-lander', 'lunokhod', 'change-lander', 'small-lander', 'nova-c', 'impactor'] as const
export type Archetype = (typeof ARCHETYPES)[number]

export type MissionModel =
  | { kind: 'glb'; file: string; height_m: number; credit?: string; license?: string; source_url?: string }
  | { kind: 'archetype'; archetype: string; height_m: number }

/** Typical heights in metres, used when the data gives no model at all. */
const TYPICAL_HEIGHT: Record<Archetype, number> = {
  'apollo-lm': 7,
  surveyor: 3,
  'luna-lander': 3.5,
  lunokhod: 2.6,
  'change-lander': 3.2,
  'small-lander': 2.2,
  'nova-c': 4.3,
  impactor: 12,
}

/** The stand-in to draw when a mission has no model entry: chosen from what it was. */
export function defaultModel(m: { name: string; kind: string }): { kind: 'archetype'; archetype: Archetype; height_m: number } {
  const n = m.name
  const a: Archetype =
    m.kind === 'crewed'
      ? 'apollo-lm'
      : /surveyor/i.test(n)
        ? 'surveyor'
        : /lunokhod|luna 17|luna 21/i.test(n)
          ? 'lunokhod'
          : /^luna/i.test(n)
            ? 'luna-lander'
            : /chang/i.test(n)
              ? 'change-lander'
              : /\bIM-|odysseus|athena/i.test(n)
                ? 'nova-c'
                : /centaur|impact/i.test(n)
                  ? 'impactor'
                  : 'small-lander'
  return { kind: 'archetype', archetype: a, height_m: TYPICAL_HEIGHT[a] }
}

const isArchetype = (s: string): s is Archetype => (ARCHETYPES as readonly string[]).includes(s)

// A few neutral materials: foil, bare metal, white paint, dark parts, solar cells, ground.
const FOIL = { color: '#b09a66', metalness: 0.3, roughness: 0.55 }
const METAL = { color: '#b9bdc4', metalness: 0.35, roughness: 0.45 }
const PAINT = { color: '#d8d8d4', metalness: 0.1, roughness: 0.7 }
const DARK = { color: '#3a3d44', metalness: 0.2, roughness: 0.6 }
const CELLS = { color: '#232c40', metalness: 0.3, roughness: 0.4 }
const REGOLITH = '#77746f'

type V3 = [number, number, number]

/** A round strut between two points. */
function Strut({ a, b, r = 0.012, mat = METAL }: { a: V3; b: V3; r?: number; mat?: typeof METAL }) {
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
function Legs({ count, top, low, foot, bodyR, start = 0, r = 0.014 }: { count: number; top: number; low: number; foot: number; bodyR: number; start?: number; r?: number }) {
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

function Box({ p, s, mat, rot }: { p: V3; s: V3; mat: typeof METAL; rot?: V3 }) {
  return (
    <mesh position={p} rotation={rot} castShadow receiveShadow>
      <boxGeometry args={s} />
      <meshStandardMaterial {...mat} />
    </mesh>
  )
}

function Cyl({ p, rTop, rBot, h, seg = 24, mat, rot }: { p: V3; rTop: number; rBot?: number; h: number; seg?: number; mat: typeof METAL; rot?: V3 }) {
  return (
    <mesh position={p} rotation={rot} castShadow receiveShadow>
      <cylinderGeometry args={[rTop, rBot ?? rTop, h, seg]} />
      <meshStandardMaterial {...mat} flatShading={seg <= 8} />
    </mesh>
  )
}

function Ball({ p, r, mat }: { p: V3; r: number; mat: typeof METAL }) {
  return (
    <mesh position={p} castShadow>
      <sphereGeometry args={[r, 20, 14]} />
      <meshStandardMaterial {...mat} />
    </mesh>
  )
}

/** A dish antenna: a shallow cone on a short stem, facing `rot`. */
function Dish({ p, r, rot = [0, 0, 0] }: { p: V3; r: number; rot?: V3 }) {
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
function Wheels({ perSide, length, halfWidth, y, r }: { perSide: number; length: number; halfWidth: number; y: number; r: number }) {
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

// ---- the eight stand-ins, each 1 unit tall with its feet at y = 0 ----

function ApolloLM() {
  const q = Math.PI / 8
  return (
    <group>
      <Cyl p={[0, 0.3, 0]} rTop={0.3} h={0.2} seg={8} mat={FOIL} rot={[0, q, 0]} />
      <Cyl p={[0, 0.15, 0]} rTop={0.05} rBot={0.11} h={0.12} mat={DARK} />
      <Legs count={4} top={0.38} low={0.22} foot={0.56} bodyR={0.29} r={0.016} />
      {/* ascent stage: cabin, side tanks, docking tunnel, antennas */}
      <Box p={[0, 0.55, -0.02]} s={[0.3, 0.26, 0.26]} mat={METAL} />
      <Cyl p={[0, 0.55, 0.13]} rTop={0.14} h={0.14} mat={METAL} rot={[Math.PI / 2, 0, 0]} />
      <Ball p={[0.2, 0.52, -0.03]} r={0.095} mat={FOIL} />
      <Ball p={[-0.2, 0.52, -0.03]} r={0.095} mat={FOIL} />
      <Cyl p={[0, 0.71, -0.03]} rTop={0.07} h={0.06} mat={DARK} />
      <Strut a={[0.1, 0.68, -0.1]} b={[0.16, 0.92, -0.14]} r={0.008} />
      <Dish p={[0.16, 0.95, -0.14]} r={0.08} rot={[0.5, 0, -0.4]} />
      <Strut a={[-0.1, 0.68, 0.06]} b={[-0.1, 0.84, 0.06]} r={0.006} />
    </group>
  )
}

function Surveyor() {
  const ring = (y: number, r: number) =>
    [0, 1, 2].map((k) => {
      const a = (k / 3) * Math.PI * 2
      const b = ((k + 1) / 3) * Math.PI * 2
      return <Strut key={`${y}${k}`} a={[r * Math.cos(a), y, r * Math.sin(a)]} b={[r * Math.cos(b), y, r * Math.sin(b)]} />
    })
  return (
    <group>
      {ring(0.22, 0.26)}
      {ring(0.38, 0.2)}
      {[0, 1, 2].map((k) => {
        const a = (k / 3) * Math.PI * 2
        return <Strut key={k} a={[0.26 * Math.cos(a), 0.22, 0.26 * Math.sin(a)]} b={[0.2 * Math.cos(a), 0.38, 0.2 * Math.sin(a)]} />
      })}
      <Legs count={3} top={0.36} low={0.22} foot={0.5} bodyR={0.24} />
      <Box p={[0.1, 0.3, 0.06]} s={[0.14, 0.14, 0.12]} mat={PAINT} />
      <Box p={[-0.1, 0.3, -0.06]} s={[0.12, 0.14, 0.14]} mat={PAINT} />
      <Ball p={[0, 0.27, 0]} r={0.07} mat={FOIL} />
      <Cyl p={[0, 0.14, 0]} rTop={0.03} rBot={0.06} h={0.1} mat={DARK} />
      <Strut a={[0, 0.38, 0]} b={[0, 0.86, 0]} r={0.014} />
      <Box p={[-0.17, 0.9, 0]} s={[0.3, 0.012, 0.26]} mat={CELLS} rot={[0, 0, 0.5]} />
      <Box p={[0.17, 0.88, 0]} s={[0.26, 0.012, 0.26]} mat={PAINT} rot={[0, 0, -0.35]} />
      <Strut a={[0, 0.86, 0]} b={[-0.17, 0.9, 0]} r={0.008} />
      <Strut a={[0, 0.86, 0]} b={[0.17, 0.88, 0]} r={0.008} />
    </group>
  )
}

function LunaLander() {
  return (
    <group>
      <Cyl p={[0, 0.3, 0]} rTop={0.17} h={0.26} mat={METAL} />
      {[0, 1, 2, 3].map((k) => {
        const a = Math.PI / 4 + (k / 4) * Math.PI * 2
        return <Ball key={k} p={[0.24 * Math.cos(a), 0.3, 0.24 * Math.sin(a)]} r={0.12} mat={FOIL} />
      })}
      <Cyl p={[0, 0.13, 0]} rTop={0.05} rBot={0.1} h={0.1} mat={DARK} />
      <Legs count={4} top={0.34} low={0.2} foot={0.52} bodyR={0.3} />
      {/* ascent rocket with the return capsule on top */}
      <Cyl p={[0, 0.56, 0]} rTop={0.1} rBot={0.13} h={0.26} mat={PAINT} />
      {[0, 1, 2].map((k) => {
        const a = (k / 3) * Math.PI * 2
        return <Ball key={k} p={[0.13 * Math.cos(a), 0.52, 0.13 * Math.sin(a)]} r={0.07} mat={METAL} />
      })}
      <Cyl p={[0, 0.76, 0]} rTop={0.07} h={0.14} mat={METAL} />
      <Ball p={[0, 0.91, 0]} r={0.09} mat={DARK} />
      <Strut a={[0.2, 0.4, 0.1]} b={[0.46, 0.5, 0.2]} r={0.008} />
    </group>
  )
}

function Lunokhod() {
  return (
    <group>
      {/* the landing platform with its ramps */}
      <Cyl p={[0, 0.2, 0]} rTop={0.3} h={0.1} mat={METAL} />
      {[0, 1, 2, 3].map((k) => {
        const a = Math.PI / 4 + (k / 4) * Math.PI * 2
        return <Ball key={k} p={[0.27 * Math.cos(a), 0.2, 0.27 * Math.sin(a)]} r={0.1} mat={FOIL} />
      })}
      <Legs count={4} top={0.24} low={0.16} foot={0.56} bodyR={0.34} />
      <Box p={[0.1, 0.13, 0.5]} s={[0.05, 0.012, 0.5]} mat={METAL} rot={[0.5, 0, 0]} />
      <Box p={[-0.1, 0.13, 0.5]} s={[0.05, 0.012, 0.5]} mat={METAL} rot={[0.5, 0, 0]} />
      {/* the rover: a tub on eight wheels with its lid open */}
      <Wheels perSide={4} length={0.34} halfWidth={0.19} y={0.33} r={0.065} />
      <Cyl p={[0, 0.47, 0]} rTop={0.2} rBot={0.14} h={0.15} mat={PAINT} />
      <Cyl p={[0, 0.62, -0.17]} rTop={0.2} h={0.012} mat={CELLS} rot={[-1.0, 0, 0]} />
      <Box p={[0, 0.5, 0.2]} s={[0.2, 0.05, 0.05]} mat={DARK} />
      <Strut a={[0.12, 0.54, 0.1]} b={[0.16, 0.86, 0.12]} r={0.008} />
      <Cyl p={[0.16, 0.93, 0.12]} rTop={0.012} rBot={0.045} h={0.14} mat={METAL} />
      <Dish p={[-0.14, 0.62, 0.14]} r={0.06} rot={[0.9, 0, 0.3]} />
    </group>
  )
}

function ChangELander() {
  return (
    <group>
      <Cyl p={[0, 0.42, 0]} rTop={0.27} h={0.3} seg={8} mat={FOIL} rot={[0, Math.PI / 8, 0]} />
      <Cyl p={[0, 0.22, 0]} rTop={0.05} rBot={0.1} h={0.12} mat={DARK} />
      <Legs count={4} top={0.46} low={0.3} foot={0.52} bodyR={0.26} start={Math.PI / 4} r={0.016} />
      <Box p={[0.44, 0.58, 0]} s={[0.36, 0.012, 0.3]} mat={CELLS} rot={[0, 0, 0.15]} />
      <Box p={[-0.44, 0.58, 0]} s={[0.36, 0.012, 0.3]} mat={CELLS} rot={[0, 0, -0.15]} />
      <Box p={[0, 0.6, 0]} s={[0.3, 0.06, 0.3]} mat={METAL} />
      <Strut a={[0.08, 0.62, -0.08]} b={[0.08, 0.92, -0.08]} r={0.01} />
      <Dish p={[0.08, 0.95, -0.08]} r={0.08} rot={[0.4, 0, 0.3]} />
      <Strut a={[-0.1, 0.62, 0.1]} b={[-0.1, 0.8, 0.1]} r={0.008} />
      <Box p={[-0.1, 0.82, 0.1]} s={[0.06, 0.04, 0.04]} mat={DARK} />
      {/* the small six-wheel rover beside it */}
      <group position={[0.2, 0, 0.72]} rotation={[0, 0.5, 0]}>
        <Wheels perSide={3} length={0.2} halfWidth={0.085} y={0.04} r={0.04} />
        <Box p={[0, 0.11, 0]} s={[0.13, 0.07, 0.2]} mat={FOIL} />
        <Box p={[0.14, 0.15, 0]} s={[0.16, 0.008, 0.16]} mat={CELLS} rot={[0, 0, 0.2]} />
        <Box p={[-0.14, 0.15, 0]} s={[0.16, 0.008, 0.16]} mat={CELLS} rot={[0, 0, -0.2]} />
        <Strut a={[0, 0.14, 0.07]} b={[0, 0.3, 0.07]} r={0.006} />
        <Box p={[0, 0.31, 0.07]} s={[0.05, 0.025, 0.025]} mat={DARK} />
      </group>
    </group>
  )
}

function SmallLander() {
  return (
    <group>
      <Cyl p={[0, 0.48, 0]} rTop={0.3} h={0.36} seg={8} mat={FOIL} rot={[0, Math.PI / 8, 0]} />
      <Cyl p={[0, 0.24, 0]} rTop={0.05} rBot={0.1} h={0.12} mat={DARK} />
      <Legs count={4} top={0.5} low={0.34} foot={0.56} bodyR={0.29} start={Math.PI / 4} r={0.016} />
      <Cyl p={[0, 0.675, 0]} rTop={0.33} h={0.02} seg={8} mat={CELLS} rot={[0, Math.PI / 8, 0]} />
      <Box p={[0.12, 0.72, 0.1]} s={[0.1, 0.07, 0.1]} mat={PAINT} />
      <Ball p={[-0.14, 0.72, -0.08]} r={0.05} mat={METAL} />
      <Strut a={[-0.05, 0.68, 0.12]} b={[-0.05, 0.94, 0.12]} r={0.008} />
      <Dish p={[-0.05, 0.96, 0.12]} r={0.07} rot={[0.5, 0, 0.2]} />
    </group>
  )
}

function NovaC() {
  return (
    <group>
      <Cyl p={[0, 0.58, 0]} rTop={0.19} h={0.62} seg={6} mat={FOIL} />
      <Cyl p={[0, 0.9, 0]} rTop={0.2} h={0.02} seg={6} mat={CELLS} />
      <Cyl p={[0, 0.2, 0]} rTop={0.06} rBot={0.12} h={0.14} mat={DARK} />
      <Legs count={6} top={0.5} low={0.3} foot={0.46} bodyR={0.18} start={Math.PI / 6} r={0.012} />
      {[0, 2, 4].map((k) => {
        const a = (k / 6) * Math.PI * 2
        return <Box key={k} p={[0.17 * Math.cos(a), 0.6, 0.17 * Math.sin(a)]} s={[0.012, 0.44, 0.17]} mat={CELLS} rot={[0, -a, 0]} />
      })}
      <Ball p={[0.07, 0.95, 0]} r={0.045} mat={METAL} />
      <Strut a={[-0.06, 0.9, 0.04]} b={[-0.06, 1.0, 0.04]} r={0.007} />
    </group>
  )
}

function Impactor() {
  // A spent rocket stage, shown lying at an angle; 1 unit long.
  return (
    <group position={[0, 0.3, 0]} rotation={[0, 0.4, 1.15]}>
      <Cyl p={[0, 0, 0]} rTop={0.15} h={0.86} seg={32} mat={PAINT} />
      <Cyl p={[0, -0.47, 0]} rTop={0.07} rBot={0.12} h={0.1} mat={DARK} />
      <Cyl p={[0, 0.44, 0]} rTop={0.11} rBot={0.15} h={0.04} mat={METAL} />
      <Cyl p={[0, 0.1, 0]} rTop={0.153} h={0.03} seg={32} mat={METAL} />
    </group>
  )
}

const BUILD: Record<Archetype, () => ReactNode> = {
  'apollo-lm': ApolloLM,
  surveyor: Surveyor,
  'luna-lander': LunaLander,
  lunokhod: Lunokhod,
  'change-lander': ChangELander,
  'small-lander': SmallLander,
  'nova-c': NovaC,
  impactor: Impactor,
}

function ArchetypeModel({ archetype, heightM }: { archetype: Archetype; heightM: number }) {
  const Build = BUILD[archetype]
  return (
    <group scale={heightM}>
      <Build />
    </group>
  )
}

/** A loaded model file, centred on the disc and scaled so it stands `heightM` tall. */
function fitToHeight(scene: THREE.Object3D, heightM: number): THREE.Object3D {
  const box = new THREE.Box3().setFromObject(scene)
  const size = box.getSize(new THREE.Vector3())
  const centre = box.getCenter(new THREE.Vector3())
  const k = size.y > 0 ? heightM / size.y : 1
  scene.position.set(-centre.x * k, -box.min.y * k, -centre.z * k)
  scene.scale.setScalar(k)
  scene.traverse((o) => {
    o.castShadow = true
    o.receiveShadow = true
  })
  const holder = new THREE.Group()
  holder.add(scene)
  return holder
}

export type ModelState = 'loading' | 'file' | 'simplified'

/** Where the Sun is at the site, in degrees; `up` is false when it is below the terrain horizon. */
export interface SunAt {
  az: number
  el: number
  up: boolean
}

function Rig({ heightM, angle, turning }: { heightM: number; angle: React.RefObject<number>; turning: boolean }) {
  const camera = useThree((s) => s.camera)
  const aspect = useThree((s) => s.size.width / Math.max(s.size.height, 1))
  useFrame((_, dt) => {
    if (turning) angle.current += Math.min(dt, 0.1) * 0.14
    // Far enough to show the whole craft and its legs, also in a tall, narrow view.
    const r = heightM * Math.max(3.1, 3.0 / aspect)
    camera.position.set(Math.sin(angle.current) * r, heightM * 0.85, Math.cos(angle.current) * r)
    camera.lookAt(0, heightM * 0.42, 0)
  })
  return null
}

function Stage({ model, fallback, baseUrl, sun, onState }: { model: MissionModel; fallback: Archetype; baseUrl: string; sun: SunAt; onState: (s: ModelState) => void }) {
  const invalidate = useThree((s) => s.invalidate)
  const file = model.kind === 'glb' ? model.file : null
  const [loaded, setLoaded] = useState<{ file: string; object: THREE.Object3D | null } | null>(null)
  useEffect(() => {
    if (!file) return
    let live = true
    // The loader is fetched only when a model file is actually shown.
    import('./landers/loadGlb')
      .then(({ loadGlb }) => loadGlb(`${baseUrl}data/${file}`))
      .then(
        (scene) => live && setLoaded({ file, object: fitToHeight(scene, model.height_m) }),
        (e) => {
          // Could not be loaded: say why in the console and draw the stand-in instead.
          console.warn(`Model file ${file} could not be loaded; showing the simplified model.`, e)
          if (live) setLoaded({ file, object: null })
        },
      )
    return () => {
      live = false
    }
  }, [file, baseUrl, model.height_m])
  const mine = loaded && loaded.file === file ? loaded : null
  const state: ModelState = !file ? 'simplified' : !mine ? 'loading' : mine.object ? 'file' : 'simplified'
  useEffect(() => {
    onState(state)
    invalidate()
  }, [state, onState, invalidate])

  const h = model.height_m
  const archetype = model.kind === 'archetype' && isArchetype(model.archetype) ? model.archetype : fallback
  // North is -z and east is +x on the disc.
  const el = (sun.el * Math.PI) / 180
  const az = (sun.az * Math.PI) / 180
  const light: V3 = [Math.cos(el) * Math.sin(az) * h * 6, Math.max(Math.sin(el), 0.02) * h * 6, -Math.cos(el) * Math.cos(az) * h * 6]
  useEffect(() => invalidate(), [sun.az, sun.el, sun.up, invalidate])
  return (
    <>
      <hemisphereLight args={['#aab4c8', '#3a3835', sun.up ? 0.4 : 1.6]} />
      {!sun.up && <ambientLight intensity={0.5} />}
      {sun.up && (
        <directionalLight
          position={light}
          intensity={3.2}
          castShadow
          shadow-mapSize={[1024, 1024]}
          shadow-camera-left={-h * 2.5}
          shadow-camera-right={h * 2.5}
          shadow-camera-top={h * 2.5}
          shadow-camera-bottom={-h * 2.5}
          shadow-camera-near={0.1}
          shadow-camera-far={h * 14}
          shadow-bias={-0.0005}
        />
      )}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[h * 1.7, 64]} />
        <meshStandardMaterial color={REGOLITH} roughness={1} metalness={0} />
      </mesh>
      {state === 'file' && mine?.object ? <primitive object={mine.object} /> : state === 'simplified' ? <ArchetypeModel archetype={archetype} heightM={h} /> : null}
    </>
  )
}

interface Props {
  model: MissionModel
  /** the stand-in to draw if the model file cannot be loaded or names an unknown archetype */
  fallback: Archetype
  /** the app's base URL; model files are under `${baseUrl}data/` */
  baseUrl: string
  sun: SunAt
  onState: (s: ModelState) => void
}

/**
 * The hero view. The camera turns slowly round the craft while the page is visible and the user
 * has not asked for reduced motion; dragging turns it by hand. This is the only view in the app
 * that draws continuously, and only while it is on screen.
 */
export function LanderView({ model, fallback, baseUrl, sun, onState }: Props) {
  const angle = useRef(0.6)
  const drag = useRef<{ x: number; a: number } | null>(null)
  const [held, setHeld] = useState(false)
  const [hidden, setHidden] = useState(() => typeof document !== 'undefined' && document.hidden)
  const [still] = useState(() => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches)
  const redraw = useRef<() => void>(() => {})
  useEffect(() => {
    const on = () => setHidden(document.hidden)
    document.addEventListener('visibilitychange', on)
    return () => document.removeEventListener('visibilitychange', on)
  }, [])
  const turning = !still && !hidden && !held
  return (
    <div
      className="lander-view"
      role="img"
      aria-label="3D model of the craft; drag to turn it"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        drag.current = { x: e.clientX, a: angle.current }
        setHeld(true)
      }}
      onPointerMove={(e) => {
        if (!drag.current) return
        angle.current = drag.current.a - (e.clientX - drag.current.x) * 0.01
        redraw.current()
      }}
      onPointerUp={() => {
        drag.current = null
        setHeld(false)
      }}
      onPointerCancel={() => {
        drag.current = null
        setHeld(false)
      }}
    >
      <Canvas
        frameloop={turning ? 'always' : 'demand'}
        shadows
        dpr={[1, 2]}
        gl={{ alpha: true, antialias: true }}
        camera={{ fov: 30, near: 0.1, far: 500 }}
        onCreated={(s) => {
          redraw.current = s.invalidate
        }}
      >
        <Rig heightM={model.height_m} angle={angle} turning={turning} />
        <Stage model={model} fallback={fallback} baseUrl={baseUrl} sun={sun} onState={onState} />
      </Canvas>
    </div>
  )
}
