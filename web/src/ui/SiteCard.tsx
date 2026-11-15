// One pinned point: what the Sun and Earth are doing there now, and over the next two months.
import { useEffect, useState } from 'react'
import { assumptionsText, earthRuleText, sunRuleText } from '../lib/assumptions'
import { fmtAngle, fmtCoord, fmtDegrees, fmtDuration, fmtPeriod, fmtElevation, fmtShare, fmtSlope, fmtSpan } from '../lib/format'
import type { Series } from '../lib/windows'
import { useAssumptions, useStore } from '../store'
import { Badge } from './controls'
import { siteSentence } from './siteSentence'
import { SiteTimeline } from './Timeline'
import { WhenToLand } from './WhenToLand'
import { TIER_NOTE, TIER_SHORT, terrainTag } from './tiers'
import { DAY, WINDOW_DAYS, type SiteAnalysis } from './useSiteAnalysis'

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
          <text x={cx < W / 2 ? cx + 7 : cx - 7} y={below ? H - 3 : 11} textAnchor={cx < W / 2 ? 'start' : 'end'} className="tick">
            {name} {fmtAngle(b.el)}
          </text>
        </g>
      )
    }
    // Heights in this picture are stretched many times over (a full turn across, a few degrees
    // up), so a disc drawn to scale would be a tall thin oval. A round dot marks the centre and
    // the bar behind it runs from the true bottom of the disc to its true top, which is what
    // shows how much of it clears the hills.
    const half = Math.max((b.radius / (yMax - yMin)) * H, 3)
    return (
      <g className={cls}>
        <rect x={X(b.az) - 1.5} y={Y(b.el) - half} width="3" height={half * 2} rx="1.5" className="extent" />
        <circle cx={X(b.az)} cy={Y(b.el)} r="4.5" />
      </g>
    )
  }
  // The lowest tick gives way to the off-scale arrow's label when a body is below the picture.
  const anyBelow = sun.el < yMin || earth.el < yMin
  // ...and when it would sit on top of the 0° label.
  const lowest = Math.ceil(yMin)
  const ticks = [...(anyBelow || Y(lowest) - Y(0) < 12 ? [] : [lowest]), 0, Math.floor(yMax)].filter((v, i, a) => a.indexOf(v) === i)
  return (
    <svg className="pano" viewBox={`0 0 ${W} ${H + 16}`} role="img" aria-label="Horizon panorama with the Sun and Earth">
      <rect width={W} height={H} className="pano-bg" />
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
        <text key={v} x="3" y={Math.max(Y(v) - 2, 11)} className="tick">
          {fmtDegrees(v)}
        </text>
      ))}
      {['N', 'E', 'S', 'W'].map((c, i) => (
        <text key={c} x={X(i * 90) + (i === 0 ? 3 : 0)} y={H + 13} className="tick" textAnchor={i === 0 ? 'start' : 'middle'}>
          {c}
        </text>
      ))}
    </svg>
  )
}

interface Props {
  a: SiteAnalysis
  active: boolean
  /** every pinned site with figures, for an export made from this card */
  all?: SiteAnalysis[]
}

export function SiteCard({ a, active, all }: Props) {
  const criteria = useStore((s) => s.criteria)
  const assumptions = useAssumptions()
  const playing = useStore((s) => s.playing)
  const planner = useStore((s) => s.mode === 'plan')
  const removePin = useStore((s) => s.removePin)
  const setActivePin = useStore((s) => s.setActivePin)
  const { pin, hM, slope, horizon, series, summary, sky, eclipse, sunFrac, earthClear, sunNext, commNext, tier } = a
  // The horizon view follows the active card until the user opens or closes it by hand.
  const [panoChoice, setPanoChoice] = useState<boolean | null>(null)
  const [help, setHelp] = useState(false)
  // A spot pinned from the finder's shortlist opens straight on the next question: when to land.
  const fromFinder = useStore((s) => !!s.fromFinder[pin.id])
  const [land, setLand] = useState(fromFinder)
  // "When to land here" from the mission showcase (or anywhere else) opens it on this card.
  const landingFocus = useStore((s) => s.landingFocus)
  const focusLanding = useStore((s) => s.focusLanding)
  useEffect(() => {
    if (landingFocus !== pin.id) return
    setLand(true)
    focusLanding(null)
  }, [landingFocus, pin.id, focusLanding])
  const missionId = useStore((s) => s.pinMission[pin.id])
  const startShowcase = useStore((s) => s.startShowcase)
  // In Explorer it starts closed: it is the most technical part of the card.
  const pano = panoChoice ?? (active && planner)
  const [tierShort, rough] = TIER_SHORT[tier]
  const until = (event: string, h: number | null) => (h === null ? `${event} ${fmtDuration(null, WINDOW_DAYS)}` : `${event} in ${fmtDuration(h)}`)
  const head = siteSentence(summary, WINDOW_DAYS)
  const partial = sunFrac > 0.005 && sunFrac < 0.995

  return (
    <section className={active ? 'site active' : 'site'} onClick={() => setActivePin(pin.id)}>
      <header>
        <Badge slot={pin.slot} />
        <strong title={pin.label}>{pin.label}</strong>
        <button
          type="button"
          className="btn ghost icon"
          onClick={(e) => {
            e.stopPropagation()
            removePin(pin.id)
          }}
          aria-label={`Remove ${pin.label}`}
        >
          ×
        </button>
        <span className="where">
          {fmtCoord(pin.lat, pin.lon)} · {fmtElevation(hM)}
          {Number.isNaN(slope) ? '' : ` · slope ${fmtSlope(slope)}`}
        </span>
      </header>

      <p className="headline">
        <b>{head.lead}</b> {head.rest} {head.earth}
      </p>

      <button
          type="button"
          className="disc card-help"
          aria-expanded={help}
          onClick={(e) => {
            e.stopPropagation()
            setHelp(!help)
          }}
        >
          How to read this card
        </button>
      {help && (
        <ul className="help">
          <li>
            <b>Two rows at the top:</b> what is true at the selected time, and how long until it changes.
          </li>
          <li>
            <b>Two bars:</b> the {WINDOW_DAYS} days named above them (the period moves on when the clock leaves it). Yellow means in sunlight, blue means Earth in view, a gap means not. The grey bracket
            marks the longest night. The white line is the selected time; drag it to move the clock.
          </li>
          <li>
            <b>Four numbers:</b> the share of those {WINDOW_DAYS} days in sunlight and with Earth in view, and the longest unbroken stretch
            without each.
          </li>
          <li>
            <b>Horizon view:</b> stand on the point and turn a full circle (N, E, S, W). Grey is the ground and hills around you. When the
            yellow dot (Sun) is above the grey, the point is in sunlight. When the blue dot (Earth) is above it, a radio link to Earth is
            possible.
          </li>
          <li>
            <b>Observer {horizon.observerHeightM} m:</b> everything is worked out for a solar panel or antenna {horizon.observerHeightM} m above
            the ground{horizon.observerHeightM === 2 ? ', about the top of a small lander' : ''}. Taller sees over more hills.
          </li>
          <li>
            <b>What counts:</b> sunlit means {sunRuleText(criteria)}; Earth in view means {earthRuleText(criteria)}. Change these under Guides and settings,
            top right.
          </li>
        </ul>
      )}

      <div className="now">
        <p className={playing ? 'basis live' : 'basis'}>{playing ? 'Now · these two rows follow the clock' : 'At the selected time'}</p>
        <div>
          <i className={sunNext.now ? 'dot sun' : 'dot night'} />
          <b>{sunNext.now ? 'In sunlight' : 'Dark'}</b>
          <span>{until(sunNext.now ? 'Sunset' : 'Sunrise', sunNext.inHours)}</span>
          <span className="aside" title={`Height of the Sun's centre above the level horizon. Counted as sunlit when ${sunRuleText(criteria)}.`}>
            Sun {fmtAngle(sky.sun.el)}
            {partial ? ` · ${fmtShare(sunFrac)} of disc` : ''}
          </span>
        </div>
        <div>
          <i className={commNext.now ? 'dot earth' : 'dot night'} />
          <b>{commNext.now ? 'Earth in view' : 'No Earth link'}</b>
          <span>{until(commNext.now ? 'Earthset' : 'Earthrise', commNext.inHours)}</span>
          <span className="aside" title={`Height of Earth's centre above the terrain in its direction. Counted as in view when ${earthRuleText(criteria)}.`}>
            Earth {fmtAngle(earthClear)}
            {criteria.earthMaskDeg > 0 ? ` · needs ${fmtDegrees(criteria.earthMaskDeg)}` : ''}
          </span>
        </div>
        {eclipse < 1 && <p className="caption">Earth is eclipsing the Sun.</p>}
      </div>

      <div>
        <h3 className="section period">{fmtPeriod(series.t0Ms, WINDOW_DAYS)}</h3>
        <SiteTimeline sites={[a]} />
      </div>

      <div className="stats-block">
        <p className="basis">
          {fmtSpan(series.t0Ms, WINDOW_DAYS)} · {terrainTag(tier)}
          {playing ? ' · fixed period' : ''}
        </p>
        <dl className="stats">
          <div>
            <dt>
              <i className="sw sun" /> In sunlight
            </dt>
            <dd>{fmtShare(summary.sunShare)}</dd>
          </div>
          <div>
            <dt>Longest night</dt>
            <dd>{fmtDuration(summary.longestDarkH)}</dd>
          </div>
          <div>
            <dt>
              <i className="sw earth" /> Earth in view
            </dt>
            <dd>{fmtShare(summary.commShare)}</dd>
          </div>
          <div>
            <dt>Longest gap</dt>
            <dd>{fmtDuration(summary.longestNoCommH)}</dd>
          </div>
        </dl>
      </div>

      <button
        type="button"
        className="btn wtl-toggle"
        aria-expanded={land}
        onClick={(e) => {
          e.stopPropagation()
          setLand(!land)
          setActivePin(pin.id)
        }}
      >
        When to land
        <span>{land ? 'Hide' : 'Compare landing dates'}</span>
      </button>
      {land && <WhenToLand a={a} sites={all} />}

      <div className="discs">
        <button
          type="button"
          className="disc"
          aria-expanded={pano}
          onClick={(e) => {
            e.stopPropagation()
            setPanoChoice(!pano)
            setActivePin(pin.id)
          }}
        >
          Horizon view
        </button>
        {missionId && (
          <button
            type="button"
            className="link"
            onClick={(e) => {
              e.stopPropagation()
              startShowcase(missionId, 'request')
            }}
          >
            Mission details
          </button>
        )}
      </div>

      {pano && (
        <div>
          <Panorama s={series} elev={horizon.elevDeg} azStep={horizon.azStepDeg} sun={sky.sun} earth={sky.earth} />
          <p className="caption key">
            The view from this point, all the way round. Grey is ground. <i className="dot sun" /> Sun <i className="dot earth" /> Earth; dotted
            lines are their paths over
            the next month. Heights are stretched, so each dot has a bar showing the true top and bottom of its disc.
          </p>
        </div>
      )}


      <details className="note" onClick={(e) => e.stopPropagation()}>
        <summary>
          {rough && <i className="dot warn" />}
          {tierShort} · figures for {fmtPeriod(series.t0Ms, WINDOW_DAYS)}, UTC · <u>more</u>
        </summary>
        <p>
          {TIER_NOTE[tier]} {assumptionsText(assumptions)} These figures are worked out for this point and this period; the
          site finder's shortlist shows 18.6-year averages on 300 m cells, so the two can differ by several points.
        </p>
      </details>
    </section>
  )
}
