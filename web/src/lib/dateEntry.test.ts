import { describe, expect, it } from 'vitest'
import { clampTime, commitFields, daysInMonth, fieldsOf, isLeapYear, parseFields, stepTime, STEPS, type DateFields } from './dateEntry'

const range: [number, number] = [Date.UTC(2024, 0, 4), Date.UTC(2035, 10, 1)]
const DAY = 86400000
const f = (year: string, month: string, day: string, hour = '00', minute = '00'): DateFields => ({ year, month, day, hour, minute })

describe('month lengths and leap years', () => {
  it('knows the length of every month', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => daysInMonth(2027, m))).toEqual([31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31])
    expect(daysInMonth(2028, 2)).toBe(29)
  })

  it('follows the leap-year rule, century years included', () => {
    expect([2024, 2028, 2032, 2000, 2400].every(isLeapYear)).toBe(true)
    expect([2025, 2026, 2027, 2100, 1900].some(isLeapYear)).toBe(false)
  })
})

describe('parseFields', () => {
  it('reads a whole date and time as UTC', () => {
    expect(parseFields(f('2030', '05', '06', '07', '08'))).toEqual({ ok: true, tMs: Date.UTC(2030, 4, 6, 7, 8) })
    expect(parseFields(f(' 2030 ', '5', '6', '7', '8'))).toEqual({ ok: true, tMs: Date.UTC(2030, 4, 6, 7, 8) })
    expect(parseFields(f('2028', '02', '29', '23', '59'))).toEqual({ ok: true, tMs: Date.UTC(2028, 1, 29, 23, 59) })
    expect(parseFields(fieldsOf(Date.UTC(2026, 10, 14, 8, 13)))).toEqual({ ok: true, tMs: Date.UTC(2026, 10, 14, 8, 13) })
  })

  it('names the field that is wrong', () => {
    const bad = (x: DateFields) => {
      const p = parseFields(x)
      return p.ok ? 'ok' : `${p.field}: ${p.error}`
    }
    expect(bad(f('2', '03', '01'))).toBe('year: Year must have four digits, for example 2027.')
    expect(bad(f('203', '03', '01'))).toMatch(/^year/)
    expect(bad(f('', '03', '01'))).toMatch(/^year/)
    expect(bad(f('20a6', '03', '01'))).toMatch(/^year/)
    expect(bad(f('2027', '13', '01'))).toBe('month: Month must be 1 to 12.')
    expect(bad(f('2027', '0', '01'))).toMatch(/^month/)
    expect(bad(f('2027', '02', '29'))).toBe('day: Day must be 1 to 28 for Feb 2027.')
    expect(bad(f('2028', '02', '30'))).toBe('day: Day must be 1 to 29 for Feb 2028.')
    expect(bad(f('2027', '04', '31'))).toBe('day: Day must be 1 to 30 for Apr 2027.')
    expect(bad(f('2027', '12', '32'))).toBe('day: Day must be 1 to 31 for Dec 2027.')
    expect(bad(f('2027', '12', '0'))).toMatch(/^day/)
    expect(bad(f('2027', '12', '1.5'))).toMatch(/^day/)
    expect(bad(f('2027', '12', '-1'))).toMatch(/^day/)
    expect(bad(f('2027', '12', '01', '24'))).toBe('hour: Hour must be 0 to 23.')
    expect(bad(f('2027', '12', '01', ''))).toMatch(/^hour/)
    expect(bad(f('2027', '12', '01', '23', '60'))).toBe('minute: Minute must be 0 to 59.')
    expect(bad(f('2027', '12', '01', '23', '1e1'))).toMatch(/^minute/)
  })
})

describe('the supported range', () => {
  it('leaves a time inside the range alone', () => {
    expect(clampTime(Date.UTC(2030, 0, 1), range)).toEqual({ tMs: Date.UTC(2030, 0, 1), clamped: false })
    expect(clampTime(range[0], range)).toEqual({ tMs: range[0], clamped: false })
    expect(clampTime(range[1], range)).toEqual({ tMs: range[1], clamped: false })
  })

  it('pulls a set date back to the nearest end, at both ends, and says so', () => {
    expect(commitFields(f('2036', '03', '01', '12', '00'), range)).toEqual({ ok: true, tMs: range[1], clamped: true })
    expect(commitFields(f('2023', '12', '31', '23', '59'), range)).toEqual({ ok: true, tMs: range[0], clamped: true })
    expect(commitFields(f('0002', '03', '01'), range)).toEqual({ ok: true, tMs: range[0], clamped: true })
    // a later in-range date is not clamped, so the note goes
    expect(commitFields(f('2030', '03', '01'), range)).toEqual({ ok: true, tMs: Date.UTC(2030, 2, 1), clamped: false })
  })

  it('does not set a date that is not a real one', () => {
    expect(commitFields(f('2027', '02', '30'), range)).toMatchObject({ ok: false, field: 'day' })
    // typing "2036" passes through "2", "20", "203": none of them is ever a date to set
    for (const year of ['2', '20', '203']) expect(commitFields(f(year, '03', '01'), range)).toMatchObject({ ok: false, field: 'year' })
  })
})

describe('step buttons', () => {
  it('offer one hour, one day, seven days and thirty days', () => {
    expect(STEPS.map(([label, ms]) => [label, ms / 3600000])).toEqual([['1 h', 1], ['1 d', 24], ['7 d', 168], ['30 d', 720]])
  })

  it('move the clock by exactly that much, across month and year ends', () => {
    expect(stepTime(Date.UTC(2027, 1, 28, 23, 30), 3600000, range)).toEqual({ tMs: Date.UTC(2027, 2, 1, 0, 30), clamped: false })
    expect(stepTime(Date.UTC(2028, 1, 28, 12), DAY, range)).toEqual({ tMs: Date.UTC(2028, 1, 29, 12), clamped: false })
    expect(stepTime(Date.UTC(2026, 11, 28), 7 * DAY, range)).toEqual({ tMs: Date.UTC(2027, 0, 4), clamped: false })
    expect(stepTime(Date.UTC(2027, 0, 15), -30 * DAY, range)).toEqual({ tMs: Date.UTC(2026, 11, 16), clamped: false })
  })

  it('stop at each end of the range', () => {
    expect(stepTime(range[1] - DAY, 7 * DAY, range)).toEqual({ tMs: range[1], clamped: true })
    expect(stepTime(range[0] + 3600000, -30 * DAY, range)).toEqual({ tMs: range[0], clamped: true })
    expect(stepTime(range[1], 3600000, range)).toEqual({ tMs: range[1], clamped: true })
    expect(stepTime(range[1], -3600000, range)).toEqual({ tMs: range[1] - 3600000, clamped: false })
  })
})
