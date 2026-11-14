// The browser's whole-Moon elevation lookup must reproduce the Python build's values.
import { readFileSync } from 'node:fs'
import { PNG } from 'pngjs'
import { describe, expect, it } from 'vitest'
import { globalHeightAt, type GlobalDem } from './globalDem'
import { decodeHeights } from './terrain'

const png = PNG.sync.read(readFileSync(new URL('../../public/data/globe/moon_dem_4k.png', import.meta.url)))
const dem: GlobalDem = {
  width: png.width,
  height: png.height,
  h: decodeHeights(new Uint8ClampedArray(png.data.buffer, png.data.byteOffset, png.data.length), png.width * png.height),
}

describe('whole-Moon elevation', () => {
  // Values from pipeline/globe/build_global_dem.py `sample` on the same file.
  const cases: [string, number, number, number][] = [
    ['Apollo 11', 0.674, 23.473, -1918.31],
    ["Chang'e 4", -45.457, 177.589, -5927.84],
    ['Chandrayaan-3', -69.37, 32.32, 538.2],
    ['Apollo 15', 26.13, 3.63, -1935.94],
    ['near the -180 edge', -85.0, -179.9, -4764.55],
    ['near the +180 edge', 40.0, 179.99, 2275.93],
  ]
  for (const [name, lat, lon, want] of cases) {
    it(`${name} matches the Python reference`, () => {
      expect(Math.abs(globalHeightAt(dem, lat, lon) - want)).toBeLessThan(0.05)
    })
  }
  it('has no missing data and wraps in longitude', () => {
    expect(dem.h.some((v) => Number.isNaN(v))).toBe(false)
    expect(globalHeightAt(dem, 10, 180)).toBeCloseTo(globalHeightAt(dem, 10, -180), 6)
    expect(globalHeightAt(dem, 10, 540)).toBeCloseTo(globalHeightAt(dem, 10, -180), 6)
  })
})
