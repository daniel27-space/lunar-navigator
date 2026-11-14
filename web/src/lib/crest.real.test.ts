// End-to-end check of the 20 m crest patches in the browser code: at the Shackleton-de Gerlache
// connecting ridge (Glaeser et al. 2014, spot 2, observer 2 m) the longest night must come out
// near the published 4.62 days with the patch, and near 9 days on the 80 m tiles alone, and
// both must agree with the Python reference run on the same published files.
import { describe, expect, it } from 'vitest'
import { skyAt } from './ephem'
import { computeHorizon, discVisibleFraction } from './horizon'
import { patchCovering, sourceHeight } from './terrain'
import { upVector } from './geo'
import { readEphem, readGlobalDem, readJson, readPatch, readPatchIndex, readPolarTerrain } from './testData'

const LAT = -89.4399
const LON = 222.8524 - 360
const HOUR = 3600000

interface Case {
  longest_darkness_days: number
  share_in_light: number
}
interface Ref {
  cases: { with_patch: Case; without_patch: Case }
}

describe('20 m crest patch at the connecting ridge', () => {
  const index = readPatchIndex()
  const ref = readJson<Ref>('patches/crest_reference.json')
  const ephem = readEphem()
  const polar = readPolarTerrain()
  const global = readGlobalDem()

  function run(withPatch: boolean) {
    const terrains = withPatch ? [readPatch(index!, 'connecting-ridge'), polar] : [polar]
    const src = { terrains, global }
    const hz = computeHorizon(src, LAT, LON, { observerHeightM: 2 })
    const u = upVector(LAT, LON)
    const hM = sourceHeight(src, u[0], u[1], u[2]) + 2
    const t0 = Date.parse('2024-01-01T00:00:00Z')
    const t1 = Date.parse('2036-01-01T00:00:00Z')
    let lit = 0
    let n = 0
    let run = 0
    let longest = 0
    // "In light" = any part of the solar disc above the terrain horizon; Earth eclipses ignored.
    for (let t = t0; t < t1; t += HOUR) {
      const sky = skyAt(ephem, t, LAT, LON, hM)
      const on = discVisibleFraction(hz, sky.sun.az, sky.sun.el, sky.sun.radius) > 0
      n++
      if (on) {
        lit++
        run = 0
      } else if (++run > longest) longest = run
    }
    return { longestDarkD: longest / 24, inLight: lit / n }
  }

  it('is published, and a pin on the ridge selects it', () => {
    expect(ref).not.toBeNull()
    expect(patchCovering(index!, LAT, LON)?.id).toBe('connecting-ridge')
  })

  it('with the patch, the longest night is close to the published 4.62 days', () => {
    const r = run(true)
    console.log(`with 20 m patch: longest night ${r.longestDarkD.toFixed(2)} d, in light ${(r.inLight * 100).toFixed(2)} %`)
    expect(Math.abs(r.longestDarkD - 4.62)).toBeLessThan(0.3)
    expect(Math.abs(r.longestDarkD - ref!.cases.with_patch.longest_darkness_days)).toBeLessThan(0.15)
    expect(Math.abs(r.inLight - ref!.cases.with_patch.share_in_light)).toBeLessThan(0.003)
  })

  it('without it, the 80 m tiles give the long night the validation study found', () => {
    const r = run(false)
    console.log(`80 m tiles only: longest night ${r.longestDarkD.toFixed(2)} d, in light ${(r.inLight * 100).toFixed(2)} %`)
    expect(r.longestDarkD).toBeGreaterThan(7)
    expect(Math.abs(r.longestDarkD - ref!.cases.without_patch.longest_darkness_days)).toBeLessThan(0.15)
  })
})
