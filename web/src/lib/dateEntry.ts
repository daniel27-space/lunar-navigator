// The time bar's date and time editor: typed fields are only a draft until they are set, a set
// date is checked as a real calendar date, and every time it produces is kept inside the
// supported range. All times are UTC.

export interface DateFields {
  year: string
  month: string
  day: string
  hour: string
  minute: string
}

export type Range = readonly [number, number]

const two = (n: number) => String(n).padStart(2, '0')
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** The fields that show a time: { year: "2026", month: "11", day: "14", hour: "08", minute: "13" }. */
export function fieldsOf(ms: number): DateFields {
  const d = new Date(ms)
  return { year: String(d.getUTCFullYear()), month: two(d.getUTCMonth() + 1), day: two(d.getUTCDate()), hour: two(d.getUTCHours()), minute: two(d.getUTCMinutes()) }
}

export const isLeapYear = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0

/** Days in a month, 1 = January. */
export function daysInMonth(year: number, month: number): number {
  return month === 2 ? (isLeapYear(year) ? 29 : 28) : [4, 6, 9, 11].includes(month) ? 30 : 31
}

export type ParsedDate = { ok: true; tMs: number } | { ok: false; field: keyof DateFields; error: string }

/** A whole number written in digits only, or NaN. */
function whole(text: string, maxDigits: number): number {
  const t = text.trim()
  return new RegExp(`^\\d{1,${maxDigits}}$`).test(t) ? Number(t) : NaN
}

/**
 * The time typed fields stand for, or which field is wrong and why. Each field must be a whole
 * number in its range, and the day must exist in that month of that year.
 */
export function parseFields(f: DateFields): ParsedDate {
  const year = whole(f.year, 4)
  if (Number.isNaN(year) || f.year.trim().length !== 4) return { ok: false, field: 'year', error: 'Year must have four digits, for example 2027.' }
  const month = whole(f.month, 2)
  if (Number.isNaN(month) || month < 1 || month > 12) return { ok: false, field: 'month', error: 'Month must be 1 to 12.' }
  const last = daysInMonth(year, month)
  const day = whole(f.day, 2)
  if (Number.isNaN(day) || day < 1 || day > last) return { ok: false, field: 'day', error: `Day must be 1 to ${last} for ${MONTHS[month - 1]} ${year}.` }
  const hour = whole(f.hour, 2)
  if (Number.isNaN(hour) || hour > 23) return { ok: false, field: 'hour', error: 'Hour must be 0 to 23.' }
  const minute = whole(f.minute, 2)
  if (Number.isNaN(minute) || minute > 59) return { ok: false, field: 'minute', error: 'Minute must be 0 to 59.' }
  return { ok: true, tMs: Date.UTC(year, month - 1, day, hour, minute) }
}

export interface ClampedTime {
  /** the time to set, inside the supported range */
  tMs: number
  /** true when the time asked for was outside the range and was pulled back to its nearest end */
  clamped: boolean
}

export function clampTime(tMs: number, range: Range): ClampedTime {
  const inside = Math.min(Math.max(tMs, range[0]), range[1])
  return { tMs: inside, clamped: inside !== tMs }
}

/** Typed fields, set: the time they stand for pulled into the range, or the field that is wrong. */
export function commitFields(f: DateFields, range: Range): ({ ok: true } & ClampedTime) | Extract<ParsedDate, { ok: false }> {
  const p = parseFields(f)
  return p.ok ? { ok: true, ...clampTime(p.tMs, range) } : p
}

const HOUR = 3600000
/** The editor's step buttons: [label, milliseconds]. */
export const STEPS: readonly (readonly [string, number])[] = [
  ['1 h', HOUR],
  ['1 d', 24 * HOUR],
  ['7 d', 7 * 24 * HOUR],
  ['30 d', 30 * 24 * HOUR],
]

/** A step from a time, kept inside the range. */
export function stepTime(tMs: number, deltaMs: number, range: Range): ClampedTime {
  return clampTime(tMs + deltaMs, range)
}
