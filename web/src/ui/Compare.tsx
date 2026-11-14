// Comparison of two or three pinned sites on one grid (docs/DESIGN.md section 7): who is who
// (once), a one-sentence verdict, one shared timeline, then one aligned row per measure. Raw
// details stay folded away.
import { useMemo, useState, type CSSProperties } from 'react'
import { fmtAngle, fmtCoord, fmtDate, fmtElevation, fmtMeasure, MISSING } from '../lib/format'
import { measures, type Measure, type SiteFacts } from '../lib/verdict'
import { useStore } from '../store'
import { Badge, SITE_LETTERS } from './controls'
import { SiteTimeline } from './Timeline'
import { WINDOW_DAYS, type SiteAnalysis, type Tier } from './useSiteAnalysis'
import { MISSION, verdictSentence } from './verdictSentence'

/** [panel label, phone label] */
const LABEL: Record<Measure['id'], [string, string]> = {
  sun: ['Time in sunlight', 'Sunlight'],
  night: ['Longest night', 'Night'],
  earth: ['Earth in view', 'Earth'],
  outage: ['Longest Earth gap', 'Earth gap'],
  slope: ['Slope', 'Slope'],
}

const TERRAIN: Record<Tier, string> = { crest: '20 m', fine: '80 m', patch: '80 m', coarse: '300 m', global: '2.7 km', none: MISSING }

/** True when the known values are closer together than the smallest difference that counts. */
function aboutEqual(m: Measure): boolean {
  const v = m.values.filter((x) => !Number.isNaN(x))
  return v.length === m.values.length && Math.max(...v) - Math.min(...v) < m.threshold
}

/** One measure on a worse-to-better scale with one dot per site (in Details). */
function Scale({ m, sites }: { m: Measure; sites: SiteAnalysis[] }) {
  const known = m.values.filter((v) => !Number.isNaN(v))
  const hi = m.unit === '%' ? 100 : Math.max(...known, m.unit === 'd' ? 5 : 10) * 1.1
  const pos = (v: number) => {
    const t = Math.min(Math.max(v / hi, 0), 1)
    return (m.higherIsBetter ? t : 1 - t) * 100
  }
  return (
    <div className="cmp-row cmp-scale">
      <span className="cmp-label">{LABEL[m.id][0]}</span>
      <div className="track" role="img" aria-label={`${m.label}: worse on the left, better on the right`}>
        {sites.map((a, i) => (Number.isNaN(m.values[i]) ? null : <i key={a.pin.id} className="sdot" data-slot={a.pin.slot} style={{ left: `${pos(m.values[i])}%` }} />))}
      </div>
    </div>
  )
}

export function Compare({ sites }: { sites: SiteAnalysis[] }) {
  const finder = useStore((s) => s.finder)
  const preset = useStore((s) => s.preset)
  const layer = useStore((s) => s.layer)
  const setLayer = useStore((s) => s.setLayer)
  const setTab = useStore((s) => s.setTab)
  const removePin = useStore((s) => s.removePin)
  const goTo = useStore((s) => s.goTo)
  const [onlyDiff, setOnlyDiff] = useState(false)
  // "Better" follows the finder's mission when it is in use; otherwise sunlight and Earth view are good.
  const wants = useMemo(
    () =>
      layer === 'finder' || preset !== 'solar'
        ? { sunHigh: finder.sunPrefer !== 'low', earthHigh: finder.earthPrefer !== 'low' }
        : { sunHigh: true, earthHigh: true },
    [finder, preset, layer],
  )
  const facts: SiteFacts[] = useMemo(
    () => sites.map((a) => ({ label: a.pin.label, summary: a.summary, slopeDeg: a.slope })),
    [sites],
  )
  const ms = useMemo(() => measures(facts, wants), [facts, wants])
  const mission = MISSION[preset] ?? MISSION.custom
  const v = useMemo(
    () =>
      verdictSentence(
        ms,
        sites.map((a) => SITE_LETTERS[a.pin.slot]),
        mission[0],
      ),
    [ms, sites, mission],
  )
  const shown = onlyDiff ? ms.filter((m) => !aboutEqual(m)) : ms

  return (
    <section className="compare" style={{ '--n': sites.length } as CSSProperties}>
      <div className="cmp-row cmp-head">
        <span />
        {sites.map((a) => (
          <div key={a.pin.id} className="cmp-col">
            <button
              type="button"
              className="cmp-fly"
              onClick={() => goTo({ kind: 'site', lat: a.pin.lat, lon: a.pin.lon, hM: a.hM })}
              title={`${a.pin.label}: fly to this site`}
              aria-label={`Fly to ${a.pin.label}`}
            >
              <Badge slot={a.pin.slot} />
              <span className="cmp-name">{a.pin.label}</span>
            </button>
            <button type="button" className="cmp-x" onClick={() => removePin(a.pin.id)} aria-label={`Remove ${a.pin.label}`}>
              ×
            </button>
          </div>
        ))}
      </div>

      <div className="cmp-verdict">
        <p className="verdict">
          {v.leader >= 0 && <Badge slot={sites[v.leader].pin.slot} />} {v.text}
        </p>
        <p className="caption">
          {v.sub} Judged for:{' '}
          <button
            type="button"
            className="link"
            title="Open the site finder to change what the mission needs"
            onClick={() => {
              setLayer('finder')
              setTab('find')
            }}
          >
            {mission[1]}
          </button>
        </p>
      </div>

      <div className="cmp-block">
        <h3 className="section">Next {WINDOW_DAYS} days</h3>
        <SiteTimeline sites={sites} compare />
        <p className="caption key">
          <i className="sw sun" /> Sun <i className="sw earth" /> Earth <i className="sw night" /> longest night · all: every site sunlit · drag to move the clock
        </p>
      </div>

      <div className="cmp-block">
        <div className="cmp-row cmp-mhead">
          <h3 className="section">Measures</h3>
          {sites.map((a) => (
            <span key={a.pin.id} className="cmp-letter">
              {SITE_LETTERS[a.pin.slot]}
            </span>
          ))}
        </div>
        {shown.map((m) => {
          const equal = aboutEqual(m)
          const hint = m.higherIsBetter ? 'higher is better for this mission' : 'lower is better for this mission'
          return (
            <div key={m.id} className="cmp-row cmp-measure">
              <span className="cmp-label" title={`${m.label}: ${equal ? 'about equal' : hint}`}>
                <span className="lbl-wide">{LABEL[m.id][0]}</span>
                <span className="lbl-phone">{LABEL[m.id][1]}</span>
                {equal ? (
                  <em>about equal</em>
                ) : (
                  <i className="dir" aria-label={hint}>
                    {m.higherIsBetter ? '↑' : '↓'}
                  </i>
                )}
              </span>
              {m.values.map((val, i) => (
                <span key={sites[i].pin.id} className={Number.isNaN(val) ? 'cmp-val none' : i === m.winner ? 'cmp-val win' : 'cmp-val'}>
                  {fmtMeasure(val, m.unit)}
                  {i === m.winner && <i className="sdot" data-slot={sites[i].pin.slot} role="img" aria-label="best" />}
                </span>
              ))}
            </div>
          )
        })}
        {shown.length === 0 && <p className="caption">No measure differs between these sites.</p>}
      </div>

      <details className="disclosure">
        <summary>Details</summary>
        <div className="cmp-details">
          <label className="check">
            <input type="checkbox" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} />
            <span>Show only differences</span>
          </label>
          <ul className="cmp-sitelist">
            {sites.map((a) => (
              <li key={a.pin.id}>
                <Badge slot={a.pin.slot} />
                <span>{a.pin.label}</span>
                <span className="num">{fmtCoord(a.pin.lat, a.pin.lon)}</span>
              </li>
            ))}
          </ul>
          <div>
            <div className="cmp-row cmp-fine">
              <span className="cmp-label">Elevation</span>
              {sites.map((a) => (
                <span key={a.pin.id} className="cmp-val">
                  {fmtElevation(a.hM)}
                </span>
              ))}
            </div>
            <div className="cmp-row cmp-fine">
              <span className="cmp-label">Sun elevation now</span>
              {sites.map((a) => (
                <span key={a.pin.id} className="cmp-val">
                  {fmtAngle(a.sky.sun.el)}
                </span>
              ))}
            </div>
            <div className="cmp-row cmp-fine">
              <span className="cmp-label">Terrain used</span>
              {sites.map((a) => (
                <span key={a.pin.id} className="cmp-val">
                  {TERRAIN[a.tier]}
                </span>
              ))}
            </div>
          </div>
          <div>
            <h3 className="section">Worse to better</h3>
            {ms.map((m) => (
              <Scale key={m.id} m={m} sites={sites} />
            ))}
          </div>
          <p className="caption">
            {WINDOW_DAYS} days from {fmtDate(sites[0].series.t0Ms)} UTC, observer 2 m above the surface. Differences under 3 points, 0.5 d or 1° are
            ignored.
          </p>
        </div>
      </details>
    </section>
  )
}
