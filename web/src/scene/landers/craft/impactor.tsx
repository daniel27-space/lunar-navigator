// A spent rocket stage (the LCROSS Centaur).
// Drawn 1 unit tall with its feet at y = 0 (see ../parts).
import { Cyl, DARK, METAL, PAINT } from '../parts'

export function Impactor() {
  // A spent rocket stage, shown lying at an angle; 1 unit long.
  return (
    <group position={[0, 0.3, 0]} rotation={[0, 0.4, 1.15]}>
      <Cyl p={[0, 0, 0]} rTop={0.15} h={0.86} seg={32} mat={PAINT} />
      <Cyl p={[0, -0.47, 0]} rTop={0.07} rBot={0.12} h={0.1} mat={DARK} />
      <Cyl p={[0, 0.44, 0]} rTop={0.11} rBot={0.15} h={0.04} mat={METAL} />
      <Cyl p={[0, 0.1, 0]} rTop={0.153} h={0.03} seg={32} mat={METAL} />
    </group>
  )
}
