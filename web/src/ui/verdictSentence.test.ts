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
      text: 'is the best of these three for a solar lander: shortest night (2.0 d) and Earth always in view.',
      sub: 'Leads on sunlight and Earth link.',
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
    expect(verdictSentence(ms, ['A', 'B'], 'ice prospecting').text).toBe('is the better of these two for ice prospecting: least sunlight (2%).')
  })

  it('counts sunlight and longest night as one win, so a site strong on Earth link and slope leads', () => {
    // x wins sunlight share and night (one group); y wins Earth view and is flatter (two groups).
    const ms = measures([site('x', { sunShare: 0.8, longestDarkH: 20 }), site('y', { commShare: 0.9 }, 0.5)], solar)
    const v = verdictSentence(ms, ['A', 'B'], 'a solar lander')
    expect(v.leader).toBe(1)
    expect(v.sub).toBe('Leads on Earth link and slope.')
  })

  it('states a serious weakness of the leader plainly', () => {
    const ms = measures([site('x', { sunShare: 0.9, longestDarkH: 10, commShare: 0.14, longestNoCommH: 100 }), site('y', { commShare: 0.14 }), site('z', { commShare: 0.14 })], solar)
    expect(verdictSentence(ms, ['A', 'B', 'C'], 'a solar lander')).toEqual({
      leader: 0,
      text: 'is the best of these three for a solar lander: most sunlight (90%), but Earth is in view only 14% of the time.',
      sub: 'Leads on sunlight.',
    })
  })

  it('mirrors the weakness for a goal that wants darkness, and names both when there are two', () => {
    const wants = { sunHigh: false, earthHigh: true }
    const ms = measures([site('x', { sunShare: 0.75, commShare: 0.3 }), site('y', { sunShare: 0.95, commShare: 0.3 })], wants)
    expect(verdictSentence(ms, ['A', 'B'], 'ice prospecting').text).toBe(
      'is the better of these two for ice prospecting: least sunlight (75%), but it is sunlit 75% of the time and Earth is in view only 30% of the time.',
    )
  })

  it('adds no weakness clause when the leader has none', () => {
    const ms = measures([site('x', { sunShare: 0.8 }), site('y', {})], solar)
    expect(verdictSentence(ms, ['A', 'B'], 'a solar lander').text).toBe('is the better of these two for a solar lander: most sunlight (80%).')
  })
})
