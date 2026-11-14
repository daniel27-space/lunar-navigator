// Shading shared by the south-pole terrain and the whole-Moon globe, so the two meet without
// a visible join: the same NASA colour map as surface brightness, the same tone curve, and one
// exposure that follows the camera (bright when close to the dim polar terrain, normal when
// the whole sunlit disc is in view, as a real camera would be set).
import { useEffect, useState } from 'react'
import * as THREE from 'three'
import { loadGlobalDem, type GlobalDem } from '../lib/globalDem'
import { R_KM } from '../lib/geo'
import type { Frame } from '../lib/terrain'

export interface GlobeMap {
  tex: THREE.Texture
  /** longitude at the left edge of the texture, radians */
  lonLeftRad: number
}

/** Loads the whole-Moon colour map once. Null until it arrives (or if it is missing). */
export function useGlobeMap(dataBase: string): GlobeMap | null {
  const [map, setMap] = useState<GlobeMap | null>(null)
  useEffect(() => {
    let tex: THREE.Texture | null = null
    let cancelled = false
    fetch(`${dataBase}globe/globe.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('no globe texture'))))
      .then((j) => {
        if (cancelled) return
        const lonLeftRad = ((j.lon_left_deg ?? -180) * Math.PI) / 180
        tex = new THREE.TextureLoader().load(`${dataBase}globe/${j.files?.color_4k ?? j.file}`, (t) => {
          if (!cancelled) setMap({ tex: t, lonLeftRad })
        })
        tex.colorSpace = THREE.NoColorSpace
        // No mipmaps: the longitude seam would otherwise show as a line.
        tex.generateMipmaps = false
        tex.minFilter = tex.magFilter = THREE.LinearFilter
      })
      .catch(() => setMap(null)) // both surfaces still render, in flat grey
    return () => {
      cancelled = true
      tex?.dispose()
    }
  }, [dataBase])
  return map
}

export interface GlobeRelief {
  dem: GlobalDem
  /** elevation in km, half-float, row 0 = south so it shares the colour map's coordinates */
  tex: THREE.DataTexture
}

/** Loads the whole-Moon elevation once. Null until it arrives; the globe is smooth until then. */
export function useGlobeRelief(dataBase: string): GlobeRelief | null {
  const [relief, setRelief] = useState<GlobeRelief | null>(null)
  useEffect(() => {
    let cancelled = false
    let tex: THREE.DataTexture | null = null
    loadGlobalDem(dataBase)
      .then((dem) => {
        if (cancelled) return
        const data = new Uint16Array(dem.width * dem.height)
        for (let y = 0; y < dem.height; y++) {
          const src = (dem.height - 1 - y) * dem.width
          for (let x = 0; x < dem.width; x++) data[y * dem.width + x] = THREE.DataUtils.toHalfFloat(dem.h[src + x] / 1000)
        }
        tex = new THREE.DataTexture(data, dem.width, dem.height, THREE.RedFormat, THREE.HalfFloatType)
        tex.minFilter = tex.magFilter = THREE.LinearFilter
        tex.wrapS = THREE.RepeatWrapping
        tex.wrapT = THREE.ClampToEdgeWrapping
        tex.needsUpdate = true
        setRelief({ dem, tex })
      })
      .catch(() => setRelief(null))
    return () => {
      cancelled = true
      tex?.dispose()
    }
  }, [dataBase])
  return relief
}

export const shadingUniforms = () => ({
  uDem: { value: null as THREE.Texture | null },
  uHasDem: { value: 0 },
  uDemPx: { value: new THREE.Vector2(1 / 4096, 1 / 2048) },
  uMap: { value: null as THREE.Texture | null },
  uHasMap: { value: 0 },
  uLonLeft: { value: -Math.PI },
  uExpo: { value: EXPO_NEAR },
})

export function applyGlobeMap(u: ReturnType<typeof shadingUniforms>, map: GlobeMap | null, relief: GlobeRelief | null) {
  u.uDem.value = relief ? relief.tex : null
  u.uHasDem.value = relief ? 1 : 0
  if (relief) u.uDemPx.value.set(1 / relief.dem.width, 1 / relief.dem.height)
  u.uMap.value = map ? map.tex : null
  u.uHasMap.value = map ? 1 : 0
  if (map) u.uLonLeft.value = map.lonLeftRad
}

const EXPO_NEAR = 8.25 // polar terrain under a grazing Sun
const EXPO_FAR = 1.32 // the full sunlit disc
const ALT_NEAR_KM = 700
const ALT_FAR_KM = 3500

/**
 * Exposure for a camera at this position (km, Moon-centred) with the Sun in direction `sun`.
 * Close to the surface it is set for the ground under the camera: high where the Sun is low
 * (the poles, or near sunrise), normal where the Sun is high. Far away it is set for the full disc.
 */
export function exposureFor(position: THREE.Vector3, sun: THREE.Vector3): number {
  const len = position.length()
  const alt = Math.max(len - R_KM, 1)
  const sinSunElevation = position.dot(sun) / len
  const near = THREE.MathUtils.clamp(EXPO_FAR / Math.max(sinSunElevation, 1e-3), EXPO_FAR, EXPO_NEAR)
  const s = THREE.MathUtils.smoothstep(Math.log(alt), Math.log(ALT_NEAR_KM), Math.log(ALT_FAR_KM))
  return Math.exp(THREE.MathUtils.lerp(Math.log(near), Math.log(EXPO_FAR), s))
}

/** GLSL: surface brightness from the colour map and the tone curve. `d` is a unit body-fixed direction. */
export const SHADING_GLSL = /* glsl */ `
uniform sampler2D uMap;
uniform float uHasMap;
uniform float uLonLeft;   // radians, longitude at the left edge of the texture
uniform float uExpo;
uniform sampler2D uDem;   // whole-Moon elevation, km
uniform float uHasDem;
uniform vec2 uDemPx;      // one pixel in texture coordinates
vec2 lonLatUv(vec3 d) {
  float lon = atan(d.y, d.x);
  float lat = asin(clamp(d.z, -1.0, 1.0));
  return vec2(fract((lon - uLonLeft) / 6.283185307179586), lat / 3.141592653589793 + 0.5);
}
vec3 albedoAt(vec3 d) {
  // The JPEG is sRGB-encoded; work in linear light.
  return mix(vec3(0.4), pow(texture2D(uMap, lonLatUv(d)).rgb, vec3(2.2)), uHasMap);
}
// Surface normal of the whole-Moon elevation map at direction d, at true scale (no exaggeration).
vec3 globeNormal(vec3 d) {
  if (uHasDem < 0.5 || abs(d.z) > 0.9995) return d;
  float c = sqrt(1.0 - d.z * d.z); // cos(latitude)
  vec2 uv = lonLatUv(d);
  // Step one pixel north-south; east-west, widen the step towards the poles so both steps
  // cover about the same ground distance.
  float du = min(uDemPx.x / c, 0.01);
  float dv = uDemPx.y;
  float hE = texture2D(uDem, uv + vec2(du, 0.0)).r - texture2D(uDem, uv - vec2(du, 0.0)).r;
  float hN = texture2D(uDem, uv + vec2(0.0, dv)).r - texture2D(uDem, uv - vec2(0.0, dv)).r;
  const float R = 1737.4;
  float slopeE = hE / (2.0 * du * 6.283185307179586 * R * c);
  float slopeN = hN / (2.0 * dv * 3.141592653589793 * R);
  vec3 east = normalize(vec3(-d.y, d.x, 0.0));
  vec3 north = cross(d, east);
  return normalize(d - slopeE * east - slopeN * north);
}
// Direct sunlight (0..1) on the globe at direction d: slope lighting from the elevation map,
// cut off where the smooth Moon itself hides the Sun. The map casts no shadows.
float globeDirect(vec3 d, vec3 sun) {
  return max(dot(globeNormal(d), sun), 0.0) * smoothstep(-0.01, 0.03, dot(d, sun));
}
vec3 tone(vec3 albedo, float direct) {
  return 1.0 - exp(-albedo * direct * uExpo) + albedo * 0.03;
}
`

// Cut-outs: where a more detailed terrain is drawn, the coarser surface under it is skipped.
export const MAX_CUTS = 5
/** The cut-out sits this far inside the detailed terrain's edge, so that terrain always covers the hole. */
export const CUT_INSET_KM = 1.5

export interface Cut {
  frame: Frame
  /** half-size in km of the square the terrain covers in its own map */
  halfKm: number
}

const vectors = () => Array.from({ length: MAX_CUTS }, () => new THREE.Vector3(0, 0, 1))
export const cutUniforms = () => ({
  uCutN: { value: 0 },
  uCutAx: { value: vectors() },
  uCutAy: { value: vectors() },
  uCutUp: { value: vectors() },
  uCutHalf: { value: new Array<number>(MAX_CUTS).fill(0) },
})

export function applyCuts(u: ReturnType<typeof cutUniforms>, cuts: Cut[]) {
  const n = Math.min(cuts.length, MAX_CUTS)
  u.uCutN.value = n
  for (let i = 0; i < n; i++) {
    u.uCutAx.value[i].set(...cuts[i].frame.ax)
    u.uCutAy.value[i].set(...cuts[i].frame.ay)
    u.uCutUp.value[i].set(...cuts[i].frame.up)
    u.uCutHalf.value[i] = Math.max(cuts[i].halfKm - CUT_INSET_KM, 0)
  }
}

/** GLSL: `inCut(d, radiusKm)` is true where unit direction d falls inside any cut-out square. */
export const CUT_GLSL = /* glsl */ `
uniform int uCutN;
uniform vec3 uCutAx[${MAX_CUTS}];
uniform vec3 uCutAy[${MAX_CUTS}];
uniform vec3 uCutUp[${MAX_CUTS}];
uniform float uCutHalf[${MAX_CUTS}];   // km, half-size of each square in its own map x/y
bool inCut(vec3 d, float radiusKm) {
  for (int i = 0; i < ${MAX_CUTS}; i++) {
    if (i >= uCutN) break;
    float c = dot(d, uCutUp[i]);
    if (c > 0.5) {
      vec2 xy = 2.0 * radiusKm / (1.0 + c) * vec2(dot(d, uCutAx[i]), dot(d, uCutAy[i]));
      if (abs(xy.x) < uCutHalf[i] && abs(xy.y) < uCutHalf[i]) return true;
    }
  }
  return false;
}
`
