// The welcome: four short illustrated cards on what the app is for, then a choice of view.
// It is shown on every load and covers the app while the terrain downloads, so the first thing
// a visitor sees is never a half-loaded Moon. The cards say what you can do here; the controls
// themselves are taught afterwards by doing (ui/Tutorial.tsx). Borrowed from: game loading
// screens (a wait is the one moment cards are free), Flight Simulator's first-start choice of
// assistance, and Kerbal Space Program's modes named for what you do in them.
// Notes: docs/research/welcome.md.
import { useEffect, useState, type ReactNode } from 'react'
import { useStore, type Mode } from '../store'
import { startGuide } from './Tutorial'

const MOON = (
  <>
    <circle cx="120" cy="80" r="56" className="w-moon" />
    <circle cx="100" cy="62" r="11" className="w-crater" />
    <circle cx="138" cy="96" r="16" className="w-crater" />
    <circle cx="112" cy="108" r="6" className="w-crater" />
    <circle cx="146" cy="58" r="5" className="w-crater" />
  </>
)

const CARDS: { title: string; text: string; art: ReactNode }[] = [
  {
    title: 'The real Moon, in 3D',
    text: "Spin it, zoom in to any crater, and fly low over the south pole. The ground is NASA's laser-measured terrain.",
    art: (
      <>
        {MOON}
        <path d="M40 80a80 30 0 0 0 160 0" className="w-orbit" />
        <path d="M196 70l5 11 9-8" className="w-orbit" />
      </>
    ),
  },
  {
    title: 'See where the Sun shines, and when',
    text: 'Pick any date. Near the pole the Sun skims the horizon, so one ridge is lit for months while the crater beside it never sees daylight.',
    art: (
      <>
        <circle cx="34" cy="92" r="14" className="w-sun" />
        <path d="M54 92H232" className="w-ray" />
        <path d="M54 84L232 60" className="w-ray" />
        <path d="M0 132H70L96 92L118 132H150Q176 150 202 132H240V160H0Z" className="w-ground" />
        <path d="M118 132H150Q176 150 202 132Z" className="w-shadow" />
        <circle cx="206" cy="34" r="9" className="w-earth" />
      </>
    ),
  },
  {
    title: 'Find the best place to land',
    text: 'Say what a mission needs: sunlight for power, a view of Earth for radio, gentle slopes, ice nearby. The map lights up where the ground fits, and you can compare the best spots side by side.',
    art: (
      <>
        {[0, 1, 2, 3, 4, 5].map((c) =>
          [0, 1, 2, 3].map((r) => <rect key={`${c}-${r}`} x={36 + c * 28} y={24 + r * 28} width="26" height="26" rx="3" className={`w-cell h${(c * 7 + r * 5 + c * r) % 4}`} />),
        )}
        <circle cx="105" cy="65" r="11" className="w-pin a" />
        <circle cx="161" cy="93" r="11" className="w-pin b" />
        <circle cx="77" cy="121" r="11" className="w-pin c" />
      </>
    ),
  },
  {
    title: 'Stand where others landed',
    text: 'Visit the sites of 41 missions, from Apollo 11 to the landers planned next, with the Sun and Earth in the sky where they really were.',
    art: (
      <>
        <circle cx="198" cy="36" r="12" className="w-earth" />
        <path d="M0 128Q60 112 120 126T240 120V160H0Z" className="w-ground" />
        <path d="M104 96h32l6 14h-44z" className="w-craft" />
        <rect x="110" y="78" width="20" height="18" rx="3" className="w-craft top" />
        <path d="M100 110l-10 16M140 110l10 16M120 110v14" className="w-leg" />
        <path d="M120 78v-12l10 4" className="w-leg" />
      </>
    ),
  },
]

const MODES: { id: Mode; title: string; text: string; points: string[] }[] = [
  {
    id: 'explore',
    title: 'Explorer',
    text: 'Fly around, discover places and learn as you go.',
    points: ['Starts with a one-minute hands-on tour', 'The essentials, in plain language'],
  },
  {
    id: 'plan',
    title: 'Mission planner',
    text: 'Every layer, exact figures and the assumptions behind them.',
    points: ['Height and slope layers, coordinate entry, export', 'Adjustable sunlight and Earth-link rules'],
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
  return (
    <div className="welcome" role="dialog" aria-modal="true" aria-label="Welcome">
      <div className="welcome-card panel-surface">
        {card ? (
          <>
            <svg viewBox="0 0 240 160" className="welcome-art" aria-hidden="true" key={i}>
              {card.art}
            </svg>
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
                <button key={m.id} type="button" onClick={() => choose(m.id)}>
                  <b>{m.title}</b>
                  <span>{m.text}</span>
                  <ul>
                    {m.points.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
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
              <button type="button" className="btn ghost" onClick={() => setI(last)}>
                Skip
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
