import { describe, expect, it } from 'vitest'
import { DEFAULT_ASSUMPTIONS } from './assumptions'
import {
  ascii,
  csvField,
  EVENT_COLUMNS,
  MEASURE_COLUMNS,
  scenarioCsv,
  scenarioFileName,
  siteEvents,
  SITE_COLUMNS,
  STAY_COLUMNS,
  type ExportSite,
  type ScenarioInput,
} from './exportScenario'
import { DEFAULT_CRITERIA, type Criteria, type Series } from './windows'

const STEP = 20 * 60000
const T0 = Date.UTC(2026, 10, 12, 13)

function series(sunFrac: number[], earthClear: number[] = sunFrac.map(() => 1)): Series {
  const n = sunFrac.length
  return {
    t0Ms: T0,
    stepMs: STEP,
    count: n,
    sunEl: new Float32Array(n),
    sunAz: new Float32Array(n),
    sunFrac: Float32Array.from(sunFrac),
    earthEl: new Float32Array(n),
    earthAz: new Float32Array(n),
    earthFrac: new Float32Array(n),
    earthClear: Float32Array.from(earthClear),
  }
}

const site = (s: Partial<ExportSite>): ExportSite => ({
  letter: 'A',
  name: 'Ridge',
  lat: -89.4391,
  lon: -137.11849,
  elevationM: 1959.04,
  slopeDeg: 1.44,
  terrain: '20 m',
  terrainNote: 'Horizon from LOLA 20 m terrain within about 5 km of this point, and 80 m terrain beyond.',
  series: series([0, 0, 0.2, 0.7, 1, 1, 0.7, 0.2, 0], [-1, -1, 3, 3, 3, 3, 6, 6, -1]),
  sunElNowDeg: 1.437,
  earthClearNowDeg: -2.345,
  ...s,
})

const input = (over: Partial<ScenarioInput> = {}): ScenarioInput => ({
  exportedAtMs: Date.UTC(2026, 10, 14, 14, 1, 30),
  clockMs: Date.UTC(2026, 10, 14, 13, 20),
  periodStartMs: T0,
  periodDays: 60,
  goal: 'Solar lander',
  assumptions: DEFAULT_ASSUMPTIONS,
  kernels: ['de440.bsp', 'moon_pa_de440_200625.bpc'],
  sites: [site({})],
  ...over,
})

const tables = (csv: string) => {
  const out: Record<string, string[]> = {}
  for (const block of csv.split('\r\n\r\n').slice(1)) {
    const lines = block.split('\r\n').filter((l) => l !== '')
    out[lines[0].replace('# table: ', '')] = lines.filter((l) => !l.startsWith('#'))
  }
  return out
}

describe('csvField', () => {
  it('quotes only when needed', () => {
    expect(csvField('Shackleton crater floor')).toBe('Shackleton crater floor')
    expect(csvField('Ridge, north end')).toBe('"Ridge, north end"')
    expect(csvField('the "long" night')).toBe('"the ""long"" night"')
    // A line break inside a name would split the record, so it becomes a space.
    expect(csvField('two\r\nlines')).toBe('two lines')
    expect(csvField(' padded ')).toBe('" padded "')
    expect(csvField(-89.439)).toBe('-89.439')
    expect(csvField('')).toBe('')
  })

  it('keeps the file plain ASCII', () => {
    expect(ascii('Gläser’s spot 2 – 79.6°S · −1 211 m…')).toBe("Glaser's spot 2 - 79.6 degS - -1 211 m...")
    expect(csvField('Chang’e 6 (嫦娥)')).toBe("Chang'e 6 (??)")
    // eslint-disable-next-line no-control-regex
    expect(/^[\x00-\x7f]*$/.test(scenarioCsv(input({ sites: [site({ name: 'Malapert – “massif”, 86°S' })] })))).toBe(true)
  })
})

describe('siteEvents', () => {
  const s = site({}).series
  const at = (i: number) => T0 + i * STEP

  it('finds every change of state, stamped with the first sample in the new state', () => {
    expect(siteEvents(s, DEFAULT_CRITERIA)).toEqual([
      { tMs: at(2), event: 'earthrise' },
      { tMs: at(3), event: 'sunrise' },
      { tMs: at(7), event: 'sunset' },
      { tMs: at(8), event: 'earthset' },
    ])
  })

  it('follows the assumptions', () => {
    const any: Criteria = { minSunFrac: 0.001, earthMaskDeg: 0 }
    const strict: Criteria = { minSunFrac: 0.999, earthMaskDeg: 5 }
    expect(siteEvents(s, any).filter((e) => e.event.startsWith('sun'))).toEqual([
      { tMs: at(2), event: 'sunrise' },
      { tMs: at(8), event: 'sunset' },
    ])
    expect(siteEvents(s, strict)).toEqual([
      { tMs: at(4), event: 'sunrise' },
      { tMs: at(6), event: 'sunset' },
      { tMs: at(6), event: 'earthrise' },
      { tMs: at(8), event: 'earthset' },
    ])
  })

  it('gives no events for a site that is lit or dark throughout', () => {
    expect(siteEvents(series([1, 1, 1, 1]), DEFAULT_CRITERIA)).toEqual([])
    expect(siteEvents(series([0, 0, 0, 0], [-5, -5, -5, -5]), DEFAULT_CRITERIA)).toEqual([])
    expect(siteEvents(series([]), DEFAULT_CRITERIA)).toEqual([])
  })
})

describe('scenarioCsv', () => {
  const two = input({
    sites: [site({}), site({ letter: 'B', name: 'Shackleton crater floor', lat: -89.67, lon: 129.2, elevationM: -2787.3, slopeDeg: NaN, terrain: '80 m', terrainNote: 'Horizon from LOLA 80 m terrain.', series: series([0, 0, 0, 0, 0, 0, 0, 0, 0], [-9, -9, -9, -9, -9, -9, -9, -9, -9]), sunElNowDeg: 1.9, earthClearNowDeg: -25.94 })],
  })
  const csv = scenarioCsv(two)

  it('starts with the header lines, in order, and uses CRLF line ends', () => {
    const head = csv.split('\r\n\r\n')[0].split('\r\n')
    expect(head.every((l) => l.startsWith('# '))).toBe(true)
    expect(head.slice(0, 11)).toEqual([
      '# Umbra: Lunar Landing Site Navigator - scenario export',
      '# App: https://daniel27-space.github.io/lunar-navigator/',
      '# Exported (UTC): 2026-11-14T14:01:30Z',
      '# Clock time (UTC): 2026-11-14T13:20:00Z',
      '# Analysis period (UTC): 2026-11-12T13:00:00Z to 2027-01-11T13:00:00Z (60 days)',
      '# Mission goal: Solar lander',
      "# Assumption, sunlit when: at least half the Sun's disc is above the terrain (disc fraction at least 0.5)",
      "# Assumption, Earth in view when: Earth's centre is above the terrain (centre at least 0 deg above it)",
      '# Assumption, observer height: solar panel and antenna 2 m above the ground',
      '# Assumptions are the app defaults.',
      "# Sun and Earth positions: JPL DE440 via the app's hourly table; kernels: de440.bsp, moon_pa_de440_200625.bpc",
    ])
    expect(head).toContain('# Terrain, site A: Horizon from LOLA 20 m terrain within about 5 km of this point, and 80 m terrain beyond.')
    expect(head).toContain('# Terrain, site B: Horizon from LOLA 80 m terrain.')
    expect(head.find((l) => l.includes('Time step'))).toMatch(/^# Time step of measures and events: 20 min\./)
    expect(head.at(-1)).toBe('# Screening tool, not mission-grade. See docs/VALIDATION.md in the repository.')
    expect(csv.endsWith('\r\n')).toBe(true)
    expect(csv.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/)
  })

  it('says so in the header when a site has no events', () => {
    const head = csv.split('\r\n\r\n')[0]
    expect(head).toContain('# Events, site B: no sunrise or sunset in the period (dark throughout).')
    expect(head).toContain('# Events, site B: no earthrise or earthset in the period (Earth out of view throughout).')
    expect(head).not.toContain('Events, site A')
    const lit = scenarioCsv(input({ sites: [site({ series: series([1, 1, 1], [2, 2, 2]) })] }))
    expect(lit).toContain('# Events, site A: no sunrise or sunset in the period (sunlit throughout).')
    expect(lit).toContain('# Events, site A: no earthrise or earthset in the period (Earth in view throughout).')
    expect(tables(lit).events).toEqual(['site,time_utc,event'])
  })

  it('writes the tables in a fixed order with fixed columns', () => {
    const t = tables(csv)
    expect(Object.keys(t)).toEqual(['sites', 'measures', 'events'])
    expect(t.sites[0]).toBe(SITE_COLUMNS.join(','))
    expect(t.sites[0]).toBe('site,name,latitude_deg,longitude_deg_east,elevation_m,slope_deg,terrain_used')
    expect(t.sites.slice(1)).toEqual(['A,Ridge,-89.439,-137.118,1959.0,1.4,20 m', 'B,Shackleton crater floor,-89.670,129.200,-2787.3,,80 m'])
    expect(t.measures[0]).toBe(MEASURE_COLUMNS.join(','))
    expect(t.measures[0]).toBe('site,sunlit_pct,longest_night_h,earth_in_view_pct,longest_earth_gap_h,sun_elevation_now_deg,earth_elevation_over_terrain_now_deg')
    // Site A: 4 of 9 samples sunlit (44.4%), longest night 3 samples = 1.0 h; Earth 6 of 9, gap 2 samples.
    expect(t.measures.slice(1)).toEqual(['A,44.4,1.0,66.7,0.7,1.44,-2.35', 'B,0.0,3.0,0.0,3.0,1.90,-25.94'])
    expect(t.events[0]).toBe(EVENT_COLUMNS.join(','))
    expect(t.events.slice(1)).toEqual([
      'A,2026-11-12T13:40:00Z,earthrise',
      'A,2026-11-12T14:00:00Z,sunrise',
      'A,2026-11-12T15:20:00Z,sunset',
      'A,2026-11-12T15:40:00Z,earthset',
    ])
  })

  it('merges the sites’ events in time order', () => {
    const both = scenarioCsv(input({ sites: [site({}), site({ letter: 'B', series: series([0, 1, 1, 1, 1, 1, 1, 1, 1]) })] }))
    expect(tables(both).events.slice(1, 4)).toEqual(['B,2026-11-12T13:20:00Z,sunrise', 'A,2026-11-12T13:40:00Z,earthrise', 'A,2026-11-12T14:00:00Z,sunrise'])
  })

  it('changes the events, the measures and the header when the assumptions change', () => {
    const any = scenarioCsv(input({ assumptions: { criteria: { minSunFrac: 0.001, earthMaskDeg: 5 }, observerM: 10 } }))
    expect(any).toContain("# Assumption, sunlit when: any part of the Sun's disc is above the terrain (disc fraction at least 0.001)")
    expect(any).toContain("# Assumption, Earth in view when: Earth's centre is at least 5 deg above the terrain (centre at least 5 deg above it)")
    expect(any).toContain('# Assumption, observer height: solar panel and antenna 10 m above the ground')
    expect(any).toContain('# Assumptions differ from the app defaults (half the disc; 0 deg; 2 m).')
    const t = tables(any)
    expect(t.events.slice(1)).toEqual([
      'A,2026-11-12T13:40:00Z,sunrise',
      'A,2026-11-12T15:00:00Z,earthrise',
      'A,2026-11-12T15:40:00Z,sunset',
      'A,2026-11-12T15:40:00Z,earthset',
    ])
    expect(t.events).not.toEqual(tables(scenarioCsv(input())).events)
    expect(t.measures[1]).toBe('A,66.7,0.7,22.2,2.0,1.44,-2.35')
  })

  it('adds the stays compared when exported from When to land, and "none" for no goal', () => {
    const w = { startMs: Date.UTC(2027, 6, 19, 6), days: 14, sunShare: 1, commShare: 0.4567, longestDarkH: 0, longestNoCommH: 181.25, meanSunElLit: 1, minSunElLit: 0.2 }
    const out = scenarioCsv(
      input({
        goal: null,
        stays: {
          siteLetter: 'A',
          rule: '14-day stays starting every 6 h, from 1-hour steps; ranked 60% on sunlight, 40% on Earth in view.',
          rows: [
            { label: 'baseline', stats: null },
            { label: 'selected', stats: { ...w, startMs: Date.UTC(2026, 10, 14, 13), sunShare: 0.5612, longestDarkH: 103 } },
            { label: 'rank 1', stats: w },
          ],
        },
      }),
    )
    expect(out).toContain('# Mission goal: none')
    const t = tables(out)
    expect(Object.keys(t)).toEqual(['sites', 'measures', 'events', 'stays (site A)'])
    expect(t['stays (site A)']).toEqual([
      STAY_COLUMNS.join(','),
      'baseline,,,,,,',
      'selected,2026-11-14T13:00:00Z,14,56.1,103.0,45.7,181.3',
      'rank 1,2027-07-19T06:00:00Z,14,100.0,0.0,45.7,181.3',
    ])
    expect(out).toContain('# table: stays (site A)\r\n# Ranking: 14-day stays starting every 6 h, from 1-hour steps; ranked 60% on sunlight, 40% on Earth in view.\r\nstay,start_utc,')
  })

  it('names the file by the export time', () => {
    expect(scenarioFileName(Date.UTC(2026, 10, 14, 14, 1, 30))).toBe('lunar-navigator_2026-11-14T1401Z.csv')
  })
})
