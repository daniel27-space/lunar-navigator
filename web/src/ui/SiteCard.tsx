// One pinned point: what the Sun and Earth are doing there now, and over the next two months.
import { useMemo } from 'react'
import { DEFAULT_CRITERIA, hasComm, isSunlit, type Series } from '../lib/windows'
import { SITE_COLORS, useStore } from '../store'
import { DAY, runs, WINDOW_DAYS, type SiteAnalysis } from './useSiteAnalysis'

const fmtLat = (v: number) => `${Math.abs(v).toFixed(3)}°${v < 0 ? 'S' : 'N'}`
const fmtLon = (v: number) => `${Math.abs(v).toFixed(3)}°${v < 0 ? 'W' : 'E'}`
const fmtDur = (h: number | null) =>
  h === null ? `more than ${WINDOW_DAYS} d` : h >= 48 ? `${(h / 24).toFixed(1)} d` : `${h.toFixed(1)} h`
const pct = (v: number) => `${Math.round(v * 100)}%`

const TIER_NOTE = {
  crest: 'Horizon from LOLA 20 m terrain within about 5 km of this point, and 80 m terrain beyond.',
  patch: 'Horizon from 80 m terrain within about 30 km of this site, and the whole-Moon map (2.7 km pixels) beyond.',
  fine: 'Horizon from LOLA 80 m terrain.',
  coarse: 'Horizon from LOLA terrain at about 300 m: rise and set times are less certain here.',
  global:
    'Horizon from the whole-Moon map only (2.7 km pixels): hills smaller than a few km are missed, so treat times as rough.',
  none: 'No terrain data here: smooth-sphere horizon, so real hills are ignored.',
}

function Timeline({ s, tMs, onSeek }: { s: Series; tMs: number; onSeek: (t: number) => void }) {
  const W = 300
  const X0 = 34 // room for the row labels
  const x = (i: number) => X0 + (i / s.count) * (W - X0)
  const sun = useMemo(() => runs(s.count, (i) => isSunlit(s, i, DEFAULT_CRITERIA)), [s])
  const comm = useMemo(() => runs(s.count, (i) => hasComm(s, i, DEFAULT_CRITERIA)), [s])
  const cursor = X0 + ((tMs - s.t0Ms) / (s.count * s.stepMs)) * (W - X0)
  const days = Array.from({ length: WINDOW_DAYS / 10 + 1 }, (_, k) => k * 10)
  return (
    <svg
      className="timeline"
      viewBox={`0 0 ${W} 46`}
      role="img"
      aria-label="Sunlight and Earth visibility over the next 60 days"
      onClick={(ev) => {
        const r = ev.currentTarget.getBoundingClientRect()
        const f = (((ev.clientX - r.left) / r.width) * W - X0) / (W - X0)
        onSeek(s.t0Ms + Math.min(Math.max(f, 0), 1) * s.count * s.stepMs)
      }}
    >
      <text x="0" y="11" className="tl-tick">Sunlight</text>
      <text x="0" y="27" className="tl-tick">Earth</text>
      <rect x={X0} y="2" width={W - X0} height="12" className="tl-bg" />
      <rect x={X0} y="18" width={W - X0} height="12" className="tl-bg" />
      {sun.map(([a, b]) => (
        <rect key={`s${a}`} x={x(a)} y="2" width={Math.max(x(b) - x(a), 0.5)} height="12" className="tl-sun" />
      ))}
      {comm.map(([a, b]) => (
        <rect key={`e${a}`} x={x(a)} y="18" width={Math.max(x(b) - x(a), 0.5)} height="12" className="tl-earth" />
      ))}
      {days.map((d) => (
        <text key={d} x={X0 + (d / WINDOW_DAYS) * (W - X0)} y="43" className="tl-tick" textAnchor={d === 0 ? 'start' : d === WINDOW_DAYS ? 'end' : 'middle'}>
          {new Date(s.t0Ms + d * DAY).toISOString().slice(5, 10)}
        </text>
      ))}
      {cursor >= X0 && cursor <= W && <line x1={cursor} x2={cursor} y1="0" y2="32" className="tl-cursor" />}
    </svg>
  )
}

function Panorama({
  s,
  elev,
  azStep,
  sun,
  earth,
}: {
  s: Series
  elev: Float32Array
  azStep: number
  sun: { az: number; el: number; radius: number }
  earth: { az: number; el: number; radius: number }
}) {
  const W = 300
  const H = 120
  let lo = Infinity
  let hi = -Infinity
  for (const e of elev) {
    if (e < lo) lo = e
    if (e > hi) hi = e
  }
  // The scale follows the terrain. A body far below the horizon (or very high) is shown as an
  // arrow at the edge instead of stretching the picture until the terrain is a thin line.
  const yMin = Math.min(lo, -1) - 1.5
  const top = Math.max(hi, 2)
  const inView = (el: number) => (el > yMin ? el : -Infinity)
  const yMax = Math.min(Math.max(top, inView(sun.el), inView(earth.el)) + 1.5, top + 30)
  const X = (az: number) => (az / 360) * W
  const Y = (el: number) => H - ((el - yMin) / (yMax - yMin)) * H
  let d = `M0,${H}`
  for (let i = 0; i <= elev.length; i++) d += ` L${X(i * azStep).toFixed(1)},${Y(elev[i % elev.length]).toFixed(1)}`
  d += ` L${W},${H} Z`
  // Tracks over the next synodic month (29.5 days), broken where azimuth wraps.
  const n = Math.min(s.count, Math.round((29.53 * DAY) / s.stepMs))
  const track = (az: Float32Array, el: Float32Array) => {
    let p = ''
    for (let i = 0; i < n; i += 3) {
      const jump = i > 0 && Math.abs(az[i] - az[i - 3]) > 180
      p += `${i === 0 || jump ? 'M' : 'L'}${X(az[i]).toFixed(1)},${Y(el[i]).toFixed(1)} `
    }
    return p
  }
  const disc = (b: { az: number; el: number; radius: number }, cls: string, name: string) => {
    const below = b.el < yMin
    if (below || b.el > yMax) {
      const cx = Math.min(Math.max(X(b.az), 6), W - 6)
      const y = below ? H - 2 : 2
      const d = below ? -7 : 7
      return (
        <g className={cls}>
          <path d={`M${cx - 4},${y + d} L${cx + 4},${y + d} L${cx},${y} Z`} />
          <text x={cx < W / 2 ? cx + 7 : cx - 7} y={below ? H - 3 : 9} textAnchor={cx < W / 2 ? 'start' : 'end'} className="off">
            {name} {b.el.toFixed(0)}°
          </text>
        </g>
      )
    }
    return (
      <ellipse
        cx={X(b.az)}
        cy={Y(b.el)}
        rx={Math.max((b.radius / 360) * W, 3)}
        ry={Math.max((b.radius / (yMax - yMin)) * H, 3)}
        className={cls}
      />
    )
  }
  // The lowest tick gives way to the off-scale arrow's label when a body is below the picture.
  const anyBelow = sun.el < yMin || earth.el < yMin
  const ticks = [...(anyBelow ? [] : [Math.ceil(yMin)]), 0, Math.floor(yMax)].filter((v, i, a) => a.indexOf(v) === i)
  return (
    <svg className="pano" viewBox={`0 0 ${W} ${H + 14}`} role="img" aria-label="Horizon panorama with the Sun and Earth">
      <svg x="0" y="0" width={W} height={H}>
        <path d={track(s.sunAz, s.sunEl)} className="trk-sun" />
        <path d={track(s.earthAz, s.earthEl)} className="trk-earth" />
        {sun.el >= yMin && disc(sun, 'disc-sun', 'Sun')}
        {earth.el >= yMin && disc(earth, 'disc-earth', 'Earth')}
        <path d={d} className="terrain" />
        <line x1="0" x2={W} y1={Y(0)} y2={Y(0)} className="zero" />
        {sun.el < yMin && disc(sun, 'disc-sun', 'Sun')}
        {earth.el < yMin && disc(earth, 'disc-earth', 'Earth')}
      </svg>
      {ticks.map((v) => (
        <text key={v} x="2" y={Y(v) - 2} className="tl-tick">
          {v}°
        </text>
      ))}
      {['N', 'E', 'S', 'W'].map((c, i) => (
        <text key={c} x={X(i * 90) + (i === 0 ? 2 : 0)} y={H + 11} className="tl-tick" textAnchor={i === 0 ? 'start' : 'middle'}>
          {c}
        </text>
      ))}
    </svg>
  )
}

interface Props {
  a: SiteAnalysis
  active: boolean
}

export function SiteCard({ a, active }: Props) {
  const tMs = useStore((s) => s.tMs)
  const setTime = useStore((s) => s.setTime)
  const removePin = useStore((s) => s.removePin)
  const setActivePin = useStore((s) => s.setActivePin)
  const anchor = useStore((s) => s.windowStart)
  const { pin, hM, slope, horizon, series, summary, sky, eclipse, sunFrac, earthClear, sunNext, commNext, tier } = a

  return (
    <section
      className={`site ${active ? 'active' : ''}`}
      style={{ borderLeftColor: SITE_COLORS[pin.slot] }}
      onClick={() => setActivePin(pin.id)}
    >
      <header>
        <strong>{pin.label}</strong>
        <span className="muted">
          {fmtLat(pin.lat)} {fmtLon(pin.lon)} · {hM.toFixed(0)} m{Number.isNaN(slope) ? '' : ` · slope ${slope.toFixed(1)}°`}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation()
            removePin(pin.id)
          }}
          aria-label={`Remove ${pin.label}`}
        >
          ×
        </button>
      </header>

      <div className="now">
        <div className={sunNext.now ? 'ok' : 'bad'}>
          <b>{sunNext.now ? 'In sunlight' : 'In darkness'}</b>
          <span>
            {sunNext.now ? 'Sunset' : 'Sunrise'} in {fmtDur(sunNext.inHours)}
          </span>
          <span className="muted">
            Sun {sky.sun.el.toFixed(2)}° · {pct(sunFrac)} of disc visible{eclipse < 1 ? ' (Earth is eclipsing the Sun)' : ''}
          </span>
        </div>
        <div className={commNext.now ? 'ok' : 'bad'}>
          <b>{commNext.now ? 'Earth in view' : 'No Earth link'}</b>
          <span>
            {commNext.now ? 'Earthset' : 'Earthrise'} in {fmtDur(commNext.inHours)}
          </span>
          <span className="muted">
            Earth {earthClear >= 0 ? '+' : ''}
            {earthClear.toFixed(2)}° over terrain
          </span>
        </div>
      </div>

      {active && (
        <>
          <Panorama s={series} elev={horizon.elevDeg} azStep={horizon.azStepDeg} sun={sky.sun} earth={sky.earth} />
          <p className="muted small key">
            The view from this point, all the way round. Grey is ground. <i className="dot sun" /> Sun{' '}
            <i className="dot earth" /> Earth; dotted lines are their paths over the next month.
          </p>
        </>
      )}

      <Timeline s={series} tMs={tMs} onSeek={setTime} />

      <dl className="stats">
        <dt>In sunlight</dt>
        <dd>{pct(summary.sunShare)}</dd>
        <dt>Longest night</dt>
        <dd>{fmtDur(summary.longestDarkH)}</dd>
        <dt>Earth in view</dt>
        <dd>{pct(summary.commShare)}</dd>
        <dt>Longest outage</dt>
        <dd>{fmtDur(summary.longestNoCommH)}</dd>
      </dl>
      <details className="help">
        <summary>How to read this</summary>
        <ul>
          <li>
            <b>Two boxes at the top:</b> what is true at the selected time, and how long until it changes.
          </li>
          <li>
            <b>Dark picture:</b> stand on the point and turn a full circle (N, E, S, W). Grey is the ground and hills
            around you. When the yellow dot (Sun) is above the grey, the point is in sunlight. When the blue dot
            (Earth) is above it, a radio link to Earth is possible.
          </li>
          <li>
            <b>Two bars:</b> the next 60 days. Yellow means in sunlight, blue means Earth in view, a gap means not.
            The white line is the selected time; click a bar to jump there.
          </li>
          <li>
            <b>Four numbers:</b> the share of those 60 days in sunlight and with Earth in view, and the longest
            unbroken stretch without each.
          </li>
          <li>
            <b>Observer 2 m:</b> everything is worked out for a solar panel or antenna 2 m above the ground, about the
            top of a small lander. Taller sees over more hills.
          </li>
        </ul>
      </details>
      <p className="muted small">
        Stats cover 60 days from {new Date(anchor).toISOString().slice(0, 10)}. Observer {horizon.observerHeightM} m above the
        surface. {TIER_NOTE[tier]}
      </p>
    </section>
  )
}
