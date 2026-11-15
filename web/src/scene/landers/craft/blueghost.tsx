// Blue Ghost (Firefly Aerospace), as Mission 1 stood in Mare Crisium.
// Drawn 1 unit tall with its feet at y = 0 (see ../parts). The real craft is about 2 m tall and
// 3.5 m across its feet, so the footpads sit far outside the body: that wide, low stance is what
// makes it recognisable.
import * as THREE from 'three'
import { Ball, Box, CELLS, Cyl, DARK, FOIL, METAL, PAINT, Strut, type V3 } from '../parts'

// Silver insulation on the decks, and the gold end fittings of the carbon legs.
const SILVER = { color: '#c6c8cc', metalness: 0.3, roughness: 0.5 }
const GOLD = { color: '#a58a4a', metalness: 0.35, roughness: 0.5 }
const CARBON = { color: '#2b2d31', metalness: 0.2, roughness: 0.55 }
const GRID = { color: '#8f96a6', metalness: 0.2, roughness: 0.6 }

// The body is a square frustum: a small top deck over a wider lower deck.
const TOP_Y = 0.74
const LOW_Y = 0.29
const TOP_HALF = 0.3
const LOW_HALF = 0.37
// How far the side faces lean in towards the top.
const LEAN = Math.atan((LOW_HALF - TOP_HALF) / (TOP_Y - LOW_Y))

/** A solar panel lying in its own XY plane and facing +z: silver backing, cells, cell rows. */
function Panel({ p, rot, w, h, cols = 5, rows = 4 }: { p: V3; rot: V3; w: number; h: number; cols?: number; rows?: number }) {
  return (
    <group position={p} rotation={rot}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[w, h, 0.012]} />
        <meshStandardMaterial {...SILVER} />
      </mesh>
      <mesh position={[0, 0, 0.008]}>
        <boxGeometry args={[w * 0.95, h * 0.93, 0.006]} />
        <meshStandardMaterial {...CELLS} />
      </mesh>
      {Array.from({ length: cols - 1 }, (_, k) => (
        <mesh key={`c${k}`} position={[w * 0.95 * ((k + 1) / cols - 0.5), 0, 0.0115]}>
          <boxGeometry args={[0.004, h * 0.93, 0.001]} />
          <meshStandardMaterial {...GRID} />
        </mesh>
      ))}
      {Array.from({ length: rows - 1 }, (_, k) => (
        <mesh key={`r${k}`} position={[0, h * 0.93 * ((k + 1) / rows - 0.5), 0.0115]}>
          <boxGeometry args={[w * 0.95, 0.004, 0.001]} />
          <meshStandardMaterial {...GRID} />
        </mesh>
      ))}
    </group>
  )
}

/** One landing leg on a body corner: carbon main strut with a gold end, two braces, a bowl pad. */
function Leg({ sx, sz }: { sx: number; sz: number }) {
  const d = Math.SQRT1_2
  const top: V3 = [sx * 0.31, TOP_Y - 0.02, sz * 0.31]
  const foot: V3 = [sx * 0.85 * d, 0.055, sz * 0.85 * d]
  const along = (t: number): V3 => [top[0] + (foot[0] - top[0]) * t, top[1] + (foot[1] - top[1]) * t, top[2] + (foot[2] - top[2]) * t]
  return (
    <group>
      <Strut a={top} b={foot} r={0.02} mat={CARBON} />
      <Strut a={along(0.8)} b={along(0.97)} r={0.025} mat={GOLD} />
      <Strut a={along(0.0)} b={along(0.05)} r={0.025} mat={GOLD} />
      {/* The two braces run from the lower deck, one from each side of the corner. */}
      <Strut a={[sx * LOW_HALF, LOW_Y, sz * 0.1]} b={along(0.86)} r={0.012} mat={CARBON} />
      <Strut a={[sx * 0.1, LOW_Y, sz * LOW_HALF]} b={along(0.86)} r={0.012} mat={CARBON} />
      <Ball p={foot} r={0.026} mat={METAL} />
      <Cyl p={[foot[0], 0.02, foot[2]]} rTop={0.105} rBot={0.055} h={0.04} seg={20} mat={METAL} />
    </group>
  )
}

export function BlueGhost() {
  const corners: [number, number][] = [[1, 1], [-1, 1], [-1, -1], [1, -1]]
  const midY = (TOP_Y + LOW_Y) / 2
  const midHalf = (TOP_HALF + LOW_HALF) / 2
  return (
    <group>
      {/* Body: gold foil over the tanks, between a silver top deck and a dark lower deck. */}
      <Cyl p={[0, midY, 0]} rTop={TOP_HALF * Math.SQRT2 * 0.98} rBot={LOW_HALF * Math.SQRT2 * 0.98} h={TOP_Y - LOW_Y} seg={4} mat={FOIL} rot={[0, Math.PI / 4, 0]} />
      <Box p={[0, TOP_Y, 0]} s={[TOP_HALF * 2 + 0.04, 0.025, TOP_HALF * 2 + 0.04]} mat={SILVER} />
      <Box p={[0, LOW_Y, 0]} s={[LOW_HALF * 2 + 0.04, 0.025, LOW_HALF * 2 + 0.04]} mat={DARK} />

      {/* Solar panels on three of the leaning side faces; the fourth (+z) stays gold foil. */}
      {[1, 2, 3].map((k) => (
        <group key={k} rotation={[0, (k * Math.PI) / 2, 0]}>
          <Panel p={[0, midY, midHalf + 0.012]} rot={[-LEAN, 0, 0]} w={0.6} h={0.42} cols={7} rows={5} />
        </group>
      ))}

      {/* The foil face carries payload boxes and a white radiator. */}
      <Box p={[-0.13, midY, midHalf + 0.012]} s={[0.22, 0.26, 0.016]} mat={PAINT} rot={[-LEAN, 0, 0]} />
      <Box p={[0.15, LOW_Y + 0.08, LOW_HALF - 0.01]} s={[0.16, 0.12, 0.07]} mat={SILVER} />
      <Box p={[0.17, midY + 0.1, midHalf - 0.015]} s={[0.1, 0.1, 0.05]} mat={GOLD} rot={[-LEAN, 0, 0]} />

      {/* Propellant tanks: their foil wrapped lower domes bulge out under the lower deck. */}
      {corners.map(([sx, sz]) => (
        <Ball key={`t${sx}${sz}`} p={[sx * 0.19, LOW_Y + 0.03, sz * 0.19]} r={0.135} mat={FOIL} />
      ))}

      {/* Main engine in the middle, and eight smaller thrusters in pairs by the corners. */}
      <Cyl p={[0, LOW_Y - 0.05, 0]} rTop={0.06} h={0.08} seg={16} mat={METAL} />
      <mesh position={[0, LOW_Y - 0.11, 0]} castShadow>
        <cylinderGeometry args={[0.04, 0.1, 0.17, 20, 1, true]} />
        <meshStandardMaterial {...DARK} side={THREE.DoubleSide} />
      </mesh>
      {corners.flatMap(([sx, sz]) =>
        [-1, 1].map((e) => (
          <Cyl key={`n${sx}${sz}${e}`} p={[sx * 0.3 + e * 0.035, LOW_Y - 0.06, sz * 0.3 - e * sx * sz * 0.035]} rTop={0.016} rBot={0.034} h={0.1} seg={12} mat={METAL} />
        )),
      )}

      {corners.map(([sx, sz]) => (
        <Leg key={`l${sx}${sz}`} sx={sx} sz={sz} />
      ))}

      {/* Top deck: the flat solar array. */}
      <Panel p={[-0.1, TOP_Y + 0.02, 0.06]} rot={[-Math.PI / 2, 0, 0]} w={0.34} h={0.4} cols={4} rows={4} />

      {/* X-band antenna: a flat panel on a two axis gimbal, tipped up towards Earth, with the
          small LuGRE navigation antenna riding on the same gimbal. */}
      <Cyl p={[0.14, TOP_Y + 0.06, -0.14]} rTop={0.022} h={0.12} seg={10} mat={METAL} />
      <Box p={[0.14, TOP_Y + 0.13, -0.14]} s={[0.08, 0.035, 0.05]} mat={DARK} />
      <Box p={[0.14, 0.895, -0.14]} s={[0.26, 0.014, 0.22]} mat={PAINT} rot={[1.0, 0, 0]} />
      <Box p={[0.14, 0.889, -0.149]} s={[0.22, 0.008, 0.18]} mat={GOLD} rot={[1.0, 0, 0]} />
      <Strut a={[0.14, TOP_Y + 0.13, -0.14]} b={[0.31, 0.88, -0.14]} r={0.006} />
      <Cyl p={[0.31, 0.885, -0.14]} rTop={0.032} h={0.012} seg={14} mat={PAINT} rot={[1.0, 0, 0]} />

      {/* LEXI, the X-ray telescope: a white box looking up through a dark aperture. */}
      <Box p={[0.17, TOP_Y + 0.065, 0.16]} s={[0.13, 0.1, 0.13]} mat={PAINT} />
      <Box p={[0.17, TOP_Y + 0.117, 0.16]} s={[0.1, 0.006, 0.1]} mat={DARK} />

      {/* The magnetotelluric sounder's mast with its magnetometer on top. */}
      <Strut a={[-0.25, TOP_Y, -0.24]} b={[-0.25, 0.975, -0.24]} r={0.007} />
      <Box p={[-0.25, 0.98, -0.24]} s={[0.035, 0.035, 0.035]} mat={PAINT} />
      <Box p={[-0.25, TOP_Y + 0.03, -0.24]} s={[0.07, 0.04, 0.07]} mat={SILVER} />

      {/* Smaller deck payloads: the retroreflector dome and an electronics box. */}
      <Ball p={[-0.05, TOP_Y + 0.03, -0.22]} r={0.03} mat={METAL} />
      <Box p={[0.02, TOP_Y + 0.04, -0.05]} s={[0.07, 0.05, 0.09]} mat={GOLD} />

      {/* Lunar PlanetVac: a sampling head lowered to the ground beside a leg. */}
      <Box p={[0.3, LOW_Y - 0.04, LOW_HALF + 0.02]} s={[0.08, 0.06, 0.06]} mat={PAINT} />
      <Strut a={[0.3, LOW_Y - 0.05, LOW_HALF + 0.03]} b={[0.36, 0.06, 0.5]} r={0.01} />
      <Cyl p={[0.36, 0.035, 0.5]} rTop={0.035} h={0.07} seg={14} mat={METAL} />

      {/* LISTER, the heat flow drill: a box under the deck with its tube down to the soil. */}
      <Box p={[-0.26, LOW_Y - 0.07, LOW_HALF - 0.02]} s={[0.08, 0.12, 0.08]} mat={SILVER} />
      <Strut a={[-0.26, LOW_Y - 0.13, LOW_HALF - 0.02]} b={[-0.26, 0, LOW_HALF - 0.02]} r={0.008} />
    </group>
  )
}
