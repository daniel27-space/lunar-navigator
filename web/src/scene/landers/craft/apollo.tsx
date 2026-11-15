// The Apollo Lunar Module stand-in, used only if the real model file cannot be loaded.
// Drawn 1 unit tall with its feet at y = 0 (see ../parts).
import { Ball, Box, Cyl, DARK, Dish, FOIL, Legs, METAL, Strut } from '../parts'

export function ApolloLM() {
  const q = Math.PI / 8
  return (
    <group>
      <Cyl p={[0, 0.3, 0]} rTop={0.3} h={0.2} seg={8} mat={FOIL} rot={[0, q, 0]} />
      <Cyl p={[0, 0.15, 0]} rTop={0.05} rBot={0.11} h={0.12} mat={DARK} />
      <Legs count={4} top={0.38} low={0.22} foot={0.56} bodyR={0.29} r={0.016} />
      {/* ascent stage: cabin, side tanks, docking tunnel, antennas */}
      <Box p={[0, 0.55, -0.02]} s={[0.3, 0.26, 0.26]} mat={METAL} />
      <Cyl p={[0, 0.55, 0.13]} rTop={0.14} h={0.14} mat={METAL} rot={[Math.PI / 2, 0, 0]} />
      <Ball p={[0.2, 0.52, -0.03]} r={0.095} mat={FOIL} />
      <Ball p={[-0.2, 0.52, -0.03]} r={0.095} mat={FOIL} />
      <Cyl p={[0, 0.71, -0.03]} rTop={0.07} h={0.06} mat={DARK} />
      <Strut a={[0.1, 0.68, -0.1]} b={[0.16, 0.92, -0.14]} r={0.008} />
      <Dish p={[0.16, 0.95, -0.14]} r={0.08} rot={[0.5, 0, -0.4]} />
      <Strut a={[-0.1, 0.68, 0.06]} b={[-0.1, 0.84, 0.06]} r={0.006} />
    </group>
  )
}
