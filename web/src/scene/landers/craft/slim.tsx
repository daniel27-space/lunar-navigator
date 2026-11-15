// SLIM (JAXA).
// Drawn 1 unit tall with its feet at y = 0 (see ../parts).
import { Ball, Box, CELLS, Cyl, DARK, Dish, FOIL, Legs, METAL, PAINT, Strut } from '../parts'

export function Slim() {
  return (
    <group>
      <Cyl p={[0, 0.48, 0]} rTop={0.3} h={0.36} seg={8} mat={FOIL} rot={[0, Math.PI / 8, 0]} />
      <Cyl p={[0, 0.24, 0]} rTop={0.05} rBot={0.1} h={0.12} mat={DARK} />
      <Legs count={4} top={0.5} low={0.34} foot={0.56} bodyR={0.29} start={Math.PI / 4} r={0.016} />
      <Cyl p={[0, 0.675, 0]} rTop={0.33} h={0.02} seg={8} mat={CELLS} rot={[0, Math.PI / 8, 0]} />
      <Box p={[0.12, 0.72, 0.1]} s={[0.1, 0.07, 0.1]} mat={PAINT} />
      <Ball p={[-0.14, 0.72, -0.08]} r={0.05} mat={METAL} />
      <Strut a={[-0.05, 0.68, 0.12]} b={[-0.05, 0.94, 0.12]} r={0.008} />
      <Dish p={[-0.05, 0.96, 0.12]} r={0.07} rot={[0.5, 0, 0.2]} />
    </group>
  )
}
