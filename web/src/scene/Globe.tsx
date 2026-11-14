// The rest of the Moon: a sphere at the reference radius, lit by the true Sun direction, with
// relief from the whole-Moon LOLA elevation map (slope lighting only, no cast shadows).
// The square covered by the south-pole terrain tiles is cut out so the two never overlap;
// the terrain fades into this same shading at its edge (see shading.ts).
import { useMemo } from 'react'
import * as THREE from 'three'
import type { ThreeEvent } from '@react-three/fiber'
import { latLonOf, R_KM, type Vec3 } from '../lib/geo'
import { applyGlobeMap, exposureFor, SHADING_GLSL, shadingUniforms, type GlobeMap, type GlobeRelief } from './shading'

const vertexShader = /* glsl */ `
varying vec3 vP;
void main() {
  vP = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`

const fragmentShader = /* glsl */ `
precision highp float;
uniform vec3 uSun;
uniform float uR;
uniform float uCut;       // km, half-size of the terrain square in stereographic x/y
varying vec3 vP;
${SHADING_GLSL}
void main() {
  vec3 d = normalize(vP);
  if (d.z < 0.0) {
    vec2 xy = 2.0 * uR / (1.0 - d.z) * vec2(d.y, d.x);
    if (abs(xy.x) < uCut && abs(xy.y) < uCut) discard;
  }
  vec3 col = tone(albedoAt(d), globeDirect(d, uSun));
  gl_FragColor = vec4(pow(col, vec3(1.0 / 2.2)), 1.0);
}`

/** The globe's cut-out sits this far inside the tile edge, so the terrain mesh always covers the hole. */
export const CUT_INSET_KM = 1.5

interface Props {
  sunDir: Vec3
  /** half-size in km of the stereographic square the terrain tiles cover; 0 for no cut-out */
  cutKm: number
  map: GlobeMap | null
  relief: GlobeRelief | null
  onPick: (lat: number, lon: number) => void
}

export function Globe({ sunDir, cutKm, map, relief, onPick }: Props) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
          ...shadingUniforms(),
          uSun: { value: new THREE.Vector3(1, 0, 0) },
          uR: { value: R_KM },
          uCut: { value: 0 },
        },
      }),
    [],
  )

  applyGlobeMap(material.uniforms as never, map, relief)
  material.uniforms.uSun.value.set(sunDir[0], sunDir[1], sunDir[2])
  material.uniforms.uCut.value = Math.max(cutKm - CUT_INSET_KM, 0)

  const handleClick = (ev: ThreeEvent<MouseEvent>) => {
    if (ev.delta > 4) return
    ev.stopPropagation()
    const ll = latLonOf([ev.point.x, ev.point.y, ev.point.z])
    onPick(ll.lat, ll.lon)
  }

  return (
    // Exposure is set at draw time, so the globe and the terrain always use the same camera position.
    <mesh
      material={material}
      onClick={handleClick}
      onBeforeRender={(_r, _s, camera) => {
        material.uniforms.uExpo.value = exposureFor(camera.position)
      }}
    >
      <sphereGeometry args={[R_KM, 192, 96]} />
    </mesh>
  )
}
