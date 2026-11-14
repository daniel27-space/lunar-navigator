// Comparison of two or three pinned sites. The order follows what a decision needs:
// a verdict in plain words, then one shared timeline, then one dot row per measure, with the
// full table last. (Patterns: "main differences" from product-comparison sites, a shared time
// cursor from sun-planning tools, dot rows instead of a radar chart; docs/research/design-references.md.)
import { useMemo } from 'react'
import { measures, verdict, type Measure, type SiteFacts } from '../lib/verdict'
import { DEFAULT_CRITERIA, hasComm, isSunlit, type Series } from '../lib/windows'
import { SITE_COLORS, useStore } from '../store'
import { DAY, runs, WINDOW_DAYS, type SiteAnalysis } from './useSiteAnalysis'

const short = (label: string) => (label.length > 16 ? `${label.slice(0, 15)}…` : label)

function longest(spans: [number, number][]): [number, number] | null {
  let best: [number, number] | null = null
  for (const s of spans) if (!best || s[1] - s[0] > best[1] - best[0]) best = s
  return best
}

function SharedTimeline({ sites }: { sites: SiteAnalysis[] }) {
  const tMs = useStore((s) => s.tMs)
  const setTime = useStore((s) => s.setTime)
  const s0: Series = sites[0].series
  const W = 340
  const X0 = 4
  const LANE = 26
  const top = 4
  const H = top + sites.length * LANE + 16
  const x = (i: number) => X0 + (i / s0.count) * (W - X0)
  const lanes = useMemo(
    () =>
      sites.map((a) => {
        const sun = runs(a.series.count, (i) => isSunlit(a.series, i, DEFAULT_CRITERIA))
        const dark = runs(a.series.count, (i) => !isSunlit(a.series, i, DEFAULT_CRITERIA))
        const comm = runs(a.series.count, (i) => hasComm(a.series, i, DEFAULT_CRITERIA))
        return { sun, comm, night: longest(dark) }
      }),
    [sites],
  )
  // When every site is in sunlight at once.
  const allLit = useMemo(
    () => runs(s0.count, (i) => sites.every((a) => isSunlit(a.series, i, DEFAULT_CRITERIA))),
    [sites, s0],
  )
  const cursor = X0 + ((tMs - s0.t0Ms) / (s0.count * s0.stepMs)) * (W - X0)
  const seek = (ev: React.PointerEvent<SVGSVGElement>) => {
    const r = ev.currentTarget.getBoundingClientRect()
    const f = (((ev.clientX - r.left) / r.width) * W - X0) / (W - X0)
    setTime(s0.t0Ms + Math.min(Math.max(f, 0), 1) * s0.count * s0.stepMs)
  }
  const days = [0, 15, 30, 45, 60]
  return (
    <svg
      className="cmp-timeline"
      viewBox={`0 0 ${W} ${H + 12}`}
      role="img"
      aria-label="Sunlight and Earth visibility for each site over the same 60 days"
      onPointerDown={(ev) => {
        ev.currentTarget.setPointerCapture(ev.pointerId)
        seek(ev)
      }}
      onPointerMove={(ev) => ev.buttons === 1 && seek(ev)}
    >
      {sites.map((a, k) => {
        const y = top + k * LANE
        const l = lanes[k]
        return (
          <g key={a.pin.id}>
            <rect x={X0} y={y} width={W - X0} height="10" className="tl-bg" />
            <rect x={X0} y={y + 12} width={W - X0} height="5" className="tl-bg" />
            {l.sun.map(([p, q]) => (
              <rect key={`s${p}`} x={x(p)} y={y} width={Math.max(x(q) - x(p), 0.5)} height="10" className="tl-sun" />
            ))}
            {l.comm.map(([p, q]) => (
              <rect key={`e${p}`} x={x(p)} y={y + 12} width={Math.max(x(q) - x(p), 0.5)} height="5" className="tl-earth" />
            ))}
            {l.night && (
              <path
                d={`M${x(l.night[0])},${y + 20} v2.5 H${x(l.night[1])} v-2.5`}
                className="cmp-night"
              />
            )}
            <rect x="0" y={y} width="2.5" height="17" fill={SITE_COLORS[a.pin.slot]} />
          </g>
        )
      })}
      <rect x={X0} y={top + sites.length * LANE} width={W - X0} height="5" className="tl-bg" />
      {allLit.map(([p, q]) => (
        <rect key={`a${p}`} x={x(p)} y={top + sites.length * LANE} width={Math.max(x(q) - x(p), 0.5)} height="5" className="cmp-all" />
      ))}
      {days.map((d) => (
        <text
          key={d}
          x={X0 + (d / WINDOW_DAYS) * (W - X0)}
          y={H + 8}
          className="tl-tick"
          textAnchor={d === 0 ? 'start' : d === WINDOW_DAYS ? 'end' : 'middle'}
        >
          {new Date(s0.t0Ms + d * DAY).toISOString().slice(5, 10)}
        </text>
      ))}
      {cursor >= X0 && cursor <= W && <line x1={cursor} x2={cursor} y1="0" y2={H - 4} className="tl-cursor" />}
    </svg>
  )
}

const show = (v: number, unit: Measure['unit']) =>
  Number.isNaN(v) ? 'n/a' : unit === '%' ? `${Math.round(v)}%` : unit === 'd' ? `${v.toFixed(1)} d` : `${v.toFixed(1)}°`

/** One measure: a track running from worse (left) to better (right) with one dot per site. */
function DotRow({ m, sites }: { m: Measure; sites: SiteAnalysis[] }) {
  const known = m.values.filter((v) => !Number.isNaN(v))
  const hi = m.unit === '%' ? 100 : Math.max(...known, m.unit === 'd' ? 5 : 10) * 1.1
  const pos = (v: number) => {
    const t = Math.min(Math.max(v / hi, 0), 1)
    return (m.higherIsBetter ? t : 1 - t) * 100
  }
  return (
    <div className="dotrow">
      <div className="dotrow-head">
        <span>{m.label}</span>
        <span className="muted">{m.higherIsBetter ? 'more is better' : 'less is better'} →</span>
      </div>
      <div className="track">
        {sites.map((a, i) =>
          Number.isNaN(m.values[i]) ? null : (
            <i
              key={a.pin.id}
              className={i === m.winner ? 'win' : ''}
              style={{ left: `${pos(m.values[i])}%`, background: SITE_COLORS[a.pin.slot], color: SITE_COLORS[a.pin.slot] }}
            />
          ),
        )}
      </div>
      <div className="dotrow-values">
        {sites.map((a, i) => (
          <span key={a.pin.id} className={i === m.winner ? 'win' : ''} style={{ color: SITE_COLORS[a.pin.slot] }}>
            {show(m.values[i], m.unit)}
          </span>
        ))}
      </div>
    </div>
  )
}

export function Compare({ sites }: { sites: SiteAnalysis[] }) {
  const finder = useStore((s) => s.finder)
  const preset = useStore((s) => s.preset)
  const layer = useStore((s) => s.layer)
  const removePin = useStore((s) => s.removePin)
  const goTo = useStore((s) => s.goTo)
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
  const v = useMemo(() => verdict(facts, wants), [facts, wants])
  const start = new Date(sites[0].series.t0Ms).toISOString().slice(0, 10)

  return (
    <section className="compare">
      <div className="cmp-sites">
        {sites.map((a) => (
          <div key={a.pin.id} className="cmp-site" style={{ borderColor: SITE_COLORS[a.pin.slot] }}>
            <button className="cmp-name" onClick={() => goTo({ kind: 'site', lat: a.pin.lat, lon: a.pin.lon, hM: a.hM })} title="Fly to this site">
              <i style={{ background: SITE_COLORS[a.pin.slot] }} />
              {short(a.pin.label)}
            </button>
            <span className="cmp-now">
              <b className={a.sunNext.now ? 'lit' : ''}>{a.sunNext.now ? 'Sunlit' : 'Dark'}</b>
              <b className={a.commNext.now ? 'link' : ''}>{a.commNext.now ? 'Earth' : 'No Earth'}</b>
            </span>
            <button className="cmp-x" onClick={() => removePin(a.pin.id)} aria-label={`Remove ${a.pin.label}`}>
              ×
            </button>
          </div>
        ))}
      </div>

      <h3>Verdict</h3>
      <ul className="verdict">
        {v.lines.map((l) => (
          <li key={l.text} style={{ borderColor: SITE_COLORS[sites[l.winner].pin.slot] }}>
            {l.text}
          </li>
        ))}
      </ul>
      <p className="overall">{v.overall}</p>
      <p className="muted small">
        Judged for a mission that wants {wants.sunHigh ? 'sunlight' : 'darkness'} and {wants.earthHigh ? 'a view of Earth' : 'to be hidden from Earth'}
        {layer === 'finder' ? ' (from the site finder)' : ''}. Differences under 3 points, half a day or 1° are not counted.
      </p>

      <h3>The same 60 days, side by side</h3>
      <SharedTimeline sites={sites} />
      <p className="muted small key">
        Per site: <i className="bar sun" /> in sunlight, <i className="bar earth" /> Earth in view, <i className="bar night" /> longest night.
        Bottom strip: <i className="bar all" /> every site sunlit at once. Drag to move the clock.
      </p>

      <h3>Measure by measure</h3>
      {ms.map((m) => (
        <DotRow key={m.id} m={m} sites={sites} />
      ))}

      <details className="help">
        <summary>All figures as a table</summary>
        <table className="cmp-table">
          <thead>
            <tr>
              <th />
              {sites.map((a) => (
                <th key={a.pin.id} style={{ color: SITE_COLORS[a.pin.slot] }}>
                  {short(a.pin.label)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ms.map((m) => (
              <tr key={m.id}>
                <td>{m.label}</td>
                {m.values.map((val, i) => (
                  <td key={i} className={i === m.winner ? 'win' : ''}>
                    {show(val, m.unit)}
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <td>Elevation</td>
              {sites.map((a) => (
                <td key={a.pin.id}>{a.hM.toFixed(0)} m</td>
              ))}
            </tr>
            <tr>
              <td>Latitude, longitude</td>
              {sites.map((a) => (
                <td key={a.pin.id}>
                  {a.pin.lat.toFixed(2)}°, {a.pin.lon.toFixed(2)}°
                </td>
              ))}
            </tr>
            <tr>
              <td>Sun now</td>
              {sites.map((a) => (
                <td key={a.pin.id}>{a.sky.sun.el.toFixed(1)}°</td>
              ))}
            </tr>
            <tr>
              <td>Terrain used</td>
              {sites.map((a) => (
                <td key={a.pin.id}>{a.tier === 'fine' || a.tier === 'patch' ? '80 m' : a.tier === 'coarse' ? '300 m' : a.tier === 'global' ? '2.7 km' : 'none'}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </details>
      <p className="muted small">60 days from {start}. Observer 2 m above the surface.</p>
    </section>
  )
}
