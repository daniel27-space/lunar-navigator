// Whole-Moon elevation (LOLA, about 2.7 km per pixel at the equator) for the globe view and
// for the height of points outside the south-pole tiles. Built by pipeline/globe/build_global_dem.py.
import { decodeHeights, decodePng } from './terrain'

export interface GlobalDem {
  width: number
  height: number
  /** metres above the 1737.4 km sphere; row 0 = north, column 0 = longitude -180 */
  h: Float32Array
}

export async function loadGlobalDem(base: string): Promise<GlobalDem> {
  const meta = await (await fetch(`${base}globe/globe.json`)).json()
  if (!meta.dem) throw new Error('no global elevation listed in globe.json')
  const img = await decodePng(`${base}globe/${meta.dem.file}`)
  return { width: img.width, height: img.height, h: decodeHeights(img.data, img.width * img.height) }
}

/** Bilinear height in metres. Pixel centres: lon = -180 + 360 (x + 0.5) / W, lat = 90 - 180 (y + 0.5) / H. */
export function globalHeightAt(d: GlobalDem, latDeg: number, lonDeg: number): number {
  const fx = ((((lonDeg + 180) % 360) + 360) % 360) / 360 * d.width - 0.5
  const fy = Math.min(Math.max(((90 - latDeg) / 180) * d.height - 0.5, 0), d.height - 1)
  const x0 = Math.floor(fx)
  const y0 = Math.min(Math.floor(fy), d.height - 2)
  const wx = fx - x0
  const wy = fy - y0
  const a = ((x0 % d.width) + d.width) % d.width
  const b = (a + 1) % d.width
  const top = d.h[y0 * d.width + a] * (1 - wx) + d.h[y0 * d.width + b] * wx
  const bot = d.h[(y0 + 1) * d.width + a] * (1 - wx) + d.h[(y0 + 1) * d.width + b] * wx
  return top * (1 - wy) + bot * wy
}
