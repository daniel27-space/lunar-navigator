// The Chang'e landers.
// Drawn 1 unit tall with its feet at y = 0 (see ../parts).
import { Box, CELLS, Cyl, DARK, Dish, FOIL, Legs, METAL, Strut, Wheels } from '../parts'

export function ChangELander() {
  return (
    <group>
      <Cyl p={[0, 0.42, 0]} rTop={0.27} h={0.3} seg={8} mat={FOIL} rot={[0, Math.PI / 8, 0]} />
      <Cyl p={[0, 0.22, 0]} rTop={0.05} rBot={0.1} h={0.12} mat={DARK} />
      <Legs count={4} top={0.46} low={0.3} foot={0.52} bodyR={0.26} start={Math.PI / 4} r={0.016} />
      <Box p={[0.44, 0.58, 0]} s={[0.36, 0.012, 0.3]} mat={CELLS} rot={[0, 0, 0.15]} />
      <Box p={[-0.44, 0.58, 0]} s={[0.36, 0.012, 0.3]} mat={CELLS} rot={[0, 0, -0.15]} />
      <Box p={[0, 0.6, 0]} s={[0.3, 0.06, 0.3]} mat={METAL} />
      <Strut a={[0.08, 0.62, -0.08]} b={[0.08, 0.92, -0.08]} r={0.01} />
      <Dish p={[0.08, 0.95, -0.08]} r={0.08} rot={[0.4, 0, 0.3]} />
      <Strut a={[-0.1, 0.62, 0.1]} b={[-0.1, 0.8, 0.1]} r={0.008} />
      <Box p={[-0.1, 0.82, 0.1]} s={[0.06, 0.04, 0.04]} mat={DARK} />
      {/* the small six-wheel rover beside it */}
      <group position={[0.2, 0, 0.72]} rotation={[0, 0.5, 0]}>
        <Wheels perSide={3} length={0.2} halfWidth={0.085} y={0.04} r={0.04} />
        <Box p={[0, 0.11, 0]} s={[0.13, 0.07, 0.2]} mat={FOIL} />
        <Box p={[0.14, 0.15, 0]} s={[0.16, 0.008, 0.16]} mat={CELLS} rot={[0, 0, 0.2]} />
        <Box p={[-0.14, 0.15, 0]} s={[0.16, 0.008, 0.16]} mat={CELLS} rot={[0, 0, -0.2]} />
        <Strut a={[0, 0.14, 0.07]} b={[0, 0.3, 0.07]} r={0.006} />
        <Box p={[0, 0.31, 0.07]} s={[0.05, 0.025, 0.025]} mat={DARK} />
      </group>
    </group>
  )
}

export function ChangE5() {
  return (
    <group>
      <Cyl p={[0, 0.42, 0]} rTop={0.27} h={0.3} seg={8} mat={FOIL} rot={[0, Math.PI / 8, 0]} />
      <Cyl p={[0, 0.22, 0]} rTop={0.05} rBot={0.1} h={0.12} mat={DARK} />
      <Legs count={4} top={0.46} low={0.3} foot={0.52} bodyR={0.26} start={Math.PI / 4} r={0.016} />
      <Box p={[0.44, 0.58, 0]} s={[0.36, 0.012, 0.3]} mat={CELLS} rot={[0, 0, 0.15]} />
      <Box p={[-0.44, 0.58, 0]} s={[0.36, 0.012, 0.3]} mat={CELLS} rot={[0, 0, -0.15]} />
      <Box p={[0, 0.6, 0]} s={[0.3, 0.06, 0.3]} mat={METAL} />
      <Strut a={[0.08, 0.62, -0.08]} b={[0.08, 0.92, -0.08]} r={0.01} />
      <Dish p={[0.08, 0.95, -0.08]} r={0.08} rot={[0.4, 0, 0.3]} />
      <Strut a={[-0.1, 0.62, 0.1]} b={[-0.1, 0.8, 0.1]} r={0.008} />
      <Box p={[-0.1, 0.82, 0.1]} s={[0.06, 0.04, 0.04]} mat={DARK} />
      {/* the small six-wheel rover beside it */}
      <group position={[0.2, 0, 0.72]} rotation={[0, 0.5, 0]}>
        <Wheels perSide={3} length={0.2} halfWidth={0.085} y={0.04} r={0.04} />
        <Box p={[0, 0.11, 0]} s={[0.13, 0.07, 0.2]} mat={FOIL} />
        <Box p={[0.14, 0.15, 0]} s={[0.16, 0.008, 0.16]} mat={CELLS} rot={[0, 0, 0.2]} />
        <Box p={[-0.14, 0.15, 0]} s={[0.16, 0.008, 0.16]} mat={CELLS} rot={[0, 0, -0.2]} />
        <Strut a={[0, 0.14, 0.07]} b={[0, 0.3, 0.07]} r={0.006} />
        <Box p={[0, 0.31, 0.07]} s={[0.05, 0.025, 0.025]} mat={DARK} />
      </group>
    </group>
  )
}
