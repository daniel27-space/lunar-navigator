// Shading shared by the south-pole terrain and the whole-Moon globe, so the two meet without
// a visible join: the same NASA colour map as surface brightness, the same tone curve, and one
// exposure that follows the camera (bright when close to the dim polar terrain, normal when
// the whole sunlit disc is in view, as a real camera would be set).
import { useEffect, useState } from 'react'
import * as THREE from 'three'
import { R_KM } from '../lib/geo'

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

export const shadingUniforms = () => ({
  uMap: { value: null as THREE.Texture | null },
  uHasMap: { value: 0 },
  uLonLeft: { value: -Math.PI },
  uExpo: { value: EXPO_NEAR },
})

export function applyGlobeMap(u: ReturnType<typeof shadingUniforms>, map: GlobeMap | null) {
  u.uMap.value = map ? map.tex : null
  u.uHasMap.value = map ? 1 : 0
  if (map) u.uLonLeft.value = map.lonLeftRad
}

const EXPO_NEAR = 8.25 // polar terrain under a grazing Sun
const EXPO_FAR = 1.32 // the full sunlit disc
const ALT_NEAR_KM = 700
const ALT_FAR_KM = 3500

/** Exposure for a camera at this position (km, Moon-centred). */
export function exposureFor(position: THREE.Vector3): number {
  const alt = Math.max(position.length() - R_KM, 1)
  const s = THREE.MathUtils.smoothstep(Math.log(alt), Math.log(ALT_NEAR_KM), Math.log(ALT_FAR_KM))
  return Math.exp(THREE.MathUtils.lerp(Math.log(EXPO_NEAR), Math.log(EXPO_FAR), s))
}

/** GLSL: surface brightness from the colour map and the tone curve. `d` is a unit body-fixed direction. */
export const SHADING_GLSL = /* glsl */ `
uniform sampler2D uMap;
uniform float uHasMap;
uniform float uLonLeft;   // radians, longitude at the left edge of the texture
uniform float uExpo;
vec3 albedoAt(vec3 d) {
  float lon = atan(d.y, d.x);
  float lat = asin(clamp(d.z, -1.0, 1.0));
  vec2 uv = vec2(fract((lon - uLonLeft) / 6.283185307179586), lat / 3.141592653589793 + 0.5);
  // The JPEG is sRGB-encoded; work in linear light.
  return mix(vec3(0.4), pow(texture2D(uMap, uv).rgb, vec3(2.2)), uHasMap);
}
vec3 tone(vec3 albedo, float direct) {
  return 1.0 - exp(-albedo * direct * uExpo) + albedo * 0.03;
}
`
