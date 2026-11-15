// Wreckage for a craft that was lost on landing: where each broken piece lies. ILLUSTRATIVE,
// like the ground itself: no debris field on the Moon has been surveyed at this detail, so the
// layout is generated from a seed (the mission id) and is the same on every visit.
//
// The pieces come from the mission's stand-in model (same parts, same colours), so the wreck is
// recognisably that craft: a crumpled body near the middle of the impact scar, then legs, tanks,
// panels, the dish and foil scraps thrown outwards, denser near the centre and more of them
// downrange (the way the craft was travelling).
//
// This file is only the layout maths (no drawing), so it can be tested: every piece is lowered
// until its lowest point is a little under the ground at its own position.
import * as THREE from 'three'
import type { Archetype } from '../LanderModel'
import { WRECK_REACH, rng, seedFrom, wreckScar } from './ground'

export type WreckMat = 'foil' | 'metal' | 'paint' | 'dark' | 'cells'

/** A piece's shape, in metres. Every shape is centred on its own origin. */
export type WreckShape =
  /** `size[1]` (y) is the thin side, so an unturned box lies flat */
  | { kind: 'box'; size: [number, number, number] }
  /** axis along y; `open` is a torn ring of tank wall with no end caps */
  | { kind: 'cyl'; rTop: number; rBot: number; h: number; seg: number; open?: boolean }
  | { kind: 'ball'; r: number }
  /** the antenna dish: a shallow open cone, axis along y */
  | { kind: 'dish'; r: number }
  /** a landing leg: a strut along y with its foot pad at the lower end */
  | { kind: 'leg'; len: number; r: number; pad: number }

export interface WreckPiece {
  /** what it was: 'body', 'leg', 'tank', 'panel', 'dish', 'engine', 'scrap', ... */
  part: string
  shape: WreckShape
  mat: WreckMat
  /** centre, metres from the impact point (x east, y up, z south) */
  pos: [number, number, number]
  /** how it is turned, as a quaternion x, y, z, w */
  quat: [number, number, number, number]
  /** the crumpled body chunk at the centre */
  main: boolean
  /** large enough that nothing else may lie on top of it */
  big: boolean
  /** radius of the circle on the ground that the piece fits in, m */
  reachM: number
  /** how far its lowest point is under the ground, m */
  sinkM: number
  /** how strongly its surface is dented when drawn (share of its size) */
  crumple: number
}

export interface Wreck {
  pieces: WreckPiece[]
  /** compass-free direction the debris was thrown in, radians in the ground plane */
  downrange: number
  /** how much darker the soil is at a point, 0 (untouched) to 1 */
  soil: (x: number, z: number) => number
}

interface Part {
  part: string
  shape: WreckShape
  mat: WreckMat
  big?: boolean
}

const cyl = (part: string, mat: WreckMat, r: number, h: number, seg = 24, rBot = r, open = false): Part => ({ part, mat, shape: { kind: 'cyl', rTop: r, rBot, h, seg, open } })
const box = (part: string, mat: WreckMat, x: number, y: number, z: number): Part => ({ part, mat, shape: { kind: 'box', size: [x, y, z] } })
const ball = (part: string, mat: WreckMat, r: number): Part => ({ part, mat, shape: { kind: 'ball', r } })
const dish = (r: number): Part => ({ part: 'dish', mat: 'paint', shape: { kind: 'dish', r } })
const big = (p: Part): Part => ({ ...p, big: true })
const times = (n: number, p: Part): Part[] => Array.from({ length: n }, () => p)

interface Spec {
  /** the crumpled body chunk */
  main: Part
  parts: Part[]
  legs: number
  legLen: number
  /** colours of the small torn scraps, and how many */
  scrap: WreckMat[]
  scraps: number
}

// What each stand-in breaks into, in units of the craft's height. Sizes follow the parts of the
// stand-ins in LanderModel.tsx; thin or tiny parts are a little larger so they can be seen.
const SPECS: Record<Archetype, Spec> = {
  'apollo-lm': {
    main: cyl('body', 'foil', 0.3, 0.16, 8),
    parts: [big(box('cabin', 'metal', 0.3, 0.2, 0.26)), big(cyl('cabin', 'metal', 0.14, 0.14)), ...times(2, big(ball('tank', 'foil', 0.095))), cyl('engine', 'dark', 0.05, 0.12, 24, 0.11), cyl('tunnel', 'dark', 0.07, 0.06), dish(0.1)],
    legs: 4,
    legLen: 0.5,
    scrap: ['foil', 'foil', 'metal'],
    scraps: 12,
  },
  surveyor: {
    main: cyl('frame', 'metal', 0.22, 0.1, 3),
    parts: [...times(2, big(box('box', 'paint', 0.14, 0.12, 0.14))), big(ball('tank', 'foil', 0.08)), big(box('panel', 'cells', 0.3, 0.014, 0.26)), big(box('panel', 'paint', 0.26, 0.014, 0.26)), cyl('engine', 'dark', 0.03, 0.1, 24, 0.06), cyl('mast', 'metal', 0.016, 0.45, 8)],
    legs: 3,
    legLen: 0.42,
    scrap: ['metal', 'paint', 'cells'],
    scraps: 9,
  },
  'luna-lander': {
    main: cyl('body', 'metal', 0.17, 0.22),
    parts: [...times(4, big(ball('tank', 'foil', 0.12))), big(cyl('ascent stage', 'paint', 0.1, 0.26, 24, 0.13)), ...times(3, ball('tank', 'metal', 0.07)), ball('capsule', 'dark', 0.09), cyl('engine', 'dark', 0.05, 0.1, 24, 0.1), cyl('collar', 'metal', 0.07, 0.14)],
    legs: 4,
    legLen: 0.44,
    scrap: ['metal', 'foil', 'paint'],
    scraps: 10,
  },
  lunokhod: {
    main: cyl('platform', 'metal', 0.3, 0.09),
    parts: [...times(4, big(ball('tank', 'foil', 0.1))), big(cyl('rover tub', 'paint', 0.2, 0.15, 24, 0.14)), big(cyl('lid', 'cells', 0.2, 0.014)), ...times(8, cyl('wheel', 'dark', 0.065, 0.045, 14)), ...times(2, box('ramp', 'metal', 0.05, 0.012, 0.5)), dish(0.08)],
    legs: 4,
    legLen: 0.4,
    scrap: ['metal', 'foil', 'paint'],
    scraps: 9,
  },
  'change-lander': {
    main: cyl('body', 'foil', 0.27, 0.22, 8),
    parts: [...times(2, big(box('panel', 'cells', 0.36, 0.014, 0.3))), big(box('deck', 'metal', 0.3, 0.05, 0.3)), ...times(2, big(ball('tank', 'metal', 0.09))), cyl('engine', 'dark', 0.05, 0.12, 24, 0.1), box('camera', 'dark', 0.08, 0.05, 0.05), dish(0.1), ...times(4, cyl('wheel', 'dark', 0.04, 0.03, 14))],
    legs: 4,
    legLen: 0.5,
    scrap: ['foil', 'foil', 'cells'],
    scraps: 12,
  },
  'small-lander': {
    main: cyl('body', 'foil', 0.3, 0.26, 8),
    parts: [
      // the eight-sided solar deck, broken in three
      ...times(3, big(box('panel', 'cells', 0.34, 0.016, 0.24))),
      big(box('body', 'foil', 0.3, 0.14, 0.22)),
      ...times(2, big(ball('tank', 'metal', 0.09))),
      cyl('engine', 'dark', 0.05, 0.12, 24, 0.1),
      box('box', 'paint', 0.12, 0.08, 0.12),
      ball('tank', 'metal', 0.06),
      dish(0.1),
    ],
    legs: 4,
    legLen: 0.5,
    scrap: ['foil', 'foil', 'cells', 'metal'],
    scraps: 14,
  },
  'nova-c': {
    main: cyl('body', 'foil', 0.19, 0.4, 6),
    parts: [big(cyl('body', 'foil', 0.19, 0.18, 6)), ...times(3, big(box('panel', 'cells', 0.17, 0.014, 0.44))), big(cyl('deck', 'cells', 0.2, 0.02, 6)), ...times(2, big(ball('tank', 'metal', 0.09))), cyl('engine', 'dark', 0.06, 0.14, 24, 0.12)],
    legs: 6,
    legLen: 0.45,
    scrap: ['foil', 'foil', 'cells'],
    scraps: 12,
  },
  // A spent rocket stage that hit at over 2 km/s: nothing whole is left, only torn rings of tank
  // wall, the engine, pressure bottles and plate.
  impactor: {
    main: cyl('tank wall', 'paint', 0.15, 0.3, 32, 0.15, true),
    parts: [
      ...times(2, big(cyl('tank wall', 'paint', 0.15, 0.16, 32, 0.15, true))),
      big(cyl('ring', 'metal', 0.153, 0.05, 32, 0.153, true)),
      big(cyl('engine', 'dark', 0.07, 0.12, 24, 0.12)),
      big(cyl('adapter', 'metal', 0.11, 0.05, 24, 0.15)),
      ...times(3, ball('bottle', 'metal', 0.045)),
      ...times(4, big(box('plate', 'paint', 0.24, 0.012, 0.16))),
    ],
    legs: 0,
    legLen: 0,
    scrap: ['paint', 'paint', 'metal', 'dark'],
    scraps: 16,
  },
}

const scaled = (s: WreckShape, k: number): WreckShape => {
  switch (s.kind) {
    case 'box':
      return { kind: 'box', size: [s.size[0] * k, s.size[1] * k, s.size[2] * k] }
    case 'cyl':
      return { ...s, rTop: s.rTop * k, rBot: s.rBot * k, h: s.h * k }
    case 'ball':
      return { kind: 'ball', r: s.r * k }
    case 'dish':
      return { kind: 'dish', r: s.r * k }
    case 'leg':
      return { kind: 'leg', len: s.len * k, r: s.r * k, pad: s.pad * k }
  }
}

/** A dish is drawn this deep, as a share of its radius. */
export const DISH_DEPTH = 0.35

/** The shape as a spinning outline: half its length along its own axis and its widest radius; null for a box or ball. */
function spun(s: WreckShape): { half: number; r: number } | null {
  if (s.kind === 'cyl') return { half: s.h / 2, r: Math.max(s.rTop, s.rBot) }
  if (s.kind === 'dish') return { half: (s.r * DISH_DEPTH) / 2, r: s.r }
  // A leg rests on its strut; the foot pad at its end is wider and digs into the soil.
  if (s.kind === 'leg') return { half: s.len / 2, r: s.r }
  return null
}

/** How far the turned shape reaches below (and above) its centre, m. */
export function halfHeight(s: WreckShape, q: THREE.Quaternion): number {
  if (s.kind === 'ball') return s.r
  if (s.kind === 'box') {
    const m = new THREE.Matrix4().makeRotationFromQuaternion(q).elements
    // The second row of the rotation says how much of each box axis points up.
    return (Math.abs(m[1]) * s.size[0] + Math.abs(m[5]) * s.size[1] + Math.abs(m[9]) * s.size[2]) / 2
  }
  const o = spun(s)!
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q).y
  return o.half * Math.abs(up) + o.r * Math.sqrt(Math.max(0, 1 - up * up))
}

/** Radius of the circle on the ground that the shape fits in however it is turned, m. */
export function reach(s: WreckShape): number {
  if (s.kind === 'ball') return s.r
  if (s.kind === 'box') return Math.hypot(s.size[0], s.size[1], s.size[2]) / 2
  if (s.kind === 'leg') return Math.hypot(s.len / 2, s.pad)
  const o = spun(s)!
  return Math.hypot(o.half, o.r)
}

/** Height of a piece's lowest point, m (for a ball, box, cylinder: exact). */
export function lowestPoint(p: WreckPiece): number {
  return p.pos[1] - halfHeight(p.shape, new THREE.Quaternion(...p.quat))
}

const Y = new THREE.Vector3(0, 1, 0)
const X = new THREE.Vector3(1, 0, 0)

/** The ground's upward direction at a point, from the slope over a hand's width. */
function groundNormal(height: (x: number, z: number) => number, x: number, z: number): THREE.Vector3 {
  const e = 0.15
  return new THREE.Vector3(height(x - e, z) - height(x + e, z), 2 * e, height(x, z - e) - height(x, z + e)).normalize()
}

/**
 * How a piece lies before the ground's slope is applied: long things on their side, flat things
 * flat, each then tipped a little so no two lie alike.
 */
function lie(s: WreckShape, main: boolean, rand: () => number): THREE.Quaternion {
  const q = new THREE.Quaternion()
  const o = spun(s)
  if (main) {
    // the body chunk has rolled most of the way over: clearly not standing
    q.setFromAxisAngle(X, 0.95 + rand() * 0.45)
  } else if (s.kind === 'dish') {
    // face down on its rim, or on its back
    q.setFromAxisAngle(X, rand() < 0.5 ? Math.PI : 0)
  } else if (o && o.half > o.r * 0.6) {
    q.setFromAxisAngle(X, Math.PI / 2)
  }
  const tip = s.kind === 'leg' ? 0.1 : s.kind === 'box' ? 0.26 : 0.3
  const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(Math.cos(rand() * 6.283), 0, Math.sin(rand() * 6.283)).normalize(), (rand() - 0.3) * tip)
  const yaw = new THREE.Quaternion().setFromAxisAngle(Y, rand() * Math.PI * 2)
  return yaw.multiply(tilt).multiply(q)
}

/** Share of a piece's half-height that is under the soil: balls and the body dig in most. */
function sinkShare(s: WreckShape, main: boolean, rand: () => number): number {
  if (main) return 0.22 + rand() * 0.08
  if (s.kind === 'ball') return 0.25 + rand() * 0.25
  return 0.14 + rand() * 0.2
}

/** Dark rays of thrown soil from the impact point, most of them downrange, plus the scar itself. */
function soilMarks(rand: () => number, h: number, downrange: number): Wreck['soil'] {
  const scar = wreckScar(h)
  const rays = Array.from({ length: 9 }, (_, i) => ({
    a: i < 6 ? downrange + (rand() - 0.5) * 2.2 : rand() * Math.PI * 2,
    // wide enough to cover a few of the ground mesh's spokes, so a ray is not a single thin line
    w: 0.11 + rand() * 0.12,
    len: scar.r * (1.4 + rand() * 1.4),
    dark: 0.55 + rand() * 0.4,
  }))
  return (x, z) => {
    const d = Math.hypot(x, z)
    const q = d / scar.r
    // the scar: darkest in the middle, gone a little outside its rim
    let v = 0.7 * Math.max(0, 1 - (q / 1.25) ** 2)
    if (d > 1e-6) {
      const at = Math.atan2(z, x)
      for (const r of rays) {
        if (d >= r.len) continue
        const off = Math.abs(Math.atan2(Math.sin(at - r.a), Math.cos(at - r.a)))
        if (off < r.w) v = Math.max(v, r.dark * (1 - (off / r.w) ** 2) * (1 - d / r.len) ** 0.7)
      }
    }
    return Math.min(v, 1)
  }
}

/**
 * The wreck of one craft. `height` is the ground's own height function, so pieces rest on the
 * ground that is drawn (scar included).
 */
export function wreckLayout(seedText: string, archetype: Archetype, craftHeightM: number, height: (x: number, z: number) => number): Wreck {
  const h = craftHeightM
  const rand = rng(seedFrom(`${seedText}:wreck`))
  const spec = SPECS[archetype]
  const downrange = rand() * Math.PI * 2
  const pieces: WreckPiece[] = []

  const rest = (p: Part, x: number, z: number, main: boolean): WreckPiece => {
    const shape = scaled(p.shape, h)
    const q = new THREE.Quaternion().setFromUnitVectors(Y, groundNormal(height, x, z)).multiply(lie(shape, main, rand))
    const half = halfHeight(shape, q)
    const sinkM = half * sinkShare(shape, main, rand)
    return {
      part: p.part,
      shape,
      mat: p.mat,
      pos: [x, height(x, z) + half - sinkM, z],
      quat: [q.x, q.y, q.z, q.w],
      main,
      big: main || !!p.big,
      reachM: reach(shape),
      sinkM,
      // tanks and bottles are thick-walled and keep their shape; thin skin and frames do not
      crumple: main ? 0.22 : shape.kind === 'ball' ? 0 : p.part === 'scrap' ? 0.04 : 0.1,
    }
  }

  // The body: just downrange of the impact point, inside the scar.
  const mainAt = 0.1 * h
  pieces.push(rest(spec.main, Math.cos(downrange) * mainAt, Math.sin(downrange) * mainAt, true))

  /** A free spot between `lo` and `hi` craft heights out; nearer spots are likelier. */
  const place = (p: Part, lo: number, hi: number) => {
    const own = reach(scaled(p.shape, h))
    for (let attempt = 0; attempt < 60; attempt++) {
      // about two thirds of the debris goes downrange, in a fan; the rest anywhere
      const a = rand() < 0.65 ? downrange + (rand() + rand() + rand() - 1.5) * 1.5 : rand() * Math.PI * 2
      const d = h * (lo + (hi - lo) * Math.pow(rand(), 1.7))
      const x = Math.cos(a) * d
      const z = Math.sin(a) * d
      // not on top of the body or any large piece; small scraps may lie close to each other
      const clear = pieces.every((o) => !(o.big || p.big) || Math.hypot(o.pos[0] - x, o.pos[2] - z) > (o.reachM + own) * 1.05)
      if (clear) return pieces.push(rest(p, x, z, false))
    }
    // No free spot found (does not happen with these counts): leave the piece out rather than stack it.
  }

  const leg: Part = { part: 'leg', mat: 'metal', big: true, shape: { kind: 'leg', len: spec.legLen, r: 0.02, pad: 0.06 } }
  for (const p of [...spec.parts, ...times(spec.legs, leg)].filter((p) => p.big)) place(p, 0.55, 2.8)
  for (const p of spec.parts.filter((p) => !p.big)) place(p, 0.55, 3)
  for (let i = 0; i < spec.scraps; i++) {
    const mat = spec.scrap[i % spec.scrap.length]
    place(box('scrap', mat, 0.1 + rand() * 0.14, 0.01, 0.07 + rand() * 0.11), 0.4, WRECK_REACH)
  }
  return { pieces, downrange, soil: soilMarks(rand, h, downrange) }
}

/** True for a mission whose craft is shown as wreckage: it was lost on landing. */
export function isWrecked(m: { status: string }): boolean {
  return m.status === 'crashed'
}

/** One line for the caption of a craft shown as wreckage. */
export const WRECK_NOTE = 'Shown as wreckage: the pieces and where they lie are illustrative (the real debris was not mapped in this detail).'
