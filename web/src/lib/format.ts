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

/** A comparison measure in its display unit: percent (0..100), days or degrees. */
export function fmtMeasure(value: number, unit: '%' | 'd' | '°'): string {
  if (!known(value)) return MISSING
  return unit === '%' ? fmtShare(value / 100) : unit === 'd' ? fmtDuration(value * 24) : fmtSlope(value)
}
