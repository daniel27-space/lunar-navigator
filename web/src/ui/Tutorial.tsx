// Guides: short interactive lessons. Every step is finished by doing the action on the live Moon,
// never by pressing Next (research in docs/research/tutorial.md: people learn controls by using
// them, and decks of cards that can be clicked through teach nothing). A small card that never
// covers or dims the scene; it can be left at any point, and any guide can be started from the menu.
import { useEffect, useRef, useState } from 'react'
import { clearProgress, NEED, readProgress, type Progress } from '../lib/tour'
import { coarsePointer, useStore } from '../store'

type Kind = 'turn' | 'zoom' | 'slide' | 'pin' | 'time'

/** What a step can look at to tell whether it has been done. */
interface Seen {
  pins: number
  /** id of the newest pin (0 if none): a new pin has a higher id even when it replaces one */
  newestPin: number
  tMs: number
  layer: string
  finder: unknown
  showcase: boolean
}
interface Ctx extends Seen {
  camera: Progress
  /** the same things as they were when the step began */
  base: Seen
}
interface Step {
  kind: Kind
  /** what to do, for a mouse and for a touch screen */
  ask: [string, string]
  /** shown if nothing has happened after a few seconds */
  hint: [string, string]
  /** what the user has just learned, shown with the tick */
  payoff: string
  /** how far along the step is: 1 or more means done */
  share: (c: Ctx) => number
  /** a step that is already done when it begins is passed over without a tick */
  skipIfMet?: boolean
}
interface Guide {
  id: string
  title: string
  /** one line for the menu */
  about: string
  steps: Step[]
}

const MOVED_CLOCK_MS = 6 * 3600 * 1000
const both = (t: string): [string, string] => [t, t]
const newPin = (c: Ctx) => (c.newestPin > c.base.newestPin ? 1 : 0)
const clockMoved = (c: Ctx) => Math.abs(c.tMs - c.base.tMs) / MOVED_CLOCK_MS

export const GUIDES: Guide[] = [
  {
    id: 'basics',
    title: 'The basics',
    about: 'Move around, pin a site, move the clock. 1 minute.',
    steps: [
      {
        kind: 'turn',
        ask: ['Hold the left mouse button and drag to turn the view.', 'Drag with one finger to turn the view.'],
        hint: ['Press on the Moon itself, keep the button down and move the mouse.', 'Put one finger on the Moon and move it.'],
        payoff: "You are over the Moon's south pole, where the next landings are aimed.",
        share: (c) => c.camera.turnDeg / NEED.turnDeg,
      },
      {
        kind: 'zoom',
        ask: ['Roll the mouse wheel to zoom in and out.', 'Pinch with two fingers to zoom in and out.'],
        hint: ['Put the pointer over the Moon first. On a trackpad, slide two fingers up or down.', 'Put two fingers on the Moon and move them apart.'],
        payoff: 'Up close the ground is real NASA elevation data, as fine as 20 m here.',
        share: (c) => c.camera.zoom / NEED.zoom,
      },
      {
        kind: 'slide',
        ask: ['Press the wheel down (or hold the right button) and drag to slide across the surface.', 'Drag with two fingers to slide across the surface.'],
        hint: ['The wheel is also a button: press it in, hold it and move the mouse. The right button does the same.', 'Keep two fingers the same distance apart and move them together.'],
        payoff: 'Sliding keeps your height, so you can follow a ridge or a crater rim.',
        share: (c) => c.camera.slide / NEED.slide,
      },
      {
        kind: 'pin',
        ask: ['Click any spot on the Moon to pin a site there.', 'Tap any spot on the Moon to pin a site there.'],
        hint: ['A single click without dragging. Bright ridges and dark crater floors make good first picks.', 'A single tap without dragging.'],
        payoff: 'Its card says whether that spot has sunlight and a view of Earth right now.',
        share: newPin,
      },
      {
        kind: 'time',
        ask: ['Drag the time bar at the bottom to move the clock.', 'Drag the time bar to move the clock.'],
        hint: ['The round handle on the long bar at the bottom. Or press the play button beside it.', 'The round handle on the long bar. Or press the play button beside it.'],
        payoff: 'The shadows sweep round as the Sun circles the horizon, and the site card follows.',
        share: clockMoved,
      },
    ],
  },
  {
    id: 'layers',
    title: 'Map layers',
    about: 'Colour the Moon by sunlight, Earth view, shadow, height or slope.',
    steps: [
      {
        kind: 'pin',
        ask: ['In the Map layers bar at the top, press Avg sunlight.', 'Press the layer button at the top and choose Average sunlight.'],
        hint: ['The bar is top left, under the title: Sun now, Avg sunlight, Avg Earth view, Shadow, Height, Slope.', 'The button with the stack of sheets, next to the title.'],
        payoff: 'Bright ground is sunlit most of the year, dark ground hardly ever. The colour scale is in the legend.',
        share: (c) => (c.layer === 'sunavg' ? 1 : 0),
      },
      {
        kind: 'pin',
        ask: ['Now press Shadow.', 'Now choose Shadow from the same button.'],
        hint: both('Each layer colours the same map by a different measure.'),
        payoff: 'The marked floors never see the Sun. They are the coldest places, where ice could survive.',
        share: (c) => (c.layer === 'psr' ? 1 : 0),
      },
      {
        kind: 'pin',
        ask: ['Press Sun now to go back to plain sunlight.', 'Choose Sun now to go back to plain sunlight.'],
        hint: both('Sun now is the first layer in the list.'),
        payoff: 'Layers only colour the map. Your pinned sites and the clock stay as they are.',
        share: (c) => (c.layer === 'natural' ? 1 : 0),
      },
    ],
  },
  {
    id: 'finder',
    title: 'Find a landing site',
    about: 'Say what the mission needs and get a ranked shortlist.',
    steps: [
      {
        kind: 'pin',
        ask: ['Press Find a site, top left.', 'Press the layer button at the top and choose Find a site.'],
        hint: ['The button with the magnifying glass, left of the Map layers bar.', 'The button with the stack of sheets, next to the title.'],
        payoff: 'Only ground that meets every limit is coloured, brightest where it fits best.',
        share: (c) => (c.layer === 'finder' ? 1 : 0),
        skipIfMet: true,
      },
      {
        kind: 'pin',
        ask: ['In the finder panel, choose a different mission type or move one of the limits.', 'In the Find tab below, choose a different mission type or move one of the limits.'],
        hint: both('Solar lander, Base near ice and Long-stay base are ready-made sets of limits. Custom lets you set your own.'),
        payoff: 'The map and the shortlist are worked out again for the new limits.',
        share: (c) => (c.finder !== c.base.finder ? 1 : 0),
      },
      {
        kind: 'pin',
        ask: ['Pin a shortlisted spot: click a numbered marker on the map, or a row in the shortlist.', 'Pin a shortlisted spot: tap a numbered marker on the map, or a row in the shortlist.'],
        hint: both('The numbers are the ranking: 1 fits the limits best.'),
        payoff: 'Its card shows sunlight and Earth view there. When to land, in the card, compares landing dates.',
        share: newPin,
      },
    ],
  },
  {
    id: 'compare',
    title: 'Compare sites',
    about: 'Pin two or three places and see which is better, and why.',
    steps: [
      {
        kind: 'pin',
        ask: ['Pin a first site: click anywhere on the Moon.', 'Pin a first site: tap anywhere on the Moon.'],
        hint: both('A bright ridge is a good first pick.'),
        payoff: 'One site pinned.',
        share: (c) => (c.pins >= 1 ? 1 : 0),
        skipIfMet: true,
      },
      {
        kind: 'pin',
        ask: ['Pin a second site somewhere different, such as a dark crater floor.', 'Pin a second site somewhere different, such as a dark crater floor.'],
        hint: both('Each pin gets a letter and a colour: A, B, C. Three at most.'),
        payoff: 'With two or more sites the panel becomes a comparison, with a verdict at the top.',
        share: (c) => (c.pins >= 2 ? 1 : 0),
        skipIfMet: true,
      },
      {
        kind: 'time',
        ask: both('Move the clock: drag the time bar, or the white line in the comparison.'),
        hint: both('The yellow bars show when each site is in sunlight, the blue bars when Earth is in view.'),
        payoff: 'The rows line the sites up on the same days, so gaps in sunlight or Earth view are easy to spot.',
        share: clockMoved,
      },
    ],
  },
  {
    id: 'missions',
    title: 'Visit a past mission',
    about: 'Fly to a real landing site and stand next to the craft.',
    steps: [
      {
        kind: 'pin',
        ask: ['Open "Go to a mission site or place" at the top and choose a mission, such as Apollo 11.', 'Open the three-dot menu at the top and choose a mission, such as Apollo 11.'],
        hint: ['Clicking a coloured dot on the Moon does the same. Green landed, red was lost, hollow is planned.', 'Tapping a coloured dot on the Moon does the same.'],
        payoff: 'The camera flies down to the site. The skyline, Sun and Earth around the craft are the real ones.',
        share: (c) => (c.showcase ? 1 : 0),
      },
      {
        kind: 'time',
        ask: both('Move the clock with the time bar and watch the light change on the craft.'),
        hint: both('You can also drag inside the picture to walk round the craft, and scroll to get closer.'),
        payoff: 'The Sun and Earth are where they would be at that moment. On the near side, Earth hardly moves in the sky.',
        share: clockMoved,
      },
      {
        kind: 'pin',
        ask: both('Close the mission with the × at the top of its panel.'),
        hint: both('The × is beside the mission name.'),
        payoff: 'The camera rises back over the site, which stays pinned for comparing.',
        share: (c) => (c.showcase ? 0 : 1),
      },
    ],
  },
]

/** Starts a guide at its first step. */
export function startGuide(id: string) {
  clearProgress()
  const st = useStore.getState()
  st.setHelp(false)
  // On a phone the sheet would cover most of the Moon during the camera steps: fold it away.
  if (id === 'basics' && window.innerWidth <= 760) st.setSheet('peek')
  st.setTour({ guide: id, step: 1 })
}

const HINT_AFTER_MS = 8000
const TICK_MS = 1900

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

export function Tutorial() {
  const tour = useStore((s) => s.tour)
  const showcase = useStore((s) => s.showcase !== null)
  const guide = tour && GUIDES.find((g) => g.id === tour.guide)
  // The mission view fills the map: only the guide about missions stays up over it.
  if (!tour || !guide || (showcase && guide.id !== 'missions')) return null
  return <TourCard key={guide.id} guide={guide} step={tour.step} />
}

function TourCard({ guide, step }: { guide: Guide; step: number }) {
  const setTour = useStore((s) => s.setTour)
  const pins = useStore((s) => s.pins.length)
  const newestPin = useStore((s) => s.pins.reduce((m, x) => Math.max(m, x.id), 0))
  const tMs = useStore((s) => s.tMs)
  const layer = useStore((s) => s.layer)
  const finder = useStore((s) => s.finder)
  const showcase = useStore((s) => s.showcase !== null)
  const seen: Seen = { pins, newestPin, tMs, layer, finder, showcase }
  const [touch] = useState(coarsePointer)
  const which = touch ? 1 : 0
  const steps = guide.steps
  const s = step >= 1 && step <= steps.length ? steps[step - 1] : null
  // What the step started from, so only what is done during it counts.
  const base = useRef<{ step: number; seen: Seen }>({ step: -1, seen })
  if (base.current.step !== step) base.current = { step, seen }
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
  const share = s ? s.share({ ...seen, camera: readProgress(), base: base.current.seen }) : 0
  const met = share >= 1
  const go = (n: number) => setTour({ guide: guide.id, step: n })

  useEffect(() => {
    setDone(false)
    setLate(false)
    if (!s) return
    // Already true when the step began: nothing to teach, move on.
    if (s.skipIfMet && s.share({ ...base.current.seen, camera: readProgress(), base: base.current.seen }) >= 1) return go(step + 1)
    const t = setTimeout(() => setLate(true), HINT_AFTER_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, s])
  useEffect(() => {
    if (!met || done || !s) return
    setDone(true)
    const t = setTimeout(() => go(step + 1), TICK_MS)
    return () => clearTimeout(t)
    // `done` is left out on purpose: setting it must not cancel the timer that moves on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [met, s, step])

  const end = () => setTour(null)

  if (step === 0)
    return (
      <section className="tour panel-surface" aria-label="Welcome">
        <h2>Where would you land on the Moon?</h2>
        <p>A lander needs sunlight for power and a view of Earth for radio. Near the south pole the hills decide both. This shows them for any place and date.</p>
        <div className="tour-actions">
          <button type="button" className="btn primary" onClick={() => startGuide('basics')}>
            Show me how (1 minute)
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              end()
              // The start card stays available: two examples and the way into planning.
              useStore.getState().setHelp(true)
            }}
          >
            Skip the tour
          </button>
        </div>
      </section>
    )

  if (!s) {
    const next = GUIDES[GUIDES.findIndex((g) => g.id === guide.id) + 1]
    return (
      <section className="tour panel-surface" aria-label="Guide finished">
        <h2>
          <i className="tour-tick" aria-hidden="true" /> {guide.id === 'basics' ? 'You know the controls' : `Done: ${guide.title.toLowerCase()}`}
        </h2>
        <p>Every guide is under Guides and settings, top right, whenever you want one.</p>
        <div className="tour-actions">
          {next && (
            <button type="button" className="btn primary" onClick={() => startGuide(next.id)}>
              Next: {next.title.toLowerCase()}
            </button>
          )}
          <button type="button" className={next ? 'btn ghost' : 'btn primary'} onClick={end}>
            Explore on my own
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className={done ? 'tour panel-surface done' : 'tour panel-surface'} aria-label={`${guide.title}, step ${step} of ${steps.length}`}>
      <p className="tour-name caption">{guide.title}</p>
      <div className="tour-main">
        {done ? <i className="tour-tick big" aria-hidden="true" /> : <Glyph kind={s.kind} touch={touch} />}
        <div className="tour-text" role="status" aria-live="polite">
          <p className="tour-ask">{done ? 'Done.' : s.ask[which]}</p>
          <p className="caption">{done ? s.payoff : late ? s.hint[which] : '\u00a0'}</p>
        </div>
      </div>
      <div className="tour-meter" aria-hidden="true">
        <i style={{ width: `${Math.min(1, done ? 1 : share) * 100}%` }} />
      </div>
      <div className="tour-foot">
        <ol className="tour-dots" aria-hidden="true">
          {steps.map((_, i) => (
            <li key={i} className={i + 1 < step || (i + 1 === step && done) ? 'on' : i + 1 === step ? 'now' : ''} />
          ))}
        </ol>
        <span className="caption">
          {step} of {steps.length}
        </span>
        <button type="button" className="link caption" onClick={() => go(step + 1)} disabled={done}>
          Skip this step
        </button>
        <button type="button" className="link caption" onClick={end}>
          End guide
        </button>
      </div>
    </section>
  )
}
