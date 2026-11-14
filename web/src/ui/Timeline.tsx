// The 60-day timeline used by both the site card (one site) and the comparison (two or three):
// a Sun lane over an Earth lane per site, the longest night bracketed, and one draggable cursor
// for the selected time.
import { useMemo } from 'react'
import { fmtDateTime, fmtMonth, fmtTick } from '../lib/format'
import { DEFAULT_CRITERIA, hasComm, isSunlit, type Series } from '../lib/windows'
import { useStore } from '../store'
import { Badge } from './controls'
import { DAY, runs, WINDOW_DAYS, type SiteAnalysis } from './useSiteAnalysis'

type Span = [number, number]

function longest(spans: Span[]): Span | null {
  let best: Span | null = null
  for (const s of spans) if (!best || s[1] - s[0] > best[1] - best[0]) best = s
  return best
}

const at = (i: number, n: number) => `${(i / n) * 100}%`

function Runs({ spans, n }: { spans: Span[]; n: number }) {
  return (
    <>
      {spans.map(([p, q]) => (
        <i key={p} style={{ left: at(p, n), width: at(q - p, n) }} />
      ))}
    </>
  )
}

/** The draggable, keyboard-operable layer over a strip that moves the shared clock. */
function useClockSeek(t0Ms: number, spanMs: number, label: string) {
  const tMs = useStore((s) => s.tMs)
  const setTime = useStore((s) => s.setTime)
  const f = (tMs - t0Ms) / spanMs
  const seek = (ev: React.PointerEvent<HTMLDivElement>) => {
    const r = ev.currentTarget.getBoundingClientRect()
    setTime(t0Ms + Math.min(Math.max((ev.clientX - r.left) / r.width, 0), 1) * spanMs)
  }
  const nudge = (ms: number) => setTime(Math.min(Math.max(tMs + ms, t0Ms), t0Ms + spanMs))
  const hit = {
    className: 'tl-hit',
    role: 'slider',
    tabIndex: 0,
    'aria-label': label,
    'aria-valuemin': 0,
    'aria-valuemax': Math.round(spanMs / DAY),
    'aria-valuenow': Math.round(((Math.min(Math.max(f, 0), 1) * spanMs) / DAY) * 10) / 10,
    'aria-valuetext': fmtDateTime(tMs),
    onPointerDown: (ev: React.PointerEvent<HTMLDivElement>) => {
      ev.currentTarget.setPointerCapture(ev.pointerId)
      seek(ev)
    },
    onPointerMove: (ev: React.PointerEvent<HTMLDivElement>) => {
      if (ev.buttons === 1) seek(ev)
    },
    onKeyDown: (ev: React.KeyboardEvent<HTMLDivElement>) => {
      const step = (ev.shiftKey ? 24 : 6) * 3600000
      if (ev.key === 'ArrowLeft') nudge(-step)
      else if (ev.key === 'ArrowRight') nudge(step)
      else return
      ev.preventDefault()
    },
  }
  return { f, hit }
}

export interface StayMark {
  rank: number
  startMs: number
  days: number
}

/** One site over a year: sunlight and Earth lanes, the ranked stays marked above them, month ticks. */
export function YearStrip({ series, marks, baselineMs }: { series: Series; marks: StayMark[]; baselineMs?: number }) {
  const n = series.count
  const span = n * series.stepMs
  const lanes = useMemo(
    () => ({
      sun: runs(n, (i) => isSunlit(series, i, DEFAULT_CRITERIA)),
      comm: runs(n, (i) => hasComm(series, i, DEFAULT_CRITERIA)),
    }),
    [series, n],
  )
  const months = useMemo(() => {
    const out: number[] = []
    const d = new Date(series.t0Ms)
    let t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)
    while (t < series.t0Ms + span) {
      out.push(t)
      const m = new Date(t)
      t = Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1)
    }
    return out
  }, [series, span])
  const { f, hit } = useClockSeek(series.t0Ms, span, 'Selected time within this year')
  const at = (ms: number) => `${((ms - series.t0Ms) / span) * 100}%`
  return (
    <div className="tl tl-year">
      <div className="tl-body">
        <div className="tl-marks">
          {marks.map((m) => (
            <b key={m.rank} style={{ left: at(m.startMs), width: `${((m.days * DAY) / span) * 100}%` }}>
              <span>{m.rank}</span>
            </b>
          ))}
        </div>
        <div className="tl-row">
          <div className="tl-lanes">
            <div className="lane sun">
              <Runs spans={lanes.sun} n={n} />
            </div>
            <div className="lane earth">
              <Runs spans={lanes.comm} n={n} />
            </div>
          </div>
        </div>
        <div {...hit}>
          {baselineMs !== undefined && baselineMs >= series.t0Ms && baselineMs <= series.t0Ms + span && <i className="tl-baseline" style={{ left: at(baselineMs) }} />}
          {f >= 0 && f <= 1 && <i className="tl-cursor" style={{ left: `${f * 100}%` }} />}
        </div>
      </div>
      <div className="tl-ticks" aria-hidden="true">
        {months.map((t) => (
          <span key={t} style={{ left: at(t) }}>
            {fmtMonth(t)}
          </span>
        ))}
      </div>
    </div>
  )
}

const TICK_DAYS = [0, 15, 30, 45, 60]

export function SiteTimeline({ sites, compare = false }: { sites: SiteAnalysis[]; compare?: boolean }) {
  const s0 = sites[0].series
  const n = s0.count
  const span = n * s0.stepMs
  const lanes = useMemo(
    () =>
      sites.map((a) => ({
        sun: runs(a.series.count, (i) => isSunlit(a.series, i, DEFAULT_CRITERIA)),
        comm: runs(a.series.count, (i) => hasComm(a.series, i, DEFAULT_CRITERIA)),
        night: longest(runs(a.series.count, (i) => !isSunlit(a.series, i, DEFAULT_CRITERIA))),
      })),
    [sites],
  )
  // When every site is in sunlight at once.
  const allLit = useMemo(
    () => (compare ? runs(n, (i) => sites.every((a) => isSunlit(a.series, i, DEFAULT_CRITERIA))) : []),
    [compare, sites, n],
  )
  const { f, hit } = useClockSeek(s0.t0Ms, span, compare ? 'Selected time, shared by every site' : 'Selected time within these 60 days')

  return (
    <div className={compare ? 'tl tl-compare' : 'tl'}>
      <div className="tl-body">
        {sites.map((a, k) => (
          <div className="tl-row" key={a.pin.id}>
            {compare && <Badge slot={a.pin.slot} />}
            <div className="tl-lanes">
              <div className="lane sun">
                <Runs spans={lanes[k].sun} n={n} />
              </div>
              <div className="lane earth">
                <Runs spans={lanes[k].comm} n={n} />
              </div>
              {lanes[k].night && <b className="tl-night" style={{ left: at(lanes[k].night[0], n), width: at(lanes[k].night[1] - lanes[k].night[0], n) }} />}
            </div>
          </div>
        ))}
        {compare && (
          <div className="tl-row">
            <span className="tl-all">all</span>
            <div className="tl-lanes">
              <div className="lane all">
                <Runs spans={allLit} n={n} />
              </div>
            </div>
          </div>
        )}
        <div {...hit}>{f >= 0 && f <= 1 && <i className="tl-cursor" style={{ left: `${f * 100}%` }} />}</div>
      </div>
      <div className="tl-ticks" aria-hidden="true">
        {TICK_DAYS.map((d) => (
          <span key={d} style={{ left: `${(d / WINDOW_DAYS) * 100}%` }}>
            {fmtTick(s0.t0Ms + d * DAY)}
          </span>
        ))}
      </div>
    </div>
  )
}
