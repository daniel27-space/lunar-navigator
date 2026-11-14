// The Sun and the Earth in the main view, in the directions they really are from the Moon at
// the selected time. Directions are real; distances and sizes are not: the Earth is 220 Moon
// radii away and the Sun 86,000, far outside what the view can hold, so both are drawn much
// nearer and enlarged so they can be seen.
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { unit, type Vec3 } from '../lib/geo'
import { EARTH_FRAGMENT, EARTH_VERTEX, earthOrientation, earthTexture, subLunarLonDeg } from './landers/earth'

/** Where the two are drawn, km from the Moon's centre (the camera's far limit is 30,000 km). */
export const EARTH_AT_KM = 13000
export const SUN_AT_KM = 19000
/** Earth's real radius seen from the Moon is about 0.95 degrees; drawn at twice that. */
const EARTH_RADIUS_KM = EARTH_AT_KM * Math.tan((0.95 * 2 * Math.PI) / 180)
/** The Sun's real radius is 0.27 degrees; its disc is drawn at three times that, plus a glow. */
const SUN_DISC_KM = SUN_AT_KM * Math.tan((0.27 * 3 * Math.PI) / 180)

function glowTexture(): THREE.Texture {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128)
  grad.addColorStop(0, 'rgba(255,252,238,1)')
  grad.addColorStop(0.09, 'rgba(255,250,228,1)')
  grad.addColorStop(0.13, 'rgba(255,236,190,0.55)')
  grad.addColorStop(0.4, 'rgba(255,220,150,0.12)')
  grad.addColorStop(1, 'rgba(255,210,130,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 256, 256)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

interface Props {
  /** Moon-centred vectors to the Sun and the Earth, body-fixed (any length) */
  sun: Vec3
  earth: Vec3
  tMs: number
}

export function SkyBodies({ sun, earth, tMs }: Props) {
  const sunDir = unit(sun)
  const earthDir = unit(earth)
  const earthMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: EARTH_VERTEX,
        fragmentShader: EARTH_FRAGMENT,
        uniforms: { uMap: { value: earthTexture() }, uSun: { value: new THREE.Vector3(1, 0, 0) } },
        toneMapped: false,
      }),
    [],
  )
  const glow = useMemo(glowTexture, [])
  useEffect(
    () => () => {
      earthMaterial.uniforms.uMap.value.dispose()
      earthMaterial.dispose()
      glow.dispose()
    },
    [earthMaterial, glow],
  )
  // Sunlight reaches the Earth from the same direction as it reaches the Moon, so the Earth's
  // phase follows from the Sun direction used everywhere else in the app.
  earthMaterial.uniforms.uSun.value.set(sunDir[0], sunDir[1], sunDir[2])
  const earthPos = new THREE.Vector3(earthDir[0], earthDir[1], earthDir[2]).multiplyScalar(EARTH_AT_KM)
  // The Earth's north is taken along the Moon's (they differ by up to about 25 degrees), and
  // the side of the Earth that really faces the Moon at this time is turned towards it.
  const earthTurn = earthOrientation(new THREE.Vector3(0, 0, 1), earthPos, subLunarLonDeg(tMs))
  return (
    <>
      <mesh position={earthPos} quaternion={earthTurn} material={earthMaterial} frustumCulled={false}>
        <sphereGeometry args={[EARTH_RADIUS_KM, 48, 32]} />
      </mesh>
      <sprite position={[sunDir[0] * SUN_AT_KM, sunDir[1] * SUN_AT_KM, sunDir[2] * SUN_AT_KM]} scale={[SUN_DISC_KM * 22, SUN_DISC_KM * 22, 1]}>
        <spriteMaterial map={glow} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </sprite>
    </>
  )
}
