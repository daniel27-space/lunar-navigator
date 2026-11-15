// Lunokhod on its Luna landing platform.
// Drawn 1 unit tall with its feet at y = 0 (see ../parts).
import { Ball, Box, CELLS, Cyl, DARK, Dish, FOIL, Legs, METAL, PAINT, Strut, Wheels } from '../parts'

export function Lunokhod() {
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
