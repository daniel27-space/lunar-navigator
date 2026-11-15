// Surveyor (1966 to 1968): an open triangular tube frame on three hinged legs, with a tall
// mast that carries the solar panel and the flat high-gain antenna.
// Drawn 1 unit tall with its feet at y = 0 (see ../parts). The real craft is about 3 m tall and
// its footpads sit on a circle about 4.3 m across, so it is wider than it is tall.
import { Ball, Box, CELLS, Cyl, DARK, METAL, PAINT, Strut, type V3 } from '../parts'

// Polished radiator mirrors on top of the thermal compartments, and the camera mirror.
const MIRROR = { color: '#e8ebf0', metalness: 0.3, roughness: 0.25 }
// Tanks were wrapped in aluminised insulation, so they read as dull silver.
const SILVER = { color: '#c6c9ce', metalness: 0.4, roughness: 0.38 }
// Crushable aluminium honeycomb of the footpads and the blocks under the frame.
const HONEYCOMB = { color: '#aaa79d', metalness: 0.15, roughness: 0.8 }
// The thermal compartments and the camera were painted a brighter white than the frame fittings.
const WHITE = { color: '#ecece7', metalness: 0.05, roughness: 0.65 }
// The slotted face of the planar high-gain antenna.
const ARRAY = { color: '#b4b8bd', metalness: 0.15, roughness: 0.55 }

const DEG = Math.PI / 180
// The three legs point this way (degrees round the y axis); the sides lie halfway between.
const LEGS = [90, 210, 330]
const SIDE_A = 150 // thermal compartment A (the big one)
const SIDE_B = 270 // thermal compartment B
const SIDE_C = 30 // TV camera and soil sampler

// Heights and radii of the frame.
const Y_LOW = 0.16
const Y_UP = 0.34
const R_LOW = 0.31
const R_UP = 0.22
const HINGE = 0.07 // half width of a leg hinge along the frame
const R_FOOT = 0.7
const Y_APEX = 0.5

/** A point given round the craft: `deg` round the y axis, `out` from the centre, `side` along the tangent. */
function at(deg: number, out: number, y: number, side = 0): V3 {
  const c = Math.cos(deg * DEG)
  const s = Math.sin(deg * DEG)
  return [out * c + side * s, y, out * s - side * c]
}

/** Turns a group so that its local z points outward along `deg` and its x along the tangent. */
function facing(deg: number): V3 {
  return [0, Math.PI / 2 - deg * DEG, 0]
}

function Frame() {
  const low = LEGS.flatMap((d) => [at(d, R_LOW, Y_LOW, HINGE), at(d, R_LOW, Y_LOW, -HINGE)])
  const up = LEGS.map((d) => at(d, R_UP, Y_UP))
  return (
    <>
      {low.map((p, k) => (
        <Strut key={`l${k}`} a={p} b={low[(k + 1) % low.length]} r={0.011} />
      ))}
      {up.map((p, k) => (
        <Strut key={`u${k}`} a={p} b={up[(k + 1) % up.length]} r={0.011} />
      ))}
      {up.map((p, k) => (
        <group key={`d${k}`}>
          <Strut a={low[k * 2]} b={p} r={0.009} />
          <Strut a={low[k * 2 + 1]} b={p} r={0.009} />
          {/* The mast stands on a tripod that rises from the three upper corners. */}
          <Strut a={p} b={[0, Y_APEX, 0]} r={0.009} />
        </group>
      ))}
    </>
  )
}

/** One landing leg: a tapering A-frame hinged on the lower frame, a shock strut down from the upper frame, a footpad. */
function Leg({ deg }: { deg: number }) {
  // A point along the leg, t = 0 at the hinge and 1 at the footpad.
  const along = (t: number, side: number): V3 => at(deg, R_LOW + (R_FOOT - R_LOW) * t, Y_LOW + (0.05 - Y_LOW) * t, side * HINGE * (1 - t))
  const grip = along(0.8, 0)
  const top = at(deg, R_UP, Y_UP)
  // The fat upper half of the shock strut is its hydraulic cylinder.
  const mid: V3 = [top[0] + (grip[0] - top[0]) * 0.55, top[1] + (grip[1] - top[1]) * 0.55, top[2] + (grip[2] - top[2]) * 0.55]
  return (
    <group>
      <Strut a={along(0, 1)} b={along(1, 0)} r={0.011} />
      <Strut a={along(0, -1)} b={along(1, 0)} r={0.011} />
      <Strut a={along(0.3, 1)} b={along(0.3, -1)} r={0.007} />
      <Strut a={along(0.3, -1)} b={along(0.6, 1)} r={0.007} />
      <Strut a={along(0.6, 1)} b={along(0.6, -1)} r={0.007} />
      <Strut a={top} b={grip} r={0.009} />
      <Strut a={top} b={mid} r={0.017} />
      <Cyl p={at(deg, R_FOOT, 0.02)} rTop={0.055} h={0.04} seg={18} mat={HONEYCOMB} />
      <Cyl p={at(deg, R_FOOT, 0.047)} rTop={0.026} rBot={0.04} h={0.014} seg={14} mat={METAL} />
      {/* Crushable block under the frame beside the hinge, and the vernier engine next to it. */}
      <Cyl p={at(deg, 0.27, 0.125)} rTop={0.032} h={0.05} seg={12} mat={HONEYCOMB} />
      <Cyl p={at(deg, 0.235, 0.115, 0.105)} rTop={0.011} rBot={0.026} h={0.05} seg={12} mat={DARK} />
      <Cyl p={at(deg, 0.235, 0.158, 0.105)} rTop={0.016} h={0.036} seg={10} mat={METAL} />
      {/* Two propellant tanks sit inside the frame at every leg. */}
      <Ball p={at(deg, 0.19, 0.25, 0.07)} r={0.047} mat={SILVER} />
      <Ball p={at(deg, 0.19, 0.25, -0.07)} r={0.047} mat={SILVER} />
    </group>
  )
}

/** A white thermal compartment with its mirrored radiator on top, hung on one side of the frame. */
function Compartment({ deg, out, y, size }: { deg: number; out: number; y: number; size: V3 }) {
  return (
    <group position={at(deg, out, y)} rotation={facing(deg)}>
      <Box p={[0, 0, 0]} s={size} mat={WHITE} />
      <Box p={[0, size[1] / 2 + 0.004, 0]} s={[size[0] * 0.92, 0.008, size[2] * 0.9]} mat={MIRROR} />
    </group>
  )
}

/** The survey TV camera: an upright tube tilted outward, looking up into a mirror under a hood. */
function Camera() {
  return (
    <group position={at(SIDE_C, 0.19, 0.3, -0.07)} rotation={facing(SIDE_C)}>
      <group rotation={[16 * DEG, 0, 0]}>
        <Cyl p={[0, 0.1, 0]} rTop={0.027} h={0.2} seg={14} mat={WHITE} />
        <Cyl p={[0, 0.225, 0]} rTop={0.036} h={0.06} seg={14} mat={WHITE} />
        {/* The hood is open toward the outside; the mirror inside it leans at 45 degrees. */}
        <Box p={[0, 0.285, -0.026]} s={[0.07, 0.07, 0.008]} mat={WHITE} />
        <Box p={[0, 0.322, 0.002]} s={[0.07, 0.008, 0.062]} mat={WHITE} />
        <Box p={[0, 0.282, 0.0]} s={[0.058, 0.006, 0.07]} mat={MIRROR} rot={[-45 * DEG, 0, 0]} />
      </group>
    </group>
  )
}

/** The soil sampler of Surveyor 3 and 7: lazy tongs that reach out between two legs, with a scoop. */
function Sampler() {
  const cells = 4
  const half = 0.036
  // The arm runs from the frame down toward the ground.
  const node = (i: number, up: number): V3 => {
    const t = i / cells
    return at(SIDE_C, 0.25 + 0.36 * t, 0.25 - 0.15 * t + up * half, 0.11)
  }
  return (
    <group>
      {Array.from({ length: cells }, (_, i) => (
        <group key={i}>
          <Strut a={node(i, 1)} b={node(i + 1, -1)} r={0.005} />
          <Strut a={node(i, -1)} b={node(i + 1, 1)} r={0.005} />
        </group>
      ))}
      <group position={at(SIDE_C, 0.635, 0.095, 0.11)} rotation={facing(SIDE_C)}>
        <Box p={[0, 0, 0]} s={[0.04, 0.05, 0.05]} mat={METAL} />
      </group>
      <group position={at(SIDE_C, 0.24, 0.25, 0.11)} rotation={facing(SIDE_C)}>
        <Box p={[0, 0, 0]} s={[0.05, 0.09, 0.04]} mat={PAINT} />
      </group>
    </group>
  )
}

/** A low-gain antenna: a cone on the end of a boom that swings out and up from the frame. */
function Omni({ deg }: { deg: number }) {
  const root = at(deg, 0.17, Y_UP)
  const tip = at(deg, 0.56, 0.6)
  return (
    <group>
      <Strut a={root} b={tip} r={0.007} />
      <group position={tip} rotation={facing(deg)}>
        <mesh rotation={[55 * DEG, 0, 0]} castShadow>
          <coneGeometry args={[0.03, 0.045, 14]} />
          <meshStandardMaterial {...PAINT} />
        </mesh>
      </group>
    </group>
  )
}

/** The mast with the solar panel and the planar antenna, which hang off its top at different angles. */
function Mast() {
  const head: V3 = [0, 0.885, 0]
  return (
    <group rotation={[0, 0.45, 0]}>
      <Cyl p={[0, (Y_APEX + 0.88) / 2, 0]} rTop={0.019} h={0.88 - Y_APEX} seg={12} mat={METAL} />
      <Cyl p={[0, Y_APEX, 0]} rTop={0.03} h={0.03} seg={12} mat={METAL} />
      <Box p={head} s={[0.05, 0.05, 0.05]} mat={METAL} />
      {/* The axis the two panels turn on to follow the Sun and the Earth. */}
      <Cyl p={head} rTop={0.014} h={0.12} seg={10} mat={DARK} rot={[Math.PI / 2, 0, 0]} />
      {/* Solar panel: cells face up and away from the mast. */}
      <Strut a={head} b={[0.11, 0.925, 0]} r={0.008} />
      <group position={[0.13, 0.925, 0]} rotation={[0, 0, -25 * DEG]}>
        <Box p={[0, 0.005, 0]} s={[0.33, 0.006, 0.29]} mat={CELLS} />
        <Box p={[0, -0.001, 0]} s={[0.34, 0.006, 0.3]} mat={PAINT} />
        {/* Thin gaps between the strings of cells. */}
        {[-0.0825, 0, 0.0825].map((x) => (
          <Box key={x} p={[x, 0.0085, 0]} s={[0.004, 0.002, 0.29]} mat={METAL} />
        ))}
      </group>
      {/* Planar high-gain antenna: stands steeper, on the other side. */}
      <Strut a={head} b={[-0.12, 0.84, 0]} r={0.008} />
      <group position={[-0.135, 0.835, 0]} rotation={[0, 0, 62 * DEG]}>
        <Box p={[0, 0.005, 0]} s={[0.31, 0.006, 0.31]} mat={ARRAY} />
        <Box p={[0, -0.001, 0]} s={[0.32, 0.006, 0.32]} mat={PAINT} />
        {/* The array was built from four square sections. */}
        <Box p={[0, 0.0085, 0]} s={[0.004, 0.002, 0.31]} mat={DARK} />
        <Box p={[0, 0.0085, 0]} s={[0.31, 0.002, 0.004]} mat={DARK} />
      </group>
    </group>
  )
}

export function Surveyor() {
  return (
    <group>
      <Frame />
      {LEGS.map((d) => (
        <Leg key={d} deg={d} />
      ))}
      <Mast />
      <Compartment deg={SIDE_A} out={0.245} y={0.275} size={[0.21, 0.17, 0.14]} />
      <Compartment deg={SIDE_B} out={0.235} y={0.27} size={[0.16, 0.14, 0.11]} />
      <Camera />
      <Sampler />
      <Omni deg={125} />
      <Omni deg={300} />
      {/* Helium tank in the middle of the frame and the small nitrogen tank for the attitude jets. */}
      <Ball p={[0, 0.25, 0]} r={0.06} mat={SILVER} />
      <Ball p={at(SIDE_C, 0.1, 0.3, 0.03)} r={0.034} mat={SILVER} />
      {/* The two flat radar antennas that measured height and speed on the way down hang under the frame. */}
      <Cyl p={at(SIDE_A, 0.2, 0.135)} rTop={0.085} rBot={0.07} h={0.02} seg={18} mat={METAL} rot={[0, 0, 0]} />
      <Cyl p={at(SIDE_B, 0.19, 0.135)} rTop={0.07} rBot={0.058} h={0.02} seg={18} mat={METAL} />
    </group>
  )
}
