// The Soviet Luna landers.
// Drawn 1 unit tall with its feet at y = 0 (see ../parts).
import { Ball, Cyl, DARK, FOIL, Legs, METAL, PAINT, Strut } from '../parts'

export function LunaLander() {
  return (
    <group>
      <Cyl p={[0, 0.3, 0]} rTop={0.17} h={0.26} mat={METAL} />
      {[0, 1, 2, 3].map((k) => {
        const a = Math.PI / 4 + (k / 4) * Math.PI * 2
        return <Ball key={k} p={[0.24 * Math.cos(a), 0.3, 0.24 * Math.sin(a)]} r={0.12} mat={FOIL} />
      })}
      <Cyl p={[0, 0.13, 0]} rTop={0.05} rBot={0.1} h={0.1} mat={DARK} />
      <Legs count={4} top={0.34} low={0.2} foot={0.52} bodyR={0.3} />
      {/* ascent rocket with the return capsule on top */}
      <Cyl p={[0, 0.56, 0]} rTop={0.1} rBot={0.13} h={0.26} mat={PAINT} />
      {[0, 1, 2].map((k) => {
        const a = (k / 3) * Math.PI * 2
        return <Ball key={k} p={[0.13 * Math.cos(a), 0.52, 0.13 * Math.sin(a)]} r={0.07} mat={METAL} />
      })}
      <Cyl p={[0, 0.76, 0]} rTop={0.07} h={0.14} mat={METAL} />
      <Ball p={[0, 0.91, 0]} r={0.09} mat={DARK} />
      <Strut a={[0.2, 0.4, 0.1]} b={[0.46, 0.5, 0.2]} r={0.008} />
    </group>
  )
}

export function Luna9() {
  return (
    <group>
      <Cyl p={[0, 0.3, 0]} rTop={0.17} h={0.26} mat={METAL} />
      {[0, 1, 2, 3].map((k) => {
        const a = Math.PI / 4 + (k / 4) * Math.PI * 2
        return <Ball key={k} p={[0.24 * Math.cos(a), 0.3, 0.24 * Math.sin(a)]} r={0.12} mat={FOIL} />
      })}
      <Cyl p={[0, 0.13, 0]} rTop={0.05} rBot={0.1} h={0.1} mat={DARK} />
      <Legs count={4} top={0.34} low={0.2} foot={0.52} bodyR={0.3} />
      {/* ascent rocket with the return capsule on top */}
      <Cyl p={[0, 0.56, 0]} rTop={0.1} rBot={0.13} h={0.26} mat={PAINT} />
      {[0, 1, 2].map((k) => {
        const a = (k / 3) * Math.PI * 2
        return <Ball key={k} p={[0.13 * Math.cos(a), 0.52, 0.13 * Math.sin(a)]} r={0.07} mat={METAL} />
      })}
      <Cyl p={[0, 0.76, 0]} rTop={0.07} h={0.14} mat={METAL} />
      <Ball p={[0, 0.91, 0]} r={0.09} mat={DARK} />
      <Strut a={[0.2, 0.4, 0.1]} b={[0.46, 0.5, 0.2]} r={0.008} />
    </group>
  )
}
