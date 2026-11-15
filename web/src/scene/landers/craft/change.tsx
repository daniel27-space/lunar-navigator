// The Chang'e landers: Chang'e 3 and 4 with the Yutu rover beside them, and the Chang'e 5 and 6
// sample-return lander with its ascent vehicle on top.
// Each is drawn 1 unit tall with its feet at y = 0 (see ../parts).
import { Ball, Box, CELLS, Cyl, DARK, Dish, FOIL, METAL, PAINT, Strut, type V3 } from '../parts'

type Mat = typeof METAL

// Local presets. There is no environment map, so everything stays at low metalness.
const FOIL_DEEP: Mat = { color: '#8c7748', metalness: 0.3, roughness: 0.6 } // foil in shade: deck plates, panel backs
const FOIL_PALE: Mat = { color: '#c9c1a8', metalness: 0.3, roughness: 0.5 } // the silvery blanket of the ascent vehicle and rover top
const WHEEL: Mat = { color: '#8a8d93', metalness: 0.35, roughness: 0.5 } // the rover's wire-mesh wheels read as light grey metal
const FLAG: Mat = { color: '#a8322c', metalness: 0.05, roughness: 0.8 }

const OCT = Math.PI / 8 // turns an 8-sided cylinder so its flat faces look along x and z

/**
 * One landing leg on a diagonal face: a thick foil-wrapped main strut whose thinner piston runs
 * on to a wide footpad, and two side struts from the lower body to the middle of the main strut.
 * The pad is a shallow dish whose underside is at y = 0.
 */
function Leg({ ang, bodyR, top, low, foot, r = 0.022, pad = 0.075 }: { ang: number; bodyR: number; top: number; low: number; foot: number; r?: number; pad?: number }) {
  const c = Math.cos(ang)
  const s = Math.sin(ang)
  const A: V3 = [bodyR * c, top, bodyR * s]
  const F: V3 = [foot * c, 0.035, foot * s]
  const t = 0.55
  const M: V3 = [A[0] + (F[0] - A[0]) * t, A[1] + (F[1] - A[1]) * t, A[2] + (F[2] - A[2]) * t]
  const side = (d: number): V3 => [bodyR * 1.02 * Math.cos(ang + d), low, bodyR * 1.02 * Math.sin(ang + d)]
  return (
    <group>
      <Strut a={A} b={M} r={r} mat={FOIL} />
      <Strut a={M} b={F} r={r * 0.6} />
      <Strut a={side(0.42)} b={M} r={r * 0.5} mat={FOIL} />
      <Strut a={side(-0.42)} b={M} r={r * 0.5} mat={FOIL} />
      <Ball p={[F[0], 0.04, F[2]]} r={r * 0.9} mat={METAL} />
      <Cyl p={[F[0], 0.0125, F[2]]} rTop={pad} rBot={pad * 0.72} h={0.025} seg={20} mat={METAL} />
    </group>
  )
}

/**
 * A solar wing that folds out from a hinge line. `dir` is the side it opens to (+1 or -1 in x),
 * `tilt` lifts its outer edge. The cells sit on a slightly larger back plate, in `segs` sections.
 */
function Wing({ hinge, dir, tilt, len, wid, segs = 1, gap = 0 }: { hinge: V3; dir: 1 | -1; tilt: number; len: number; wid: number; segs?: number; gap?: number }) {
  const seg = len / segs
  return (
    <group position={hinge} rotation={[0, 0, dir * tilt]}>
      {gap > 0 && <Strut a={[0, 0, 0]} b={[dir * gap, 0, 0]} r={0.008} />}
      {Array.from({ length: segs }, (_, k) => {
        const x = dir * (gap + seg * (k + 0.5))
        return (
          <group key={k}>
            <Box p={[x, 0, 0]} s={[seg - 0.004, 0.008, wid]} mat={FOIL_DEEP} />
            <Box p={[x, 0.006, 0]} s={[seg - 0.02, 0.006, wid - 0.016]} mat={CELLS} />
          </group>
        )
      })}
    </group>
  )
}

/** The Yutu rover, drawn in metres with its wheels on y = 0 and its front toward +z. */
function Yutu() {
  const wheelZ = [-0.5, 0, 0.5]
  return (
    <group>
      {[-1, 1].map((sd) => (
        <group key={sd}>
          {wheelZ.map((z) => (
            <group key={z}>
              <Cyl p={[sd * 0.54, 0.15, z]} rTop={0.15} h={0.13} seg={18} mat={WHEEL} rot={[0, 0, Math.PI / 2]} />
              <Cyl p={[sd * 0.5, 0.15, z]} rTop={0.045} h={0.22} seg={10} mat={PAINT} rot={[0, 0, Math.PI / 2]} />
            </group>
          ))}
          {/* rocker to the front wheel, bogie carrying the middle and rear wheels */}
          <Strut a={[sd * 0.42, 0.42, 0.05]} b={[sd * 0.42, 0.16, 0.5]} r={0.022} mat={PAINT} />
          <Strut a={[sd * 0.42, 0.42, 0.05]} b={[sd * 0.42, 0.3, -0.25]} r={0.022} mat={PAINT} />
          <Strut a={[sd * 0.42, 0.3, -0.25]} b={[sd * 0.42, 0.16, 0]} r={0.02} mat={PAINT} />
          <Strut a={[sd * 0.42, 0.3, -0.25]} b={[sd * 0.42, 0.16, -0.5]} r={0.02} mat={PAINT} />
          {/* whip antennas at the rear corners */}
          <Strut a={[sd * 0.33, 0.68, -0.44]} b={[sd * 0.33, 1.08, -0.44]} r={0.008} mat={FOIL} />
        </group>
      ))}
      {/* foil box body under a bright top plate */}
      <Box p={[0, 0.5, 0]} s={[0.76, 0.32, 1.0]} mat={FOIL} />
      <Box p={[0, 0.668, 0]} s={[0.8, 0.016, 1.04]} mat={FOIL_PALE} />
      {/* the two solar wings: one lies nearly flat, the other is raised toward the sun */}
      <Wing hinge={[-0.4, 0.69, 0]} dir={-1} tilt={0.06} len={0.82} wid={0.92} />
      <Wing hinge={[0.4, 0.69, 0]} dir={1} tilt={0.38} len={0.82} wid={0.92} />
      {/* mast at the front with the panoramic camera head and the dish */}
      <Strut a={[0, 0.67, 0.3]} b={[0, 1.42, 0.3]} r={0.025} mat={PAINT} />
      <Box p={[0, 1.47, 0.3]} s={[0.36, 0.1, 0.1]} mat={FOIL_PALE} />
      <Cyl p={[0.11, 1.47, 0.36]} rTop={0.032} h={0.03} seg={10} mat={DARK} rot={[Math.PI / 2, 0, 0]} />
      <Cyl p={[-0.11, 1.47, 0.36]} rTop={0.032} h={0.03} seg={10} mat={DARK} rot={[Math.PI / 2, 0, 0]} />
      <Dish p={[0, 1.1, 0.38]} r={0.2} rot={[-Math.PI / 2 - 0.4, 0, 0]} />
      {/* folded robotic arm across the front, with its sensor head */}
      <Strut a={[0.2, 0.4, 0.5]} b={[0.2, 0.3, 0.78]} r={0.022} mat={PAINT} />
      <Strut a={[0.2, 0.3, 0.78]} b={[-0.12, 0.26, 0.8]} r={0.022} mat={PAINT} />
      <Box p={[-0.16, 0.26, 0.8]} s={[0.09, 0.09, 0.09]} mat={METAL} />
      {/* flag on the front face */}
      <Box p={[-0.16, 0.56, 0.503]} s={[0.2, 0.13, 0.006]} mat={FLAG} />
    </group>
  )
}

export function ChangELander() {
  const R = 0.4 // corner radius of the octagonal body; its flat faces are at 0.37
  const face = R * Math.cos(OCT)
  // The rover ramp: two rails hung below the deck that slope down to the ground on the +z side.
  const railTop: V3 = [0, 0.3, 0.39]
  const railEnd: V3 = [0, 0.014, 0.98]
  const railLen = Math.hypot(railEnd[1] - railTop[1], railEnd[2] - railTop[2])
  const railRot = Math.atan2(railTop[1] - railEnd[1], railEnd[2] - railTop[2])
  return (
    <group>
      {/* octagonal foil body with a darker deck and the descent engine underneath */}
      <Cyl p={[0, 0.465, 0]} rTop={R} h={0.39} seg={8} mat={FOIL} rot={[0, OCT, 0]} />
      <Cyl p={[0, 0.667, 0]} rTop={R + 0.012} h={0.014} seg={8} mat={FOIL_DEEP} rot={[0, OCT, 0]} />
      <Cyl p={[0, 0.255, 0]} rTop={0.16} rBot={0.1} h={0.03} seg={16} mat={FOIL_DEEP} />
      <Cyl p={[0, 0.175, 0]} rTop={0.045} rBot={0.105} h={0.13} seg={20} mat={DARK} />
      {[0, 1, 2, 3].map((k) => (
        <Leg key={k} ang={Math.PI / 4 + (k * Math.PI) / 2} bodyR={face} top={0.6} low={0.3} foot={0.62} />
      ))}
      {/* white radiator panels and the flag break up the foil on the back face */}
      <Box p={[0.08, 0.5, -face - 0.003]} s={[0.13, 0.2, 0.006]} mat={PAINT} />
      <Box p={[-0.1, 0.56, -face - 0.003]} s={[0.1, 0.065, 0.006]} mat={FLAG} />
      <Box p={[face + 0.003, 0.44, 0]} s={[0.006, 0.16, 0.2]} mat={PAINT} />
      <Box p={[-face - 0.003, 0.44, 0]} s={[0.006, 0.16, 0.2]} mat={PAINT} />
      {/* the two solar panels hinge on the top edges of the side faces */}
      <Wing hinge={[face, 0.67, 0]} dir={1} tilt={0.3} len={0.5} wid={0.62} />
      <Wing hinge={[-face, 0.67, 0]} dir={-1} tilt={0.1} len={0.5} wid={0.62} />
      {/* rails on the deck where the rover rode, and the ramp it drove down */}
      {[-0.12, 0.12].map((x) => (
        <group key={x}>
          <Box p={[x, 0.68, 0.12]} s={[0.05, 0.012, 0.5]} mat={METAL} />
          <Strut a={[x, 0.67, 0.385]} b={[x, 0.3, 0.385]} r={0.01} />
          <Box p={[x, (railTop[1] + railEnd[1]) / 2, (railTop[2] + railEnd[2]) / 2]} s={[0.045, 0.012, railLen]} mat={METAL} rot={[railRot, 0, 0]} />
        </group>
      ))}
      <Strut a={[-0.12, 0.3, 0.4]} b={[0.12, 0.3, 0.4]} r={0.008} />
      <Strut a={[-0.12, 0.2, 0.6]} b={[0.12, 0.2, 0.6]} r={0.008} />
      <Strut a={[-0.12, 0.1, 0.8]} b={[0.12, 0.1, 0.8]} r={0.008} />
      {/* mast with the terrain camera */}
      <Strut a={[0.24, 0.67, -0.2]} b={[0.24, 0.95, -0.2]} r={0.012} />
      <Box p={[0.24, 0.972, -0.2]} s={[0.09, 0.05, 0.05]} mat={FOIL_PALE} />
      <Cyl p={[0.24, 0.972, -0.17]} rTop={0.016} h={0.02} seg={10} mat={DARK} rot={[Math.PI / 2, 0, 0]} />
      {/* dish antenna on its stem */}
      <Strut a={[-0.2, 0.67, -0.16]} b={[-0.2, 0.83, -0.16]} r={0.012} />
      <Dish p={[-0.2, 0.86, -0.16]} r={0.1} rot={[Math.PI - 0.35, 0, 0.2]} />
      {/* instruments on the deck: the boxed telescope and the upward-looking camera */}
      <Box p={[0.22, 0.715, 0.12]} s={[0.12, 0.08, 0.16]} mat={FOIL_PALE} />
      <Cyl p={[-0.25, 0.72, 0.14]} rTop={0.04} h={0.09} seg={12} mat={FOIL_PALE} />
      <Strut a={[-0.3, 0.67, -0.02]} b={[-0.34, 0.8, -0.02]} r={0.006} />
      {/* Yutu, driven off the ramp and turned aside. 1 unit here is about 3.3 m. */}
      <group position={[-0.48, 0, 0.92]} rotation={[0, -0.7, 0]} scale={0.3}>
        <Yutu />
      </group>
    </group>
  )
}

export function ChangE5() {
  const R = 0.37
  const face = R * Math.cos(OCT)
  const deck = 0.585
  // The sampling arm: shoulder on the deck corner, elbow held out, sampler resting on the ground.
  const shoulder: V3 = [0.24, deck + 0.03, 0.24]
  const elbow: V3 = [0.47, 0.53, 0.47]
  const hand: V3 = [0.6, 0.07, 0.62]
  return (
    <group>
      {/* octagonal foil body, deck, descent engine */}
      <Cyl p={[0, 0.42, 0]} rTop={R} h={0.32} seg={8} mat={FOIL} rot={[0, OCT, 0]} />
      <Cyl p={[0, deck - 0.002, 0]} rTop={R + 0.01} h={0.014} seg={8} mat={FOIL_DEEP} rot={[0, OCT, 0]} />
      <Cyl p={[0, 0.245, 0]} rTop={0.15} rBot={0.1} h={0.03} seg={16} mat={FOIL_DEEP} />
      <Cyl p={[0, 0.17, 0]} rTop={0.045} rBot={0.1} h={0.12} seg={20} mat={DARK} />
      {[0, 1, 2, 3].map((k) => (
        <Leg key={k} ang={Math.PI / 4 + (k * Math.PI) / 2} bodyR={face} top={0.53} low={0.29} foot={0.62} />
      ))}
      {/* white radiator panels on the faces under the wings and beside the flag */}
      <Box p={[face + 0.003, 0.4, 0]} s={[0.006, 0.14, 0.18]} mat={PAINT} />
      <Box p={[-face - 0.003, 0.4, 0]} s={[0.006, 0.14, 0.18]} mat={PAINT} />
      <Box p={[0.08, 0.43, face + 0.003]} s={[0.14, 0.16, 0.006]} mat={PAINT} />
      {/* two-section solar wings held out level from the side faces */}
      <Wing hinge={[face, 0.53, 0]} dir={1} tilt={0} len={0.56} wid={0.3} segs={2} gap={0.05} />
      <Wing hinge={[-face, 0.53, 0]} dir={-1} tilt={0} len={0.56} wid={0.3} segs={2} gap={0.05} />

      {/* the ascent vehicle stands on a short truss above the deck */}
      {[0, 1, 2, 3].map((k) => {
        const a = Math.PI / 4 + (k * Math.PI) / 2
        const b: V3 = [0.24 * Math.cos(a), deck, 0.24 * Math.sin(a)]
        const up = (d: number): V3 => [0.17 * Math.cos(a + d), 0.69, 0.17 * Math.sin(a + d)]
        return (
          <group key={k}>
            <Strut a={b} b={up(0.5)} r={0.009} mat={PAINT} />
            <Strut a={b} b={up(-0.5)} r={0.009} mat={PAINT} />
            {/* propellant tanks slung under the corners */}
            <Ball p={[0.15 * Math.cos(a), 0.69, 0.15 * Math.sin(a)]} r={0.05} mat={METAL} />
          </group>
        )
      })}
      <Cyl p={[0, 0.8, 0]} rTop={0.21} h={0.21} seg={8} mat={FOIL_PALE} rot={[0, OCT, 0]} />
      <Cyl p={[0, 0.909, 0]} rTop={0.2} h={0.012} seg={8} mat={PAINT} rot={[0, OCT, 0]} />
      <Cyl p={[0, 0.655, 0]} rTop={0.025} rBot={0.05} h={0.07} seg={14} mat={DARK} />
      {/* sample container port and antennas on the ascent vehicle */}
      <Cyl p={[0, 0.93, 0]} rTop={0.05} h={0.035} seg={14} mat={METAL} />
      <Strut a={[0.12, 0.91, 0.1]} b={[0.2, 0.995, 0.16]} r={0.007} mat={PAINT} />
      <Strut a={[-0.12, 0.91, 0.1]} b={[-0.2, 0.995, 0.16]} r={0.007} mat={PAINT} />
      <Cyl p={[-0.1, 0.94, -0.08]} rTop={0.012} rBot={0.03} h={0.05} seg={10} mat={PAINT} />

      {/* drill assembly on the back face: a tall column that reaches the ascent vehicle's top,
          the fat drum beside it, and the bit going into the ground */}
      <Cyl p={[0, 0.53, -face - 0.05]} rTop={0.032} h={0.8} seg={12} mat={FOIL} />
      <Cyl p={[0, 0.065, -face - 0.05]} rTop={0.009} h={0.13} seg={8} mat={DARK} />
      <Cyl p={[0.11, 0.43, -face - 0.06]} rTop={0.055} h={0.32} seg={14} mat={FOIL_PALE} />
      <Strut a={[0, 0.9, -face - 0.05]} b={[0, 0.9, -0.19]} r={0.008} />
      <Strut a={[0, 0.3, -face - 0.05]} b={[0, 0.3, -face]} r={0.008} />

      {/* sampling arm with its scoop on the surface */}
      <Cyl p={[shoulder[0], deck + 0.02, shoulder[2]]} rTop={0.03} h={0.04} seg={12} mat={METAL} />
      <Strut a={shoulder} b={elbow} r={0.014} mat={PAINT} />
      <Ball p={elbow} r={0.022} mat={METAL} />
      <Strut a={elbow} b={hand} r={0.012} mat={PAINT} />
      <Box p={[hand[0], 0.055, hand[2]]} s={[0.06, 0.05, 0.06]} mat={METAL} rot={[0, Math.PI / 4, 0]} />
      <Cyl p={[hand[0] + 0.015, 0.015, hand[2] + 0.015]} rTop={0.022} rBot={0.014} h={0.03} seg={10} mat={DARK} />

      {/* small flag panel held out from the front face on a stalk */}
      <Strut a={[-0.2, 0.55, face]} b={[-0.22, 0.6, face + 0.07]} r={0.006} />
      <Box p={[-0.22, 0.625, face + 0.075]} s={[0.1, 0.065, 0.004]} mat={FLAG} />
      {/* panoramic camera on a short mast at the deck edge */}
      <Strut a={[-0.27, deck, 0.2]} b={[-0.27, 0.7, 0.2]} r={0.008} />
      <Box p={[-0.27, 0.715, 0.2]} s={[0.06, 0.035, 0.035]} mat={FOIL_PALE} />
    </group>
  )
}
