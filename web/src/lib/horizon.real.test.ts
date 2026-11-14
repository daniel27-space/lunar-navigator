// The browser horizon code, run on the real LOLA web tiles, must reproduce the Python
// reference implementation (pipeline/terrain/horizon.py) at the published test points.
import { readFileSync } from 'node:fs'
import { PNG } from 'pngjs'
import { describe, expect, it } from 'vitest'
import { computeHorizon } from './horizon'
import { decodeHeights, type Terrain } from './terrain'

const dir = new URL('../../public/data/terrain/', import.meta.url)
const meta = JSON.parse(readFileSync(new URL('sp_meta.json', dir), 'utf8'))

function load(): Terrain {
  return {
    radiusM: meta.radius_m,
    levels: meta.levels.map((l: Record<string, number | string>) => {
      const png = PNG.sync.read(readFileSync(new URL(l.file as string, dir)))
      return {
        size: l.size,
        xMin: l.x_min_m,
        xMax: l.x_max_m,
        yMin: l.y_min_m,
        yMax: l.y_max_m,
        pixel: l.pixel_m,
        h: decodeHeights(new Uint8ClampedArray(png.data.buffer, png.data.byteOffset, png.data.length), png.width * png.height),
      }
    }),
  }
}

const vectors: {
  name: string
  lat: number
  lon: number
  observer_height_m: number
  az_step_deg: number
  elev_deg: number[]
}[] = JSON.parse(readFileSync(new URL('horizon_testvectors.json', dir), 'utf8'))

describe('horizon on real LOLA tiles vs the Python reference', () => {
  const terrain = load()
  for (const v of vectors) {
    it(`${v.name} matches to 0.001 degrees`, () => {
      const hz = computeHorizon(terrain, v.lat, v.lon, {
        observerHeightM: v.observer_height_m,
        azStepDeg: v.az_step_deg,
      })
      let worst = 0
      for (let i = 0; i < v.elev_deg.length; i++) worst = Math.max(worst, Math.abs(hz.elevDeg[i] - v.elev_deg[i]))
      console.log(`${v.name}: worst difference ${worst.toExponential(2)} deg`)
      expect(worst).toBeLessThan(0.001)
    })
  }
})
