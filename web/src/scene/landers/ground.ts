// The ground a mission's craft stands on in its ground-level view. The app has no terrain data
// finer than 20-80 m, so everything here is ILLUSTRATIVE: gentle undulation, small craters with
// raised rims and a few rocks, generated from a seed (the mission id) so a site looks the same
// on every visit. The real terrain enters the view only as the distant skyline.
//
// The look follows the Apollo surface photographs (fine grey powder, many small soft-edged
// craters, scattered small rocks, very gentle relief). There are three styles, so two missions
// do not stand on the same ground: mare, highland and polar.

export type GroundStyle = 'mare' | 'highland' | 'polar'

interface StyleSpec {
  /** regolith colour */
  albedo: string
  /** height of the undulation at long, medium and short wavelengths, m */
  relief: [number, number, number]
  craters: number
  /** largest crater radius, m, and how strongly small ones dominate (higher = more small) */
  craterMaxM: number
  craterSkew: number
  /** crater depth and rim height as shares of the radius */
  depth: number
  rim: number
  rocks: number
  /** largest rock half-size, m */
  rockMaxM: number
  /** strength of the fine-grain bump */
  grain: number
}

export const GROUND_STYLES: Record<GroundStyle, StyleSpec> = {
  // Smooth, level, darker: many small soft craters, few rocks.
  mare: { albedo: '#6f6c68', relief: [0.45, 0.14, 0.04], craters: 90, craterMaxM: 5, craterSkew: 3, depth: 0.19, rim: 0.04, rocks: 9, rockMaxM: 0.22, grain: 0.7 },
  // Lighter and hummocky: more and larger rocks, a few bigger subdued craters.
  highland: { albedo: '#9a9793', relief: [1.7, 0.5, 0.07], craters: 42, craterMaxM: 12, craterSkew: 2.2, depth: 0.15, rim: 0.04, rocks: 32, rockMaxM: 0.7, grain: 0.9 },
  // Rough and blocky, with strong undulation that throws long shadows under a grazing Sun.
  polar: { albedo: '#86847f', relief: [3.0, 1.1, 0.16], craters: 44, craterMaxM: 9, craterSkew: 2.2, depth: 0.22, rim: 0.07, rocks: 40, rockMaxM: 0.95, grain: 1.2 },
}

/** Sites the simple rule below would get wrong (checked by hand against where they landed). */
const STYLE_OVERRIDE: Record<string, GroundStyle> = {
  // Mare plains that lie a little above the -1.5 km line (Oceanus Procellarum, Sinus Medii, Reiner Gamma).
  'apollo-12': 'mare',
  'surveyor-3': 'mare',
  'luna-9': 'mare',
  'surveyor-6': 'mare',
  'im-3': 'mare',
  // Highland material although the site is low-lying: Fra Mauro, the Apollonius highlands, and
  // the far-side basins (South Pole-Aitken, Schroedinger), which are deep but not near-side mare plains.
  'apollo-14': 'highland',
  'luna-20': 'highland',
  'change-4': 'highland',
  'change-6': 'highland',
  'apex-cp-12': 'highland',
  'blue-ghost-m2': 'highland',
}

/**
 * Which ground a mission stands on. Poleward of 75 degrees: polar. Otherwise by elevation on the
 * 1737.4 km sphere: the maria are low (below about -1.5 km), the highlands are not.
 */
export function groundStyle(missionId: string, latDeg: number, elevationM: number): GroundStyle {
  const forced = STYLE_OVERRIDE[missionId]
  if (forced) return forced
  if (Math.abs(latDeg) >= 75) return 'polar'
  return elevationM < -1500 ? 'mare' : 'highland'
}

/** A stable 32-bit seed from text. */
export function seedFrom(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Small seeded generator of numbers in [0, 1). */
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1)
  return t * t * (3 - 2 * t)
}

/** Smooth value noise in 2D, 0..1. */
function noise2(seed: number) {
  const at = (ix: number, iz: number) => {
    let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + seed) | 0
    h = Math.imul(h ^ (h >>> 13), 1274126177)
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296
  }
  return (x: number, z: number) => {
    const ix = Math.floor(x)
    const iz = Math.floor(z)
    const fx = x - ix
    const fz = z - iz
    const ux = fx * fx * (3 - 2 * fx)
    const uz = fz * fz * (3 - 2 * fz)
    const a = at(ix, iz) * (1 - ux) + at(ix + 1, iz) * ux
    const b = at(ix, iz + 1) * (1 - ux) + at(ix + 1, iz + 1) * ux
    return a * (1 - uz) + b * uz
  }
}

export interface Crater {
  x: number
  z: number
  r: number
}
export interface Rock {
  x: number
  z: number
  /** half-sizes in metres */
  size: [number, number, number]
  turn: number
}

export interface Ground {
  /** metres above the level the craft's pads rest on, at (x east, z south) metres from the craft */
  height: (x: number, z: number) => number
  style: GroundStyle
  /** regolith colour and fine-grain strength for the material */
  albedo: string
  grain: number
  craters: Crater[]
  rocks: Rock[]
  /** radius of the level patch the craft stands on, m */
  padM: number
  /** where the ground mesh ends, m */
  edgeM: number
  /** for a craft that did not end up upright: how it lies */
  rest?: Rest
}

/** How a tipped craft lies: lean from vertical, compass turn of the lean, and how far it has sunk in. */
export interface Rest {
  tiltDeg: number
  turnDeg: number
  sinkM: number
}

/** Outline of the Nova-C stand-in, in units of its height (see `NovaC` in LanderModel.tsx). */
const NOVA = { bodyR: 0.19, bodyLow: 0.27, bodyTop: 0.89, footX: 0.46 * Math.cos(Math.PI / 6) }

/**
 * Ground made for the two craft that tipped over, so they rest on something instead of hanging
 * in the air. Illustrative, like all ground here, but it follows what is known:
 * - IM-1 Odysseus caught a leg, tipped and came to rest leaning at about 30 degrees to the
 *   ground: here it leans at 60 degrees from vertical with its low-side legs dug into a ridge
 *   of pushed-up soil and its upper body propped on a boulder.
 * - IM-2 Athena came down in a small crater and lies on its side: here it lies on the floor of
 *   a crater a few craft-lengths across.
 */
interface Custom {
  rest?: Rest
  /** a bowl centred on the craft: radius and depth, m */
  crater?: { r: number; depth: number }
  mounds: { x: number; z: number; r: number; h: number }[]
  rocks: Rock[]
}
const TIP_DEG: Record<string, [tilt: number, turn: number]> = { 'im-1-odysseus': [60, 25], 'im-2-athena': [88, 40] }

/** One line for the caption of a craft that is shown tipped over, or null. */
export function restNote(missionId: string): string | null {
  return missionId in TIP_DEG ? 'Shown tipped over, as it came to rest (how it leans and what it rests on are illustrative).' : null
}

function customGround(missionId: string, h: number): Custom | null {
  const tip = TIP_DEG[missionId]
  if (!tip) return null
  const [tiltDeg, turnDeg] = tip
  const t = (tiltDeg * Math.PI) / 180
  const turn = (turnDeg * Math.PI) / 180
  // After leaning by `t` towards +x, a point (x, y) of the upright craft is at height -x sin t + y cos t.
  const foot = -NOVA.footX * Math.sin(t) + 0.005 * Math.cos(t)
  const bodyEdge = -NOVA.bodyR * Math.sin(t) + NOVA.bodyLow * Math.cos(t)
  // Sink until the lower edge of the body, not the legs, rests on the ground.
  const sinkM = Math.max(bodyEdge - foot, 0) * h
  // The lean points this way on the ground (x east, z south) once the craft is turned.
  const dir = [Math.cos(turn), -Math.sin(turn)]
  const along = (d: number) => ({ x: dir[0] * d * h, z: dir[1] * d * h })
  if (missionId === 'im-2-athena') {
    const r = Math.max(1.9 * h, 7)
    return { rest: { tiltDeg, turnDeg, sinkM }, crater: { r, depth: 0.13 * r }, mounds: [], rocks: [] }
  }
  // Where the upper body ends up, and how high its underside is there.
  const topOut = NOVA.bodyR * Math.cos(t) + NOVA.bodyTop * Math.sin(t)
  const topUp = (NOVA.bodyTop - NOVA.bodyLow) * Math.cos(t) * h
  const feetOut = NOVA.footX * Math.cos(t)
  const half = (topUp + 0.08) / 1.55 // a rock's top is 1.55 half-heights above the ground it sits on
  return {
    rest: { tiltDeg, turnDeg, sinkM },
    mounds: [{ ...along(feetOut + 0.05), r: 0.5 * h, h: 0.11 * h }],
    rocks: [{ ...along(topOut - 0.06), size: [half * 1.35, half, half * 1.2], turn: 0.6 }],
  }
}

/**
 * The shallow scar under a craft that was lost on landing: a wide, soft bowl a little deeper
 * than a footprint is long. Wide and shallow on purpose, so the ground mesh (coarse rings) and
 * `height` agree closely and no piece of wreckage placed by `height` hangs above the drawn ground.
 */
export function wreckScar(craftHeightM: number): { r: number; depth: number } {
  const r = Math.max(1.3 * craftHeightM, 2.2)
  return { r, depth: 0.07 * r }
}

/** Wreckage is thrown this many craft heights out at most (see wreck.ts). */
export const WRECK_REACH = 3.2

/** Beyond this distance the ground falls away, so its edge never rises above the real skyline. */
const FALL_FROM_M = 80
const FALL_RADIUS_M = 1600
export const GROUND_EDGE_M = 600

/**
 * `wrecked`: the craft was lost on landing, so the ground gets an impact scar and stays level
 * (apart from the scar) across the whole debris field.
 */
export function makeGround(seedText: string, craftHeightM: number, style: GroundStyle = 'mare', wrecked = false): Ground {
  const k = GROUND_STYLES[style]
  const seed = seedFrom(seedText)
  const rand = rng(seed)
  const n = noise2(seed)
  // The craft's pads rest on a level patch; the relief fades in around it.
  // For wreckage the patch covers the debris field: the short bumps and small craters beyond it
  // are finer than the ground mesh, and a small scrap resting on them would seem to float.
  const padM = Math.max(craftHeightM * (wrecked ? WRECK_REACH + 0.1 : 0.95), 3)
  const custom: Custom | null = customGround(seedText, craftHeightM) ?? (wrecked ? { crater: wreckScar(craftHeightM), mounds: [], rocks: [] } : null)
  const craters: Crater[] = []
  for (let i = 0; i < k.craters; i++) {
    // Denser near the craft, where the camera stands.
    const d = padM * 1.6 + Math.pow(rand(), 1.5) * 120
    const a = rand() * Math.PI * 2
    // Many small craters, a few large ones.
    const r = 0.45 + Math.pow(rand(), k.craterSkew) * k.craterMaxM
    craters.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, r })
  }
  // Shapes added for a tipped craft; they apply on the level patch too.
  const shaped = (x: number, z: number) => {
    if (!custom) return 0
    let h = 0
    if (custom.crater) {
      const q = Math.hypot(x, z) / custom.crater.r
      if (q < 1) h -= custom.crater.depth * (1 - q * q)
      h += 0.05 * custom.crater.r * Math.exp(-(((q - 1) / 0.28) ** 2))
    }
    for (const m of custom.mounds) h += m.h * Math.exp(-((Math.hypot(x - m.x, z - m.z) / m.r) ** 2) * 2.2)
    return h
  }
  const height = (x: number, z: number) => {
    const d = Math.hypot(x, z)
    if (d <= padM) return shaped(x, z)
    let h = (n(x / 24, z / 24) - 0.5) * 2 * k.relief[0] + (n(x / 6, z / 6) - 0.5) * 2 * k.relief[1] + (n(x / 1.4, z / 1.4) - 0.5) * 2 * k.relief[2]
    for (const c of craters) {
      const q = Math.hypot(x - c.x, z - c.z) / c.r
      if (q > 1.9) continue
      const bowl = q < 1 ? -k.depth * c.r * (1 - q * q) : 0
      const rim = k.rim * c.r * Math.exp(-(((q - 1) / 0.3) ** 2))
      h += bowl + rim
    }
    const far = d > FALL_FROM_M ? -((d - FALL_FROM_M) ** 2) / (2 * FALL_RADIUS_M) : 0
    return h * smooth(padM, padM * 2.4, d) + far + shaped(x, z)
  }
  const rocks: Rock[] = []
  for (let i = 0; i < k.rocks; i++) {
    // Most rocks are scattered; about a third lie round the rim of one of the larger craters.
    const big = craters.filter((c) => c.r > 1.5)
    const host = big.length && rand() < 0.35 ? big[Math.floor(rand() * big.length)] : null
    const a = rand() * Math.PI * 2
    const d = host ? host.r * (1 + rand() * 0.7) : padM * 1.3 + Math.pow(rand(), 1.4) * 50
    const s = 0.05 + Math.pow(rand(), 2.5) * k.rockMaxM
    if (host) {
      const x = host.x + Math.cos(a) * d
      const z = host.z + Math.sin(a) * d
      if (Math.hypot(x, z) > padM * 1.3) {
        rocks.push({ x, z, size: [s * (0.7 + rand() * 0.6), s * (0.45 + rand() * 0.4), s * (0.7 + rand() * 0.6)], turn: rand() * Math.PI })
        continue
      }
    }
    rocks.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, size: [s * (0.7 + rand() * 0.6), s * (0.45 + rand() * 0.4), s * (0.7 + rand() * 0.6)], turn: rand() * Math.PI })
  }
  if (custom) rocks.push(...custom.rocks)
  return { height, style, albedo: k.albedo, grain: k.grain, craters, rocks, padM, edgeM: GROUND_EDGE_M, rest: custom?.rest }
}

/**
 * The camera's start: which compass direction it looks in. With the Sun up it looks across the
 * light (the Sun behind and to one side), so the craft is lit and its shadow shows; at night it
 * looks towards Earth when Earth is above the level horizon, otherwise north.
 */
export function startViewAz(sun: { az: number; up: boolean }, earth: { az: number; el: number }, seedText = ''): number {
  // Which side of the sunlight the camera stands on comes from the mission, so sites differ.
  const side = seedText && seedFrom(seedText) % 2 ? -1 : 1
  const az = sun.up ? sun.az + side * 110 : earth.el > 0 ? earth.az + 14 : 0
  return ((az % 360) + 360) % 360
}

/** Brightness (0..1) of distant terrain seen in direction `azDeg`: its near face is lit when the Sun is behind the viewer. */
export function skylineShade(azDeg: number, sun: { az: number; up: boolean }): number {
  const ambient = 0.07
  if (!sun.up) return ambient * 0.6
  return ambient + 0.5 * Math.max(0, -Math.cos(((azDeg - sun.az) * Math.PI) / 180))
}
