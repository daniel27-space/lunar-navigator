// One CSV file a planner can open in a spreadsheet and cite: what was asked (sites, period,
// assumptions, data) in '#' header lines, then the sites, their measures, every sunrise, sunset,
// earthrise and earthset in the period, and (from "When to land") the stays compared.
// Pure text building; the interface only gathers the inputs and starts the download.
import { earthRuleText, isDefaultAssumptions, sunRuleText, type Assumptions } from './assumptions'
import type { WindowStats } from './landing'
import { hasComm, isSunlit, summarise, type Criteria, type Series } from './windows'

export const APP_NAME = 'Lunar Landing Site Navigator'
export const APP_URL = 'https://daniel27-space.github.io/lunar-navigator/'

export interface ExportSite {
  /** badge letter: A, B or C */
  letter: string
  name: string
  /** decimal degrees; longitude east-positive */
  lat: number
  lon: number
  elevationM: number
  /** NaN where no detailed terrain covers the site */
  slopeDeg: number
  /** finest terrain resolution used, e.g. "20 m" */
  terrain: string
  /** the tier text the app shows, e.g. "Horizon from LOLA 20 m terrain within about 5 km ..." */
  terrainNote: string
  /** the site's series over the analysis period */
  series: Series
  /** at the clock time */
  sunElNowDeg: number
  earthClearNowDeg: number
}

export interface ExportStays {
  siteLetter: string
  /** the ranking rule, in one line */
  rule: string
  /** "baseline", "selected", "rank 1", ...; null figures when the stay cannot be checked */
  rows: { label: string; stats: WindowStats | null }[]
}

export interface ScenarioInput {
  exportedAtMs: number
  clockMs: number
  periodStartMs: number
  periodDays: number
  /** the finder preset the sites are judged for, or null */
  goal: string | null
  assumptions: Assumptions
  /** SPICE kernels behind the Sun and Earth table, when the table names them */
  kernels: string[]
  sites: ExportSite[]
  stays?: ExportStays
}

export type EventKind = 'sunrise' | 'sunset' | 'earthrise' | 'earthset'
export interface SiteEvent {
  tMs: number
  event: EventKind
}

/** Text in plain ASCII on one line: accents dropped, typographic dashes, quotes and signs replaced, line breaks as spaces, anything else as "?". */
export function ascii(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‐-―−]/g, '-')
    .replace(/[‘’′]/g, "'")
    .replace(/[“”″]/g, '"')
    .replace(/[   ]/g, ' ')
    .replace(/°/g, ' deg')
    .replace(/·/g, '-')
    .replace(/…/g, '...')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[^\x20-\x7e]/g, '?')
}

/** One CSV field: quoted only when it holds a comma, a quote or outer spaces (line breaks are already spaces). */
export function csvField(value: string | number): string {
  const s = typeof value === 'number' ? String(value) : ascii(value)
  return /[",\r\n]|^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const row = (fields: (string | number)[]) => fields.map(csvField).join(',')

/** Fixed decimals, empty for an unknown value, and never "-0.0". */
function num(v: number, decimals: number): string {
  if (!Number.isFinite(v)) return ''
  const s = v.toFixed(decimals)
  return Number(s) === 0 ? s.replace('-', '') : s
}

/** "2026-11-14T14:01:00Z" */
export const isoUtc = (ms: number) => new Date(ms).toISOString().slice(0, 19) + 'Z'

/** "lunar-navigator_2026-11-14T1401Z.csv" */
export function scenarioFileName(exportedAtMs: number): string {
  const iso = new Date(exportedAtMs).toISOString()
  return `lunar-navigator_${iso.slice(0, 10)}T${iso.slice(11, 13)}${iso.slice(14, 16)}Z.csv`
}

/**
 * Every change of state in a series, in time order. An event is stamped with the first sample
 * in the new state, so the true moment lies within one step before it. A site that is lit (or
 * dark, or linked) for the whole series has no events of that kind.
 */
export function siteEvents(s: Series, c: Criteria): SiteEvent[] {
  const out: SiteEvent[] = []
  for (let i = 1; i < s.count; i++) {
    const tMs = s.t0Ms + i * s.stepMs
    const lit = isSunlit(s, i, c)
    if (lit !== isSunlit(s, i - 1, c)) out.push({ tMs, event: lit ? 'sunrise' : 'sunset' })
    const link = hasComm(s, i, c)
    if (link !== hasComm(s, i - 1, c)) out.push({ tMs, event: link ? 'earthrise' : 'earthset' })
  }
  return out
}

const stepText = (ms: number) => (ms % 3600000 === 0 ? `${ms / 3600000} h` : `${Math.round(ms / 60000)} min`)

export const SITE_COLUMNS = ['site', 'name', 'latitude_deg', 'longitude_deg_east', 'elevation_m', 'slope_deg', 'terrain_used']
export const MEASURE_COLUMNS = [
  'site',
  'sunlit_pct',
  'longest_night_h',
  'earth_in_view_pct',
  'longest_earth_gap_h',
  'sun_elevation_now_deg',
  'earth_elevation_over_terrain_now_deg',
]
export const EVENT_COLUMNS = ['site', 'time_utc', 'event']
export const STAY_COLUMNS = ['stay', 'start_utc', 'length_days', 'sunlit_pct', 'longest_night_h', 'earth_in_view_pct', 'longest_earth_gap_h']

/** The whole file: '#' header lines, then blank-line-separated tables, each with a header row. CRLF line ends. */
export function scenarioCsv(input: ScenarioInput): string {
  const { assumptions: a, sites } = input
  const c = a.criteria
  const periodEnd = input.periodStartMs + input.periodDays * 86400000
  const stepMs = sites[0]?.series.stepMs ?? 0
  const events = sites.map((s) => siteEvents(s.series, c))

  const head: string[] = [
    `${APP_NAME} - scenario export`,
    `App: ${APP_URL}`,
    `Exported (UTC): ${isoUtc(input.exportedAtMs)}`,
    `Clock time (UTC): ${isoUtc(input.clockMs)}`,
    `Analysis period (UTC): ${isoUtc(input.periodStartMs)} to ${isoUtc(periodEnd)} (${input.periodDays} days)`,
    `Mission goal: ${input.goal ?? 'none'}`,
    `Assumption, sunlit when: ${sunRuleText(c)} (disc fraction at least ${c.minSunFrac})`,
    `Assumption, Earth in view when: ${earthRuleText(c, ' deg')} (centre at least ${c.earthMaskDeg} deg above it)`,
    `Assumption, observer height: solar panel and antenna ${a.observerM} m above the ground`,
    isDefaultAssumptions(a) ? 'Assumptions are the app defaults.' : 'Assumptions differ from the app defaults (half the disc; 0 deg; 2 m).',
    `Sun and Earth positions: JPL DE440 via the app's hourly table${input.kernels.length ? `; kernels: ${input.kernels.join(', ')}` : ''}`,
    ...sites.map((s) => `Terrain, site ${s.letter}: ${s.terrainNote}`),
    'Coordinates: decimal degrees, east-positive longitude, MOON_ME frame, 1737.4 km sphere; elevation in metres above that sphere',
    `Time step of measures and events: ${stepText(stepMs)}. An event is stamped with the first sample in the new state (the change happened within one step before it).`,
    ...sites.flatMap((s, i) => {
      const notes: string[] = []
      if (!events[i].some((e) => e.event === 'sunrise' || e.event === 'sunset'))
        notes.push(`Events, site ${s.letter}: no sunrise or sunset in the period (${s.series.count && isSunlit(s.series, 0, c) ? 'sunlit' : 'dark'} throughout).`)
      if (!events[i].some((e) => e.event === 'earthrise' || e.event === 'earthset'))
        notes.push(`Events, site ${s.letter}: no earthrise or earthset in the period (Earth ${s.series.count && hasComm(s.series, 0, c) ? 'in view' : 'out of view'} throughout).`)
      return notes
    }),
    'Screening tool, not mission-grade. See docs/VALIDATION.md in the repository.',
  ]

  const lines: string[] = head.map((h) => `# ${ascii(h)}`)
  const table = (name: string, columns: string[], rows: (string | number)[][], notes: string[] = []) => {
    lines.push('', `# table: ${ascii(name)}`, ...notes.map((n) => `# ${ascii(n)}`), row(columns), ...rows.map(row))
  }

  table(
    'sites',
    SITE_COLUMNS,
    sites.map((s) => [s.letter, s.name, num(s.lat, 3), num(s.lon, 3), num(s.elevationM, 1), num(s.slopeDeg, 1), s.terrain]),
  )
  table(
    'measures',
    MEASURE_COLUMNS,
    sites.map((s) => {
      const m = summarise(s.series, c)
      return [s.letter, num(m.sunShare * 100, 1), num(m.longestDarkH, 1), num(m.commShare * 100, 1), num(m.longestNoCommH, 1), num(s.sunElNowDeg, 2), num(s.earthClearNowDeg, 2)]
    }),
  )
  table(
    'events',
    EVENT_COLUMNS,
    sites
      .flatMap((s, i) => events[i].map((e) => ({ letter: s.letter, ...e })))
      .sort((x, y) => x.tMs - y.tMs || x.letter.localeCompare(y.letter))
      .map((e) => [e.letter, isoUtc(e.tMs), e.event]),
  )
  if (input.stays) {
    table(
      `stays (site ${input.stays.siteLetter})`,
      STAY_COLUMNS,
      input.stays.rows.map(({ label, stats: w }) =>
        w
          ? [label, isoUtc(w.startMs), w.days, num(w.sunShare * 100, 1), num(w.longestDarkH, 1), num(w.commShare * 100, 1), num(w.longestNoCommH, 1)]
          : [label, '', '', '', '', '', ''],
      ),
      [`Ranking: ${input.stays.rule}`],
    )
  }
  return lines.join('\r\n') + '\r\n'
}
