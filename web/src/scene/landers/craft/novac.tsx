// Nova-C (Intuitive Machines): IM-1 Odysseus, IM-2 Athena, IM-3.
// Drawn 1 unit tall with its feet at y = 0 (see ../parts). One unit is about 4.3 m.
//
// Layout follows the NASA/Intuitive Machines hangar photo of the IM-1 lander (IM_00309):
// a tall hexagonal body on six wide legs, black below and silver-white above, two tall
// body-mounted solar panels plus a top-deck array, a copper-wrapped pressurant sphere bulging
// out of a side face above the gold sponsor panel, and the engine bell under an insulated
// tank dome. It stands upright here; the app leans the whole group for IM-1 and IM-2.
import type { ReactNode } from 'react'
import { DoubleSide } from 'three'
import { Ball, Box, CELLS, Cyl, DARK, METAL, PAINT, Strut, type V3 } from '../parts'

// Local finishes. Metalness stays low because the scene has no environment map.
const BLACK = { color: '#22242a', metalness: 0.15, roughness: 0.7 }
const SILVER = { color: '#c8cacd', metalness: 0.3, roughness: 0.5 }
const GOLD = { color: '#b3955a', metalness: 0.3, roughness: 0.55 }
const COPPER = { color: '#a5653c', metalness: 0.35, roughness: 0.5 }
const NOZZLE = { color: '#4a4541', metalness: 0.35, roughness: 0.5 }

// The hexagonal body: R is the corner radius, AP the distance from the axis to a flat face.
// 1.6 m across the flats on a 4.3 m craft gives an apothem of about 0.18.
const R = 0.205
const AP = R * Math.cos(Math.PI / 6)
const BODY_LOW = 0.3
const BODY_TOP = 0.93
const FOOT = 0.53

// A cylinderGeometry with six sides has a corner on +z, so corner k sits at k * 60 degrees
// and face k is centred 30 degrees further round. Inside a Face, +z points out of the face.
const cornerAngle = (k: number) => (k * Math.PI) / 3
function Face({ k, children }: { k: number; children: ReactNode }) {
  return <group rotation={[0, Math.PI / 6 + cornerAngle(k), 0]}>{children}</group>
}

/** One landing leg at a body corner: a long main strut, a V of lower braces and a round pad. */
function Leg({ k }: { k: number }) {
  const t = cornerAngle(k)
  const at = (rad: number, y: number, off = 0): V3 => [rad * Math.sin(t + off), y, rad * Math.cos(t + off)]
  const ankle = at(FOOT, 0.03)
  return (
    <group>
      <Strut a={at(R, 0.45)} b={ankle} r={0.011} />
      <Strut a={at(R * 0.93, BODY_LOW + 0.012, 0.4)} b={at(FOOT - 0.03, 0.05)} r={0.007} />
      <Strut a={at(R * 0.93, BODY_LOW + 0.012, -0.4)} b={at(FOOT - 0.03, 0.05)} r={0.007} />
      {/* The copper-wrapped fitting where the main strut meets the body. */}
      <Ball p={at(R + 0.004, 0.45)} r={0.02} mat={COPPER} />
      <Ball p={ankle} r={0.015} mat={METAL} />
      <Cyl p={at(FOOT, 0.006)} rTop={0.034} rBot={0.04} h={0.012} seg={16} mat={METAL} />
    </group>
  )
}

/** A tall solar panel lying on a body face, in a thin bright frame. */
function BodyPanel({ k }: { k: number }) {
  return (
    <Face k={k}>
      <Box p={[0, 0.655, AP + 0.004]} s={[0.158, 0.51, 0.008]} mat={METAL} />
      <Box p={[0, 0.655, AP + 0.01]} s={[0.146, 0.498, 0.006]} mat={CELLS} />
      {/* Thin bright lines where the strings of cells meet, so the panel reads as cells up close. */}
      {[-0.166, -0.083, 0, 0.083, 0.166].map((dy) => (
        <Box key={dy} p={[0, 0.655 + dy, AP + 0.0125]} s={[0.146, 0.003, 0.002]} mat={METAL} />
      ))}
    </Face>
  )
}

export function NovaC() {
  return (
    <group>
      {/* Body: black lower half, silver-white insulation above, a bright ring at each end. */}
      <Cyl p={[0, BODY_LOW + 0.006, 0]} rTop={R + 0.006} h={0.012} seg={6} mat={METAL} />
      <Cyl p={[0, 0.455, 0]} rTop={R} h={0.29} seg={6} mat={BLACK} />
      <Cyl p={[0, 0.765, 0]} rTop={R} h={0.33} seg={6} mat={SILVER} />
      <Cyl p={[0, BODY_TOP + 0.004, 0]} rTop={R + 0.006} h={0.008} seg={6} mat={METAL} />
      {/* Top-deck solar array. */}
      <Cyl p={[0, BODY_TOP + 0.011, 0]} rTop={R * 0.8} h={0.006} seg={6} mat={CELLS} />

      {/* Under the body: the insulated dome of the lower propellant tank, then the engine. */}
      <Ball p={[0, 0.33, 0]} r={0.15} mat={SILVER} />
      <Cyl p={[0, 0.178, 0]} rTop={0.034} rBot={0.026} h={0.03} seg={16} mat={METAL} />
      <mesh position={[0, 0.118, 0]} castShadow>
        <cylinderGeometry args={[0.026, 0.07, 0.095, 24, 1, true]} />
        <meshStandardMaterial {...NOZZLE} side={DoubleSide} />
      </mesh>

      {[0, 1, 2, 3, 4, 5].map((k) => (
        <Leg key={k} k={k} />
      ))}

      {/* Two tall body solar panels (the third array is the top deck), either side of face 2. */}
      {[1, 3].map((k) => (
        <BodyPanel key={k} k={k} />
      ))}

      {/* Face 0: the gold sponsor panel, the copper-wrapped sphere above it, a horn antenna on top. */}
      <Face k={0}>
        <Box p={[0, 0.44, AP + 0.004]} s={[0.15, 0.2, 0.008]} mat={GOLD} />
        <Ball p={[-0.01, 0.675, AP - 0.005]} r={0.088} mat={COPPER} />
        <Box p={[0.05, 0.86, AP + 0.02]} s={[0.07, 0.07, 0.04]} mat={PAINT} />
        <mesh position={[-0.04, 0.87, AP + 0.03]} rotation={[-Math.PI / 2.6, 0, 0]} castShadow>
          <coneGeometry args={[0.03, 0.05, 16, 1, true]} />
          <meshStandardMaterial {...METAL} side={DoubleSide} />
        </mesh>
      </Face>

      {/* Face 2: payload boxes, white above and foil-wrapped below. */}
      <Face k={2}>
        <Box p={[0.01, 0.82, AP + 0.025]} s={[0.11, 0.12, 0.05]} mat={PAINT} />
        <Box p={[-0.03, 0.63, AP + 0.02]} s={[0.05, 0.04, 0.04]} mat={COPPER} />
        <Box p={[0.02, 0.48, AP + 0.022]} s={[0.07, 0.1, 0.044]} mat={GOLD} />
      </Face>

      {/* Face 4: the second pressurant sphere, the navigation pod and a camera. */}
      <Face k={4}>
        <Ball p={[0.01, 0.675, AP - 0.005]} r={0.088} mat={COPPER} />
        <Box p={[0, 0.43, AP + 0.02]} s={[0.1, 0.07, 0.04]} mat={DARK} />
        <Cyl p={[-0.025, 0.43, AP + 0.045]} rTop={0.014} h={0.02} seg={12} mat={METAL} rot={[Math.PI / 2, 0, 0]} />
        <Cyl p={[0.025, 0.43, AP + 0.045]} rTop={0.014} h={0.02} seg={12} mat={METAL} rot={[Math.PI / 2, 0, 0]} />
        <Box p={[0.04, 0.86, AP + 0.015]} s={[0.05, 0.05, 0.03]} mat={PAINT} />
      </Face>

      {/* Face 5: avionics shelf and equipment boxes strapped outside the body. */}
      <Face k={5}>
        <Box p={[0, 0.8, AP + 0.03]} s={[0.13, 0.09, 0.06]} mat={PAINT} />
        <Box p={[-0.03, 0.66, AP + 0.02]} s={[0.06, 0.08, 0.04]} mat={GOLD} />
        <Box p={[0.04, 0.5, AP + 0.02]} s={[0.07, 0.12, 0.04]} mat={SILVER} />
      </Face>

      {/* Top deck: two whip antennas, a star tracker and a small box, round the solar array. */}
      <Strut a={[R * 0.82, BODY_TOP, 0.03]} b={[R * 0.82, 1.0, 0.03]} r={0.004} />
      <Strut a={[-R * 0.7, BODY_TOP, -0.09]} b={[-R * 0.7, 0.995, -0.09]} r={0.004} />
      <Box p={[-0.02, BODY_TOP + 0.022, R * 0.72]} s={[0.05, 0.03, 0.04]} mat={PAINT} />
      <Cyl p={[0.1, BODY_TOP + 0.025, -0.12]} rTop={0.018} rBot={0.014} h={0.04} seg={12} mat={DARK} rot={[0.3, 0, -0.3]} />
    </group>
  )
}
