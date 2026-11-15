// The rest of the Moon: a sphere whose surface follows the whole-Moon LOLA elevation map
// (true heights, slope lighting, no cast shadows), lit by the true Sun direction. The square
// covered by each detailed terrain (the south-pole tiles, any site patch on screen) is cut out
// so the two never overlap; the terrain fades into this same shading at its edge (shading.ts).
import { useMemo } from 'react'
import * as THREE from 'three'
import { overMarker } from './markers'
import { sphereHit } from './pickRay'
import { frameProject } from '../lib/terrain'
import type { ThreeEvent } from '@react-three/fiber'
import { latLonOf, R_KM, type Vec3 } from '../lib/geo'
import {
  applyCuts,
  applyGlobeMap,
  CUT_GLSL,
  CUT_INSET_KM,
  cutUniforms,
  exposureFor,
  SHADING_GLSL,
  shadingUniforms,
  type Cut,
  type GlobeMap,
  type GlobeRelief,
} from './shading'

const vertexShader = /* glsl */ `
uniform float uR;
varying vec3 vP;
${SHADING_GLSL}
void main() {
  vec3 d = normalize(position);
  vP = d;
  float h = uHasDem > 0.5 ? texture2D(uDem, lonLatUv(d)).r : 0.0;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(d * (uR + h), 1.0);
}`

const fragmentShader = /* glsl */ `
precision highp float;
uniform vec3 uSun;
uniform float uR;
varying vec3 vP;
${SHADING_GLSL}
${CUT_GLSL}
void main() {
  vec3 d = normalize(vP);
  if (inCut(d, uR)) discard;
  vec3 col = tone(albedoAt(d), globeDirect(d, uSun));
  gl_FragColor = vec4(pow(col, vec3(1.0 / 2.2)), 1.0);
}`

interface Props {
  sunDir: Vec3
  cuts: Cut[]
  map: GlobeMap | null
  relief: GlobeRelief | null
  /** sphere segments around and from pole to pole */
  segments: [number, number]
  onPick: (lat: number, lon: number) => void
}

export function Globe({ sunDir, cuts, map, relief, segments, onPick }: Props) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
          ...shadingUniforms(),
          uSun: { value: new THREE.Vector3(1, 0, 0) },
          uR: { value: R_KM },
          ...cutUniforms(),
        },
      }),
    [],
  )

  applyGlobeMap(material.uniforms as never, map, relief)
  material.uniforms.uSun.value.set(sunDir[0], sunDir[1], sunDir[2])
  applyCuts(material.uniforms as never, cuts)

  // On the CPU the globe is a plain sphere (its relief is added when it is drawn), so the
  // pointer's ray is tested against the sphere itself, not against its triangles. Where a
  // detailed terrain covers the ground the globe is not drawn, so it is not hit there either.
  const raycast = useMemo(
    () =>
      function (this: THREE.Mesh, rc: THREE.Raycaster, hits: THREE.Intersection[]) {
        const t = sphereHit(rc.ray.origin, rc.ray.direction, R_KM)
        if (t === null || t < rc.near || t > rc.far) return
        const point = rc.ray.at(t, new THREE.Vector3())
        const u = point.clone().normalize()
        for (const c of cuts) {
          const xy = frameProject(c.frame, u.x, u.y, u.z, R_KM)
          const half = Math.max(c.halfKm - CUT_INSET_KM, 0)
          if (xy && Math.abs(xy[0]) <= half && Math.abs(xy[1]) <= half) return
        }
        hits.push({ distance: t, point, object: this })
      },
    [cuts],
  )

  const handleClick = (ev: ThreeEvent<MouseEvent>) => {
    if (ev.delta > 4) return
    if (overMarker(ev.intersections)) return // the click belongs to a marker drawn over this ground
    ev.stopPropagation()
    const ll = latLonOf([ev.point.x, ev.point.y, ev.point.z])
    onPick(ll.lat, ll.lon)
  }

  return (
    // Exposure is set at draw time, so the globe and the terrain always use the same camera position.
    <mesh
      material={material}
      raycast={raycast}
      onClick={handleClick}
      frustumCulled={false}
      onBeforeRender={(_r, _s, camera) => {
        material.uniforms.uExpo.value = exposureFor(camera.position, material.uniforms.uSun.value)
      }}
    >
      <sphereGeometry args={[R_KM, segments[0], segments[1]]} />
    </mesh>
  )
}
