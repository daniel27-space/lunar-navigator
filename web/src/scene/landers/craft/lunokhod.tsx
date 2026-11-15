// Lunokhod standing on the ground just off the ramps of its Luna 17 / Luna 21 landing platform.
// Drawn 1 unit tall with its lowest point at y = 0 (see ../parts).
//
// Everything below is written in metres and the whole group is scaled once at the end, so the
// numbers can be checked against the real craft: wheels 0.51 m across, tub 2.15 m across at the
// rim, lid the same size, wheel track 1.6 m, platform deck about 1 m above the ground.
import * as THREE from 'three'
import { Box, Cyl, DARK, METAL, PAINT, Strut, type V3 } from '../parts'

// The tallest point is the tip of the open lid, about 2.62 m up.
const HEIGHT = 2.62
// The platform sits at z = 0 and the rover ahead of it; shifting by half the overall length
// keeps the pair centred on the origin.
const ROVER_Z = 4.45
const CENTRE_Z = 1.4

const TUB = { color: '#c3c5c6', metalness: 0.35, roughness: 0.5 }
const WIRE = { color: '#a3a6ab', metalness: 0.3, roughness: 0.5 }
// Rough enough that the sun does not wash the cells out to white.
const BLUE_CELLS = { color: '#263a6e', metalness: 0.15, roughness: 0.7 }
const SEAM = { color: '#7f8aa6', metalness: 0.2, roughness: 0.5 }
const GLASS = { color: '#15181d', metalness: 0.3, roughness: 0.25 }
const CREAM = { color: '#cfc7a8', metalness: 0.1, roughness: 0.7 }
const TANK = { color: '#c9c8c2', metalness: 0.25, roughness: 0.55 }
const FRAME = { color: '#8f9399', metalness: 0.35, roughness: 0.5 }

const v = (pts: [number, number][]) => pts.map(([x, y]) => new THREE.Vector2(x, y))

// Side profile of the pressurised tub, spun round the vertical axis: narrow at the bottom,
// flaring out to a wide rim.
const TUB_PROFILE = v([[0, 0.5], [0.62, 0.5], [0.76, 0.58], [0.8, 0.78], [0.86, 0.88], [1.03, 0.985], [1.075, 1.0], [1.075, 1.04]])
// The gently domed radiator that closes the top of the tub (the lid folds down over it at night).
const TOP_PROFILE = v([[1.075, 1.04], [0.8, 1.075], [0.4, 1.095], [0, 1.1]])
// Spokes run from both ends of the hub to the middle rim, like a bicycle wheel.
const SPOKE_PROFILE = v([[0.06, 0.09], [0.255, 0], [0.06, -0.09]])
// The stepped white motor housing that sticks out of every wheel.
const HUB_PROFILE = v([[0, -0.09], [0.07, -0.09], [0.07, 0.03], [0.088, 0.04], [0.088, 0.1], [0.062, 0.115], [0.062, 0.15], [0.036, 0.165], [0.036, 0.2], [0, 0.2]])
const SMALL_SPOKES = v([[0.02, 0.03], [0.115, 0], [0.02, -0.03]])

function Lathe({ pts, seg = 28, mat, wire = false }: { pts: THREE.Vector2[]; seg?: number; mat: typeof METAL; wire?: boolean }) {
  return (
    <mesh castShadow receiveShadow={!wire}>
      <latheGeometry args={[pts, seg]} />
      <meshStandardMaterial {...mat} side={THREE.DoubleSide} wireframe={wire} />
    </mesh>
  )
}

/** One of the eight wire-mesh wheels. `side` is +1 or -1: which way the hub points. */
function Wheel({ p, side }: { p: V3; side: number }) {
  const r = 0.255
  const w = 0.2
  return (
    // Turned so that local y is the axle, pointing away from the body.
    <group position={p} rotation={[0, 0, (-side * Math.PI) / 2]}>
      {[-1, 0, 1].map((k) => (
        <mesh key={k} position={[0, (k * w) / 2, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <torusGeometry args={[r, 0.009, 6, 28]} />
          <meshStandardMaterial {...WIRE} />
        </mesh>
      ))}
      {/* The tread is wire mesh: a see-through skin (which still casts the shadow) under a wire grid. */}
      <mesh castShadow>
        <cylinderGeometry args={[r, r, w, 28, 1, true]} />
        <meshStandardMaterial {...WIRE} side={THREE.DoubleSide} transparent opacity={0.4} depthWrite={false} />
      </mesh>
      <mesh>
        <cylinderGeometry args={[r + 0.004, r + 0.004, w, 28, 2, true]} />
        <meshStandardMaterial {...WIRE} wireframe />
      </mesh>
      <Lathe pts={SPOKE_PROFILE} seg={16} mat={WIRE} wire />
      <Lathe pts={HUB_PROFILE} seg={14} mat={PAINT} />
    </group>
  )
}

function Rover() {
  const lidR = 1.075
  // How far the lid is swung up past the horizontal, measured at the hinge.
  const lidTilt = (46 * Math.PI) / 180
  const wheelZ = [-0.85, -0.283, 0.283, 0.85]
  return (
    <group>
      {/* Running gear: a frame under the tub, and each wheel on its own swing arm. */}
      <Box p={[0, 0.45, 0]} s={[0.96, 0.1, 1.72]} mat={FRAME} />
      {[-1, 1].flatMap((side) =>
        wheelZ.map((z) => (
          <group key={`${side}${z}`}>
            <Wheel p={[side * 0.8, 0.255, z]} side={side} />
            <Strut a={[side * 0.48, 0.45, z - Math.sign(z) * 0.2]} b={[side * 0.7, 0.255, z]} r={0.03} mat={FRAME} />
          </group>
        )),
      )}

      {/* The tub and its radiator top. */}
      <Lathe pts={TUB_PROFILE} seg={36} mat={TUB} />
      <Lathe pts={TOP_PROFILE} seg={36} mat={PAINT} />

      {/* The lid, hinged at the back and propped open, solar cells on the inside face. */}
      <group position={[0, 1.06, -lidR]} rotation={[lidTilt - Math.PI, 0, 0]}>
        <Cyl p={[0, 0, lidR]} rTop={lidR} h={0.03} seg={36} mat={PAINT} />
        <Cyl p={[0, -0.018, lidR]} rTop={1.01} h={0.01} seg={36} mat={BLUE_CELLS} />
        {[-0.5, 0, 0.5].map((k) => (
          <Box key={k} p={[0, -0.024, lidR + k]} s={[2 * Math.sqrt(1 - k * k) - 0.04, 0.004, 0.014]} mat={SEAM} />
        ))}
        {[-0.35, 0.35].map((k) => (
          <Box key={k} p={[k, -0.024, lidR]} s={[0.014, 0.004, 1.84]} mat={SEAM} />
        ))}
      </group>
      {[-0.3, 0.3].map((x) => (
        <Box key={x} p={[x, 1.05, -1.06]} s={[0.12, 0.09, 0.12]} mat={FRAME} />
      ))}

      {/* The two forward television cameras, side by side low on the front. */}
      {[-0.15, 0.15].map((x) => (
        <group key={x}>
          <Cyl p={[x, 0.8, 0.93]} rTop={0.075} h={0.26} seg={16} mat={PAINT} rot={[Math.PI / 2, 0, 0]} />
          <Cyl p={[x, 0.8, 1.065]} rTop={0.055} h={0.012} seg={16} mat={GLASS} rot={[Math.PI / 2, 0, 0]} />
        </group>
      ))}

      {/* Narrow-beam antenna on the front left: a drive column with a long helical rod aimed at Earth. */}
      <Cyl p={[0.42, 1.21, 0.9]} rTop={0.1} h={0.36} seg={16} mat={PAINT} />
      <Cyl p={[0.42, 1.44, 0.9]} rTop={0.14} h={0.12} seg={16} mat={PAINT} />
      <Strut a={[0.42, 1.48, 0.9]} b={[0.62, 2.1, 1.16]} r={0.055} mat={CREAM} />
      <Strut a={[0.62, 2.1, 1.16]} b={[0.66, 2.22, 1.21]} r={0.062} mat={DARK} />

      {/* Conical spiral antenna on a mast at the front right, white with dark turns. */}
      <Strut a={[-0.62, 1.05, 0.76]} b={[-0.72, 1.5, 0.9]} r={0.02} mat={FRAME} />
      <mesh position={[-0.72, 1.66, 0.9]} castShadow>
        <coneGeometry args={[0.09, 0.32, 16]} />
        <meshStandardMaterial {...PAINT} />
      </mesh>
      <Cyl p={[-0.72, 1.59, 0.9]} rTop={0.06} rBot={0.077} h={0.06} seg={16} mat={DARK} />
      <Cyl p={[-0.72, 1.71, 0.9]} rTop={0.026} rBot={0.043} h={0.06} seg={16} mat={DARK} />

      {/* French laser retroreflector held out in front, tilted up, its cover folded back. */}
      <Strut a={[-0.3, 0.98, 0.98]} b={[-0.3, 1.0, 1.24]} r={0.018} mat={FRAME} />
      <Strut a={[0, 0.98, 1.02]} b={[0, 1.0, 1.24]} r={0.018} mat={FRAME} />
      <group position={[-0.15, 1.04, 1.32]} rotation={[0.55, 0, 0]}>
        <Box p={[0, 0, 0]} s={[0.46, 0.07, 0.22]} mat={FRAME} />
        <Box p={[0, 0.038, 0]} s={[0.42, 0.008, 0.18]} mat={GLASS} />
        <Box p={[0, 0.1, -0.15]} s={[0.46, 0.012, 0.2]} mat={PAINT} rot={[1.2, 0, 0]} />
      </group>

      {/* Side-looking panoramic cameras poking out of the tub wall. */}
      {[-1, 1].map((side) => (
        <group key={side}>
          <Cyl p={[side * 0.9, 0.87, -0.2]} rTop={0.06} h={0.24} seg={12} mat={TUB} rot={[0, 0, Math.PI / 2]} />
          <Cyl p={[side * 1.025, 0.87, -0.2]} rTop={0.05} h={0.012} seg={12} mat={GLASS} rot={[0, 0, Math.PI / 2]} />
          {/* Rod antenna swept back from the side. */}
          <Strut a={[side * 0.86, 0.86, -0.45]} b={[side * 1.3, 0.66, -1.25]} r={0.012} mat={FRAME} />
        </group>
      ))}

      {/* Polonium heater that kept the rover warm through the lunar night, on the back wall. */}
      <Cyl p={[0, 0.72, -0.96]} rTop={0.2} h={0.34} seg={16} mat={DARK} />
      <Cyl p={[0, 0.9, -0.96]} rTop={0.16} h={0.03} seg={16} mat={FRAME} />

      {/* The ninth wheel, trailing on an arm, measured the distance travelled. */}
      <Strut a={[0.04, 0.44, -0.9]} b={[0.04, 0.115, -1.32]} r={0.02} mat={FRAME} />
      <group position={[0, 0.125, -1.32]} rotation={[0, 0, Math.PI / 2]}>
        <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
          <torusGeometry args={[0.115, 0.01, 6, 20]} />
          <meshStandardMaterial {...WIRE} />
        </mesh>
        <Lathe pts={SMALL_SPOKES} seg={12} mat={WIRE} wire />
      </group>
    </group>
  )
}

/** One folding ramp track from the deck down to the ground. `dir` is +1 (front) or -1 (back). */
function Ramp({ x, dir }: { x: number; dir: number }) {
  const run = 2.0
  const drop = 0.985
  const len = Math.hypot(run, drop)
  const tilt = Math.atan2(drop, run)
  return (
    <group position={[x, 1.0 - drop / 2 + 0.02, dir * (1.05 + run / 2)]} rotation={[dir * tilt, 0, 0]}>
      <Box p={[0, 0, 0]} s={[0.3, 0.016, len]} mat={FRAME} />
      {/* The tracks were open lattice; a wire grid over the plate gives the ladder look cheaply. */}
      <mesh position={[0, 0.012, 0]}>
        <boxGeometry args={[0.3, 0.004, len, 1, 1, 10]} />
        <meshStandardMaterial {...PAINT} wireframe />
      </mesh>
      {[-1, 1].map((k) => (
        <Box key={k} p={[k * 0.16, 0.02, 0]} s={[0.022, 0.06, len]} mat={METAL} />
      ))}
      {/* The joint where the ramp folded in two for the flight. */}
      <Box p={[0, 0.012, 0]} s={[0.36, 0.03, 0.05]} mat={METAL} />
    </group>
  )
}

function Platform() {
  const corners: [number, number][] = [[1, 1], [1, -1], [-1, -1], [-1, 1]]
  return (
    <group>
      {/* Four big propellant spheres round a central instrument section, engine underneath. */}
      {corners.map(([sx, sz]) => (
        <mesh key={`${sx}${sz}`} position={[sx * 0.52, 0.6, sz * 0.52]} castShadow receiveShadow>
          <sphereGeometry args={[0.43, 24, 16]} />
          <meshStandardMaterial {...TANK} />
        </mesh>
      ))}
      <Cyl p={[0, 0.62, 0]} rTop={0.46} h={0.62} seg={20} mat={FRAME} />
      <Cyl p={[0, 0.2, 0]} rTop={0.13} rBot={0.25} h={0.22} seg={16} mat={DARK} />

      {/* The deck the rover rode on: two wheel tracks joined by cross beams. */}
      {[-0.8, 0.8].map((x) => (
        <Box key={x} p={[x, 1.0, 0]} s={[0.3, 0.05, 2.1]} mat={FRAME} />
      ))}
      {[-0.75, 0, 0.75].map((z) => (
        <Box key={z} p={[0, 0.99, z]} s={[1.5, 0.05, 0.08]} mat={METAL} />
      ))}

      {/* A leg at each corner with a small tank at its root. */}
      {corners.map(([sx, sz]) => (
        <group key={`${sx}${sz}`}>
          <mesh position={[sx * 1.0, 0.64, sz * 1.0]} castShadow>
            <sphereGeometry args={[0.17, 16, 12]} />
            <meshStandardMaterial {...TANK} />
          </mesh>
          <Strut a={[sx * 0.9, 0.95, sz * 0.9]} b={[sx * 1.45, 0.06, sz * 1.45]} r={0.035} mat={METAL} />
          <Strut a={[sx * 0.8, 0.32, sz * 0.3]} b={[sx * 1.45, 0.06, sz * 1.45]} r={0.022} mat={METAL} />
          <Strut a={[sx * 0.3, 0.32, sz * 0.8]} b={[sx * 1.45, 0.06, sz * 1.45]} r={0.022} mat={METAL} />
          <Cyl p={[sx * 1.45, 0.02, sz * 1.45]} rTop={0.17} rBot={0.21} h={0.04} seg={18} mat={METAL} />
        </group>
      ))}

      {/* Two pairs of ramps, one pair at each end, so the rover could leave either way. */}
      {[-1, 1].flatMap((dir) => [-0.8, 0.8].map((x) => <Ramp key={`${dir}${x}`} x={x} dir={dir} />))}
    </group>
  )
}

export function Lunokhod() {
  return (
    <group scale={1 / HEIGHT}>
      <group position={[0, 0, -CENTRE_Z]}>
        <Platform />
        <group position={[0, 0, ROVER_Z]}>
          <Rover />
        </group>
      </group>
    </group>
  )
}
