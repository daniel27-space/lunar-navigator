// The south pole surface. Geometry is built on the real sphere (body-fixed km), so the Sun's
// body-fixed direction lights it directly. Shadows are ray-marched through the elevation
// texture in the fragment shader, including the curvature of the Moon.
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useThree, type ThreeEvent } from '@react-three/fiber'
import { latLonOf, spDirection, type Vec3 } from '../lib/geo'
import { sampleXY, type Level, type Terrain } from '../lib/terrain'
import type { LayerMode, SiteFilter } from '../store'
import { CUT_INSET_KM } from './Globe'
import { applyGlobeMap, exposureFor, SHADING_GLSL, shadingUniforms, type GlobeMap, type GlobeRelief } from './shading'

const GRID = 768
/**
 * Width in km of the ring, just inside the 80S circle where the terrain data ends, over which
 * the terrain fades into the smooth globe. The fade is round, so the detailed area reads as a
 * polar cap rather than a square tile.
 */
const FADE_KM = 50

/** 0 inside, rising to 1 where the globe takes over. x, y and edge in km. */
function edgeFade(xKm: number, yKm: number, edgeKm: number): number {
  const m = Math.hypot(xKm, yKm)
  const k = Math.min(Math.max((m - (edgeKm - FADE_KM)) / (FADE_KM - 2), 0), 1)
  return k * k * (3 - 2 * k)
}

function buildGeometry(t: Terrain): THREE.BufferGeometry {
  const l0 = t.levels[0]
  const n = GRID + 1
  const pos = new Float32Array(n * n * 3)
  const xy = new Float32Array(n * n * 2)
  const valid = new Uint8Array(n * n)
  const rKm = t.radiusM / 1000
  const edgeKm = l0.xMax / 1000 - CUT_INSET_KM
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
      // Relief flattens to the reference sphere at the edge, so it joins the globe without a step.
      const r = rKm + (Number.isNaN(h) ? 0 : (h / 1000) * (1 - edgeFade(x / 1000, y / 1000, edgeKm)))
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
uniform int uMode;    // 0 natural, 1 elevation, 2 slope, 3 avg sunlight, 4 avg Earth, 5 PSR, 6 site filter
uniform sampler2D uOverlay; // 8-bit layer on the L0 grid
uniform sampler2D uSunAvg;
uniform sampler2D uEarthAvg;
uniform vec3 uCrit;    // max slope deg, min average sunlight 0..1, min average Earth view 0..1
uniform float uLitNow; // 1 = must be sunlit at the selected time
uniform float uEdge;   // km, where the globe takes over
uniform float uFade;   // km, width of the fade into the globe
varying vec2 vXY;
${SHADING_GLSL}

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

vec3 sunRamp(float f) {
  // never lit: near black; rarely lit: purple; often lit: orange to pale yellow
  vec3 c0 = vec3(0.03, 0.02, 0.08);
  vec3 c1 = vec3(0.35, 0.10, 0.45);
  vec3 c2 = vec3(0.90, 0.40, 0.20);
  vec3 c3 = vec3(1.00, 0.95, 0.60);
  if (f < 0.25) return mix(c0, c1, f / 0.25);
  if (f < 0.6) return mix(c1, c2, (f - 0.25) / 0.35);
  return mix(c2, c3, (f - 0.6) / 0.4);
}
vec3 earthRamp(float f) {
  vec3 c0 = vec3(0.04, 0.04, 0.06);
  vec3 c1 = vec3(0.10, 0.30, 0.60);
  vec3 c2 = vec3(0.75, 0.92, 1.00);
  return f < 0.5 ? mix(c0, c1, f / 0.5) : mix(c1, c2, (f - 0.5) / 0.5);
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

  vec3 albedo = albedoAt(up);
  vec3 col;
  float ov = texture2D(uOverlay, uv0).r;
  if (uMode == 0 || uMode == 5) {
    col = tone(albedo, direct);
    if (uMode == 5 && ov > 0.5) col = mix(col, vec3(0.05, 0.42, 0.85), 0.75);
  } else if (uMode == 3 || uMode == 4) {
    float relief = 0.6 + 0.4 * (1.0 - exp(-direct * 6.0));
    float f = clamp(ov * 255.0 / 250.0, 0.0, 1.0);
    vec3 base = uMode == 3 ? sunRamp(f) : earthRamp(f);
    col = ov > 0.99 ? vec3(0.05) : base * relief;
  } else if (uMode == 6) {
    // Site filter: green where every enabled constraint is met.
    float slopeDeg = degrees(acos(clamp(dot(n, up), -1.0, 1.0)));
    float sa = texture2D(uSunAvg, uv0).r * 255.0 / 250.0;
    float ea = texture2D(uEarthAvg, uv0).r * 255.0 / 250.0;
    bool pass = slopeDeg <= uCrit.x && sa >= uCrit.y && ea >= uCrit.z && (uLitNow < 0.5 || lit > 0.5);
    float relief = 0.35 + 0.65 * (1.0 - exp(-direct * 6.0));
    float g = mix(0.6, relief, 0.6);
    col = pass ? vec3(0.16, 0.80, 0.42) * g * 1.3 : vec3(0.20, 0.20, 0.23) * g;
  } else {
    float relief = 0.45 + 0.55 * (1.0 - exp(-direct * 6.0));
    float lightMask = mix(0.55, 1.0, lit);
    vec3 base = uMode == 1
      ? elevationRamp(clamp((hAt(vXY) + 4.5) / 9.0, 0.0, 1.0))
      : slopeRamp(degrees(acos(clamp(dot(n, up), -1.0, 1.0))));
    col = base * mix(lightMask, relief, 0.5);
  }
  // Fade into the smooth globe's shading at the edge of the terrain data.
  float m = length(vXY);
  float w = smoothstep(uEdge - uFade, uEdge - 2.0, m);
  if (w > 0.0) col = mix(col, tone(albedo, globeDirect(up, uSun)), w);
  gl_FragColor = vec4(pow(col, vec3(1.0 / 2.2)), 1.0);
}`

const MODE: Record<LayerMode, number> = { natural: 0, elevation: 1, slope: 2, sunavg: 3, earthavg: 4, psr: 5, filter: 6 }
const OVERLAY_FILE: Partial<Record<LayerMode, string>> = {
  sunavg: 'sun_avg.png',
  earthavg: 'earth_avg.png',
  psr: 'psr.png',
}
const overlayCache = new Map<string, THREE.Texture>()
function overlayTexture(base: string, file: string): THREE.Texture {
  let tex = overlayCache.get(file)
  if (!tex) {
    tex = new THREE.TextureLoader().load(`${base}layers/${file}`)
    tex.colorSpace = THREE.NoColorSpace
    tex.flipY = false
    tex.generateMipmaps = false
    tex.minFilter = tex.magFilter = THREE.LinearFilter
    overlayCache.set(file, tex)
  }
  return tex
}
const blankOverlay = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1)
blankOverlay.needsUpdate = true

interface Props {
  terrain: Terrain
  /** unit vector towards the Sun, body-fixed */
  sunDir: Vec3
  /** Sun angular radius in radians */
  sunRad: number
  layer: LayerMode
  filter: SiteFilter
  /** URL prefix of the data folder */
  dataBase: string
  map: GlobeMap | null
  relief: GlobeRelief | null
  onPick: (lat: number, lon: number) => void
}

export function MoonTerrain({ terrain, sunDir, sunRad, layer, filter, dataBase, map, relief, onPick }: Props) {
  const gl = useThree((s) => s.gl)
  const geometry = useMemo(() => buildGeometry(terrain), [terrain])
  const material = useMemo(() => {
    const linear = !!gl.getContext().getExtension('OES_texture_float_linear')
    const [l0, l1] = [terrain.levels[0], terrain.levels[terrain.levels.length - 1]]
    return new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      vertexShader,
      fragmentShader,
      uniforms: {
        ...shadingUniforms(),
        uEdge: { value: l0.xMax / 1000 - CUT_INSET_KM },
        uFade: { value: FADE_KM },
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
        uOverlay: { value: blankOverlay },
        uSunAvg: { value: blankOverlay },
        uEarthAvg: { value: blankOverlay },
        uCrit: { value: new THREE.Vector3(10, 0, 0) },
        uLitNow: { value: 0 },
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

  applyGlobeMap(material.uniforms as never, map, relief)
  material.uniforms.uSun.value.set(sunDir[0], sunDir[1], sunDir[2])
  material.uniforms.uSunRad.value = sunRad
  material.uniforms.uMode.value = MODE[layer]
  const file = OVERLAY_FILE[layer]
  material.uniforms.uOverlay.value = file ? overlayTexture(dataBase, file) : blankOverlay
  if (layer === 'filter') {
    material.uniforms.uSunAvg.value = overlayTexture(dataBase, 'sun_avg.png')
    material.uniforms.uEarthAvg.value = overlayTexture(dataBase, 'earth_avg.png')
    material.uniforms.uCrit.value.set(filter.maxSlopeDeg, filter.minSunAvg, filter.minEarthAvg)
    material.uniforms.uLitNow.value = filter.litNow ? 1 : 0
  }

  const handleClick = (ev: ThreeEvent<MouseEvent>) => {
    if (ev.delta > 4) return // it was a drag, not a click
    ev.stopPropagation()
    const ll = latLonOf([ev.point.x, ev.point.y, ev.point.z])
    onPick(ll.lat, ll.lon)
  }

  return (
    <mesh
      geometry={geometry}
      material={material}
      onClick={handleClick}
      onBeforeRender={(_r, _s, camera) => {
        material.uniforms.uExpo.value = exposureFor(camera.position)
      }}
    />
  )
}
