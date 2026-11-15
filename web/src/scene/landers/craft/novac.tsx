// Nova-C (Intuitive Machines).
// Drawn 1 unit tall with its feet at y = 0 (see ../parts).
import { Ball, Box, CELLS, Cyl, DARK, FOIL, Legs, METAL, Strut } from '../parts'

export function NovaC() {
  return (
    <group>
      <Cyl p={[0, 0.58, 0]} rTop={0.19} h={0.62} seg={6} mat={FOIL} />
      <Cyl p={[0, 0.9, 0]} rTop={0.2} h={0.02} seg={6} mat={CELLS} />
      <Cyl p={[0, 0.2, 0]} rTop={0.06} rBot={0.12} h={0.14} mat={DARK} />
      <Legs count={6} top={0.5} low={0.3} foot={0.46} bodyR={0.18} start={Math.PI / 6} r={0.012} />
      {[0, 2, 4].map((k) => {
        const a = (k / 6) * Math.PI * 2
        return <Box key={k} p={[0.17 * Math.cos(a), 0.6, 0.17 * Math.sin(a)]} s={[0.012, 0.44, 0.17]} mat={CELLS} rot={[0, -a, 0]} />
      })}
      <Ball p={[0.07, 0.95, 0]} r={0.045} mat={METAL} />
      <Strut a={[-0.06, 0.9, 0.04]} b={[-0.06, 1.0, 0.04]} r={0.007} />
    </group>
  )
}
