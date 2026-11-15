// The countdown to the next sunrise or sunset must not depend on where the 60-day chart
// happens to start. Found by a judge at Apollo 11 on 2027-04-28 05:49 UTC: the card read
// "Sunrise > 60 d", and "Sunrise in 13.2 d" once the chart had re-centred.
import { describe, expect, it } from 'vitest'
import { changeAhead, DAY, WINDOW_DAYS } from './useSiteAnalysis'

const STEP = 20 * 60000
const T = Date.UTC(2027, 3, 28, 5, 49)
// Dark until a sunrise 13.2 days after T, then lit.
const SUNRISE = T + 13.2 * DAY
const lit = (s: { t0Ms: number; stepMs: number }, i: number) => s.t0Ms + i * s.stepMs >= SUNRISE
const chart = (start: number) => ({ t0Ms: start, stepMs: STEP, count: Math.floor((WINDOW_DAYS * DAY) / STEP) + 1 })
const after = (start: number) => ({ t0Ms: start + WINDOW_DAYS * DAY + STEP, stepMs: STEP, count: Math.floor((WINDOW_DAYS * DAY - STEP) / STEP) + 1 })

describe('countdown to the next change', () => {
  it('is the same wherever the chart starts, also when the time is near the chart\'s end', () => {
    const centred = T - 2 * DAY // the chart as it is after re-centring
    const late = T - 55 * DAY // the same time, five days before the chart's end
    const a = changeAhead(chart(centred), after(centred), T, false, lit)
    const b = changeAhead(chart(late), after(late), T, false, lit)
    expect(a.inHours).not.toBeNull()
    expect(b.inHours).not.toBeNull()
    // both land on the first 20-minute step at or after the sunrise
    expect(Math.abs(a.inHours! - 13.2 * 24)).toBeLessThan(1 / 3 + 1e-9)
    expect(Math.abs(b.inHours! - a.inHours!)).toBeLessThan(1 / 3 + 1e-9)
  })

  it('says none only when there is none in the chart or the period after it', () => {
    const never = () => false
    expect(changeAhead(chart(T - 55 * DAY), after(T - 55 * DAY), T, false, never).inHours).toBeNull()
    // without the period after, the old behaviour: nothing found past the chart's end
    expect(changeAhead(chart(T - 55 * DAY), null, T, false, lit).inHours).toBeNull()
  })
})
