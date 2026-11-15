// Surveyor (1966 to 1968).
// Drawn 1 unit tall with its feet at y = 0 (see ../parts).
import { Ball, Box, CELLS, Cyl, DARK, FOIL, Legs, PAINT, Strut } from '../parts'

export function Surveyor() {
  const ring = (y: number, r: number) =>
    [0, 1, 2].map((k) => {
      const a = (k / 3) * Math.PI * 2
      const b = ((k + 1) / 3) * Math.PI * 2
      return <Strut key={`${y}${k}`} a={[r * Math.cos(a), y, r * Math.sin(a)]} b={[r * Math.cos(b), y, r * Math.sin(b)]} />
    })
  return (
    <group>
      {ring(0.22, 0.26)}
      {ring(0.38, 0.2)}
      {[0, 1, 2].map((k) => {
        const a = (k / 3) * Math.PI * 2
        return <Strut key={k} a={[0.26 * Math.cos(a), 0.22, 0.26 * Math.sin(a)]} b={[0.2 * Math.cos(a), 0.38, 0.2 * Math.sin(a)]} />
      })}
      <Legs count={3} top={0.36} low={0.22} foot={0.5} bodyR={0.24} />
      <Box p={[0.1, 0.3, 0.06]} s={[0.14, 0.14, 0.12]} mat={PAINT} />
      <Box p={[-0.1, 0.3, -0.06]} s={[0.12, 0.14, 0.14]} mat={PAINT} />
      <Ball p={[0, 0.27, 0]} r={0.07} mat={FOIL} />
      <Cyl p={[0, 0.14, 0]} rTop={0.03} rBot={0.06} h={0.1} mat={DARK} />
      <Strut a={[0, 0.38, 0]} b={[0, 0.86, 0]} r={0.014} />
      <Box p={[-0.17, 0.9, 0]} s={[0.3, 0.012, 0.26]} mat={CELLS} rot={[0, 0, 0.5]} />
      <Box p={[0.17, 0.88, 0]} s={[0.26, 0.012, 0.26]} mat={PAINT} rot={[0, 0, -0.35]} />
      <Strut a={[0, 0.86, 0]} b={[-0.17, 0.9, 0]} r={0.008} />
      <Strut a={[0, 0.86, 0]} b={[0.17, 0.88, 0]} r={0.008} />
    </group>
  )
}
