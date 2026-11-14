import { describe, expect, it } from 'vitest'
import { measures, verdict, type SiteFacts } from './verdict'
import type { Summary } from './windows'

const site = (label: string, s: Partial<Summary>, slopeDeg = 3): SiteFacts => ({
  label,
  slopeDeg,
  summary: { sunShare: 0.5, commShare: 0.5, bothShare: 0.3, longestSunH: 100, longestDarkH: 100, longestCommH: 100, longestNoCommH: 100, maxSunEl: 2, ...s },
})
const solar = { sunHigh: true, earthHigh: true }

describe('verdict', () => {
  it('names the winner with both values, and skips measures that are close', () => {
    const v = verdict([site('A', { sunShare: 0.64, longestDarkH: 60 }), site('B', { sunShare: 0.41, longestDarkH: 240 })], solar)
    expect(v.lines.map((l) => l.text)).toEqual([
      'A gets the most sunlight: 64%, against 41% for B.',
      'A has the shortest night: 2.5 days, against 10.0 days for B.',
    ])
    expect(v.lines.every((l) => l.winner === 0)).toBe(true)
    expect(v.overall).toBe('A leads on 2 of 5 measures.')
  })

  it('flips what counts as better when the mission wants darkness', () => {
    const sites = [site('A', { sunShare: 0.02 }), site('B', { sunShare: 0.4 })]
    expect(measures(sites, solar)[0].winner).toBe(1)
    const ice = measures(sites, { sunHigh: false, earthHigh: true })
    expect(ice[0].winner).toBe(0)
    expect(verdict(sites, { sunHigh: false, earthHigh: true }).lines[0].text).toBe('A gets the least sunlight: 2%, against 40% for B.')
  })

  it('says so when nothing separates the sites, or when wins are split', () => {
    expect(verdict([site('A', {}), site('B', { sunShare: 0.51 })], solar)).toEqual({
      lines: [],
      overall: 'These sites are too close to separate on anything measured here.',
    })
    const split = verdict([site('A', { sunShare: 0.8 }), site('B', { commShare: 0.9 })], solar)
    expect(split.lines).toHaveLength(2)
    expect(split.overall).toMatch(/^No single site leads/)
  })

  it('does not pick a winner on a measure with an unknown value', () => {
    const ms = measures([site('A', {}, NaN), site('B', {}, 1)], solar)
    expect(ms.find((m) => m.id === 'slope')!.winner).toBe(-1)
  })

  it('compares three sites', () => {
    const v = verdict([site('A', { commShare: 1 }), site('B', { commShare: 0.2 }), site('C', { commShare: 0.6 })], solar)
    expect(v.lines[0].text).toBe('A sees Earth the most: 100%, against 20% for B and 60% for C.')
  })
})
