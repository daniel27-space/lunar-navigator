import { describe, expect, it } from 'vitest'
import type { WindowStats } from '../lib/landing'
import { landingSentence } from './landingSentence'

const T = Date.UTC(2027, 2, 3)
const stay = (s: Partial<WindowStats>): WindowStats => ({
  startMs: T,
  days: 14,
  sunShare: 1,
  commShare: 1,
  longestDarkH: 0,
  longestNoCommH: 0,
  meanSunElLit: 3,
  minSunElLit: 1,
  ...s,
})
const solar = { sunHigh: true, earthHigh: true }
const ice = { sunHigh: false, earthHigh: true }
const later = T + 40 * 86400000

describe('landingSentence', () => {
  it('compares the best stay with the selected time', () => {
    expect(landingSentence(stay({}), stay({ startMs: later, sunShare: 6 / 14, longestDarkH: 120 }), 14, solar)).toBe(
      'Landing 3 Mar 2027 gives 14 days of unbroken sunlight; at the selected time you would get 6.0 days and a night of 5.0 days.',
    )
  })

  it('describes a best stay that is not fully lit', () => {
    expect(landingSentence(stay({ sunShare: 0.5, longestDarkH: 100 }), stay({ startMs: later, sunShare: 0 , longestDarkH: 336 }), 14, solar)).toBe(
      'Landing 3 Mar 2027 gives the most sunlight, 7.0 days of 14, with a night of 4.2 days; at the selected time the whole stay would be dark.',
    )
  })

  it('says so when the selected time is the best stay, as good, or cannot be checked', () => {
    expect(landingSentence(stay({}), stay({}), 14, solar)).toBe('Landing 3 Mar 2027 gives 14 days of unbroken sunlight. That is the selected time.')
    expect(landingSentence(stay({}), stay({ startMs: later }), 14, solar)).toBe('Landing 3 Mar 2027 gives 14 days of unbroken sunlight; the selected time is as good.')
    expect(landingSentence(stay({}), null, 14, solar)).toBe(
      'Landing 3 Mar 2027 gives 14 days of unbroken sunlight; the selected time is outside the period that can be checked.',
    )
  })

  it('is plain when no stay has sunlight, or there is no data for a stay', () => {
    expect(landingSentence(stay({ sunShare: 0, longestDarkH: 336 }), stay({ sunShare: 0 }), 14, solar)).toBe(
      'No 14-day stay in the period checked gets any sunlight here.',
    )
    expect(landingSentence(null, null, 30, solar)).toBe('There is not enough data ahead to check a 30-day stay.')
  })

  it('looks for darkness when the mission wants it', () => {
    expect(landingSentence(stay({ sunShare: 0 }), stay({ startMs: later, sunShare: 0.25 }), 14, ice)).toBe(
      'Landing 3 Mar 2027 gives 14 days without direct sunlight; at the selected time the site would be sunlit for 3.5 days.',
    )
    expect(landingSentence(stay({ sunShare: 0.5 }), stay({ startMs: later, sunShare: 0.5 }), 14, ice)).toBe(
      'Landing 3 Mar 2027 is the darkest stay, sunlit for 7.0 days of 14; the selected time is as good.',
    )
  })
})
