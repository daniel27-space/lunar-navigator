// One pinned point: what the Sun and Earth are doing there now, and over the next two months.
import { useMemo, useState } from 'react'
import { skyAt, type Ephem } from '../lib/ephem'
import { computeHorizon, discVisibleFraction, horizonAt } from '../lib/horizon'
import { slopeAt, terrainTier, type Terrain } from '../lib/terrain'
import {
  computeSeries,
  DEFAULT_CRITERIA,
  hasComm,
  isSunlit,
  nextChange,
  summarise,
  type Series,
} from '../lib/windows'
import { useStore, type Pin } from '../store'

const DAY = 86400000
const WINDOW_DAYS = 60
const STEP_MS = 20 * 60000

const fmtLat = (v: number) => `${Math.abs(v).toFixed(3)}°${v < 0 ? 'S' : 'N'}`
const fmtLon = (v: number) => `${Math.abs(v).toFixed(3)}°${v < 0 ? 'W' : 'E'}`
const fmtDur = (h: number | null) =>
  h === null ? `more than ${WINDOW_DAYS} d` : h >= 48 ? `${(h / 24).toFixed(1)} d` : `${h.toFixed(1)} h`
const pct = (v: number) => `${Math.round(v * 100)}%`

const TIER_NOTE = {
  fine: 'Horizon from LOLA 80 m terrain.',
  coarse: 'Horizon from LOLA terrain at about 300 m: rise and set times are less certain here.',
  none: 'No terrain data here: smooth-sphere horizon, so real hills are ignored.',
}

/** Consecutive runs where `test` is true, as [startIndex, endIndex) pairs. */
function runs(count: number, test: (i: number) => boolean): [number, number][] {
  const out: [number, number][] = []
  let start = -1
  for (let i = 0; i <= count; i++) {
    const on = i < count && test(i)
    if (on && start < 0) start = i
    if (!on && start >= 0) {
      out.push([start, i])
      start = -1
    }
  }
  return out
}

function Timeline({ s, tMs, onSeek }: { s: Series; tMs: number; onSeek: (t: number) => void }) {
  const W = 300
  const x = (i: number) => (i / s.count) * W
  const sun = useMemo(() => runs(s.count, (i) => isSunlit(s, i, DEFAULT_CRITERIA)), [s])
  const comm = useMemo(() => runs(s.count, (i) => hasComm(s, i, DEFAULT_CRITERIA)), [s])
  const cursor = ((tMs - s.t0Ms) / (s.count * s.stepMs)) * W
  const days = Array.from({ length: WINDOW_DAYS / 10 + 1 }, (_, k) => k * 10)
  return (
    <svg
      className="timeline"
      viewBox={`0 0 ${W} 46`}
      role="img"
      aria-label="Sunlight and Earth visibility over the next 60 days"
      onClick={(ev) => {
        const r = ev.currentTarget.getBoundingClientRect()
        onSeek(s.t0Ms + ((ev.clientX - r.left) / r.width) * s.count * s.stepMs)
      }}
    >
      <rect x="0" y="2" width={W} height="12" className="tl-bg" />
      <rect x="0" y="18" width={W} height="12" className="tl-bg" />
      {sun.map(([a, b]) => (
        <rect key={`s${a}`} x={x(a)} y="2" width={Math.max(x(b) - x(a), 0.5)} height="12" className="tl-sun" />
      ))}
      {comm.map(([a, b]) => (
        <rect key={`e${a}`} x={x(a)} y="18" width={Math.max(x(b) - x(a), 0.5)} height="12" className="tl-earth" />
      ))}
      {days.map((d) => (
        <text key={d} x={(d / WINDOW_DAYS) * W} y="43" className="tl-tick" textAnchor={d === 0 ? 'start' : d === WINDOW_DAYS ? 'end' : 'middle'}>
          {new Date(s.t0Ms + d * DAY).toISOString().slice(5, 10)}
        </text>
      ))}
      {cursor >= 0 && cursor <= W && <line x1={cursor} x2={cursor} y1="0" y2="32" className="tl-cursor" />}
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
  const yMin = Math.min(lo, sun.el, earth.el, -1) - 1
  const yMax = Math.max(hi, sun.el, earth.el, 2) + 1.5
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
  const disc = (b: { az: number; el: number; radius: number }, cls: string) => (
    <ellipse
      cx={X(b.az)}
      cy={Y(b.el)}
      rx={Math.max((b.radius / 360) * W, 3)}
      ry={Math.max((b.radius / (yMax - yMin)) * H, 3)}
      className={cls}
    />
  )
  const ticks = [Math.ceil(yMin), 0, Math.floor(yMax)].filter((v, i, a) => a.indexOf(v) === i)
  return (
    <svg className="pano" viewBox={`0 0 ${W} ${H + 14}`} role="img" aria-label="Horizon panorama with the Sun and Earth">
      <path d={track(s.sunAz, s.sunEl)} className="trk-sun" />
      <path d={track(s.earthAz, s.earthEl)} className="trk-earth" />
      {disc(sun, 'disc-sun')}
      {disc(earth, 'disc-earth')}
      <path d={d} className="terrain" />
      <line x1="0" x2={W} y1={Y(0)} y2={Y(0)} className="zero" />
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
  pin: Pin
  ephem: Ephem
  terrain: Terrain
  active: boolean
}

export function SiteCard({ pin, ephem, terrain, active }: Props) {
  const tMs = useStore((s) => s.tMs)
  const setTime = useStore((s) => s.setTime)
  const removePin = useStore((s) => s.removePin)
  const setActivePin = useStore((s) => s.setActivePin)
  const hM = Number.isNaN(pin.hM) ? 0 : pin.hM

  const slope = useMemo(() => slopeAt(terrain, pin.lat, pin.lon), [terrain, pin.lat, pin.lon])
  const horizon = useMemo(() => computeHorizon(terrain, pin.lat, pin.lon), [terrain, pin.lat, pin.lon])

  // The analysis window only moves when the clock leaves it, so playback stays smooth.
  const [anchor, setAnchor] = useState(() => Math.floor(tMs / 3600000) * 3600000 - 2 * DAY)
  if (tMs < anchor || tMs > anchor + (WINDOW_DAYS - 3) * DAY) {
    setAnchor(Math.floor(tMs / 3600000) * 3600000 - 2 * DAY)
  }
  const series = useMemo(
    () => computeSeries(ephem, horizon, hM, anchor, anchor + WINDOW_DAYS * DAY, STEP_MS),
    [ephem, horizon, hM, anchor],
  )
  const summary = useMemo(() => summarise(series), [series])

  const sky = skyAt(ephem, tMs, pin.lat, pin.lon, hM + horizon.observerHeightM)
  const sunFrac = discVisibleFraction(horizon, sky.sun.az, sky.sun.el, sky.sun.radius)
  const earthClear = sky.earth.el - horizonAt(horizon, sky.earth.az)
  const sunNext = nextChange(series, tMs, (i) => isSunlit(series, i, DEFAULT_CRITERIA))
  const commNext = nextChange(series, tMs, (i) => hasComm(series, i, DEFAULT_CRITERIA))

  return (
    <section className={`site ${active ? 'active' : ''}`} onClick={() => setActivePin(pin.id)}>
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
            Sun {sky.sun.el.toFixed(2)}° · {pct(sunFrac)} of disc visible
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
        <Panorama s={series} elev={horizon.elevDeg} azStep={horizon.azStepDeg} sun={sky.sun} earth={sky.earth} />
      )}

      <Timeline s={series} tMs={tMs} onSeek={setTime} />

      <dl className="stats">
        <dt>Sunlit</dt>
        <dd>{pct(summary.sunShare)}</dd>
        <dt>Longest night</dt>
        <dd>{fmtDur(summary.longestDarkH)}</dd>
        <dt>Earth in view</dt>
        <dd>{pct(summary.commShare)}</dd>
        <dt>Longest outage</dt>
        <dd>{fmtDur(summary.longestNoCommH)}</dd>
      </dl>
      <p className="muted small">
        60 days from {new Date(anchor).toISOString().slice(0, 10)}. Observer {horizon.observerHeightM} m above the
        surface. {TIER_NOTE[terrainTier(terrain, pin.lat, pin.lon)]}
      </p>
    </section>
  )
}
