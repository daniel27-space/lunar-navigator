import { describe, expect, it } from 'vitest'
import { measures, type SiteFacts } from '../lib/verdict'
import type { Summary } from '../lib/windows'
import { verdictSentence } from './verdictSentence'

const site = (label: string, s: Partial<Summary>, slopeDeg = 3): SiteFacts => ({
  label,
  slopeDeg,
  summary: { sunShare: 0.5, commShare: 0.5, bothShare: 0.3, longestSunH: 100, longestDarkH: 100, longestCommH: 100, longestNoCommH: 100, maxSunEl: 2, ...s },
})
const solar = { sunHigh: true, earthHigh: true }

describe('verdictSentence', () => {
  it('names one leader with at most two reasons', () => {
    const ms = measures([site('x', {}), site('y', { sunShare: 0.52, longestDarkH: 48, commShare: 1 }), site('z', {})], solar)
    expect(verdictSentence(ms, ['A', 'B', 'C'], 'a solar lander')).toEqual({
      leader: 1,
      text: 'suits a solar lander best: shortest night (2.0 d) and Earth always in view.',
      sub: 'Leads on 2 of 5 measures.',
    })
  })

  it('says so when wins are split, with one reason per site', () => {
    const ms = measures([site('x', { sunShare: 0.8 }), site('y', {}, 0.4)], solar)
    const v = verdictSentence(ms, ['A', 'B'], 'a solar lander')
    expect(v.leader).toBe(-1)
    expect(v.text).toBe('No single site leads. A: most sunlight (80%); B: flattest ground (0.4°).')
  })

  it('says so when nothing separates the sites', () => {
    const ms = measures([site('x', {}), site('y', { sunShare: 0.51 })], solar)
    expect(verdictSentence(ms, ['A', 'B'], 'a solar lander')).toEqual({
      leader: -1,
      text: 'Too close to call: nothing measured here separates these sites.',
      sub: '',
    })
  })

  it('follows the mission: least sunlight wins for ice prospecting', () => {
    const ms = measures([site('x', { sunShare: 0.02 }), site('y', { sunShare: 0.4 })], { sunHigh: false, earthHigh: true })
    expect(verdictSentence(ms, ['A', 'B'], 'ice prospecting').text).toBe('suits ice prospecting best: least sunlight (2%).')
  })
})
