// The welcome: four short illustrated cards on what the app is for, then a choice of view.
// It is shown on every load, over a blurred view of the live Moon, which goes on loading behind
// it: the blur hides the coarse first seconds, so a visitor never sees a half-loaded Moon. The cards say what you can do here; the controls
// themselves are taught afterwards by doing (ui/Tutorial.tsx). Borrowed from: game loading
// screens (a wait is the one moment cards are free), Flight Simulator's first-start choice of
// assistance, and Kerbal Space Program's modes named for what you do in them.
// Notes: docs/research/welcome.md.
import { useEffect, useState } from 'react'
import { useStore, type Mode } from '../store'
import { startGuide } from './Tutorial'

// The pictures are captures of this app itself, so each card shows what the visitor is about to get.
const CARDS: { title: string; text: string; img: string; alt: string }[] = [
  {
    title: 'The real Moon, in 3D',
    text: "Spin it, zoom in to any crater, and fly low over the south pole. The ground is NASA's laser-measured terrain.",
    img: 'welcome/1.jpg',
    alt: 'The whole Moon with mission sites marked and the Earth in the distance',
  },
  {
    title: 'See where the Sun shines, and when',
    text: 'Pick any date. Near the pole the Sun skims the horizon, so one ridge is lit for months while the crater beside it never sees daylight.',
    img: 'welcome/2.jpg',
    alt: 'Long shadows across craters near the south pole',
  },
  {
    title: 'Find the best place to land',
    text: 'Say what a mission needs: sunlight for power, a view of Earth for radio, gentle slopes, ice nearby. The map lights up where the ground fits, and you can compare the best spots side by side.',
    img: 'welcome/3.jpg',
    alt: 'Ground that fits a mission lit up in green, with a numbered shortlist',
  },
  {
    title: 'Stand where others landed',
    text: 'Visit the sites of 41 missions, from Apollo 11 to the landers planned next, with the Sun and Earth in the sky where they really were.',
    img: 'welcome/4.jpg',
    alt: 'The Apollo 11 lunar module standing on the surface',
  },
]

const MODES: { id: Mode; title: string; text: string; point: string }[] = [
  {
    id: 'explore',
    title: 'Explorer',
    text: 'Fly around, discover places and learn as you go.',
    point: 'Starts with a one-minute hands-on tour.',
  },
  {
    id: 'plan',
    title: 'Mission planner',
    text: 'Every layer, exact figures and the assumptions behind them.',
    point: 'Height and slope layers, coordinate entry and export.',
  },
]

export function Welcome({ ready }: { ready: boolean }) {
  const [i, setI] = useState(0)
  const last = CARDS.length
  const choose = (mode: Mode) => {
    const st = useStore.getState()
    st.setMode(mode)
    st.setWelcome(false)
    // Explorers go straight into the hands-on tour; planners go straight to work (guides are in the menu).
    if (mode === 'explore') startGuide('basics')
  }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setI((n) => Math.min(last, n + 1))
      if (e.key === 'ArrowLeft') setI((n) => Math.max(0, n - 1))
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [last])
  const card = CARDS[i]
  // Fetch the other pictures now, so moving to the next card never shows an empty frame.
  useEffect(() => {
    for (const c of CARDS) new Image().src = `${import.meta.env.BASE_URL}${c.img}`
  }, [])
  return (
    <div className="welcome" role="dialog" aria-modal="true" aria-label="Welcome">
      <div className="welcome-card panel-surface">
        {card ? (
          <>
            <img className="welcome-art" src={`${import.meta.env.BASE_URL}${card.img}`} alt={card.alt} width={1200} height={800} key={i} />
            <div className="welcome-text">
              <p className="caption">Lunar Landing Site Navigator</p>
              <h2>{card.title}</h2>
              <p>{card.text}</p>
            </div>
          </>
        ) : (
          <div className="welcome-text">
            <h2>How do you want to use it?</h2>
            <p>Same Moon and same data either way. You can switch at any time under Guides and settings.</p>
            <div className="welcome-modes">
              {MODES.map((m) => (
                // Focus moves to the suggested choice: "Next", which had it, is gone on this card.
                <button key={m.id} type="button" className={m.id === 'explore' ? 'recommended' : undefined} autoFocus={m.id === 'explore'} onClick={() => choose(m.id)}>
                  <b>{m.title}</b>
                  <span>{m.text}</span>
                  <small>{m.point}</small>
                  {m.id === 'explore' && <small className="caption">Recommended for a first visit</small>}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="welcome-foot">
          <ol className="tour-dots" aria-label={`Card ${i + 1} of ${last + 1}`}>
            {[...CARDS, null].map((_, n) => (
              <li key={n} className={n === i ? 'now' : n < i ? 'on' : ''} />
            ))}
          </ol>
          <span className="caption welcome-load" role="status">
            {ready ? 'Moon ready' : 'Loading the Moon…'}
          </span>
          {i > 0 && (
            <button type="button" className="btn ghost" onClick={() => setI(i - 1)}>
              Back
            </button>
          )}
          {card && (
            <>
              {/* Straight to the Moon in the Explorer view. Held until the data is in, because the guide starts with it. */}
              <button type="button" className="btn ghost" onClick={() => choose('explore')} disabled={!ready}>
                Skip to the Moon
              </button>
              <button type="button" className="btn primary" onClick={() => setI(i + 1)} autoFocus>
                Next
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
