// The rest of the Moon: a sphere at the reference radius, lit by the true Sun direction.
// The square covered by the south-pole terrain tiles is cut out so the two never overlap.
import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import type { ThreeEvent } from '@react-three/fiber'
import { latLonOf, R_KM, type Vec3 } from '../lib/geo'

interface GlobeMeta {
  file: string
  lonLeftDeg: number
  credit: string
}

const vertexShader = /* glsl */ `
varying vec3 vP;
void main() {
  vP = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`

const fragmentShader = /* glsl */ `
precision highp float;
uniform sampler2D uMap;
uniform float uHasMap;
uniform float uLonLeft;   // radians, longitude at the left edge of the texture
uniform vec3 uSun;
uniform float uR;
uniform float uCut;       // km, half-size of the terrain square in stereographic x/y
varying vec3 vP;
const float PI = 3.141592653589793;
void main() {
  vec3 d = normalize(vP);
  if (d.z < 0.0) {
    vec2 xy = 2.0 * uR / (1.0 - d.z) * vec2(d.y, d.x);
    if (abs(xy.x) < uCut && abs(xy.y) < uCut) discard;
  }
  float lon = atan(d.y, d.x);
  float lat = asin(clamp(d.z, -1.0, 1.0));
  vec2 uv = vec2(fract((lon - uLonLeft) / (2.0 * PI)), lat / PI + 0.5);
  // The JPEG is sRGB-encoded; work in linear light.
  vec3 albedo = mix(vec3(0.15), pow(texture2D(uMap, uv).rgb, vec3(2.2)), uHasMap);
  float direct = max(dot(d, uSun), 0.0);
  vec3 col = albedo * (1.0 - exp(-direct * 2.2)) * 1.15 + albedo * 0.035;
  gl_FragColor = vec4(pow(col, vec3(1.0 / 2.2)), 1.0);
}`

interface Props {
  sunDir: Vec3
  /** half-size in km of the stereographic square the terrain tiles cover; 0 for no cut-out */
  cutKm: number
  dataBase: string
  onPick: (lat: number, lon: number) => void
}

export function Globe({ sunDir, cutKm, dataBase, onPick }: Props) {
  const [meta, setMeta] = useState<GlobeMeta | null>(null)
  useEffect(() => {
    fetch(`${dataBase}globe/globe.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('no globe texture'))))
      .then((j) =>
        setMeta({
          file: j.files?.color_4k ?? j.file,
          lonLeftDeg: j.lon_left_deg ?? -180,
          credit: j.credit ?? '',
        }),
      )
      .catch(() => setMeta(null)) // the globe still renders, in flat grey
  }, [dataBase])

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
          uMap: { value: null },
          uHasMap: { value: 0 },
          uLonLeft: { value: -Math.PI },
          uSun: { value: new THREE.Vector3(1, 0, 0) },
          uR: { value: R_KM },
          uCut: { value: 0 },
        },
      }),
    [],
  )

  useEffect(() => {
    if (!meta) return
    const tex = new THREE.TextureLoader().load(`${dataBase}globe/${meta.file}`, () => {
      material.uniforms.uMap.value = tex
      material.uniforms.uHasMap.value = 1
      material.uniforms.uLonLeft.value = (meta.lonLeftDeg * Math.PI) / 180
    })
    tex.colorSpace = THREE.NoColorSpace
    // No mipmaps: the longitude seam would otherwise show as a line.
    tex.generateMipmaps = false
    tex.minFilter = tex.magFilter = THREE.LinearFilter
    return () => tex.dispose()
  }, [meta, dataBase, material])

  material.uniforms.uSun.value.set(sunDir[0], sunDir[1], sunDir[2])
  // Cut slightly inside the tile edge so the terrain mesh always covers the hole.
  material.uniforms.uCut.value = Math.max(cutKm - 1.5, 0)

  const handleClick = (ev: ThreeEvent<MouseEvent>) => {
    if (ev.delta > 4) return
    ev.stopPropagation()
    const ll = latLonOf([ev.point.x, ev.point.y, ev.point.z])
    onPick(ll.lat, ll.lon)
  }

  return (
    <mesh material={material} onClick={handleClick}>
      <sphereGeometry args={[R_KM, 192, 96]} />
    </mesh>
  )
}
