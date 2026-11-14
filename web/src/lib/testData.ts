// Loads the published data files from disk for tests (the browser fetches the same files).
import { existsSync, readFileSync } from 'node:fs'
import { PNG } from 'pngjs'
import type { GlobalDem } from './globalDem'
import { decodeHeights, patchTerrain, POLAR_FRAME, type PatchIndex, type Terrain } from './terrain'

const data = new URL('../../public/data/', import.meta.url)

function heights(file: URL): { h: Float32Array; width: number; height: number } {
  const png = PNG.sync.read(readFileSync(file))
  const rgba = new Uint8ClampedArray(png.data.buffer, png.data.byteOffset, png.data.length)
  return { h: decodeHeights(rgba, png.width * png.height), width: png.width, height: png.height }
}

export function readPolarTerrain(): Terrain {
  const meta = JSON.parse(readFileSync(new URL('terrain/sp_meta.json', data), 'utf8'))
  return {
    radiusM: meta.radius_m,
    frame: POLAR_FRAME,
    levels: meta.levels.map((l: Record<string, number | string>) => ({
      size: l.size,
      xMin: l.x_min_m,
      xMax: l.x_max_m,
      yMin: l.y_min_m,
      yMax: l.y_max_m,
      pixel: l.pixel_m,
      h: heights(new URL(`terrain/${l.file}`, data)).h,
    })),
  }
}

export function readGlobalDem(): GlobalDem {
  return heights(new URL('globe/moon_dem_4k.png', data))
}

export function readPatchIndex(): PatchIndex | null {
  const file = new URL('patches/patches.json', data)
  if (!existsSync(file)) return null
  const j = JSON.parse(readFileSync(file, 'utf8'))
  return { radiusM: j.radius_m, size: j.size, pixelM: j.pixel_m, patches: j.patches }
}

export function readPatch(index: PatchIndex, id: string): Terrain {
  const entry = index.patches.find((p) => p.id === id)
  if (!entry) throw new Error(`no patch ${id}`)
  return patchTerrain(index, entry, heights(new URL(`patches/${entry.file}`, data)).h)
}

export interface HorizonVector {
  name: string
  lat: number
  lon: number
  observer_height_m: number
  az_step_deg: number
  elev_deg: number[]
  patch?: string | null
}

export function readVectors(path: string): HorizonVector[] | null {
  const file = new URL(path, data)
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null
}
