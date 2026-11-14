// The browser horizon code, run on the published data files with the full height lookup chain
// (site patch, south-pole tiles, whole-Moon map), must reproduce the Python reference
// implementation (pipeline/terrain/horizon.py) at the published test points.
import { describe, expect, it } from 'vitest'
import { computeHorizon } from './horizon'
import { readGlobalDem, readPatch, readPatchIndex, readPolarTerrain, readVectors, type HorizonVector } from './testData'

const polar = readPolarTerrain()
const global = readGlobalDem()

function worstDifference(v: HorizonVector, terrains = [polar]): number {
  const hz = computeHorizon({ terrains, global }, v.lat, v.lon, {
    observerHeightM: v.observer_height_m,
    azStepDeg: v.az_step_deg,
  })
  let worst = 0
  for (let i = 0; i < v.elev_deg.length; i++) worst = Math.max(worst, Math.abs(hz.elevDeg[i] - v.elev_deg[i]))
  return worst
}

describe('horizon at south-pole points vs the Python reference', () => {
  for (const v of readVectors('terrain/horizon_testvectors.json')!) {
    it(`${v.name} matches to 0.001 degrees`, () => {
      const worst = worstDifference(v)
      console.log(`${v.name}: worst difference ${worst.toExponential(2)} deg`)
      expect(worst).toBeLessThan(0.001)
    })
  }
})

describe('horizon at mission-site patches vs the Python reference', () => {
  const index = readPatchIndex()
  const vectors = readVectors('patches/patch_testvectors.json')
  it('has patches and reference vectors published', () => {
    expect(index?.patches.length ?? 0).toBeGreaterThan(0)
    expect(vectors?.length ?? 0).toBeGreaterThan(0)
  })
  for (const v of vectors ?? []) {
    it(`${v.name} matches to 0.001 degrees`, () => {
      const terrains = v.patch ? [readPatch(index!, v.patch), polar] : [polar]
      const worst = worstDifference(v, terrains)
      console.log(`${v.name}: worst difference ${worst.toExponential(2)} deg`)
      expect(worst).toBeLessThan(0.001)
    })
  }
})
