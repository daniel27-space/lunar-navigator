// The mission view's ground-level scene: a camera standing a little way back from the craft, as
// if a person had walked off to photograph it. It is a separate view (not part of the Moon
// scene) because a 3-7 m lander is invisible at true scale next to 80 m terrain cells.
//
// Real: the skyline (the site's terrain horizon), and where the Sun and Earth are for the site
// and time. Illustrative: the ground near the craft (scene/landers/ground.ts), because the app
// has no data that fine.
//
// A craft is either a real model file (glTF binary) or a simplified stand-in built here from
// primitives, one per "archetype" in docs/DATA_CONTRACT.md. Stand-ins are drawn 1 unit tall and
// scaled to the real craft's height.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { earthMaterial, earthOrientation } from './landers/earth'
import { glowTexture } from './SkyBodies'
import { makeGround, seedFrom, startViewAz, type Ground, type GroundStyle, type Rest } from './landers/ground'
import { DISH_DEPTH, wreckLayout, type Wreck, type WreckMat, type WreckPiece } from './landers/wreck'

import { ARCHETYPES, craftFor, type Archetype } from './landers/craft'
import { CELLS, DARK, FOIL, METAL, PAINT, ROCK, type V3 } from './landers/parts'

export { ARCHETYPES, type Archetype }

export type MissionModel =
  | { kind: 'glb'; file: string; height_m: number; credit?: string; license?: string; source_url?: string }
  | { kind: 'archetype'; archetype: string; height_m: number; /** the height is our estimate, not a published figure */ height_estimated?: boolean }

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

/**
 * A stand-in model on the ground. A craft that tipped over (`rest`, from the ground made for
 * it) is leaned, turned, lowered until its lowest point touches the ground, then sunk by the
 * amount that puts its body, not its legs, on the surface.
 */
function ArchetypeModel({ archetype, heightM, rest, missionId }: { archetype: Archetype; heightM: number; rest?: Rest; missionId: string }) {
  const Build = craftFor(missionId, archetype)
  const lean = useRef<THREE.Group>(null)
  useLayoutEffect(() => {
    const g = lean.current
    if (!g || !g.parent) return
    g.position.y = 0
    if (!rest) return
    g.updateWorldMatrix(true, true)
    const groundY = g.parent.getWorldPosition(new THREE.Vector3()).y
    g.position.y = groundY - new THREE.Box3().setFromObject(g, true).min.y - rest.sinkM
  }, [rest, heightM, archetype])
  return (
    <group rotation={[0, (rest?.turnDeg ?? 0) * D2R, 0]}>
      <group ref={lean} rotation={[0, 0, -(rest?.tiltDeg ?? 0) * D2R]}>
        <group scale={heightM}>
          <Build />
        </group>
      </group>
    </group>
  )
}

// ---- wreckage: a craft that was lost on landing, drawn as its broken pieces ----

const WRECK_MAT: Record<WreckMat, typeof METAL> = { foil: FOIL, metal: METAL, paint: PAINT, dark: DARK, cells: CELLS }

/**
 * Dents a shape so it reads as crushed, not machined. Each corner moves by an amount that
 * depends only on where it is, so corners shared by two faces stay together and no gap opens.
 */
function dent(geo: THREE.BufferGeometry, share: number, seed: number): THREE.BufferGeometry {
  if (share <= 0) return geo
  geo.computeBoundingSphere()
  const size = geo.boundingSphere?.radius ?? 1
  const pos = geo.getAttribute('position')
  for (let i = 0; i < pos.count; i++) {
    const key = (v: number) => Math.round((v / size) * 512)
    const at = seedFrom(`${seed}:${key(pos.getX(i))}:${key(pos.getY(i))}:${key(pos.getZ(i))}`) / 4294967296
    const k = 1 + (at - 0.6) * 2 * share
    pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k, pos.getZ(i) * k)
  }
  geo.computeVertexNormals()
  return geo
}

/** The mesh for one piece of wreckage, centred on the piece's own origin. */
function pieceGeometry(p: WreckPiece, seed: number): THREE.BufferGeometry {
  const s = p.shape
  const make = (): THREE.BufferGeometry => {
    switch (s.kind) {
      case 'box':
        // extra corners along the long sides, so a dented panel bends
        return new THREE.BoxGeometry(...s.size, 2, 1, 2)
      case 'cyl':
        // The body chunk is a torn-open shell with more corners to dent, so it reads as crushed.
        return p.main ? new THREE.CylinderGeometry(s.rTop, s.rBot, s.h, Math.max(s.seg, 12), 3, true) : new THREE.CylinderGeometry(s.rTop, s.rBot, s.h, s.seg, 1, !!s.open)
      case 'ball':
        return new THREE.SphereGeometry(s.r, 14, 10)
      case 'dish':
        return new THREE.ConeGeometry(s.r, s.r * DISH_DEPTH, 20, 1, true)
      case 'leg':
        return new THREE.CylinderGeometry(s.r, s.r, s.len, 8)
    }
  }
  return dent(make(), p.crumple, seed)
}

function WreckPieceMesh({ p, seed }: { p: WreckPiece; seed: number }) {
  const geo = useMemo(() => pieceGeometry(p, seed), [p, seed])
  useEffect(() => () => geo.dispose(), [geo])
  const s = p.shape
  // An open ring or dish is seen from inside too.
  const open = s.kind === 'dish' || (s.kind === 'cyl' && (p.main || !!s.open))
  return (
    <group position={p.pos} quaternion={p.quat}>
      <mesh geometry={geo} castShadow receiveShadow>
        <meshStandardMaterial {...WRECK_MAT[p.mat]} flatShading={p.crumple > 0} side={open ? THREE.DoubleSide : THREE.FrontSide} />
      </mesh>
      {s.kind === 'leg' && (
        // the foot pad, still on the end of its strut
        <mesh position={[0, -s.len / 2, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[s.pad, s.pad, s.r, 14]} />
          <meshStandardMaterial {...METAL} />
        </mesh>
      )}
    </group>
  )
}

/** All the pieces of a wreck, each already at its own place on the ground. */
function WreckModel({ wreck, seed }: { wreck: Wreck; seed: string }) {
  const n = seedFrom(seed)
  return (
    <>
      {wreck.pieces.map((p, i) => (
        <WreckPieceMesh key={i} p={p} seed={n + i} />
      ))}
    </>
  )
}

const modelFiles = new Map<string, Promise<THREE.Object3D>>()
/**
 * A mission's model file, fetched once. Called ahead of the scene (while the camera is still
 * flying in) so the craft is there when the view opens.
 */
export function fetchModel(baseUrl: string, file: string): Promise<THREE.Object3D> {
  const url = `${baseUrl}data/${file}`
  let p = modelFiles.get(url)
  if (!p) {
    // A failed download or decode is tried twice more before the stand-in is shown.
    const attempt = (left: number): Promise<THREE.Object3D> =>
      import('./landers/loadGlb')
        .then(({ loadGlb }) => loadGlb(url))
        .catch((e) => {
          if (left <= 0) throw e
          return new Promise<void>((ok) => setTimeout(ok, 800)).then(() => attempt(left - 1))
        })
    p = attempt(2)
    modelFiles.set(url, p)
    p.catch(() => modelFiles.delete(url))
  }
  return p
}

/** A loaded model file, centred on the ground and scaled so it stands `heightM` tall. */
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

/** What the scene takes from the site's analysis. Angles in degrees; azimuth clockwise from north. */
export interface SceneSky {
  /** `up` is the app's own sunlit test (at least half the disc above the terrain) */
  sun: { az: number; el: number; radius: number; up: boolean }
  earth: { az: number; el: number; radius: number }
  /** terrain skyline, degrees above level, one value per `azStepDeg`; null until it is known (flat skyline) */
  horizon: Float32Array | null
  azStepDeg: number
  /** the site's latitude, used only to turn the Earth the right way up; 0 if unknown */
  latDeg?: number
  /** longitude on Earth that faces the Moon now (degrees east); a fixed face if unknown */
  earthFaceLonDeg?: number
}

export type SceneDetail = 'low' | 'medium' | 'high'
const DETAIL: Record<SceneDetail, { rings: number; around: number; shadow: number }> = {
  low: { rings: 44, around: 64, shadow: 512 },
  medium: { rings: 70, around: 96, shadow: 1024 },
  high: { rings: 96, around: 144, shadow: 2048 },
}


const D2R = Math.PI / 180
/** Unit vector towards a compass direction and elevation: north is -z, east is +x, up is +y. */
const toward = (azDeg: number, elDeg: number): V3 => [Math.cos(elDeg * D2R) * Math.sin(azDeg * D2R), Math.sin(elDeg * D2R), -Math.cos(elDeg * D2R) * Math.cos(azDeg * D2R)]

const SKYLINE_R = 1500
const BODY_R = 3000

/** The ground mesh: rings that widen with distance, so detail is spent near the craft. */
function groundGeometry(g: Ground, rings: number, around: number, soil?: Wreck['soil']): THREE.BufferGeometry {
  const pos: number[] = []
  const uv: number[] = []
  // Only a wreck site has soil marks; they are painted per corner of the mesh.
  const tint: number[] = []
  const idx: number[] = []
  for (let i = 0; i <= rings; i++) {
    const r = g.edgeM * Math.pow(i / rings, 2.4)
    for (let j = 0; j <= around; j++) {
      const a = (j / around) * Math.PI * 2
      const x = Math.cos(a) * r
      const z = Math.sin(a) * r
      pos.push(x, g.height(x, z), z)
      uv.push(x / 5, z / 5)
      if (soil) {
        const v = 1 - 0.65 * soil(x, z)
        tint.push(v, v, v)
      }
    }
  }
  const row = around + 1
  for (let i = 0; i < rings; i++)
    for (let j = 0; j < around; j++) {
      const a = i * row + j
      const b = a + row
      idx.push(a, a + 1, b, b, a + 1, b + 1)
    }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  if (soil) geo.setAttribute('color', new THREE.Float32BufferAttribute(tint, 3))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  return geo
}

/** Fine grain for the regolith: one small tiling grey-noise texture, used for colour and as a bump. */
function grainTexture(): THREE.DataTexture {
  const n = 128
  const data = new Uint8Array(n * n * 4)
  let a = 12345
  for (let i = 0; i < n * n; i++) {
    a = (Math.imul(a, 1664525) + 1013904223) >>> 0
    const v = 205 + (a >>> 24) * 0.19
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v
    data[i * 4 + 3] = 255
  }
  const t = new THREE.DataTexture(data, n, n)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.magFilter = THREE.LinearFilter
  t.minFilter = THREE.LinearMipmapLinearFilter
  t.generateMipmaps = true
  t.needsUpdate = true
  return t
}

/**
 * The distant terrain: a ring round the camera whose top edge is the site's real skyline.
 *
 * It is lit by the scene's own lights, not coloured separately, so it can never disagree with
 * the ground in front of it: its foot has the ground's upward normal (and so exactly the
 * ground's tone under any light), and its crest leans towards the viewer, so a hill is
 * brighter when the Sun is behind the camera and darker when you look towards the Sun.
 */
function skylineGeometry(sky: SceneSky): THREE.BufferGeometry {
  const n = sky.horizon ? sky.horizon.length : 72
  const step = sky.horizon ? sky.azStepDeg : 360 / n
  const pos: number[] = []
  const nor: number[] = []
  const idx: number[] = []
  const low = -SKYLINE_R * Math.tan(16 * D2R)
  for (let i = 0; i <= n; i++) {
    const az = i * step
    const el = sky.horizon ? sky.horizon[i % n] : 0
    const sx = Math.sin(az * D2R)
    const sz = -Math.cos(az * D2R)
    pos.push(sx * SKYLINE_R, SKYLINE_R * Math.tan(Math.min(Math.max(el, -15), 60) * D2R), sz * SKYLINE_R, sx * SKYLINE_R, low, sz * SKYLINE_R)
    // crest: a slope facing the viewer (inward and up); foot: level ground
    nor.push(-sx * 0.8, 0.6, -sz * 0.8, 0, 1, 0)
    if (i < n) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 2, i * 2 + 1, i * 2 + 3)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  geo.setIndex(idx)
  return geo
}

/** The lowest height the light is given, degrees. Near the pole the Sun stays below about 1.6 degrees, so this is close to the real thing. */
export const LOW_SUN_DEG = 1.5

/**
 * Light for the ground scene. The light comes from the Sun's real direction and height, so
 * shadows have their real length: at 1.5 degrees a 2 m craft throws a shadow about 75 m long.
 * (Only below 1.5 degrees is the light held at 1.5, so it never runs along the ground.)
 * On the Moon a camera is exposed for the scene in front of it, so the light is made stronger
 * as the Sun gets lower and level ground stays visible instead of going black. Down to 5
 * degrees level ground keeps a steady brightness; below that it is allowed to dim to about half,
 * because holding it up would turn every upright surface of the craft plain white.
 */
export function sceneLight(sunElDeg: number): { elDeg: number; sun: number; bounce: number } {
  const elDeg = Math.max(sunElDeg, LOW_SUN_DEG)
  const s = Math.sin(elDeg * D2R)
  // what level ground receives (sun * s): 1.7 from 30 degrees up, 0.6 at 5 degrees, 0.35 at 1.5 degrees
  const low = 0.35 + (0.25 * (Math.min(elDeg, 5) - LOW_SUN_DEG)) / (5 - LOW_SUN_DEG)
  const sun = elDeg >= 5 ? Math.min(Math.max(1.7 / s, 3), 7) : low / s
  // sunlit ground throws light back into shadows; more of it reaches the craft when the ground is bright
  const bounce = 0.55 + 0.5 * Math.min(sun * s, 1.7) / 1.7
  return { elDeg, sun, bounce }
}

/**
 * How much of daylight the scene shows, 0 to 1: the share of the Sun's disc above the skyline in
 * its direction. Sunrise and sunset are gradual on the Moon (the disc takes about an hour to
 * clear a level horizon at the equator, and far longer near the poles), so day and night lights
 * are mixed by this instead of switching. `up` is the app's own test (half the disc, eclipses
 * included) and has the last word on which side of half the mix is.
 */
export function daylight(sky: Pick<SceneSky, 'sun' | 'horizon' | 'azStepDeg'>): number {
  let skyline = 0
  if (sky.horizon && sky.horizon.length > 0) {
    const n = sky.horizon.length
    const x = (((sky.sun.az / sky.azStepDeg) % n) + n) % n
    const i = Math.floor(x)
    skyline = sky.horizon[i] + (sky.horizon[(i + 1) % n] - sky.horizon[i]) * (x - i)
  }
  const share = Math.min(Math.max((sky.sun.el - skyline + sky.sun.radius) / (2 * sky.sun.radius), 0), 1)
  if (sky.sun.up) return Math.max(share, 0.5)
  // The app says dark although the disc clears the skyline: Earth is in front of the Sun.
  return share > 0.75 ? 0 : Math.min(share, 0.5)
}

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)

/** Where the standing camera is: all of it can be changed by dragging and scrolling. */
interface Stand {
  /** compass direction the camera looks in, degrees */
  viewAz: number
  /** eye height above the ground under the camera, m */
  eye: number
  /** distance from the craft, m */
  dist: number
  /** the distance the wheel has asked for; `dist` eases towards it, so zooming is smooth and not one jump per notch */
  distGoal: number
  /** how fast the view is still turning after a drag was let go, degrees a second; it dies away */
  spin: number
}

/** How quickly a glide dies away and a zoom catches up, seconds (the time to lose about two thirds). */
const GLIDE_S = 0.25
const ZOOM_S = 0.1

/** How far the user may move the camera: never under the ground, never losing the craft. */
function limits(h: number) {
  // A very small craft (Luna 9 is 0.6 m) can be walked up to and looked at from lower down.
  return { eye: [Math.min(1, Math.max(0.5, h)), Math.max(4, h * 1.3)] as const, dist: [Math.max(Math.min(6, 2 + h * 2), h * 2.2), Math.max(18, h * 6)] as const }
}

interface CameraProps {
  heightM: number
  ground: Ground
  stand: React.RefObject<Stand>
  /** craft left of centre by this share of the view (0 on a narrow screen) */
  shift: number
  /** false: no dolly, the camera is simply there */
  motion: boolean
  leaving: boolean
  sky: THREE.Group | null
}

/**
 * The standing camera. It arrives with a two-second dolly-in from further back and a little
 * higher, then stops: after that a frame is drawn only when the user moves it or the light
 * changes. Leaving is a half-second dolly back.
 */
function StandingCamera({ heightM, ground, stand, shift, motion, leaving, sky }: CameraProps) {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const invalidate = useThree((s) => s.invalidate)
  const arrive = useRef(motion ? 0 : 1)
  const leave = useRef(0)
  const frames = useRef(0)
  useEffect(() => invalidate(), [leaving, invalidate])
  useFrame((_, dt) => {
    const step = Math.min(dt, 0.05)
    let moving = false
    if (arrive.current < 1) {
      arrive.current = Math.min(1, arrive.current + step / 2)
      moving = true
    }
    if (leaving && motion && leave.current < 1) {
      leave.current = Math.min(1, leave.current + step / 0.5)
      moving = true
    }
    const s = stand.current
    // After a drag is let go the view glides on and settles, as the main Moon view does.
    if (Math.abs(s.spin) > 0.5) {
      s.viewAz += s.spin * step
      s.spin *= Math.exp(-step / GLIDE_S)
      moving = true
    } else s.spin = 0
    if (Math.abs(s.distGoal - s.dist) > 0.002) {
      s.dist += (s.distGoal - s.dist) * (1 - Math.exp(-step / ZOOM_S))
      moving = true
    } else s.dist = s.distGoal
    const back = 1 - easeOut(arrive.current)
    const dist = s.dist * (1 + 0.6 * back) * (1 + 0.35 * easeInOut(leave.current))
    const az = (s.viewAz + 180) * D2R
    const x = Math.sin(az) * dist
    const z = -Math.cos(az) * dist
    camera.position.set(x, Math.max(ground.height(x, z), 0) + s.eye + heightM * 0.3 * back, z)
    // Look at the craft's middle, a little to its right so it sits left of centre.
    const v = s.viewAz * D2R
    const side = dist * shift
    camera.lookAt(Math.cos(v) * side, heightM * 0.45, Math.sin(v) * side)
    // The skyline, Sun and Earth are far away: they stay centred on the camera.
    sky?.position.copy(camera.position)
    frames.current++
    gl.domElement.dataset.frames = String(frames.current)
    if (moving) invalidate()
  })
  return null
}

const GHOST_INK = '#eceef2' // the app's neutral ink, which also marks planned missions on the map

/**
 * Draws whatever is inside it as a "not there yet" outline: a faint see-through body with its
 * edges picked out, lit by nothing and casting no shadow, so it reads the same by day and night.
 */
function Ghost({ children }: { children: ReactNode }) {
  const group = useRef<THREE.Group>(null)
  const invalidate = useThree((s) => s.invalidate)
  useLayoutEffect(() => {
    const g = group.current
    if (!g) return
    const body = new THREE.MeshBasicMaterial({ color: GHOST_INK, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })
    const line = new THREE.LineBasicMaterial({ color: GHOST_INK, transparent: true, opacity: 0.75, toneMapped: false })
    const made: THREE.BufferGeometry[] = []
    const meshes: THREE.Mesh[] = []
    g.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh)
    })
    for (const m of meshes) {
      m.material = body
      m.castShadow = false
      m.receiveShadow = false
      const edges = new THREE.EdgesGeometry(m.geometry, 25)
      made.push(edges)
      m.add(new THREE.LineSegments(edges, line))
    }
    invalidate()
    return () => {
      for (const e of made) e.dispose()
      body.dispose()
      line.dispose()
    }
  }, [invalidate])
  return <group ref={group}>{children}</group>
}

/** A dashed circle laid on the ground round the target: the landing spot is a plan, and approximate. */
function LandingRing({ ground, radius }: { ground: Ground; radius: number }) {
  const dashes = 40
  const arc = (2 * Math.PI * radius) / dashes
  return (
    <>
      {Array.from({ length: dashes / 2 }, (_, i) => {
        const a = (i * 2 * 2 * Math.PI) / dashes
        const x = Math.cos(a) * radius
        const z = Math.sin(a) * radius
        return (
          <mesh key={i} position={[x, ground.height(x, z) + 0.06, z]} rotation={[0, -a, 0]}>
            <boxGeometry args={[radius * 0.012 + 0.05, 0.04, arc * 0.8]} />
            <meshBasicMaterial color={GHOST_INK} transparent opacity={0.7} toneMapped={false} />
          </mesh>
        )
      })}
    </>
  )
}

interface SceneProps {
  model: MissionModel
  fallback: Archetype
  baseUrl: string
  seed: string
  style: GroundStyle
  wrecked: boolean
  planned: boolean
  sky: SceneSky
  detail: SceneDetail
  stand: React.RefObject<Stand>
  shift: number
  motion: boolean
  leaving: boolean
  onState: (s: ModelState) => void
}

function Scene({ model, fallback, baseUrl, seed, style, wrecked, planned, sky, detail, stand, shift, motion, leaving, onState }: SceneProps) {
  const invalidate = useThree((s) => s.invalidate)
  const h = model.height_m
  const d = DETAIL[detail]

  // The craft: a model file when there is one and it loads, otherwise the simplified stand-in.
  // A wreck is always drawn from the stand-in's parts, so no model file is fetched for it.
  const file = model.kind === 'glb' && !wrecked && !planned ? model.file : null
  const [loaded, setLoaded] = useState<{ file: string; object: THREE.Object3D | null } | null>(null)
  useEffect(() => {
    if (!file) return
    let live = true
    fetchModel(baseUrl, file).then(
        // A copy, so the same file can be shown again (and by another mission) untouched.
        (scene) => live && setLoaded({ file, object: fitToHeight(scene.clone(true), model.height_m) }),
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
  const archetype = model.kind === 'archetype' && isArchetype(model.archetype) ? model.archetype : fallback

  const ground = useMemo(() => makeGround(seed, h, style, wrecked), [seed, h, style, wrecked])
  const wreck = useMemo(() => (wrecked ? wreckLayout(seed, archetype, h, ground.height) : null), [wrecked, seed, archetype, h, ground])
  const groundGeo = useMemo(() => groundGeometry(ground, d.rings, d.around, wreck?.soil), [ground, d.rings, d.around, wreck])
  const grain = useMemo(grainTexture, [])
  const skyline = useMemo(() => skylineGeometry(sky), [sky])
  useEffect(() => () => groundGeo.dispose(), [groundGeo])
  useEffect(() => () => skyline.dispose(), [skyline])
  useEffect(() => () => grain.dispose(), [grain])
  // This canvas is its own WebGL context, so it needs its own copy of the Sun's glare texture.
  const sunGlow = useMemo(glowTexture, [])
  useEffect(() => () => sunGlow.dispose(), [sunGlow])
  // A new light, skyline or body position is one new frame, not a running loop.
  useEffect(() => invalidate(), [sky, invalidate])
  const [skyGroup, setSkyGroup] = useState<THREE.Group | null>(null)

  const light = sceneLight(sky.sun.el)
  // 0 at night, 1 in full daylight, in between while the Sun's disc is crossing the skyline
  const day = daylight(sky)
  const sunDir = toward(sky.sun.az, light.elDeg)
  const reach = Math.max(14, h * 5)
  const body = (b: { az: number; el: number; radius: number }): { p: V3; r: number } => {
    const t = toward(b.az, b.el)
    return { p: [t[0] * BODY_R, t[1] * BODY_R, t[2] * BODY_R], r: BODY_R * Math.tan(b.radius * D2R) }
  }
  const sunDisc = body(sky.sun)
  const earthDisc = body(sky.earth)
  const earthDir = toward(sky.earth.az, Math.max(sky.earth.el, 5))
  const earthGlobe = useMemo(() => earthMaterial(`${baseUrl}data/`, () => invalidate()), [baseUrl, invalidate])
  useEffect(
    () => () => {
      earthGlobe.uniforms.uMap.value.dispose()
      earthGlobe.dispose()
    },
    [earthGlobe],
  )
  // The Sun's true direction, also when it is below the skyline: that is what lights the Earth.
  earthGlobe.uniforms.uSun.value.set(...toward(sky.sun.az, sky.sun.el))
  // Earth's axis is close to the Moon's: in this scene the Moon's north points along the local
  // north raised by the site's latitude. The face shown is the side of Earth that really faces
  // the Moon at this time, so it turns as the clock moves.
  const lat = (sky.latDeg ?? 0) * D2R
  const earthTurn = earthOrientation(new THREE.Vector3(0, Math.sin(lat), -Math.cos(lat)), new THREE.Vector3(...earthDisc.p), sky.earthFaceLonDeg ?? 20)

  return (
    <>
      <color attach="background" args={['#000000']} />
      <StandingCamera heightM={h} ground={ground} stand={stand} shift={shift} motion={motion} leaving={leaving} sky={skyGroup} />
      {/* Day and night lights are both always there and are mixed by how much of the Sun's disc
          is above the skyline, so sunrise and sunset are gradual. Each light keeps its own key
          and an explicit colour: without them one was once reused for another and shone black. */}
      <directionalLight
        key="sun"
        color="#ffffff"
        position={[sunDir[0] * 80, sunDir[1] * 80, sunDir[2] * 80]}
        intensity={light.sun * day}
        castShadow
        shadow-mapSize={[d.shadow, d.shadow]}
        shadow-camera-left={-reach}
        shadow-camera-right={reach}
        shadow-camera-top={reach}
        shadow-camera-bottom={-reach}
        shadow-camera-near={1}
        shadow-camera-far={200}
        shadow-bias={-0.0008}
        shadow-normalBias={0.03}
      />
      {/* sunlight bounced back up from the ground, which is what lights the shadowed side of a craft */}
      <hemisphereLight key="bounce" args={['#2a2d33', ground.albedo]} intensity={light.bounce * day} />
      <ambientLight key="ambient" color="#ffffff" intensity={0.22 * day} />
      {/* night: soft fill so the craft can be seen, from Earth's side when Earth is up */}
      <directionalLight key="fill" position={[earthDir[0] * 80, earthDir[1] * 80, earthDir[2] * 80]} intensity={(sky.earth.el > 0 ? 0.9 : 0.5) * (1 - day)} color="#b4c4dc" />
      <hemisphereLight key="night" args={['#6f7a8c', '#3a3835']} intensity={1.3 * (1 - day)} />

      <mesh geometry={groundGeo} receiveShadow>
        <meshStandardMaterial key={wreck ? 'marked' : 'plain'} color={ground.albedo} roughness={1} metalness={0} map={grain} bumpMap={grain} bumpScale={ground.grain} vertexColors={!!wreck} />
      </mesh>
      {ground.rocks.map((k, i) => (
        <mesh key={i} position={[k.x, ground.height(k.x, k.z) + k.size[1] * 0.55, k.z]} rotation={[0, k.turn, 0]} scale={k.size} castShadow receiveShadow>
          <dodecahedronGeometry args={[1, 0]} />
          <meshStandardMaterial {...ROCK} flatShading />
        </mesh>
      ))}

      <group ref={setSkyGroup}>
        <mesh geometry={skyline}>
          <meshStandardMaterial color={ground.albedo} roughness={1} metalness={0} fog={false} />
        </mesh>
        {/* beyond the skyline, so terrain hides whatever part of a disc is below it */}
        <mesh position={sunDisc.p} onUpdate={(m) => m.lookAt(0, 0, 0)}>
          <circleGeometry args={[sunDisc.r, 40]} />
          <meshBasicMaterial color="#fff8e0" side={THREE.DoubleSide} toneMapped={false} />
        </mesh>
        {/* The glare around the Sun, as in the globe view. Depth-tested at the disc's distance, so
            the skyline hides it with the disc; it is a still picture and nothing moves. */}
        {day > 0 && (
          <sprite position={sunDisc.p} scale={[sunDisc.r * 22, sunDisc.r * 22, 1]}>
            <spriteMaterial map={sunGlow} transparent opacity={day} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
          </sprite>
        )}
        {/* Earth: a small globe lit from the true Sun direction, so its phase is the real one */}
        <mesh position={earthDisc.p} quaternion={earthTurn} material={earthGlobe}>
          <sphereGeometry args={[earthDisc.r, 48, 32]} />
        </mesh>
      </group>

      {/* the craft stands (or lies) on the ground at the centre, wherever that ground is */}
      {wreck && <WreckModel wreck={wreck} seed={seed} />}
      <group position={[0, ground.height(0, 0), 0]}>
        {wreck ? null : planned ? (
          // Nothing has landed here yet: the craft is an outline, with no shadow on the ground.
          <Ghost>
            <ArchetypeModel archetype={archetype} heightM={h} rest={ground.rest} missionId={seed} />
          </Ghost>
        ) : state === 'file' && mine?.object ? (
          <primitive object={mine.object} />
        ) : state === 'simplified' ? (
          <ArchetypeModel archetype={archetype} heightM={h} rest={ground.rest} missionId={seed} />
        ) : null}
      </group>
      {planned && <LandingRing ground={ground} radius={Math.max(h * 1.8, 5)} />}
    </>
  )
}

interface Props {
  model: MissionModel
  /** the stand-in to draw if the model file cannot be loaded or names an unknown archetype */
  fallback: Archetype
  /** the app's base URL; model files are under `${baseUrl}data/` */
  baseUrl: string
  /** fixes the illustrative ground, so a site looks the same on every visit (the mission id) */
  seed: string
  /** which of the three illustrative grounds: mare, highland or polar */
  style: GroundStyle
  /** the craft was lost on landing: draw its wreckage, not the craft */
  wrecked?: boolean
  /** a mission that has not flown: the craft is drawn as an outline inside a landing ring */
  planned?: boolean
  sky: SceneSky
  detail: SceneDetail
  /** craft left of centre by this share of the view */
  shift: number
  /** how far back the camera stands, in craft heights (3 to 4; less in a small view) */
  back: number
  /** false when the user asked for reduced motion: no dolly in or out */
  motion: boolean
  /** the view is closing: dolly back */
  leaving: boolean
  onState: (s: ModelState) => void
}

/**
 * The ground-level view. Nothing turns by itself: after the dolly-in the picture is still, and
 * a frame is drawn only when the user drags (look round the craft, raise or lower the camera)
 * or scrolls (closer or further), or when the light changes with the clock.
 */
export function LanderView({ model, fallback, baseUrl, seed, style, wrecked = false, planned = false, sky, detail, shift, back, motion, leaving, onState }: Props) {
  const h = model.height_m
  const lim = limits(h)
  const dist0 = Math.min(Math.max(h * back, lim.dist[0]), lim.dist[1])
  const stand = useRef<Stand>({ viewAz: startViewAz(sky.sun, sky.earth, seed), eye: Math.min(2, Math.max(lim.eye[0], h * 1.6)), dist: dist0, distGoal: dist0, spin: 0 })
  const drag = useRef<{ x: number; y: number; az: number; eye: number; lastX: number; lastT: number; vel: number } | null>(null)
  const redraw = useRef<() => void>(() => {})
  const clamp = (v: number, [lo, hi]: readonly [number, number]) => Math.min(Math.max(v, lo), hi)
  return (
    <div
      className="lander-view"
      role="img"
      aria-label="The craft seen from the ground. Drag to look around it, scroll to move closer or further."
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        stand.current.spin = 0
        drag.current = { x: e.clientX, y: e.clientY, az: stand.current.viewAz, eye: stand.current.eye, lastX: e.clientX, lastT: e.timeStamp, vel: 0 }
      }}
      onPointerMove={(e) => {
        const d = drag.current
        if (!d) return
        // The craft and the ground near it follow the pointer: dragging right carries the camera round to the left.
        stand.current.viewAz = d.az + (e.clientX - d.x) * 0.35
        stand.current.eye = clamp(d.eye + (e.clientY - d.y) * 0.03, lim.eye)
        // The turning speed just now, smoothed, for the glide when the drag is let go.
        const dt = Math.max(e.timeStamp - d.lastT, 1) / 1000
        d.vel = d.vel * 0.5 + (((e.clientX - d.lastX) * 0.35) / dt) * 0.5
        d.lastX = e.clientX
        d.lastT = e.timeStamp
        redraw.current()
      }}
      onPointerUp={(e) => {
        const d = drag.current
        drag.current = null
        // Let go while still moving: glide on. Held still first, or reduced motion asked for: stop dead.
        if (d && motion && e.timeStamp - d.lastT < 80) stand.current.spin = Math.min(Math.max(d.vel, -240), 240)
        redraw.current()
      }}
      onPointerCancel={() => (drag.current = null)}
      onWheel={(e) => {
        stand.current.distGoal = clamp(stand.current.distGoal * Math.exp(e.deltaY * 0.001), lim.dist)
        if (!motion) stand.current.dist = stand.current.distGoal
        redraw.current()
      }}
    >
      <Canvas
        frameloop="demand"
        shadows="percentage"
        dpr={[1, detail === 'low' ? 1 : detail === 'medium' ? 1.5 : 2]}
        gl={{ antialias: detail !== 'low' }}
        camera={{ fov: 40, near: 0.2, far: 8000 }}
        onCreated={(s) => {
          redraw.current = s.invalidate
        }}
      >
        <Scene model={model} fallback={fallback} baseUrl={baseUrl} seed={seed} style={style} wrecked={wrecked} planned={planned} sky={sky} detail={detail} stand={stand} shift={shift} motion={motion} leaving={leaving} onState={onState} />
      </Canvas>
    </div>
  )
}
