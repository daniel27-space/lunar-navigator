// The first-run tour. Five steps, each finished by doing the action on the live Moon, never by
// pressing Next (research in docs/research/tutorial.md: people learn controls by using them, and
// decks of cards that can be clicked through teach nothing). A small card that never covers
// or dims the scene; it can be skipped at any point and started again from Help.
import { useEffect, useRef, useState } from 'react'
import { clearProgress, NEED, readProgress } from '../lib/tour'
import { coarsePointer, useStore } from '../store'

type Kind = 'turn' | 'zoom' | 'slide' | 'pin' | 'time'
interface Step {
  kind: Kind
  /** what to do, for a mouse and for a touch screen */
  ask: [string, string]
  /** shown if nothing has happened after a few seconds */
  hint: [string, string]
  /** what the user has just learned about the Moon, shown with the tick */
  payoff: string
}

const STEPS: Step[] = [
  {
    kind: 'turn',
    ask: ['Hold the left mouse button and drag to turn the view.', 'Drag with one finger to turn the view.'],
    hint: ['Press on the Moon itself, keep the button down and move the mouse.', 'Put one finger on the Moon and move it.'],
    payoff: "You are over the Moon's south pole, where the next landings are aimed.",
  },
  {
    kind: 'zoom',
    ask: ['Roll the mouse wheel to zoom in and out.', 'Pinch with two fingers to zoom in and out.'],
    hint: ['Put the pointer over the Moon first. On a trackpad, slide two fingers up or down.', 'Put two fingers on the Moon and move them apart.'],
    payoff: 'Up close the ground is real NASA elevation data, as fine as 20 m here.',
  },
  {
    kind: 'slide',
    ask: ['Press the wheel down (or hold the right button) and drag to slide across the surface.', 'Drag with two fingers to slide across the surface.'],
    hint: ['The wheel is also a button: press it in, hold it and move the mouse. The right button does the same.', 'Keep two fingers the same distance apart and move them together.'],
    payoff: 'Sliding keeps your height, so you can follow a ridge or a crater rim.',
  },
  {
    kind: 'pin',
    ask: ['Click any spot on the Moon to pin a site there.', 'Tap any spot on the Moon to pin a site there.'],
    hint: ['A single click without dragging. Bright ridges and dark crater floors make good first picks.', 'A single tap without dragging.'],
    payoff: 'Its card says whether that spot has sunlight and a view of Earth right now.',
  },
  {
    kind: 'time',
    ask: ['Drag the time bar at the bottom to move the clock.', 'Drag the time bar to move the clock.'],
    hint: ['The round handle on the long bar at the bottom. Or press the play button beside it.', 'The round handle on the long bar. Or press the play button beside it.'],
    payoff: 'The shadows sweep round as the Sun circles the horizon, and the site card follows.',
  },
]
export const TOUR_STEPS = STEPS.length
const HINT_AFTER_MS = 8000
const TICK_MS = 1900
const MOVED_CLOCK_MS = 6 * 3600 * 1000

function Glyph({ kind, touch }: { kind: Kind; touch: boolean }) {
  if (kind === 'pin')
    return (
      <svg viewBox="0 0 48 48" className="tour-glyph" aria-hidden="true">
        <circle cx="24" cy="24" r="6" className="g-on g-pulse" />
        <circle cx="24" cy="24" r="14" className="g-line g-ring" />
      </svg>
    )
  if (kind === 'time')
    return (
      <svg viewBox="0 0 48 48" className="tour-glyph" aria-hidden="true">
        <line x1="6" x2="42" y1="24" y2="24" className="g-line" />
        <circle cx="24" cy="24" r="5" className="g-on g-sweep" />
      </svg>
    )
  if (touch)
    return (
      <svg viewBox="0 0 48 48" className="tour-glyph" data-kind={kind} aria-hidden="true">
        {kind === 'turn' ? (
          <circle cx="24" cy="24" r="6" className="g-on g-sweep" />
        ) : (
          <>
            <circle cx="17" cy="24" r="5" className={kind === 'zoom' ? 'g-on g-apart-a' : 'g-on g-sweep'} />
            <circle cx="31" cy="24" r="5" className={kind === 'zoom' ? 'g-on g-apart-b' : 'g-on g-sweep'} />
          </>
        )}
      </svg>
    )
  // A mouse, with the part to use lit: left button, wheel, or wheel and right button.
  return (
    <svg viewBox="0 0 48 48" className={kind === 'zoom' ? 'tour-glyph' : 'tour-glyph g-sweep'} aria-hidden="true">
      <rect x="13" y="5" width="22" height="38" rx="11" className="g-line" />
      <line x1="13" x2="35" y1="21" y2="21" className="g-line" />
      {kind === 'turn' && <path d="M24 5.5 A10.5 10.5 0 0 0 13.5 16 V20.5 H24 Z" className="g-on" />}
      {kind === 'slide' && <path d="M24 5.5 A10.5 10.5 0 0 1 34.5 16 V20.5 H24 Z" className="g-dim" />}
      <rect x="21.5" y="9" width="5" height="9" rx="2.5" className={kind === 'turn' ? 'g-wheel' : kind === 'zoom' ? 'g-on g-roll' : 'g-on'} />
    </svg>
  )
}

interface Props {
  /** opens the site finder */
  onPlan: () => void
  /** opens the Apollo 11 mission view */
  onMission: () => void
}

export function Tutorial({ onPlan, onMission }: Props) {
  const step = useStore((s) => s.tour)
  return step === null ? null : <TourCard step={step} onPlan={onPlan} onMission={onMission} />
}

function TourCard({ step, onPlan, onMission }: Props & { step: number }) {
  const setTour = useStore((s) => s.setTour)
  const pins = useStore((s) => s.pins.length)
  const tMs = useStore((s) => s.tMs)
  const [touch] = useState(coarsePointer)
  const which = touch ? 1 : 0
  const s = step >= 1 && step <= STEPS.length ? STEPS[step - 1] : null
  // What the step started from, so only what is done during it counts.
  const base = useRef({ step: -1, pins: 0, tMs: 0 })
  if (base.current.step !== step) base.current = { step, pins, tMs }
  const [done, setDone] = useState(false)
  const [late, setLate] = useState(false)
  const [, tick] = useState(0)

  // Camera steps: look a few times a second at what the scene has counted.
  const camera = s && (s.kind === 'turn' || s.kind === 'zoom' || s.kind === 'slide')
  useEffect(() => {
    if (!camera || done) return
    const t = setInterval(() => tick((n) => n + 1), 150)
    return () => clearInterval(t)
  }, [camera, done])
  const p = readProgress()
  const share = !s
    ? 0
    : s.kind === 'turn'
      ? p.turnDeg / NEED.turnDeg
      : s.kind === 'zoom'
        ? p.zoom / NEED.zoom
        : s.kind === 'slide'
          ? p.slide / NEED.slide
          : s.kind === 'pin'
            ? pins > base.current.pins
              ? 1
              : 0
            : Math.abs(tMs - base.current.tMs) / MOVED_CLOCK_MS
  const met = share >= 1

  useEffect(() => {
    setDone(false)
    setLate(false)
    if (!s) return
    const t = setTimeout(() => setLate(true), HINT_AFTER_MS)
    return () => clearTimeout(t)
  }, [step, s])
  useEffect(() => {
    if (!met || done || !s) return
    setDone(true)
    const t = setTimeout(() => setTour(step + 1), TICK_MS)
    return () => clearTimeout(t)
    // `done` is left out on purpose: setting it must not cancel the timer that moves on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [met, s, step, setTour])

  const end = () => setTour(null)
  const skipTour = () => {
    setTour(null)
    // The start card stays available: two examples and the way into planning.
    useStore.getState().setHelp(true)
  }

  if (step === 0)
    return (
      <section className="tour panel-surface" aria-label="Welcome">
        <h2>Where would you land on the Moon?</h2>
        <p>A lander needs sunlight for power and a view of Earth for radio. Near the south pole the hills decide both. This shows them for any place and date.</p>
        <div className="tour-actions">
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              clearProgress()
              // On a phone the sheet would cover most of the Moon: fold it away for the camera steps.
              if (window.innerWidth <= 760) useStore.getState().setSheet('peek')
              setTour(1)
            }}
          >
            Show me how (1 minute)
          </button>
          <button type="button" className="btn ghost" onClick={skipTour}>
            Skip the tour
          </button>
        </div>
      </section>
    )

  if (!s)
    return (
      <section className="tour panel-surface" aria-label="Tour finished">
        <h2>
          <i className="tour-tick" aria-hidden="true" /> You know the controls
        </h2>
        <p>Pin up to three sites to compare them. Help brings this tour back.</p>
        <div className="tour-actions">
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              end()
              onPlan()
            }}
          >
            Find a landing site
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              end()
              onMission()
            }}
          >
            Visit Apollo 11
          </button>
          <button type="button" className="btn ghost" onClick={end}>
            Explore
          </button>
        </div>
      </section>
    )

  return (
    <section className={done ? 'tour panel-surface done' : 'tour panel-surface'} aria-label={`Tour, step ${step} of ${STEPS.length}`}>
      <div className="tour-main">
        {done ? <i className="tour-tick big" aria-hidden="true" /> : <Glyph kind={s.kind} touch={touch} />}
        <div className="tour-text" role="status" aria-live="polite">
          <p className="tour-ask">{done ? 'Done.' : s.ask[which]}</p>
          <p className="caption">{done ? s.payoff : late ? s.hint[which] : ' '}</p>
        </div>
      </div>
      <div className="tour-meter" aria-hidden="true">
        <i style={{ width: `${Math.min(1, done ? 1 : share) * 100}%` }} />
      </div>
      <div className="tour-foot">
        <ol className="tour-dots" aria-hidden="true">
          {STEPS.map((x, i) => (
            <li key={x.kind} className={i + 1 < step || (i + 1 === step && done) ? 'on' : i + 1 === step ? 'now' : ''} />
          ))}
        </ol>
        <span className="caption">
          {step} of {STEPS.length}
        </span>
        <button type="button" className="link caption" onClick={() => setTour(step + 1)} disabled={done}>
          Skip this step
        </button>
        <button type="button" className="link caption" onClick={skipTour}>
          End tour
        </button>
      </div>
    </section>
  )
}
