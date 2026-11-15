import { describe, expect, it } from 'vitest'
import type { WindowStats } from '../lib/landing'
import { landingSentence, slipSentence } from './landingSentence'

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
  it('says "that is the selected time" only for the very same start, and names a short night five hours away', () => {
    expect(landingSentence(stay({}), stay({}), 14, solar)).toBe('Landing 3 Mar 2027 gives 14 days of unbroken sunlight. That is the selected time.')
    expect(landingSentence(stay({}), stay({ startMs: T - 5 * 3600000, sunShare: 333 / 336, longestDarkH: 3 }), 14, solar)).toBe(
      'Landing 3 Mar 2027 gives 14 days of unbroken sunlight; the selected time is almost as good, with one night of 3.0 hours.',
    )
  })

  it('compares the best stay with the selected time', () => {
    expect(landingSentence(stay({}), stay({ startMs: later, sunShare: 6 / 14, longestDarkH: 120 }), 14, solar)).toBe(
      'Landing 3 Mar 2027 gives 14 days of unbroken sunlight; at the selected time you would get 6.0 days and a night of 5.0 days.',
    )
  })

  it('describes a best stay that is not fully lit', () => {
    expect(landingSentence(stay({ sunShare: 0.5, longestDarkH: 100 }), stay({ startMs: later, sunShare: 0 , longestDarkH: 336 }), 14, solar)).toBe(
      'Landing 3 Mar 2027 ranks best, with 7.0 days of sunlight in 14 and a night of 4.2 days; at the selected time the whole stay would be dark.',
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
    expect(landingSentence(stay({ sunShare: 0, longestDarkH: 336 }), stay({ startMs: later, sunShare: 0, longestDarkH: 336 }), 14, solar, false)).toBe(
      'No 14-day stay in the period checked gets any sunlight here; the selected time is as good.',
    )
    expect(landingSentence(stay({ sunShare: 0, longestDarkH: 336 }), stay({ startMs: later, sunShare: 0, longestDarkH: 336, commShare: 0.2 }), 14, solar, false)).toBe(
      'No 14-day stay in the period checked gets any sunlight here; landing 3 Mar 2027 keeps Earth in view 100% of the stay against 20% at the selected time.',
    )
    // The site does get sunlight at other times, but Earth view put a dark stay first: do not claim "no stay".
    expect(landingSentence(stay({ sunShare: 0, longestDarkH: 336 }), stay({ startMs: later, sunShare: 0.5, commShare: 0, longestDarkH: 100 }), 14, solar)).toBe(
      'The best-ranked stay, landing 3 Mar 2027, gets no sunlight; at the selected time you would get 7.0 days and a night of 4.2 days. Earth is in view 100% of that stay against 0% at the selected time.',
    )
    expect(landingSentence(null, null, 30, solar)).toBe('There is not enough data ahead to check a 30-day stay.')
  })

  it('looks for darkness when the mission wants it', () => {
    expect(landingSentence(stay({ sunShare: 0 }), stay({ startMs: later, sunShare: 0.25 }), 14, ice)).toBe(
      'Landing 3 Mar 2027 gives 14 days without direct sunlight; at the selected time the site would be sunlit for 3.5 days.',
    )
    expect(landingSentence(stay({ sunShare: 0.5 }), stay({ startMs: later, sunShare: 0.5 }), 14, ice)).toBe(
      'Landing 3 Mar 2027 ranks best, sunlit for 7.0 days of 14 days; the selected time is as good.',
    )
  })

  it('does not call the selected time as good when only Earth view differs (ice goal, both dark)', () => {
    const best = stay({ startMs: Date.UTC(2028, 3, 16), sunShare: 0, longestDarkH: 336, commShare: 0.93, longestNoCommH: 22 })
    const sel = stay({ startMs: later, sunShare: 0, longestDarkH: 336, commShare: 0.08, longestNoCommH: 12.8 * 24 })
    expect(landingSentence(best, sel, 14, ice)).toBe(
      'Both stays get no direct sunlight, but landing 16 Apr 2028 keeps Earth in view 93% of the stay against 8% at the selected time (longest gap 22 hours against 12.8 days).',
    )
  })

  it('names what is equal and what differs when both stays are fully lit', () => {
    expect(landingSentence(stay({}), stay({ startMs: later, commShare: 0.5, longestNoCommH: 6 }), 14, solar)).toBe(
      'Both stays are sunlit throughout, but landing 3 Mar 2027 keeps Earth in view 100% of the stay against 50% at the selected time.',
    )
  })

  it('counts a longer Earth gap as a difference even when the shares are close', () => {
    expect(landingSentence(stay({ commShare: 0.9, longestNoCommH: 10 }), stay({ startMs: later, commShare: 0.89, longestNoCommH: 30 }), 14, solar)).toBe(
      'Both stays are sunlit throughout, but landing 3 Mar 2027 keeps Earth in view 90% of the stay against 89% at the selected time (longest gap 10 hours against 30 hours).',
    )
  })

  it('adds the Earth difference when sunlight differs too', () => {
    expect(landingSentence(stay({}), stay({ startMs: later, sunShare: 0.5, longestDarkH: 168, commShare: 0.4 }), 14, solar)).toBe(
      'Landing 3 Mar 2027 gives 14 days of unbroken sunlight; at the selected time you would get 7.0 days and a night of 7.0 days. Earth is in view 100% of that stay against 40% at the selected time.',
    )
  })
})

describe('slipSentence', () => {
  const base = stay({ startMs: Date.UTC(2026, 10, 14), commShare: 0.85, longestNoCommH: 2.1 * 24 })
  const slip = Date.UTC(2026, 11, 5)

  it('states what a slip keeps and what it costs', () => {
    expect(slipSentence(base, stay({ startMs: slip, commShare: 0.41, longestNoCommH: 8.3 * 24 }), solar)).toBe(
      'Slipping 21 days, from 14 Nov to 5 Dec, keeps sunlight at 100% but cuts Earth view from 85% to 41% and lengthens the longest Earth gap from 2.1 days to 8.3 days.',
    )
  })

  it('lists gains with what is kept, and says so when there are only losses', () => {
    expect(slipSentence(base, stay({ startMs: slip, commShare: 1, longestNoCommH: 0 }), solar)).toBe(
      'Slipping 21 days, from 14 Nov to 5 Dec, keeps sunlight at 100%, raises Earth view from 85% to 100% and shortens the longest Earth gap from 2.1 days to none.',
    )
    expect(slipSentence(base, stay({ startMs: slip, sunShare: 0.5, longestDarkH: 168, commShare: 0.2, longestNoCommH: 240 }), solar)).toBe(
      'Slipping 21 days, from 14 Nov to 5 Dec, cuts sunlight from 100% to 50%, lengthens the longest night from none to 7.0 days, cuts Earth view from 85% to 20% and lengthens the longest Earth gap from 2.1 days to 10.0 days.',
    )
  })

  it('judges gains and losses by the mission: less sunlight is a gain for ice prospecting', () => {
    expect(slipSentence(stay({ startMs: Date.UTC(2026, 10, 14), sunShare: 0.5, longestDarkH: 168 }), stay({ startMs: slip, sunShare: 0, longestDarkH: 336, commShare: 0.5, longestNoCommH: 100 }), ice)).toBe(
      'Slipping 21 days, from 14 Nov to 5 Dec, cuts sunlight from 50% to 0% and lengthens the longest night from 7.0 days to 14.0 days but cuts Earth view from 100% to 50% and lengthens the longest Earth gap from none to 4.2 days.',
    )
  })

  it('handles an earlier date, another year, the baseline itself and dates that cannot be checked', () => {
    expect(slipSentence(base, stay({ startMs: Date.UTC(2027, 0, 9), commShare: 0.85, longestNoCommH: 2.1 * 24 }), solar)).toBe(
      'Slipping 56 days, from 14 Nov 2026 to 9 Jan 2027, keeps sunlight at 100% and keeps Earth view at 85%.',
    )
    expect(slipSentence(base, stay({ startMs: Date.UTC(2026, 10, 1), commShare: 0.85, longestNoCommH: 2.1 * 24 }), solar)).toMatch(/^Moving earlier, from 14 Nov to 1 Nov keeps/)
    expect(slipSentence(base, base, solar)).toMatch(/^The selected time is the baseline: sunlight 100%, Earth view 85%\./)
    // A slip that is not a whole number of days keeps the plain wording; one day is singular.
    expect(slipSentence(base, stay({ startMs: slip + 6 * 3600000, commShare: 0.85, longestNoCommH: 2.1 * 24 }), solar)).toBe(
      'Slipping from 14 Nov to 5 Dec keeps sunlight at 100% and keeps Earth view at 85%.',
    )
    expect(slipSentence(base, stay({ startMs: Date.UTC(2026, 10, 15), commShare: 0.85, longestNoCommH: 2.1 * 24 }), solar)).toMatch(/^Slipping 1 day, from 14 Nov to 15 Nov, keeps/)
    expect(slipSentence(base, null, solar)).toMatch(/outside the period/)
    expect(slipSentence(null, base, solar)).toMatch(/baseline date is outside/)
  })
})
