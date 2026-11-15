// The start card: what the app is for and two ways in. "Explore" pins a sunlit ridge and a
// permanently dark crater floor to compare; "Plan a landing" goes straight to the site finder.
// A card in the sites panel (the phone sheet), never a dialog over the Moon.
import { useEffect, useRef, useState } from 'react'
import { assumptionsText } from '../lib/assumptions'
import { clearProgress } from '../lib/tour'
import { coarsePointer, rememberIntroSeen, useAssumptions, useStore } from '../store'
import { Badge } from './controls'

/** The label of the crater-floor example pin. */
export const CRATER_LABEL = 'Shackleton crater floor'

interface Props {
  /** pins the sunlit ridge example; absent until the list of places has loaded */
  onRidge?: () => void
  /** the ridge pin's label, to tell when it is already pinned */
  ridgeLabel?: string
  /** pins a point on a permanently shadowed crater floor */
  onCrater: () => void
  /** opens the site finder */
  onPlan: () => void
}

export function Intro(props: Props) {
  const help = useStore((s) => s.help)
  const seq = useStore((s) => s.helpSeq)
  // Opening Help again starts the card afresh (full, not the short form left by an earlier try).
  return help ? <StartCard key={seq} {...props} /> : null
}

function StartCard({ onRidge, ridgeLabel, onCrater, onPlan }: Props) {
  const setHelp = useStore((s) => s.setHelp)
  const playing = useStore((s) => s.playing)
  const assumptions = useAssumptions()
  const ridge = useStore((s) => s.pins.find((p) => p.label === ridgeLabel))
  const crater = useStore((s) => s.pins.find((p) => p.label === CRATER_LABEL))
  // Once an example is on screen the card shrinks to its three actions, so the result is in view.
  const [tried, setTried] = useState(false)
  const touch = coarsePointer()
  const ref = useRef<HTMLElement>(null)
  // The card opens in view at its heading, wherever the panel (or the phone sheet) was scrolled to.
  useEffect(() => {
    for (const el of [ref.current?.closest('.panel'), ref.current?.closest('.dock')]) if (el) el.scrollTop = 0
  }, [])
  const act = (f: () => void) => () => {
    rememberIntroSeen()
    setTried(true)
    const s = useStore.getState()
    // On a phone the result shows in the sheet under the card: half height keeps the Moon in view too.
    if (s.sheet !== 'half') s.setSheet('half')
    f()
  }
  const play = () => {
    const s = useStore.getState()
    if (s.playing) s.setPlaying(false)
    else {
      s.setRate(86400)
      s.setPlaying(true)
    }
  }
  const hint =
    ridge && crater
      ? 'Both are pinned: the comparison below sets them side by side. Sunlight and a view of Earth do not always come together.'
      : ridge
        ? 'A crest with long sunlight. Now try the crater floor next to it.'
        : crater
          ? 'A floor the Sun never reaches, where ice could survive. Now try the ridge.'
          : playing
            ? 'One day of Moon time passes each second. Pin a place to see what changes.'
            : null
  return (
    <section className={tried ? 'intro compact' : 'intro'} aria-label="Start here" ref={ref}>
      <header>
        <h2>{tried ? 'Where would you put a solar lander?' : 'Start here'}</h2>
        <button type="button" className="btn ghost icon" aria-label="Close the start card" onClick={() => setHelp(false)}>
          ×
        </button>
      </header>
      {!tried && (
        <>
          <p>
            Near the Moon's south pole, hills decide when a lander has sunlight for power and a view of Earth for radio; this shows both for any place
            and date.
          </p>
          <h3 className="intro-q">Where would you put a solar lander?</h3>
        </>
      )}
      <div className="intro-try" role="group" aria-label="Explore">
        <button type="button" className="btn" disabled={!onRidge} aria-pressed={!!ridge} onClick={onRidge && act(onRidge)} title="Pin a sunlit crest: the Shackleton-de Gerlache connecting ridge">
          {ridge ? (
            <>
              <Badge slot={ridge.slot} /> Ridge
            </>
          ) : (
            'Try the ridge'
          )}
        </button>
        <button type="button" className="btn" aria-pressed={!!crater} onClick={act(onCrater)} title="Pin a point on the permanently shadowed floor of Shackleton crater">
          {crater ? (
            <>
              <Badge slot={crater.slot} /> Crater
            </>
          ) : (
            'Try the crater'
          )}
        </button>
        <button type="button" className="btn" aria-pressed={playing} onClick={act(play)} title="Run the clock at one day per second">
          {playing ? 'Pause' : 'Play time'}
        </button>
      </div>
      {hint && (
        <p className="caption" role="status">
          {hint}
        </p>
      )}
      {!tried && (
        <>
          <div className="intro-plan">
            <p className="caption">Already have mission limits? Rank the ground against them, then compare landing dates.</p>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setHelp(false)
                onPlan()
              }}
            >
              Plan a landing
            </button>
          </div>
          <div className="intro-plan">
            <p className="caption">New here? Learn the controls by using them.</p>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setHelp(false)
                clearProgress()
                useStore.getState().setTour(1)
              }}
            >
              Take the 1-minute tour
            </button>
          </div>
          <details className="disclosure">
            <summary>How it works</summary>
            <div className="intro-how">
              <ol>
                <li>
                  <b>Choose a place.</b>{' '}
                  {touch ? 'Drag to rotate, pinch to zoom, two fingers to slide. Tap the surface' : 'Drag to rotate, scroll to zoom, hold the wheel and drag to slide. Click the surface'}
                  , pick a mission, or type coordinates.
                </li>
                <li>
                  <b>Read the site.</b> Is it sunlit? Is Earth above the terrain? Horizon view shows why.
                </li>
                <li>
                  <b>Compare.</b> Pin up to three places, or open When to land to compare dates at one.
                </li>
                <li>
                  <b>Find a site</b> ranks ground against mission limits; the layers map long-term sunlight, Earth view, shadow, height and slope.
                </li>
              </ol>
              <div className="intro-key">
                <h3 className="section">Markers on the map</h3>
                <ul>
                  <li>
                    <i className="mk ok" /> landed mission
                  </li>
                  <li>
                    <i className="mk lost" /> lost on landing
                  </li>
                  <li>
                    <i className="mk planned" /> planned mission
                  </li>
                  <li>
                    <span className="mk-group">
                      <Badge slot={0} />
                      <Badge slot={1} />
                      <Badge slot={2} />
                    </span>{' '}
                    your pinned sites
                  </li>
                  <li>
                    <b className="mk-rank">1</b> site finder shortlist
                  </li>
                </ul>
              </div>
              <p className="caption">
                A screening tool, not mission-grade: figures depend on the terrain resolution, the period shown and the assumptions. {assumptionsText(assumptions)}{' '}
                <a href="https://github.com/daniel27-space/lunar-navigator/blob/main/docs/VALIDATION.md" target="_blank" rel="noreferrer">
                  How the numbers were checked
                </a>
                .
              </p>
            </div>
          </details>
        </>
      )}
    </section>
  )
}
