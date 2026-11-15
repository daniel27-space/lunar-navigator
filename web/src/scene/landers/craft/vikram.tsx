// Vikram and Pragyan (Chandrayaan-3), as they stood after the rover drove off.
// Drawn 1 unit tall with its feet at y = 0 (see ../parts).
//
// Proportions follow the pictures Pragyan took of the lander on the surface: the box body is
// about a third of the standing height, the legs lift it by another third, and the instruments
// on the deck fill the rest. The body tapers slightly towards the deck.
import type { ReactNode } from 'react'
import * as THREE from 'three'
import { Ball, Box, CELLS, Cyl, DARK, METAL, PAINT, Strut, type V3 } from '../parts'

// Local colours. All stay at low metalness because the scene has no environment map.
// The foil here is a shade warmer than the shared one: in full sun the shared tan washes out to
// cream, and Vikram's gold wrap is the first thing people remember about it.
const FOIL = { color: '#b29158', metalness: 0.3, roughness: 0.55 }
const BAY = { color: '#1d1f24', metalness: 0.1, roughness: 0.85 } // the open rover bay and nozzles
const GRID = { color: '#56617a', metalness: 0.3, roughness: 0.5 } // the lines between solar cells
const SAFFRON = { color: '#c98a45', metalness: 0.05, roughness: 0.8 }
const GREEN = { color: '#4a7d50', metalness: 0.05, roughness: 0.8 }
const RIM = { color: '#c9ccd1', metalness: 0.3, roughness: 0.5 } // the rover's bare aluminium wheels

// The body: half-width at the bottom and at the deck, and where it sits above the ground.
const HB = 0.36
const HT = 0.3
const Y0 = 0.34
const Y1 = 0.7
const TILT = Math.atan((HB - HT) / (Y1 - Y0))

/** Places its children flat against one sloping side of the body; local z points outward. */
function Face({ turn, children }: { turn: number; children: ReactNode }) {
  return (
    <group rotation={[0, turn, 0]}>
      <group position={[0, (Y0 + Y1) / 2, (HB + HT) / 2]} rotation={[-TILT, 0, 0]}>
        {children}
      </group>
    </group>
  )
}

/** A solar panel lying on a side face, with a few lines so it reads as rows of cells. */
function SolarFace({ w, h, x = 0 }: { w: number; h: number; x?: number }) {
  return (
    <group position={[x, 0, 0]}>
      <Box p={[0, 0, 0.008]} s={[w, h, 0.012]} mat={CELLS} />
      {[-0.25, 0, 0.25].map((k) => (
        <Box key={`v${k}`} p={[k * w, 0, 0.0145]} s={[0.005, h, 0.003]} mat={GRID} />
      ))}
      {[-1 / 6, 1 / 6].map((k) => (
        <Box key={`h${k}`} p={[0, k * h, 0.0145]} s={[w, 0.005, 0.003]} mat={GRID} />
      ))}
    </group>
  )
}

/** The flag as plain bands: saffron, white, green. */
function Flag({ p, s, rot }: { p: V3; s: [number, number]; rot?: V3 }) {
  const [w, h] = s
  return (
    <group position={p} rotation={rot}>
      <Box p={[0, 0, 0]} s={[w, h, 0.004]} mat={PAINT} />
      <Box p={[0, h / 3, 0.001]} s={[w, h / 3, 0.004]} mat={SAFFRON} />
      <Box p={[0, -h / 3, 0.001]} s={[w, h / 3, 0.004]} mat={GREEN} />
    </group>
  )
}

/** One landing leg at a corner: a telescoping main strut, two braces back to the body, a pad. */
function Leg({ sx, sz }: { sx: number; sz: number }) {
  const top: V3 = [sx * 0.34, 0.42, sz * 0.34]
  const foot: V3 = [sx * 0.56, 0.03, sz * 0.56]
  const at = (t: number): V3 => [top[0] + (foot[0] - top[0]) * t, top[1] + (foot[1] - top[1]) * t, top[2] + (foot[2] - top[2]) * t]
  return (
    <group>
      <Strut a={top} b={at(0.62)} r={0.021} />
      <Strut a={at(0.6)} b={foot} r={0.012} />
      {/* The braces meet the body well away from the middle of each side, clear of the ramp. */}
      <Strut a={at(0.68)} b={[sx * 0.355, 0.35, sz * 0.2]} r={0.009} />
      <Strut a={at(0.68)} b={[sx * 0.2, 0.35, sz * 0.355]} r={0.009} />
      <Ball p={foot} r={0.02} mat={METAL} />
      <Cyl p={[foot[0], 0.011, foot[2]]} rTop={0.052} rBot={0.064} h={0.022} seg={16} mat={METAL} />
    </group>
  )
}

/** A rover wheel: an open rim with a hub and crossed spokes, turning about the z axis. */
function Wheel({ p }: { p: V3 }) {
  const r = 0.04
  return (
    <group position={p}>
      <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[r, r, 0.036, 16, 1, true]} />
        <meshStandardMaterial {...RIM} side={THREE.DoubleSide} />
      </mesh>
      <Cyl p={[0, 0, 0]} rTop={0.011} h={0.04} seg={8} mat={DARK} rot={[Math.PI / 2, 0, 0]} />
      <Box p={[0, 0, 0]} s={[r * 1.96, 0.005, 0.005]} mat={RIM} />
      <Box p={[0, 0, 0]} s={[0.005, r * 1.96, 0.005]} mat={RIM} />
    </group>
  )
}

/** Pragyan, heading along +x. Wheels touch y = 0. */
function Pragyan() {
  const xs = [-0.115, 0, 0.115]
  return (
    <group>
      {[-1, 1].map((s) => {
        const z = s * 0.103
        const pivot: V3 = [0.03, 0.128, z]
        const bogie: V3 = [-0.058, 0.085, z]
        return (
          <group key={s}>
            {xs.map((x) => (
              <Wheel key={x} p={[x, 0.04, s * 0.125]} />
            ))}
            {/* Rocker-bogie: the front wheel hangs from the rocker, the other two share a bogie. */}
            <Strut a={[xs[2], 0.04, z]} b={pivot} r={0.007} />
            <Strut a={pivot} b={bogie} r={0.007} />
            <Strut a={bogie} b={[xs[1], 0.04, z]} r={0.006} />
            <Strut a={bogie} b={[xs[0], 0.04, z]} r={0.006} />
          </group>
        )
      })}
      <Box p={[0, 0.15, 0]} s={[0.28, 0.09, 0.18]} mat={FOIL} />
      {/* The one solar panel stands upright along the left side, cells facing outward. */}
      <Box p={[0, 0.297, -0.094]} s={[0.28, 0.2, 0.006]} mat={CELLS} />
      <Box p={[0, 0.297, -0.089]} s={[0.284, 0.204, 0.005]} mat={METAL} />
      {/* Two navigation cameras look forward from a small bar on the front edge. */}
      <Box p={[0.128, 0.213, 0]} s={[0.024, 0.036, 0.11]} mat={PAINT} />
      <Cyl p={[0.146, 0.216, 0.032]} rTop={0.013} h={0.022} seg={10} mat={BAY} rot={[0, 0, Math.PI / 2]} />
      <Cyl p={[0.146, 0.216, -0.032]} rTop={0.013} h={0.022} seg={10} mat={BAY} rot={[0, 0, Math.PI / 2]} />
      {/* The white plate with the emblem and flag on the back, as seen from the lander. */}
      <Box p={[-0.142, 0.155, 0.01]} s={[0.004, 0.066, 0.1]} mat={PAINT} />
      <Flag p={[-0.145, 0.15, 0.01]} s={[0.04, 0.026]} rot={[0, -Math.PI / 2, 0]} />
      <Strut a={[-0.09, 0.195, 0.06]} b={[-0.09, 0.3, 0.06]} r={0.004} />
      <Cyl p={[-0.09, 0.305, 0.06]} rTop={0.009} h={0.014} seg={8} mat={PAINT} />
      <Strut a={[0.04, 0.195, 0.065]} b={[0.04, 0.26, 0.065]} r={0.004} />
    </group>
  )
}

export function Vikram() {
  return (
    <group>
      {/* The lander stands a little to one side so that lander, ramp and rover together are centred. */}
      <group position={[-0.36, 0, 0]}>
        {/* Body: a four-sided box that narrows towards the deck, wrapped in foil. */}
        <Cyl p={[0, (Y0 + Y1) / 2, 0]} rTop={HT * Math.SQRT2} rBot={HB * Math.SQRT2} h={Y1 - Y0} seg={4} mat={FOIL} rot={[0, Math.PI / 4, 0]} />
        <Box p={[0, Y1 + 0.006, 0]} s={[HT * 2 + 0.03, 0.012, HT * 2 + 0.03]} mat={METAL} />
        <Box p={[0, Y0 - 0.012, 0]} s={[0.52, 0.03, 0.52]} mat={DARK} />

        {/* Four throttleable engines under the body (Chandrayaan-3 dropped the fifth, central one). */}
        {[-1, 1].flatMap((sx) =>
          [-1, 1].map((sz) => (
            <group key={`e${sx}${sz}`}>
              <Cyl p={[sx * 0.14, 0.3, sz * 0.14]} rTop={0.03} h={0.05} seg={12} mat={DARK} />
              <Cyl p={[sx * 0.14, 0.225, sz * 0.14]} rTop={0.026} rBot={0.07} h={0.11} seg={16} mat={BAY} />
            </group>
          )),
        )}

        {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => <Leg key={`l${sx}${sz}`} sx={sx} sz={sz} />))}

        {/* Small attitude thrusters on the four corner edges, firing downward. */}
        {[-1, 1].flatMap((sx) =>
          [-1, 1].map((sz) => (
            <group key={`t${sx}${sz}`}>
              <Box p={[sx * 0.325, 0.6, sz * 0.325]} s={[0.05, 0.045, 0.05]} mat={METAL} rot={[0, Math.PI / 4, 0]} />
              <Cyl p={[sx * 0.345, 0.565, sz * 0.345]} rTop={0.008} rBot={0.016} h={0.03} seg={8} mat={BAY} />
            </group>
          )),
        )}

        {/* Solar panels cover two whole sides. */}
        <Face turn={0}>
          <SolarFace w={0.56} h={0.31} />
        </Face>
        <Face turn={-Math.PI / 2}>
          <SolarFace w={0.56} h={0.31} />
        </Face>

        {/* The back: a narrower panel, with the flag and the ISRO mark as plain plates on the foil. */}
        <Face turn={Math.PI}>
          <SolarFace w={0.3} h={0.31} x={-0.12} />
          <Flag p={[0.19, 0.08, 0.006]} s={[0.12, 0.08]} />
          <Box p={[0.19, -0.05, 0.006]} s={[0.1, 0.07, 0.004]} mat={PAINT} />
        </Face>

        {/* The rover's side: the open bay it rode in, framed by the door edges. */}
        <Face turn={Math.PI / 2}>
          <Box p={[0, -0.03, 0.002]} s={[0.36, 0.27, 0.006]} mat={BAY} />
          <Box p={[-0.19, -0.03, 0.006]} s={[0.02, 0.29, 0.014]} mat={METAL} />
          <Box p={[0.19, -0.03, 0.006]} s={[0.02, 0.29, 0.014]} mat={METAL} />
          <Box p={[0, 0.115, 0.006]} s={[0.4, 0.02, 0.014]} mat={METAL} />
        </Face>

        {/* The ramp, folded down from that side to the ground: a dark sheet between two rails. */}
        <group position={[0.645, 0.179, 0]} rotation={[0, 0, -0.511]}>
          <Box p={[0, 0, 0]} s={[0.7, 0.008, 0.27]} mat={CELLS} />
          <Box p={[0, 0.01, 0.128]} s={[0.7, 0.016, 0.014]} mat={METAL} />
          <Box p={[0, 0.01, -0.128]} s={[0.7, 0.016, 0.014]} mat={METAL} />
          {[-0.2, 0, 0.2].map((x) => (
            <Box key={x} p={[x, 0.006, 0]} s={[0.012, 0.006, 0.25]} mat={GRID} />
          ))}
        </group>

        {/* Deck: the foil-wrapped housing in the middle with a tank dome showing above it. */}
        <Cyl p={[0, 0.762, 0]} rTop={0.15} rBot={0.17} h={0.1} seg={8} mat={FOIL} rot={[0, Math.PI / 8, 0]} />
        <mesh position={[0, 0.81, 0]} scale={[1, 0.6, 1]} castShadow>
          <sphereGeometry args={[0.115, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial {...FOIL} />
        </mesh>
        {/* Two stubby helix antennas and a thin mast, the tallest thing on the craft. */}
        <Cyl p={[-0.2, 0.762, 0.19]} rTop={0.03} h={0.1} seg={12} mat={PAINT} />
        <Cyl p={[-0.2, 0.832, 0.19]} rTop={0.004} rBot={0.03} h={0.04} seg={12} mat={PAINT} />
        <Cyl p={[-0.2, 0.752, -0.19]} rTop={0.026} h={0.08} seg={12} mat={PAINT} />
        <Cyl p={[-0.2, 0.81, -0.19]} rTop={0.004} rBot={0.026} h={0.036} seg={12} mat={PAINT} />
        <Strut a={[0.21, 0.71, -0.2]} b={[0.21, 0.975, -0.2]} r={0.006} />
        <Cyl p={[0.21, 0.985, -0.2]} rTop={0.016} h={0.03} seg={10} mat={PAINT} />
        {/* Cameras and electronics boxes along the deck edges. */}
        <Box p={[0.23, 0.745, 0.04]} s={[0.09, 0.066, 0.12]} mat={PAINT} />
        <Box p={[0.02, 0.74, 0.245]} s={[0.12, 0.056, 0.06]} mat={DARK} />
        <Box p={[0.02, 0.735, -0.25]} s={[0.1, 0.046, 0.05]} mat={METAL} />
        {/* NASA's laser retroreflector: a small dome on its ring at a deck corner. */}
        <Cyl p={[0.24, 0.717, 0.24]} rTop={0.034} h={0.01} seg={14} mat={METAL} />
        <mesh position={[0.24, 0.722, 0.24]} castShadow>
          <sphereGeometry args={[0.027, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial {...FOIL} />
        </mesh>
        {/* Langmuir probe: a ball on the end of a boom held straight out from the deck. */}
        <Box p={[0.3, 0.725, -0.27]} s={[0.04, 0.03, 0.04]} mat={METAL} />
        <Strut a={[0.3, 0.728, -0.27]} b={[0.74, 0.728, -0.27]} r={0.005} />
        <Ball p={[0.75, 0.728, -0.27]} r={0.017} mat={METAL} />

        {/* ChaSTE: an arm swung down from the body that pushed a thermal probe into the soil. */}
        <Box p={[-0.12, 0.37, -0.375]} s={[0.07, 0.05, 0.04]} mat={METAL} />
        <Strut a={[-0.12, 0.37, -0.39]} b={[-0.12, 0.3, -0.62]} r={0.008} />
        <Box p={[-0.12, 0.3, -0.62]} s={[0.04, 0.05, 0.04]} mat={PAINT} />
        <Strut a={[-0.12, 0.3, -0.62]} b={[-0.12, 0, -0.62]} r={0.006} />

        {/* ILSA: the seismometer box set down on the ground beside a leg, on its tether. */}
        <Box p={[-0.6, 0.025, 0.12]} s={[0.075, 0.05, 0.075]} mat={FOIL} />
        <Strut a={[-0.36, 0.345, 0.12]} b={[-0.6, 0.05, 0.12]} r={0.003} mat={DARK} />
      </group>

      {/* Pragyan stands a little way off the end of the ramp, turned slightly as it drove away. */}
      <group position={[1.04, 0, 0.14]} rotation={[0, -0.4, 0]} scale={0.88}>
        <Pragyan />
      </group>
    </group>
  )
}
