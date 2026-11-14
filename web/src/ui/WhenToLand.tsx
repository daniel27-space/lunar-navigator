// "When to land": the next step after choosing a place. For one pinned site it ranks landing
// dates over the coming year for a stay of 7, 14 or 30 days, and sets them against landing at
// the selected time, on the same aligned grid as the site comparison.
import { useMemo, useState, type CSSProperties } from 'react'
import { ephemEndMs } from '../lib/ephem'
import { fmtAngle, fmtDateTime, fmtDay, fmtDuration, fmtShare, fmtTick, MISSING } from '../lib/format'
import type { Horizon } from '../lib/horizon'
import { leader, rankWindows, windowStats, type WindowStats } from '../lib/landing'
import { computeSeries, DEFAULT_CRITERIA, type Series } from '../lib/windows'
import { useStore } from '../store'
import { Badge, Segmented } from './controls'
import { landingSentence, slipSentence } from './landingSentence'
import { YearStrip } from './Timeline'
import { DAY, type SiteAnalysis } from './useSiteAnalysis'
import { useWants } from './useWants'
import { MISSION } from './verdictSentence'

const HOUR = 3600000
const YEAR_DAYS = 365
const STAYS: readonly (readonly [number, string])[] = [
  [7, '7 days'],
  [14, '14 days'],
  [30, '30 days'],
]

// A year at 1-hour steps takes a moment to work out, so it is kept per horizon and start time.
const years = new WeakMap<Horizon, Map<string, Series>>()
function yearSeries(a: SiteAnalysis, startMs: number): Series {
  let perSite = years.get(a.horizon)
  if (!perSite) years.set(a.horizon, (perSite = new Map()))
  const key = `${startMs}:${a.hM}`
  let s = perSite.get(key)
  if (!s) {
    // Never past the ephemeris, and never an empty period (the clock is kept 61 days short of the end).
    const end = Math.max(Math.min(startMs + YEAR_DAYS * DAY, ephemEndMs(a.ephem)), startMs + 2 * HOUR)
    s = computeSeries(a.ephem, a.horizon, a.hM, startMs, end - HOUR, HOUR)
    perSite.clear()
    perSite.set(key, s)
  }
  return s
}

interface Row {
  label: string
  hint: string
  values: number[]
  higherIsBetter: boolean | null
  threshold: number
  show: (v: number) => string
}

export function WhenToLand({ a }: { a: SiteAnalysis }) {
  const tMs = useStore((s) => s.tMs)
  const setTime = useStore((s) => s.setTime)
  const windowStart = useStore((s) => s.windowStart)
  const fromFinder = useStore((s) => !!s.fromFinder[a.pin.id])
  const preset = useStore((s) => s.preset)
  const baselineMs = useStore((s) => s.baselines[a.pin.id])
  const setBaseline = useStore((s) => s.setBaseline)
  const wants = useWants(fromFinder)
  const [stay, setStay] = useState(14)
  // The year starts at the analysis window in force when this was opened and stays put while the
  // clock is inside it, so jumping to a ranked stay does not reshuffle the ranking under the user.
  const [anchor, setAnchor] = useState(windowStart)
  if (tMs < anchor || tMs > anchor + YEAR_DAYS * DAY) setAnchor(windowStart)
  const series = useMemo(() => yearSeries(a, anchor), [a.horizon, a.hM, a.ephem, anchor]) // eslint-disable-line react-hooks/exhaustive-deps
  const ranked = useMemo(() => rankWindows(series, stay, wants), [series, stay, wants])
  const everLit = useMemo(() => series.sunFrac.some((f) => f >= DEFAULT_CRITERIA.minSunFrac), [series])
  const hasBaseline = baselineMs !== undefined
  // With a baseline kept the grid is Baseline | Selected | best 1 | best 2, so it still fits the card.
  const top = ranked.slice(0, hasBaseline ? 2 : 3).map((r) => r.stats)
  const selected = windowStats(series, tMs, stay)
  const baseline = hasBaseline ? windowStats(series, baselineMs, stay) : null
  const cols: (WindowStats | null)[] = hasBaseline ? [baseline, selected, ...top] : [selected, ...top]
  const val = (f: (w: WindowStats) => number) => cols.map((w) => (w ? f(w) : NaN))
  const rows: Row[] = [
    { label: 'Sunlight', hint: 'Share of the stay in sunlight', values: val((w) => w.sunShare * 100), higherIsBetter: wants.sunHigh, threshold: 3, show: (v) => fmtShare(v / 100) },
    { label: 'Night', hint: 'Longest unbroken stretch without sunlight (the longest night)', values: val((w) => w.longestDarkH), higherIsBetter: !wants.sunHigh, threshold: 12, show: fmtDuration },
    { label: 'Earth in view', hint: 'Share of the stay with Earth above the terrain', values: val((w) => w.commShare * 100), higherIsBetter: wants.earthHigh, threshold: 3, show: (v) => fmtShare(v / 100) },
    { label: 'Earth gap', hint: 'Longest unbroken stretch without Earth in view', values: val((w) => w.longestNoCommH), higherIsBetter: !wants.earthHigh, threshold: 12, show: fmtDuration },
    { label: 'Sun height', hint: 'Mean height of the Sun above the level horizon while the site is sunlit', values: val((w) => w.meanSunElLit), higherIsBetter: null, threshold: 1, show: fmtAngle },
  ]
  // A winner is only marked among columns that have figures (a date can fall outside the year).
  const live = cols.map((w, i) => (w ? i : -1)).filter((i) => i >= 0)
  const end = series.t0Ms + series.count * series.stepMs
  const mission = (MISSION[preset] ?? MISSION.custom)[1]
  const best = landingSentence(top[0] ?? null, selected, stay, wants, everLit)

  return (
    <div className="wtl" onClick={(e) => e.stopPropagation()}>
      <h3 className="wtl-title">
        <Badge slot={a.pin.slot} />
        <span title={a.pin.label}>{a.pin.label}</span>
        <em>Judged for: {mission}</em>
      </h3>
      <div className="field">
        <span className="field-head">
          <span>Length of stay</span>
        </span>
        <Segmented label="Length of stay" options={STAYS} value={stay} onChange={setStay} />
      </div>

      <div className="wtl-say">
        <p className="wtl-sentence">{hasBaseline ? slipSentence(baseline, selected, wants) : best}</p>
        {hasBaseline && <p className="caption">{best}</p>}
      </div>

      <div className="wtl-base">
        {hasBaseline ? (
          <>
            <span className="caption">
              <i className="sw base" /> Baseline {fmtDateTime(baselineMs)}
            </span>
            <button type="button" className="btn" onClick={() => setBaseline(a.pin.id, null)}>
              Clear baseline
            </button>
          </>
        ) : (
          <>
            <span className="caption">Schedule slipped? Keep this date, then move the clock to see what changes.</span>
            <button type="button" className="btn" title={`Keep ${fmtDateTime(tMs)} as the date to compare against`} onClick={() => setBaseline(a.pin.id, tMs)}>
              Keep as baseline
            </button>
          </>
        )}
      </div>

      <div>
        <YearStrip series={series} marks={top.map((w, i) => ({ rank: i + 1, startMs: w.startMs, days: w.days }))} baselineMs={baselineMs} />
        <p className="caption key">
          <i className="sw sun" /> Sun <i className="sw earth" /> Earth <i className="sw pick" /> selected time{' '}
          {hasBaseline && (
            <>
              <i className="sw base" /> baseline{' '}
            </>
          )}
          <i className="sw stay" /> best stays, numbered · {fmtDay(series.t0Ms)} to {fmtDay(end)} (UTC) · drag to move the clock
        </p>
      </div>

      {top.length > 0 && (
        <div className="cmp-block" style={{ '--n': cols.length } as CSSProperties}>
          <div className="cmp-row cmp-mhead wtl-head">
            <h3 className="section">Landing</h3>
            {hasBaseline && (
              <button type="button" className="wtl-pick" title={`Set the clock back to the baseline: ${fmtDateTime(baselineMs)}`} onClick={() => setTime(baselineMs)}>
                <i className="sw base" />
                Baseline
              </button>
            )}
            <span className="cmp-letter" title={`The selected time: ${fmtDateTime(tMs)}`}>
              Selected
            </span>
            {top.map((w, i) => (
              <button
                key={w.startMs}
                type="button"
                className="wtl-pick"
                aria-pressed={selected !== null && Math.abs(selected.startMs - w.startMs) < HOUR}
                title={`Set the clock to this landing time: ${fmtDateTime(w.startMs)}`}
                onClick={() => setTime(w.startMs)}
              >
                <b>{i + 1}</b>
                {fmtTick(w.startMs)}
              </button>
            ))}
          </div>
          {rows.map((r) => {
            const lead = r.higherIsBetter === null ? -1 : leader(live.map((i) => r.values[i]), r.higherIsBetter, r.threshold)
            const win = lead < 0 ? -1 : live[lead]
            const dir = r.higherIsBetter === null ? '' : r.higherIsBetter ? 'higher is better for this mission' : 'lower is better for this mission'
            const full = dir ? `${r.hint}: ${dir}` : r.hint
            return (
              <div key={r.label} className="cmp-row cmp-measure">
                <span className="cmp-label" title={full} aria-label={`${r.label}. ${full}`}>
                  {r.label}
                  {r.higherIsBetter !== null && (
                    <i className="dir" aria-hidden="true">
                      {r.higherIsBetter ? '↑' : '↓'}
                    </i>
                  )}
                </span>
                {r.values.map((v, i) => (
                  <span key={i} className={Number.isNaN(v) ? 'cmp-val none' : i === win ? 'cmp-val win' : 'cmp-val'}>
                    {Number.isNaN(v) ? MISSING : r.show(v)}
                    {i === win && <i className="dot ink" role="img" aria-label="best" />}
                  </span>
                ))}
              </div>
            )
          })}
        </div>
      )}

      <p className="caption">
        {stay}-day stays starting every 6 h, from 1-hour steps over the period shown; ranked 60% on {wants.sunHigh ? 'sunlight' : 'darkness'}, 40% on{' '}
        {wants.earthHigh ? 'Earth in view' : 'being hidden from Earth'}. Observer {a.horizon.observerHeightM} m above the surface. Sunlit means at least half the
        Sun's disc is above the terrain; Earth in view means Earth's centre is above the terrain.
      </p>
    </div>
  )
}
