import { describe, expect, it } from 'vitest'
import {
  assumptionsText,
  DEFAULT_ASSUMPTIONS,
  earthRuleText,
  horizonKey,
  isDefaultAssumptions,
  SUN_RULES,
  sunRuleOf,
  sunRuleText,
} from './assumptions'
import { rankWindows, windowStats } from './landing'
import { changeAfter, DEFAULT_CRITERIA, hasComm, isSunlit, summarise, type Criteria, type Series } from './windows'

const HOUR = 3600000

/** A series at 1-hour steps from the fraction of the Sun's disc in view and Earth's height over the terrain. */
function series(sunFrac: number[], earthClear: number[] = sunFrac.map(() => 1)): Series {
  const n = sunFrac.length
  return {
    t0Ms: Date.UTC(2027, 0, 1),
    stepMs: HOUR,
    count: n,
    sunEl: new Float32Array(n).fill(1),
    sunAz: new Float32Array(n),
    sunFrac: Float32Array.from(sunFrac),
    earthEl: new Float32Array(n),
    earthAz: new Float32Array(n),
    earthFrac: new Float32Array(n).fill(1),
    earthClear: Float32Array.from(earthClear),
  }
}

const rule = (id: 'any' | 'half' | 'all', earthMaskDeg = 0): Criteria => ({ minSunFrac: SUN_RULES.find((r) => r.id === id)!.minSunFrac, earthMaskDeg })

// A crest: the Sun grazes the skyline. 20 hours: dark 2, a sliver 4, most of the disc 4, all of it 4,
// most 2, a sliver 2, dark 2.
const crest = series([0, 0, 0.2, 0.2, 0.2, 0.2, 0.7, 0.7, 0.7, 0.7, 1, 1, 1, 1, 0.7, 0.7, 0.2, 0.2, 0, 0])

describe('the sunlit rule', () => {
  it('gives three different sunlit shares and longest nights on the same series', () => {
    const any = summarise(crest, rule('any'))
    const half = summarise(crest, rule('half'))
    const all = summarise(crest, rule('all'))
    expect([any.sunShare, half.sunShare, all.sunShare]).toEqual([16 / 20, 10 / 20, 4 / 20])
    expect([any.longestDarkH, half.longestDarkH, all.longestDarkH]).toEqual([2, 6, 10])
    // The default is the half-disc rule.
    expect(summarise(crest)).toEqual(half)
    expect(summarise(crest, DEFAULT_CRITERIA)).toEqual(half)
  })

  it('is followed by the landing-date figures and ranking', () => {
    expect(windowStats(crest, crest.t0Ms, 20 / 24, rule('any'))?.sunShare).toBe(0.8)
    expect(windowStats(crest, crest.t0Ms, 20 / 24, rule('all'))?.longestDarkH).toBe(10)
    // A 4-hour stay: fully lit from hour 2 with "any part", only from hour 10 with "all of it".
    const wants = { sunHigh: true, earthHigh: true }
    const first = (c: Criteria) => rankWindows(crest, 4 / 24, wants, { everyH: 1, top: 1, criteria: c })[0].stats.startMs
    expect((first(rule('any')) - crest.t0Ms) / HOUR).toBe(2)
    expect((first(rule('half')) - crest.t0Ms) / HOUR).toBe(6)
    expect((first(rule('all')) - crest.t0Ms) / HOUR).toBe(10)
  })

  it('names the rule a threshold stands for', () => {
    expect(SUN_RULES.map((r) => sunRuleOf({ minSunFrac: r.minSunFrac, earthMaskDeg: 0 }))).toEqual(['any', 'half', 'all'])
    expect(sunRuleText(DEFAULT_CRITERIA)).toBe("at least half the Sun's disc is above the terrain")
    expect(sunRuleText(rule('any'))).toBe("any part of the Sun's disc is above the terrain")
    expect(isSunlit(crest, 2, rule('any'))).toBe(true)
    expect(isSunlit(crest, 2, rule('half'))).toBe(false)
    expect(isSunlit(crest, 6, rule('all'))).toBe(false)
  })
})

describe('the Earth mask', () => {
  // Earth's centre over the terrain, degrees: 10 hours climbing from -1 to +8.
  const s = series(new Array(10).fill(1), [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8])

  it('changes the share of time with a link and the longest gap', () => {
    expect([0, 2, 5, 10].map((m) => summarise(s, rule('half', m)).commShare)).toEqual([0.9, 0.7, 0.4, 0])
    expect([0, 2, 5, 10].map((m) => summarise(s, rule('half', m)).longestNoCommH)).toEqual([1, 3, 6, 10])
    expect(hasComm(s, 3, rule('half', 2))).toBe(true)
    expect(hasComm(s, 3, rule('half', 5))).toBe(false)
  })

  it('is stated in words', () => {
    expect(earthRuleText(DEFAULT_CRITERIA)).toBe("Earth's centre is above the terrain")
    expect(earthRuleText(rule('half', 5))).toBe("Earth's centre is at least 5° above the terrain")
    expect(earthRuleText(rule('half', 5), ' deg')).toBe("Earth's centre is at least 5 deg above the terrain")
    expect(assumptionsText(DEFAULT_ASSUMPTIONS)).toBe(
      "Sunlit means at least half the Sun's disc is above the terrain; Earth in view means Earth's centre is above the terrain; panel and antenna 2 m above the ground.",
    )
    expect(assumptionsText({ criteria: rule('any', 10), observerM: 5 })).toBe(
      "Sunlit means any part of the Sun's disc is above the terrain; Earth in view means Earth's centre is at least 10° above the terrain; panel and antenna 5 m above the ground.",
    )
  })
})

describe('defaults and the horizon cache', () => {
  it('knows when anything is not the default', () => {
    expect(isDefaultAssumptions(DEFAULT_ASSUMPTIONS)).toBe(true)
    expect(isDefaultAssumptions({ criteria: { ...DEFAULT_CRITERIA }, observerM: 2 })).toBe(true)
    expect(isDefaultAssumptions({ criteria: rule('any'), observerM: 2 })).toBe(false)
    expect(isDefaultAssumptions({ criteria: rule('half', 2), observerM: 2 })).toBe(false)
    expect(isDefaultAssumptions({ criteria: DEFAULT_CRITERIA, observerM: 5 })).toBe(false)
  })

  it('keeps one horizon per observer height', () => {
    const k2 = horizonKey(-89.45, -137.2, 'crest+patch', true, 2)
    expect(horizonKey(-89.45, -137.2, 'crest+patch', true, 2)).toBe(k2)
    expect(horizonKey(-89.45, -137.2, 'crest+patch', true, 5)).not.toBe(k2)
    expect(horizonKey(-89.45, -137.2, 'crest+patch', true, 10)).not.toBe(horizonKey(-89.45, -137.2, 'crest+patch', true, 5))
    expect(new Set([2, 5, 10].map((h) => horizonKey(0, 0, '', false, h))).size).toBe(3)
    expect(k2.endsWith(',2')).toBe(true)
  })
})

describe('changeAfter', () => {
  it('measures from the exact time to the first later sample in the other state', () => {
    const lit = (c: Criteria) => (i: number) => isSunlit(crest, i, c)
    // Half past hour 3, dark by the half-disc rule: sunrise at hour 6 is 2.5 h away.
    expect(changeAfter(crest, crest.t0Ms + 3.5 * HOUR, false, lit(rule('half')))).toEqual({ now: false, inHours: 2.5 })
    // The same moment is already sunlit with "any part"; that rule's sunset is at hour 18.
    expect(changeAfter(crest, crest.t0Ms + 3.5 * HOUR, true, lit(rule('any')))).toEqual({ now: true, inHours: 14.5 })
    // No change left in the series.
    expect(changeAfter(crest, crest.t0Ms + 18.5 * HOUR, false, lit(rule('half')))).toEqual({ now: false, inHours: null })
  })
})
