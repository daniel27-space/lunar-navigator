// Every number, coordinate and date the interface shows is formatted here (docs/DESIGN.md section 4),
// so one quantity always looks the same wherever it appears.

/** True minus sign. */
export const MINUS = '−'
/** Thin, non-breaking space used between thousands. */
export const THIN = ' '
/** Shown in place of a value that is unknown. */
export const MISSING = '–'

const known = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v)

/** Fixed decimals with a true minus, and no "-0.0". */
function fixed(v: number, decimals: number): string {
  const s = Math.abs(v).toFixed(decimals)
  return (v < 0 && Number(s) !== 0 ? MINUS : '') + s
}

/** Whole number with thin-space thousands and a true minus. */
export function fmtInt(v: number): string {
  if (!known(v)) return MISSING
  const r = Math.round(Math.abs(v))
  return (v < 0 && r !== 0 ? MINUS : '') + String(r).replace(/\B(?=(\d{3})+(?!\d))/g, THIN)
}

/** Share of time from a fraction 0..1: whole percent, "<1%" and ">99%" at the ends. */
export function fmtShare(fraction: number): string {
  if (!known(fraction)) return MISSING
  const p = fraction * 100
  if (p > 0 && p < 1) return '<1%'
  if (p > 99 && p < 100) return '>99%'
  return `${Math.round(p)}%`
}

/** A range of shares, e.g. "35–100%". */
export function fmtShareRange(lo: number, hi: number): string {
  return `${Math.round(lo * 100)}–${Math.round(hi * 100)}%`
}

/**
 * Duration from hours. Under 48 h in hours (one decimal under 10 h), otherwise days with one
 * decimal. Zero is "none"; null means it runs past the end of the period ("> 60 d").
 */
export function fmtDuration(hours: number | null, periodDays = 60): string {
  if (hours === null) return `> ${periodDays} d`
  if (!known(hours)) return MISSING
  if (hours < 0.05) return 'none'
  if (hours >= 48) return `${(hours / 24).toFixed(1)} d`
  const tenth = Math.round(hours * 10) / 10
  return tenth < 10 ? `${tenth.toFixed(1)} h` : `${Math.round(hours)} h`
}

/** Slope: one decimal, no space before the degree sign. */
export function fmtSlope(deg: number): string {
  return known(deg) ? `${fixed(deg, 1)}°` : MISSING
}

/** Sun or Earth elevation: one decimal, always signed. */
export function fmtAngle(deg: number): string {
  if (!known(deg)) return MISSING
  const s = fixed(deg, 1)
  return `${deg > 0 && Number(s) !== 0 ? '+' : ''}${s}°`
}

/** A limit in whole degrees, e.g. "10°". */
export function fmtDegrees(deg: number): string {
  return known(deg) ? `${fixed(deg, 0)}°` : MISSING
}

export function fmtLat(lat: number): string {
  return known(lat) ? `${Math.abs(lat).toFixed(3)}°${lat < 0 ? 'S' : 'N'}` : MISSING
}

export function fmtLon(lon: number): string {
  return known(lon) ? `${Math.abs(lon).toFixed(3)}°${lon < 0 ? 'W' : 'E'}` : MISSING
}

/** Coordinates: three decimals (about 30 m on the Moon) and a hemisphere letter. */
export function fmtCoord(lat: number, lon: number): string {
  return known(lat) && known(lon) ? `${fmtLat(lat)}, ${fmtLon(lon)}` : MISSING
}

/** Elevation in whole metres. */
export function fmtElevation(metres: number): string {
  return known(metres) ? `${fmtInt(metres)} m` : MISSING
}

/** Distance from metres: whole metres under 1 km, otherwise km with one decimal. */
export function fmtDistance(metres: number): string {
  if (!known(metres)) return MISSING
  return Math.round(metres) < 1000 ? `${Math.round(metres)} m` : `${(metres / 1000).toFixed(1)} km`
}

/** Area in km²: one decimal under 10, otherwise whole with thousands separators. */
export function fmtArea(km2: number): string {
  if (!known(km2)) return MISSING
  return `${km2 < 10 ? km2.toFixed(1) : fmtInt(km2)} km²`
}

/** "2026-11-14" (UTC). */
export function fmtDate(ms: number): string {
  return known(ms) ? new Date(ms).toISOString().slice(0, 10) : MISSING
}

/** "2026-11-14 08:13 UTC". */
export function fmtDateTime(ms: number): string {
  if (!known(ms)) return MISSING
  const iso = new Date(ms).toISOString()
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Axis tick: "12 Nov" (UTC). */
export function fmtTick(ms: number): string {
  if (!known(ms)) return MISSING
  const d = new Date(ms)
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
}

/** A landing date in a sentence or column head: "3 Mar 2027" (UTC). */
export function fmtDay(ms: number): string {
  return known(ms) ? `${fmtTick(ms)} ${new Date(ms).getUTCFullYear()}` : MISSING
}

/** A mission's date: "30 Jul 1971" when it is an ISO date, otherwise the text as given ("NET late 2026 (planned)"). */
export function fmtMissionDate(text: string): string {
  const m = /^(\d{4})-(\d\d)-(\d\d)/.exec(text)
  if (!m) return text.trim() || MISSING
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return known(ms) ? fmtDay(ms) : text
}

/** A period by its real dates: "12 Nov \u2013 11 Jan 2027 (60 days)"; the year is on the end date (UTC). */
export function fmtPeriod(startMs: number, days: number): string {
  if (!known(startMs) || !known(days)) return MISSING
  const end = startMs + days * 86400000
  const sameYear = new Date(startMs).getUTCFullYear() === new Date(end).getUTCFullYear()
  return `${sameYear ? fmtTick(startMs) : fmtDay(startMs)} \u2013 ${fmtDay(end)} (${days} days)`
}

/** Month tick on a year strip: "Mar" (UTC). */
export function fmtMonth(ms: number): string {
  return known(ms) ? MONTHS[new Date(ms).getUTCMonth()] : MISSING
}

/** Duration inside a sentence, with the unit spelled out: "13.9 days", "14 hours", "none". */
export function fmtDurationWords(hours: number | null, periodDays = 60): string {
  const s = fmtDuration(hours, periodDays)
  return s.replace(/ d$/, s.startsWith('1.0 ') ? ' day' : ' days').replace(/ h$/, s.startsWith('1.0 ') ? ' hour' : ' hours')
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string }

function parseAngle(text: string, kind: 'lat' | 'lon'): number {
  const m = /^([+\-\u2212]?)\s*(\d+(?:\.\d*)?|\.\d+)\s*°?\s*([NSEW])?$/i.exec(text.trim())
  if (!m) return NaN
  const letter = m[3]?.toUpperCase()
  if (letter && !(kind === 'lat' ? 'NS' : 'EW').includes(letter)) return NaN
  const v = Number(m[2])
  return letter ? (letter === 'S' || letter === 'W' ? -v : v) : m[1] && m[1] !== '+' ? -v : v
}

/** Splits pasted text such as "-89.45, 222.8" or "89.45 S 137.2 W" into its two halves. */
export function splitCoordPair(text: string): [string, string] | null {
  const byComma = text.split(/[,;]/)
  if (byComma.length === 2 && byComma[0].trim() && byComma[1].trim()) return [byComma[0].trim(), byComma[1].trim()]
  const m = /^\s*(\S+(?:\s*[NS])?)\s+([+\-\u2212.\d]\S*(?:\s*[EW])?)\s*$/i.exec(text)
  return byComma.length === 1 && m ? [m[1], m[2]] : null
}

/**
 * Typed coordinates in decimal degrees. Latitude -90..90 (or with N/S); longitude -180..180 or
 * 0..360 (or with E/W), returned as -180..180 east-positive.
 */
export function parseCoord(latText: string, lonText: string): Parsed<{ lat: number; lon: number }> {
  const lat = parseAngle(latText, 'lat')
  if (Number.isNaN(lat) || Math.abs(lat) > 90) return { ok: false, error: `Latitude must be a number from ${MINUS}90 to 90, for example ${MINUS}89.45 or 89.45 S.` }
  const lon = parseAngle(lonText, 'lon')
  if (Number.isNaN(lon) || lon < -180 || lon > 360) return { ok: false, error: `Longitude must be a number from ${MINUS}180 to 180 or 0 to 360, for example 222.8 or 137.2 W.` }
  return { ok: true, value: { lat, lon: lon > 180 ? lon - 360 : lon } }
}

/** A comparison measure in its display unit: percent (0..100), days or degrees. */
export function fmtMeasure(value: number, unit: '%' | 'd' | '°'): string {
  if (!known(value)) return MISSING
  return unit === '%' ? fmtShare(value / 100) : unit === 'd' ? fmtDuration(value * 24) : fmtSlope(value)
}
