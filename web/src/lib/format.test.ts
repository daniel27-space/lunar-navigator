import { describe, expect, it } from 'vitest'
import {
  fmtAngle,
  fmtArea,
  fmtCoord,
  fmtDate,
  fmtDateTime,
  fmtDegrees,
  fmtDistance,
  fmtDuration,
  fmtElevation,
  fmtInt,
  fmtMeasure,
  fmtShare,
  fmtShareRange,
  fmtSlope,
  fmtTick,
  MISSING,
} from './format'

const T = ' ' // thin no-break space
const M = '−' // true minus

describe('format', () => {
  it('shares: whole percent, with <1% and >99% at the ends', () => {
    expect(fmtShare(0.48)).toBe('48%')
    expect(fmtShare(0)).toBe('0%')
    expect(fmtShare(1)).toBe('100%')
    expect(fmtShare(0.004)).toBe('<1%')
    expect(fmtShare(0.996)).toBe('>99%')
    expect(fmtShare(NaN)).toBe(MISSING)
    expect(fmtShareRange(0.35, 1)).toBe('35–100%')
  })

  it('durations: hours under 48 h, days from there, none for zero, open-ended past the period', () => {
    expect(fmtDuration(0.5)).toBe('0.5 h')
    expect(fmtDuration(9.96)).toBe('10 h')
    expect(fmtDuration(14.2)).toBe('14 h')
    expect(fmtDuration(47.9)).toBe('48 h')
    expect(fmtDuration(48)).toBe('2.0 d')
    expect(fmtDuration(13.9 * 24)).toBe('13.9 d')
    expect(fmtDuration(0)).toBe('none')
    expect(fmtDuration(null)).toBe('> 60 d')
    expect(fmtDuration(NaN)).toBe(MISSING)
  })

  it('angles: slope unsigned, elevation signed with a true minus, never -0.0', () => {
    expect(fmtSlope(1.14)).toBe('1.1°')
    expect(fmtSlope(NaN)).toBe(MISSING)
    expect(fmtAngle(-7.73)).toBe(`${M}7.7°`)
    expect(fmtAngle(52.66)).toBe('+52.7°')
    expect(fmtAngle(-0.01)).toBe('0.0°')
    expect(fmtDegrees(10)).toBe('10°')
  })

  it('coordinates: three decimals and a hemisphere letter, no sign', () => {
    expect(fmtCoord(-79.5994, -30.8621)).toBe('79.599°S, 30.862°W')
    expect(fmtCoord(0.6741, 23.4733)).toBe('0.674°N, 23.473°E')
    expect(fmtCoord(NaN, 1)).toBe(MISSING)
  })

  it('elevation, distance and area: grouped thousands and the right unit', () => {
    expect(fmtElevation(-1211.4)).toBe(`${M}1${T}211 m`)
    expect(fmtElevation(-0.2)).toBe('0 m')
    expect(fmtInt(1234567)).toBe(`1${T}234${T}567`)
    expect(fmtDistance(850.2)).toBe('850 m')
    expect(fmtDistance(999.7)).toBe('1.0 km')
    expect(fmtDistance(2440)).toBe('2.4 km')
    expect(fmtArea(35926.3)).toBe(`35${T}926 km²`)
    expect(fmtArea(7.44)).toBe('7.4 km²')
  })

  it('dates: UTC, ISO order, 24 h; ticks as day and month', () => {
    const t = Date.UTC(2026, 10, 14, 8, 13, 40)
    expect(fmtDateTime(t)).toBe('2026-11-14 08:13 UTC')
    expect(fmtDate(t)).toBe('2026-11-14')
    expect(fmtTick(Date.UTC(2026, 10, 12))).toBe('12 Nov')
    expect(fmtTick(Date.UTC(2027, 0, 1, 23, 59))).toBe('1 Jan')
  })

  it('comparison measures follow the rule of their unit', () => {
    expect(fmtMeasure(52, '%')).toBe('52%')
    expect(fmtMeasure(13.9, 'd')).toBe('13.9 d')
    expect(fmtMeasure(0, 'd')).toBe('none')
    expect(fmtMeasure(0.4, '°')).toBe('0.4°')
    expect(fmtMeasure(NaN, '°')).toBe(MISSING)
  })
})
