// The Earth as seen in a mission's ground-level view: a small globe with recognisable
// continents, oceans, ice and cloud. Its place in the sky and its phase are real (the phase
// comes from the true Sun direction); the face it shows and its clouds are illustrative.
import * as THREE from 'three'

// Land on a 10-degree grid: 18 rows from 90N to 90S, 36 columns from 180W to 180E.
const LAND = [
  '....................................',
  '......#####.####.........########...',
  '.###########.#..#..#################',
  '.....#######.....###############..#.',
  '.....#######.....###############....',
  '......#####......#############.#....',
  '.......##.......########.#####......',
  '........##......#######..####.#.....',
  '..........###....######....###......',
  '..........#####....###......#####...',
  '..........#####....####.......###...',
  '...........###.....###.......#####..',
  '..........###.......#........####...',
  '..........##....................#..#',
  '...........#........................',
  '...........#........................',
  '####################################',
  '####################################',
]

/** Share of land (0..1) at a latitude and longitude, smoothed between grid cells. */
export function landAt(latDeg: number, lonDeg: number): number {
  const fr = Math.min(Math.max((90 - latDeg) / 10 - 0.5, 0), 17)
  const fc = ((((lonDeg + 180) % 360) + 360) % 360) / 10 - 0.5
  const r0 = Math.min(Math.floor(fr), 16)
  const c0 = Math.floor(fc)
  const wr = fr - r0
  const wc = fc - c0
  const at = (r: number, c: number) => (LAND[r][((c % 36) + 36) % 36] === '#' ? 1 : 0)
  return (at(r0, c0) * (1 - wc) + at(r0, c0 + 1) * wc) * (1 - wr) + (at(r0 + 1, c0) * (1 - wc) + at(r0 + 1, c0 + 1) * wc) * wr
}

function hash(ix: number, iy: number): number {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + 1013) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}
/** Smooth noise that repeats every `period` in x, so cloud has no seam at the date line. */
function noise(x: number, y: number, period: number): number {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = x - ix
  const fy = y - iy
  const ux = fx * fx * (3 - 2 * fx)
  const uy = fy * fy * (3 - 2 * fy)
  const a = ((ix % period) + period) % period
  const b = (a + 1) % period
  return (hash(a, iy) * (1 - ux) + hash(b, iy) * ux) * (1 - uy) + (hash(a, iy + 1) * (1 - ux) + hash(b, iy + 1) * ux) * uy
}

/** RGB (0..255) of the Earth's surface with cloud at a latitude and longitude. */
export function earthColour(latDeg: number, lonDeg: number): [number, number, number] {
  const land = landAt(latDeg, lonDeg)
  const abs = Math.abs(latDeg)
  let c: [number, number, number]
  if (land > 0.5) {
    // green where it rains, tan in the desert belts, white where it is frozen
    const dry = Math.max(0, 1 - Math.abs(abs - 24) / 12)
    const ice = abs > 66 ? Math.min((abs - 66) / 8, 1) : 0
    c = [62 + 118 * dry, 104 + 44 * dry, 58 + 38 * dry]
    c = [c[0] + (236 - c[0]) * ice, c[1] + (240 - c[1]) * ice, c[2] + (244 - c[2]) * ice]
  } else {
    // deep blue, a little lighter near coasts; sea ice near the poles
    const shelf = Math.min(land * 2, 1)
    const ice = abs > 74 ? Math.min((abs - 74) / 8, 1) : 0
    c = [22 + 26 * shelf, 62 + 44 * shelf, 132 + 34 * shelf]
    c = [c[0] + (232 - c[0]) * ice, c[1] + (238 - c[1]) * ice, c[2] + (244 - c[2]) * ice]
  }
  // cloud: broad bands with holes, stretched east-west
  const x = (lonDeg + 180) / 360
  const y = (90 - latDeg) / 180
  const n = noise(x * 14, y * 16, 14) * 0.6 + noise(x * 34, y * 40, 34) * 0.4
  const cloud = Math.min(Math.max((n - 0.52) / 0.22, 0), 1) * 0.85
  return [c[0] + (250 - c[0]) * cloud, c[1] + (250 - c[1]) * cloud, c[2] + (252 - c[2]) * cloud]
}

/** Equirectangular texture (longitude -180..180 left to right, north at the top). */
export function earthTexture(width = 512, height = 256): THREE.DataTexture {
  const data = new Uint8Array(width * height * 4)
  for (let j = 0; j < height; j++) {
    // DataTexture rows start at the bottom: row 0 is the south pole.
    const lat = -90 + ((j + 0.5) / height) * 180
    for (let i = 0; i < width; i++) {
      const lon = -180 + ((i + 0.5) / width) * 360
      const [r, g, b] = earthColour(lat, lon)
      const k = (j * width + i) * 4
      data[k] = r
      data[k + 1] = g
      data[k + 2] = b
      data[k + 3] = 255
    }
  }
  const tex = new THREE.DataTexture(data, width, height, THREE.RGBAFormat)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = THREE.RepeatWrapping
  tex.minFilter = tex.magFilter = THREE.LinearFilter
  tex.needsUpdate = true
  return tex
}

/**
 * The material for the Earth globe. It starts with the generated texture above and switches to
 * NASA's Blue Marble image (`globe/earth_2k.jpg`, built by pipeline/globe/build_earth.py) as
 * soon as that has loaded; if it cannot be loaded the generated one stays. `onReady` is called
 * when the picture changes, so a view that draws on demand can redraw.
 */
export function earthMaterial(dataBase: string, onReady: () => void): THREE.ShaderMaterial {
  const material = new THREE.ShaderMaterial({
    vertexShader: EARTH_VERTEX,
    fragmentShader: EARTH_FRAGMENT,
    uniforms: { uMap: { value: earthTexture() }, uSun: { value: new THREE.Vector3(1, 0, 0) }, uGain: { value: 1.05 } },
    toneMapped: false,
  })
  new THREE.TextureLoader().load(
    `${dataBase}globe/earth_2k.jpg`,
    (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace
      tex.wrapS = THREE.RepeatWrapping
      const old = material.uniforms.uMap.value as THREE.Texture
      material.uniforms.uMap.value = tex
      // The photograph's oceans are much darker than the generated ones; lift it a little.
      material.uniforms.uGain.value = 1.45
      old.dispose()
      onReady()
    },
    undefined,
    () => {}, // keep the generated texture
  )
  return material
}

/**
 * How to turn a three.js sphere so that its north pole points along `north` (scene
 * coordinates) and the meridian `faceLonDeg` faces the viewer at the origin from position `p`.
 * (A three.js sphere's texture has longitude 0 towards +x and 90E towards -z.)
 */
export function earthOrientation(north: THREE.Vector3, p: THREE.Vector3, faceLonDeg: number): THREE.Quaternion {
  const tilt = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), north.clone().normalize())
  const toViewer = p.clone().negate().normalize().applyQuaternion(tilt.clone().invert())
  const lonTowardsViewer = Math.atan2(-toViewer.z, toViewer.x)
  const spin = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), lonTowardsViewer - (faceLonDeg * Math.PI) / 180)
  return tilt.multiply(spin)
}

/**
 * Longitude on Earth (degrees east, -180..180) that faces the Moon at a UTC time: the point
 * with the Moon overhead. It moves west by about 14.5 degrees an hour as the Earth turns.
 * From the Moon's low-precision position (main terms only), good to about a degree, which is
 * far finer than anyone can see on a disc this small.
 */
export function subLunarLonDeg(tMs: number): number {
  const d = tMs / 86400000 - 10957.5 // days since 2000-01-01 12:00 UTC
  const R = Math.PI / 180
  const meanLon = 218.316 + 13.176396 * d
  const anomaly = (134.963 + 13.064993 * d) * R
  const node = (93.272 + 13.22935 * d) * R
  const lon = (meanLon + 6.289 * Math.sin(anomaly)) * R
  const lat = 5.128 * Math.sin(node) * R
  const tilt = 23.439 * R
  const rightAscension = Math.atan2(Math.sin(lon) * Math.cos(tilt) - Math.tan(lat) * Math.sin(tilt), Math.cos(lon)) / R
  const greenwich = 280.46061837 + 360.98564736629 * d
  return ((((rightAscension - greenwich + 180) % 360) + 360) % 360) - 180
}

export const EARTH_VERTEX = /* glsl */ `
varying vec2 vUv;
varying vec3 vN;
varying vec3 vView;
void main() {
  vUv = uv;
  vN = normalize(mat3(modelMatrix) * normal);
  vec4 world = modelMatrix * vec4(position, 1.0);
  vView = normalize(cameraPosition - world.xyz);
  gl_Position = projectionMatrix * viewMatrix * world;
}`

export const EARTH_FRAGMENT = /* glsl */ `
uniform sampler2D uMap;
uniform vec3 uSun;   // unit vector towards the Sun, scene coordinates
uniform float uGain;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vView;
void main() {
  vec3 n = normalize(vN);
  float lit = smoothstep(-0.08, 0.22, dot(n, uSun));
  vec3 day = texture2D(uMap, vUv).rgb;
  // thin blue air at the limb, on the sunlit side only
  float rim = pow(1.0 - max(dot(n, normalize(vView)), 0.0), 2.5);
  // a faint blue haze over the whole lit side, as the air scatters sunlight
  vec3 col = (day * uGain + vec3(0.03, 0.06, 0.13)) * lit + vec3(0.35, 0.55, 0.95) * rim * lit * 0.7 + vec3(0.010, 0.014, 0.028);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`
