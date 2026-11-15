// A detailed terrain surface: the south-pole tiles or an 80 m patch around a mission site.
// Geometry is built on the real sphere (body-fixed km), so the Sun's body-fixed direction
// lights it directly. Shadows are ray-marched through the elevation
// texture in the fragment shader, including the curvature of the Moon.
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { overMarker } from './markers'
import { invalidate, useThree, type ThreeEvent } from '@react-three/fiber'
import { latLonOf, R2D, type Vec3 } from '../lib/geo'
import { globalHeightAt, type GlobalDem } from '../lib/globalDem'
import { frameDirection, sampleXY, type Level, type Terrain } from '../lib/terrain'
import type { Detail, LayerMode } from '../store'
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

/**
 * Width of the ring at the edge of the data over which the detailed terrain fades into the
 * whole-Moon relief, as a share of the map's half-width. The fade is round, so the detailed
 * area reads as a cap rather than a square tile.
 */
const FADE_SHARE = 0.165
/** How far the skirt at a terrain's edge hangs below it, km. */
const SKIRT_KM = 6
const fadeKmOf = (t: Terrain) => Math.max((t.levels[0].xMax / 1000) * FADE_SHARE, 4)

/** 0 inside, rising to 1 where the globe takes over. x, y, edge and fade in km. */
function edgeFade(xKm: number, yKm: number, edgeKm: number, fadeKm: number): number {
  const m = Math.hypot(xKm, yKm)
  const k = Math.min(Math.max((m - (edgeKm - fadeKm)) / (fadeKm - 2), 0), 1)
  return k * k * (3 - 2 * k)
}

const globalAt = (g: GlobalDem, d: Vec3) =>
  globalHeightAt(g, Math.asin(Math.min(1, Math.max(-1, d[2]))) * R2D, Math.atan2(d[1], d[0]) * R2D)

function buildGeometry(t: Terrain, global: GlobalDem | null, GRID: number): THREE.BufferGeometry {
  const l0 = t.levels[0]
  const fadeKm = fadeKmOf(t)
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
      const d = frameDirection(t.frame, x, y, t.radiusM)
      // The globe's own height here (0 until the whole-Moon map has loaded).
      const hg = global ? globalAt(global, d) : 0
      let h = sampleXY(t, xs, ys)
      valid[k] = Number.isNaN(h) && !global ? 0 : 1
      if (Number.isNaN(h)) h = hg
      // Heights ease into the globe's at the edge, so the two surfaces join without a step.
      const w = edgeFade(x / 1000, y / 1000, edgeKm, fadeKm)
      const r = rKm + (h * (1 - w) + hg * w) / 1000
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
  // A skirt: a wall hanging down from the outer edge. The globe around this terrain is a much
  // coarser mesh of the same heights, so where it happens to sit lower than this edge there
  // would be an open gap to look through; the skirt closes it. It takes the edge's own shading
  // (a point just inside the edge), which there is the globe's.
  const rim: number[] = []
  for (let i = 0; i < GRID; i++) rim.push(i) // top row, left to right
  for (let j = 0; j < GRID; j++) rim.push(j * n + GRID) // right column, downwards
  for (let i = GRID; i > 0; i--) rim.push(GRID * n + i) // bottom row, right to left
  for (let j = GRID; j > 0; j--) rim.push(j * n) // left column, upwards
  const total = n * n + rim.length
  const pos2 = new Float32Array(total * 3)
  const xy2 = new Float32Array(total * 2)
  pos2.set(pos)
  xy2.set(xy)
  const inset = l0.pixel / 1000 / 2
  const clampIn = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo + inset), hi - inset)
  rim.forEach((v, m) => {
    const k = n * n + m
    const r = Math.hypot(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2])
    const s = (r - SKIRT_KM) / r
    pos2[k * 3] = pos[v * 3] * s
    pos2[k * 3 + 1] = pos[v * 3 + 1] * s
    pos2[k * 3 + 2] = pos[v * 3 + 2] * s
    xy2[k * 2] = clampIn(xy[v * 2], l0.xMin / 1000, l0.xMax / 1000)
    xy2[k * 2 + 1] = clampIn(xy[v * 2 + 1], l0.yMin / 1000, l0.yMax / 1000)
  })
  for (let m = 0; m < rim.length; m++) {
    const a = rim[m]
    const b = rim[(m + 1) % rim.length]
    if (!(valid[a] && valid[b])) continue
    const a2 = n * n + m
    const b2 = n * n + ((m + 1) % rim.length)
    index.push(a, a2, b, b, a2, b2)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos2, 3))
  g.setAttribute('aXY', new THREE.BufferAttribute(xy2, 2))
  g.setIndex(index)
  g.computeBoundingSphere()
  return g
}

/** The same level at half the resolution (2 x 2 averages, ignoring missing cells). */
function halved(l: Level): Level {
  const size = l.size >> 1
  const h = new Float32Array(size * size)
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      let sum = 0
      let n = 0
      for (let k = 0; k < 4; k++) {
        const v = l.h[(2 * r + (k >> 1)) * l.size + 2 * c + (k & 1)]
        if (!Number.isNaN(v)) {
          sum += v
          n++
        }
      }
      h[r * size + c] = n ? sum / n : NaN
    }
  }
  return { ...l, size, pixel: l.pixel * 2, h }
}

function heightTexture(t: Terrain, l: Level, global: GlobalDem | null, linear: boolean): THREE.DataTexture {
  // NaN would poison filtering. Gaps in the data take the whole-Moon map's height (for the
  // picture only; the numbers never use filled values), or a very low value the shader
  // treats as no data when that map is not loaded.
  const data = new Float32Array(l.h.length)
  for (let i = 0; i < data.length; i++) {
    if (!Number.isNaN(l.h[i])) data[i] = l.h[i]
    else if (!global) data[i] = -20000
    else {
      const x = l.xMin + ((i % l.size) + 0.5) * l.pixel
      const y = l.yMax - (Math.floor(i / l.size) + 0.5) * l.pixel
      data[i] = globalAt(global, frameDirection(t.frame, x, y, t.radiusM))
    }
  }
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

const fragmentShader = (steps: number, growth: number) => /* glsl */ `
precision highp float;
uniform sampler2D uH0;
uniform sampler2D uH1;
uniform vec4 uExt0;   // xmin, ymin, xmax, ymax in km
uniform vec4 uExt1;
uniform float uPix0;  // km
uniform float uPix1;
uniform float uR;     // km
uniform vec3 uAx;     // the map's x axis, y axis and centre direction, body-fixed
uniform vec3 uAy;
uniform vec3 uUp;
uniform vec3 uSun;    // unit, body-fixed, towards the Sun
uniform float uSunRad; // angular radius, radians
uniform int uMode;    // 0 natural, 1 elevation, 2 slope, 3 avg sunlight, 4 avg Earth, 5 PSR, 6 site finder
uniform sampler2D uOverlay; // 8-bit layer on the L0 grid
uniform sampler2D uScore;  // site finder: 0 = eliminated, else 1..255 = how well the cell fits
uniform vec2 uScoreRange;  // lowest and highest fit among eligible cells, 0..1
uniform float uEdge;   // km, where the globe takes over
uniform float uFade;   // km, width of the fade into the globe
varying vec2 vXY;
${SHADING_GLSL}
${CUT_GLSL}

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
// Stereographic map <-> body-fixed, written without trig so it stays exact at the centre.
vec3 dirOf(vec2 xy) {
  float rho2 = dot(xy, xy) / (4.0 * uR * uR);
  float k = 1.0 / (1.0 + rho2);
  return uAx * (xy.x / uR * k) + uAy * (xy.y / uR * k) + uUp * ((1.0 - rho2) * k);
}
vec2 xyOf(vec3 p) {
  vec3 d = normalize(p);
  return 2.0 * uR / (1.0 + dot(d, uUp)) * vec2(dot(d, uAx), dot(d, uAy));
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
  if (inCut(up, uR)) discard; // a finer terrain is drawn here
  vec3 n = normalize(cross(surf(vXY + vec2(e, 0.0)) - surf(vXY - vec2(e, 0.0)),
                           surf(vXY + vec2(0.0, e)) - surf(vXY - vec2(0.0, e))));
  if (dot(n, up) < 0.0) n = -n;

  // March towards the Sun. minA is the smallest angular clearance (radians) between the ray
  // to the Sun's centre and the terrain; the disc is fully visible above +uSunRad and fully
  // hidden below -uSunRad.
  float minA = 1.0;
  float t = max(e * 0.75, 0.02);
  vec3 start = p0 + up * 0.003;
  for (int i = 0; i < ${steps}; i++) {
    vec3 q = start + uSun * t;
    float rq = length(q);
    if (rq - uR > 11.0) break;
    vec2 xy = xyOf(q);
    if (!inside(uvOf(xy, uExt0), 0.0)) break;
    minA = min(minA, (rq - (uR + hAt(xy))) / t);
    if (minA < -uSunRad) break;
    t *= ${growth.toFixed(3)};
  }
  float lit = clamp(minA / uSunRad * 0.5 + 0.5, 0.0, 1.0);
  float direct = max(dot(n, uSun), 0.0) * lit;

  vec3 albedo = albedoAt(up);
  vec3 col;
  float ov = texture2D(uOverlay, uv0).r;
  if (uMode == 0 || uMode == 5) {
    col = tone(albedo, direct);
    if (uMode == 5 && ov > 0.5) col = mix(col, vec3(0.35, 0.80, 0.92), 0.75);
  } else if (uMode == 3 || uMode == 4) {
    float relief = 0.6 + 0.4 * (1.0 - exp(-direct * 6.0));
    float f = clamp(ov * 255.0 / 250.0, 0.0, 1.0);
    vec3 base = uMode == 3 ? sunRamp(f) : earthRamp(f);
    col = ov > 0.99 ? vec3(0.05) : base * relief;
  } else if (uMode == 6) {
    // Site finder: eliminated ground stays dim grey with its relief; eligible ground runs from
    // dark teal (just passes) to bright yellow (best fit).
    float sc = texture2D(uScore, uv0).r * 255.0;
    float relief = 0.35 + 0.65 * (1.0 - exp(-direct * 6.0));
    float g = mix(0.6, relief, 0.6);
    if (sc < 0.5) {
      col = vec3(0.17, 0.17, 0.20) * g;
    } else {
      float t = clamp(((sc - 1.0) / 254.0 - uScoreRange.x) / max(uScoreRange.y - uScoreRange.x, 0.02), 0.0, 1.0);
      vec3 ramp = t < 0.5 ? mix(vec3(0.04, 0.30, 0.34), vec3(0.16, 0.72, 0.46), t / 0.5)
                          : mix(vec3(0.16, 0.72, 0.46), vec3(0.86, 0.95, 0.50), (t - 0.5) / 0.5);
      col = ramp * mix(0.8, 1.15, g);
    }
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

const MODE: Record<LayerMode, number> = { natural: 0, elevation: 1, slope: 2, sunavg: 3, earthavg: 4, psr: 5, finder: 6 }
const OVERLAY_FILE: Partial<Record<LayerMode, string>> = {
  sunavg: 'sun_avg.png',
  earthavg: 'earth_avg.png',
  psr: 'psr.png',
}
const overlayCache = new Map<string, THREE.Texture>()
function overlayTexture(base: string, file: string): THREE.Texture {
  let tex = overlayCache.get(file)
  if (!tex) {
    tex = new THREE.TextureLoader().load(`${base}layers/${file}`, () => invalidate())
    tex.colorSpace = THREE.NoColorSpace
    tex.flipY = false
    tex.generateMipmaps = false
    tex.minFilter = tex.magFilter = THREE.LinearFilter
    overlayCache.set(file, tex)
  }
  return tex
}
/** Starts fetching every layer picture, so a layer is already there when it is first chosen. */
export function preloadOverlays(base: string) {
  for (const file of Object.values(OVERLAY_FILE)) overlayTexture(base, file)
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
  /** site finder result for the south-pole grid: per-cell fit and the best fit; null when not in use */
  score?: { tex: THREE.Texture; min: number; max: number } | null
  /** URL prefix of the data folder */
  dataBase: string
  map: GlobeMap | null
  relief: GlobeRelief | null
  /** true for the south-pole tiles, which have the NASA overlay layers; a site patch has none */
  overlays: boolean
  /** how much detail to draw; affects the picture only */
  detail: Detail
  /** finer terrains drawn on top of this one; this surface is skipped under them */
  cuts?: Cut[]
  onPick: (lat: number, lon: number) => void
}

export function MoonTerrain({ terrain, sunDir, sunRad, layer, score, dataBase, map, relief, overlays, cuts, detail, onPick }: Props) {
  const gl = useThree((s) => s.gl)
  const global = relief ? relief.dem : null
  const grid = overlays ? detail.grid : Math.min(detail.grid, 384)
  const geometry = useMemo(() => buildGeometry(terrain, global, grid), [terrain, global, grid])
  const material = useMemo(() => {
    const linear = !!gl.getContext().getExtension('OES_texture_float_linear')
    const l0 = terrain.levels[0]
    const top = terrain.levels[terrain.levels.length - 1]
    const l1 = detail.halfFine && terrain.levels.length > 1 ? halved(top) : top
    return new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      vertexShader,
      fragmentShader: fragmentShader(detail.steps, detail.growth),
      uniforms: {
        ...shadingUniforms(),
        ...cutUniforms(),
        uEdge: { value: l0.xMax / 1000 - CUT_INSET_KM },
        uFade: { value: fadeKmOf(terrain) },
        uAx: { value: new THREE.Vector3(...terrain.frame.ax) },
        uAy: { value: new THREE.Vector3(...terrain.frame.ay) },
        uUp: { value: new THREE.Vector3(...terrain.frame.up) },
        uH0: { value: heightTexture(terrain, l0, global, linear) },
        uH1: { value: heightTexture(terrain, l1, global, linear) },
        uExt0: { value: extentKm(l0) },
        uExt1: { value: extentKm(l1) },
        uPix0: { value: l0.pixel / 1000 },
        uPix1: { value: l1.pixel / 1000 },
        uR: { value: terrain.radiusM / 1000 },
        uSun: { value: new THREE.Vector3(1, 0, 0) },
        uSunRad: { value: 0.00465 },
        uMode: { value: 0 },
        uOverlay: { value: blankOverlay },
        uScore: { value: blankOverlay },
        uScoreRange: { value: new THREE.Vector2(0, 1) },
      },
    })
  }, [terrain, global, gl, detail])

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
  applyCuts(material.uniforms as never, cuts ?? [])
  material.uniforms.uSun.value.set(sunDir[0], sunDir[1], sunDir[2])
  material.uniforms.uSunRad.value = sunRad
  // A site patch has no overlay layers: it shows sunlight for those, elevation and slope as usual.
  const shown: LayerMode = overlays || layer === 'elevation' || layer === 'slope' ? layer : 'natural'
  material.uniforms.uMode.value = MODE[shown]
  const file = overlays ? OVERLAY_FILE[layer] : undefined
  material.uniforms.uOverlay.value = file ? overlayTexture(dataBase, file) : blankOverlay
  material.uniforms.uScore.value = score ? score.tex : blankOverlay
  material.uniforms.uScoreRange.value.set(score ? score.min : 0, score ? score.max : 1)

  const handleClick = (ev: ThreeEvent<MouseEvent>) => {
    if (ev.delta > 4) return // it was a drag, not a click
    if (overMarker(ev.intersections)) return // the click belongs to a marker drawn over this ground
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
        material.uniforms.uExpo.value = exposureFor(camera.position, material.uniforms.uSun.value)
      }}
    />
  )
}
