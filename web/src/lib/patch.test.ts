// Two-level site patches (docs/DATA_CONTRACT.md): lookup order inside a patch terrain and the
// choice of patch for a point, on synthetic data and on the published patches.json.
import { describe, expect, it } from 'vitest'
import { upVector } from './geo'
import {
  frameDirection,
  patchCovering,
  patchesCovering,
  patchFrame,
  patchTerrain,
  sampleDir,
  sampleXY,
  slopeAt,
  sourceHeight,
  type PatchEntry,
  type PatchIndex,
} from './terrain'
import { readPatch, readPatchIndex } from './testData'

const R = 1737400
const entry = (id: string, lat: number, lon: number, extra: Partial<PatchEntry> = {}): PatchEntry => ({
  id,
  lat,
  lon,
  file: `${id}.png`,
  sites: [],
  source: 'test',
  ...extra,
})
const OUTER = { file: 'x.outer.png', size: 768, pixel_m: 160 }
const flat = (n: number, v: number) => new Float32Array(n * n).fill(v)
/** A point `km` north of (lat, lon), along the meridian. */
const north = (lat: number, km: number) => lat + ((km * 1000) / R) * (180 / Math.PI)

describe('two-level patch terrain', () => {
  const index: PatchIndex = { radiusM: R, size: 768, pixelM: 80, patches: [] }
  const e = entry('site', 20, 30, { outer: OUTER })
  const t = patchTerrain(index, e, flat(768, 100), flat(768, 200))

  it('has levels coarse to fine: [outer 160 m, fine 80 m]', () => {
    expect(t.levels.map((l) => [l.size, l.pixel, l.xMin, l.xMax, l.yMin, l.yMax])).toEqual([
      [768, 160, -61440, 61440, -61440, 61440],
      [768, 80, -30720, 30720, -30720, 30720],
    ])
  })

  it('takes the fine level inside it, the outer level beyond, and nothing outside', () => {
    expect(sampleXY(t, 0, 0)).toBe(100)
    expect(sampleXY(t, 30000, -30000)).toBe(100)
    // the fine level ends at its last pixel centre (30680 m); the outer level takes over
    expect(sampleXY(t, 30700, 0)).toBe(200)
    expect(sampleXY(t, -45000, 52000)).toBe(200)
    expect(sampleXY(t, 61360, -61360)).toBe(200)
    expect(sampleXY(t, 61400, 0)).toBeNaN()
    expect(sampleXY(t, 0, -90000)).toBeNaN()
  })

  it('falls through to the outer level where the fine level has no data', () => {
    const h = flat(768, 100)
    h[384 * 768 + 384] = NaN
    const holed = patchTerrain(index, e, h, flat(768, 200))
    expect(sampleXY(holed, 40, -40)).toBe(200) // one of the four fine pixels around this point is missing
    expect(sampleXY(holed, 4000, 4000)).toBe(100)
  })

  it('looks up by direction and hands over to the next source beyond the outer level', () => {
    const f = patchFrame(20, 30)
    const at = (x: number, y: number) => frameDirection(f, x, y, R)
    expect(sampleDir(t, ...at(1000, 2000))).toBe(100)
    expect(sampleDir(t, ...at(50000, 2000))).toBe(200)
    expect(sampleDir(t, ...at(70000, 0))).toBeNaN()
    const below = patchTerrain(index, entry('below', 20, 30, { size: 1024, pixel_m: 1000 }), flat(1024, 300))
    const src = { terrains: [t, below], global: null }
    expect(sourceHeight(src, ...at(0, 0))).toBe(100)
    expect(sourceHeight(src, ...at(0, 60000))).toBe(200)
    expect(sourceHeight(src, ...at(0, 70000))).toBe(300)
  })

  it('measures slope on the finest level that has the point', () => {
    // fine level flat, outer level tilted 1 m per 160 m pixel towards east
    const tilted = new Float32Array(768 * 768)
    for (let r = 0; r < 768; r++) for (let c = 0; c < 768; c++) tilted[r * 768 + c] = c
    const tt = patchTerrain(index, e, flat(768, 100), tilted)
    expect(slopeAt(tt, 20, 30)).toBe(0)
    const lat = north(20, 45)
    const scale = 1 + (45000 * 45000) / (4 * R * R)
    expect(slopeAt(tt, lat, 30)).toBeCloseTo(Math.atan((1 / 160) * scale) * (180 / Math.PI), 3)
  })

  it('keeps a patch without an outer level as one level', () => {
    const one = patchTerrain(index, entry('plain', 20, 30), flat(768, 100))
    expect(one.levels.length).toBe(1)
    expect(sampleXY(one, 30700, 0)).toBeNaN()
    // outer heights without an "outer" field in the entry are ignored
    expect(patchTerrain(index, entry('plain', 20, 30), flat(768, 100), flat(768, 200)).levels.length).toBe(1)
    const crest = patchTerrain(index, entry('c', -85, 10, { size: 512, pixel_m: 20, kind: 'crest20', render: false }), flat(512, 5))
    expect(crest.levels.map((l) => [l.size, l.pixel, l.xMax])).toEqual([[512, 20, 5120]])
    expect([crest.kind, crest.render, crest.id]).toEqual(['crest20', false, 'c'])
  })
})

describe('patchCovering with outer levels (synthetic index)', () => {
  const index: PatchIndex = {
    radiusM: R,
    size: 768,
    pixelM: 80,
    patches: [
      entry('two-level', 20, 30, { outer: OUTER }),
      entry('one-level', 20, 60),
      entry('polar-80', -80.13, 1.44, { outer: OUTER }),
      entry('polar-20', -80.13, 1.44, { size: 512, pixel_m: 20, kind: 'crest20', render: false }),
    ],
  }
  const id = (lat: number, lon: number) => patchCovering(index, lat, lon)?.id ?? null

  it('covers the outer extent less the 2 km margin when there is an outer level', () => {
    expect(id(20, 30)).toBe('two-level')
    expect(id(north(20, 40), 30)).toBe('two-level')
    expect(id(north(20, 59), 30)).toBe('two-level')
    expect(id(north(20, 60), 30)).toBeNull() // map y is about 60.02 km: inside the 2 km margin (59.44 km)
  })

  it('keeps the fine extent for a patch without an outer level', () => {
    expect(id(north(20, 28), 60)).toBe('one-level')
    expect(id(north(20, 29), 60)).toBeNull()
    expect(id(north(20, 40), 60)).toBeNull()
  })

  it('prefers the 20 m patch where both cover the point, the 80 m patch elsewhere', () => {
    expect(id(-80.13, 1.44)).toBe('polar-20')
    expect(id(north(-80.13, -3.5), 1.44)).toBe('polar-20')
    expect(id(north(-80.13, -3.7), 1.44)).toBe('polar-80') // 20 m patch margin: 30 % of 5.12 km
    expect(id(north(-80.13, -40), 1.44)).toBe('polar-80')
  })
})

describe('published patches', () => {
  const index = readPatchIndex()!
  const id = (lat: number, lon: number) => patchCovering(index, lat, lon)?.id ?? null

  it('chooses the 20 m patch at each polar lander', () => {
    expect(id(-84.7906, 29.1957)).toBe('im-2-athena-20m')
    expect(id(-84.6796, -48.7093)).toBe('lcross-centaur-20m')
    expect(id(-85.28, 53.27)).toBe('griffin-1-20m')
    expect(id(-80.13, 1.44)).toBe('im-1-odysseus-20m')
    for (const pid of ['im-2-athena-20m', 'lcross-centaur-20m', 'griffin-1-20m', 'im-1-odysseus-20m']) {
      const p = index.patches.find((q) => q.id === pid)!
      expect([p.kind, p.render, p.size, p.pixel_m, p.sites.length]).toEqual(['crest20', false, 512, 20, 1])
    }
  })

  it('chooses the 80 m patch 40 km from a mid-latitude site, and beyond the 20 m patch at IM-1', () => {
    expect(id(26.13239, 3.6333)).toBe('apollo-15')
    expect(id(north(26.13239, 40), 3.6333)).toBe('apollo-15')
    expect(id(north(-80.13, -10), 1.44)).toBe('im-1-odysseus')
    expect(id(30, -100)).toBeNull()
  })

  it('loads both levels of a site patch and one level of a 20 m patch', () => {
    const a15 = readPatch(index, 'apollo-15')
    expect(a15.levels.map((l) => [l.size, l.pixel])).toEqual([
      [768, 160],
      [768, 80],
    ])
    // 40 km north of the site the height comes from the outer level and is real terrain
    const u = upVector(north(26.13239, 40), 3.6333)
    const h = sampleDir(a15, u[0], u[1], u[2])
    expect(h).toBeGreaterThan(-4000)
    expect(h).toBeLessThan(3000)
    expect(readPatch(index, 'im-2-athena-20m').levels.map((l) => [l.size, l.pixel])).toEqual([[512, 20]])
  })
})

describe('all patches covering a point', () => {
  const index = readPatchIndex()!
  it('at IM-1 gives the 20 m patch first, then the 80 m site patch', () => {
    expect(patchesCovering(index, -80.13, 1.44).map((p) => p.id)).toEqual(['im-1-odysseus-20m', 'im-1-odysseus'])
  })
  it('at a mid-latitude site gives just its 80 m patch, and nothing in open ground', () => {
    expect(patchesCovering(index, 26.13239, 3.6333).map((p) => p.id)).toEqual(['apollo-15'])
    expect(patchesCovering(index, 60, -120)).toEqual([])
  })
  it('agrees with patchCovering on the first choice', () => {
    for (const [lat, lon] of [[-80.13, 1.44], [26.13, 3.63], [-89.4399, -137.15], [0.674, 23.47], [60, -120]]) {
      expect(patchesCovering(index, lat, lon)[0]?.id).toBe(patchCovering(index, lat, lon)?.id)
    }
  })
})
