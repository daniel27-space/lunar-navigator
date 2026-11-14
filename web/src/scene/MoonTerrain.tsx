// The south pole surface. Geometry is built on the real sphere (body-fixed km), so the Sun's
// body-fixed direction lights it directly. Shadows are ray-marched through the elevation
// texture in the fragment shader, including the curvature of the Moon.
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useThree, type ThreeEvent } from '@react-three/fiber'
import { latLonOf, R_KM, spDirection, type Vec3 } from '../lib/geo'
import { sampleXY, type Level, type Terrain } from '../lib/terrain'
import type { LayerMode } from '../store'

const GRID = 768

function buildGeometry(t: Terrain): THREE.BufferGeometry {
  const l0 = t.levels[0]
  const n = GRID + 1
  const pos = new Float32Array(n * n * 3)
  const xy = new Float32Array(n * n * 2)
  const valid = new Uint8Array(n * n)
  const rKm = t.radiusM / 1000
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i
      const x = l0.xMin + ((l0.xMax - l0.xMin) * i) / GRID
      const y = l0.yMax - ((l0.yMax - l0.yMin) * j) / GRID
      // Pull edge vertices half a pixel inward so they sample real data.
      const xs = Math.min(Math.max(x, l0.xMin + l0.pixel), l0.xMax - l0.pixel)
      const ys = Math.min(Math.max(y, l0.yMin + l0.pixel), l0.yMax - l0.pixel)
      const h = sampleXY(t, xs, ys)
      valid[k] = Number.isNaN(h) ? 0 : 1
      const d = spDirection(x, y, t.radiusM)
      const r = rKm + (Number.isNaN(h) ? 0 : h / 1000)
      pos[k * 3] = d[0] * r
      pos[k * 3 + 1] = d[1] * r
      pos[k * 3 + 2] = d[2] * r
      xy[k * 2] = x / 1000
      xy[k * 2 + 1] = y / 1000
    }
  }
  const index: number[] = []
  for (let j = 0; j < GRID; j++) {
    for (let i = 0; i < GRID; i++) {
      const a = j * n + i
      const b = a + 1
      const c = a + n
      const d = c + 1
      if (!(valid[a] && valid[b] && valid[c] && valid[d])) continue
      index.push(a, c, b, b, c, d)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('aXY', new THREE.BufferAttribute(xy, 2))
  g.setIndex(index)
  g.computeBoundingSphere()
  return g
}

function heightTexture(l: Level, linear: boolean): THREE.DataTexture {
  // NaN would poison filtering; store a very low value and let the shader treat it as no data.
  const data = new Float32Array(l.h.length)
  for (let i = 0; i < data.length; i++) data[i] = Number.isNaN(l.h[i]) ? -20000 : l.h[i]
  const tex = new THREE.DataTexture(data, l.size, l.size, THREE.RedFormat, THREE.FloatType)
  tex.minFilter = tex.magFilter = linear ? THREE.LinearFilter : THREE.NearestFilter
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
  tex.needsUpdate = true
  return tex
}

const extentKm = (l: Level) =>
  new THREE.Vector4(l.xMin / 1000, l.yMin / 1000, l.xMax / 1000, l.yMax / 1000)

const vertexShader = /* glsl */ `
attribute vec2 aXY;
varying vec2 vXY;
void main() {
  vXY = aXY;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`

const fragmentShader = /* glsl */ `
precision highp float;
uniform sampler2D uH0;
uniform sampler2D uH1;
uniform vec4 uExt0;   // xmin, ymin, xmax, ymax in km
uniform vec4 uExt1;
uniform float uPix0;  // km
uniform float uPix1;
uniform float uR;     // km
uniform vec3 uSun;    // unit, body-fixed, towards the Sun
uniform float uSunRad; // angular radius, radians
uniform int uMode;    // 0 natural, 1 elevation, 2 slope
varying vec2 vXY;

vec2 uvOf(vec2 xy, vec4 ext) {
  return vec2((xy.x - ext.x) / (ext.z - ext.x), (ext.w - xy.y) / (ext.w - ext.y));
}
bool inside(vec2 uv, float m) {
  return uv.x > m && uv.y > m && uv.x < 1.0 - m && uv.y < 1.0 - m;
}
// Elevation in km above the reference sphere.
float hAt(vec2 xy) {
  vec2 uv1 = uvOf(xy, uExt1);
  if (inside(uv1, 0.001)) {
    float h1 = texture2D(uH1, uv1).r;
    if (h1 > -15000.0) return h1 * 0.001;
  }
  return max(texture2D(uH0, uvOf(xy, uExt0)).r, -10000.0) * 0.001;
}
// South polar stereographic <-> body-fixed, written without trig so it stays exact at the pole.
vec3 dirOf(vec2 xy) {
  float rho2 = dot(xy, xy) / (4.0 * uR * uR);
  float k = 1.0 / (1.0 + rho2);
  return vec3(xy.y / uR * k, xy.x / uR * k, -(1.0 - rho2) * k);
}
vec2 xyOf(vec3 p) {
  vec3 d = normalize(p);
  return 2.0 * uR / (1.0 - d.z) * vec2(d.y, d.x);
}
vec3 surf(vec2 xy) { return dirOf(xy) * (uR + hAt(xy)); }

vec3 elevationRamp(float t) {
  // dark blue -> teal -> sand -> white, perceptually ordered
  vec3 c0 = vec3(0.09, 0.11, 0.33);
  vec3 c1 = vec3(0.10, 0.45, 0.55);
  vec3 c2 = vec3(0.78, 0.70, 0.45);
  vec3 c3 = vec3(0.98, 0.97, 0.94);
  if (t < 0.33) return mix(c0, c1, t / 0.33);
  if (t < 0.66) return mix(c1, c2, (t - 0.33) / 0.33);
  return mix(c2, c3, (t - 0.66) / 0.34);
}
vec3 slopeRamp(float deg) {
  // green (landable) -> amber -> red
  if (deg < 8.0) return mix(vec3(0.10, 0.55, 0.30), vec3(0.55, 0.75, 0.25), deg / 8.0);
  if (deg < 15.0) return mix(vec3(0.55, 0.75, 0.25), vec3(0.95, 0.70, 0.15), (deg - 8.0) / 7.0);
  return mix(vec3(0.95, 0.70, 0.15), vec3(0.75, 0.12, 0.10), clamp((deg - 15.0) / 15.0, 0.0, 1.0));
}

void main() {
  vec2 uv0 = uvOf(vXY, uExt0);
  if (!inside(uv0, 0.0)) discard;
  bool fine = inside(uvOf(vXY, uExt1), 0.002);
  float e = fine ? uPix1 : uPix0;

  vec3 p0 = surf(vXY);
  vec3 up = normalize(p0);
  vec3 n = normalize(cross(surf(vXY + vec2(e, 0.0)) - surf(vXY - vec2(e, 0.0)),
                           surf(vXY + vec2(0.0, e)) - surf(vXY - vec2(0.0, e))));
  if (dot(n, up) < 0.0) n = -n;

  // March towards the Sun. minA is the smallest angular clearance (radians) between the ray
  // to the Sun's centre and the terrain; the disc is fully visible above +uSunRad and fully
  // hidden below -uSunRad.
  float minA = 1.0;
  float t = max(e * 0.75, 0.02);
  vec3 start = p0 + up * 0.003;
  for (int i = 0; i < 120; i++) {
    vec3 q = start + uSun * t;
    float rq = length(q);
    if (rq - uR > 11.0) break;
    vec2 xy = xyOf(q);
    if (!inside(uvOf(xy, uExt0), 0.0)) break;
    minA = min(minA, (rq - (uR + hAt(xy))) / t);
    if (minA < -uSunRad) break;
    t *= 1.08;
  }
  float lit = clamp(minA / uSunRad * 0.5 + 0.5, 0.0, 1.0);
  float direct = max(dot(n, uSun), 0.0) * lit;

  vec3 col;
  if (uMode == 0) {
    float I = 0.6 * direct;
    col = vec3(1.0 - exp(-I * 9.0)) * vec3(1.0, 0.985, 0.96) + vec3(0.012, 0.013, 0.016);
  } else {
    float relief = 0.45 + 0.55 * (1.0 - exp(-direct * 6.0));
    float lightMask = mix(0.55, 1.0, lit);
    vec3 base = uMode == 1
      ? elevationRamp(clamp((hAt(vXY) + 4.5) / 9.0, 0.0, 1.0))
      : slopeRamp(degrees(acos(clamp(dot(n, up), -1.0, 1.0))));
    col = base * mix(lightMask, relief, 0.5);
  }
  gl_FragColor = vec4(pow(col, vec3(1.0 / 2.2)), 1.0);
}`

const MODE: Record<LayerMode, number> = { natural: 0, elevation: 1, slope: 2 }

interface Props {
  terrain: Terrain
  /** unit vector towards the Sun, body-fixed */
  sunDir: Vec3
  /** Sun angular radius in radians */
  sunRad: number
  layer: LayerMode
  onPick: (lat: number, lon: number) => void
}

export function MoonTerrain({ terrain, sunDir, sunRad, layer, onPick }: Props) {
  const gl = useThree((s) => s.gl)
  const geometry = useMemo(() => buildGeometry(terrain), [terrain])
  const material = useMemo(() => {
    const linear = !!gl.getContext().getExtension('OES_texture_float_linear')
    const [l0, l1] = [terrain.levels[0], terrain.levels[terrain.levels.length - 1]]
    return new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uH0: { value: heightTexture(l0, linear) },
        uH1: { value: heightTexture(l1, linear) },
        uExt0: { value: extentKm(l0) },
        uExt1: { value: extentKm(l1) },
        uPix0: { value: l0.pixel / 1000 },
        uPix1: { value: l1.pixel / 1000 },
        uR: { value: terrain.radiusM / 1000 },
        uSun: { value: new THREE.Vector3(1, 0, 0) },
        uSunRad: { value: 0.00465 },
        uMode: { value: 0 },
      },
    })
  }, [terrain, gl])

  useEffect(
    () => () => {
      geometry.dispose()
      material.uniforms.uH0.value.dispose()
      material.uniforms.uH1.value.dispose()
      material.dispose()
    },
    [geometry, material],
  )

  material.uniforms.uSun.value.set(sunDir[0], sunDir[1], sunDir[2])
  material.uniforms.uSunRad.value = sunRad
  material.uniforms.uMode.value = MODE[layer]

  const handleClick = (ev: ThreeEvent<MouseEvent>) => {
    if (ev.delta > 4) return // it was a drag, not a click
    ev.stopPropagation()
    const ll = latLonOf([ev.point.x, ev.point.y, ev.point.z])
    onPick(ll.lat, ll.lon)
  }

  return (
    <>
      <mesh geometry={geometry} material={material} onClick={handleClick} />
      {/* The rest of the Moon, below the lowest polar terrain, so the patch has a body. */}
      <mesh>
        <sphereGeometry args={[R_KM - 9.5, 96, 64]} />
        <meshBasicMaterial color="#0b0c0f" />
      </mesh>
    </>
  )
}
