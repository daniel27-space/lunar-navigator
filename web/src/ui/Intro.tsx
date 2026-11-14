// First-use guide: what the app is for, four steps, its limits and a key to the map markers.
// A card in the sites panel (the phone sheet), never a dialog over the Moon.
import { useStore } from '../store'
import { Badge } from './controls'

export function Intro({ onExample }: { onExample?: () => void }) {
  const help = useStore((s) => s.help)
  const setHelp = useStore((s) => s.setHelp)
  if (!help) return null
  return (
    <section className="intro" aria-label="How to use this">
      <header>
        <h2>What this is for</h2>
        <button type="button" className="btn ghost icon" aria-label="Close the guide" onClick={() => setHelp(false)}>
          ×
        </button>
      </header>
      <p>
        Near the Moon's south pole the Sun and Earth sit low on the horizon, so hills decide when a lander has sunlight for power and a view of
        Earth for a direct radio link. This shows both, for any place and date.
      </p>
      <ol>
        <li>
          <b>Choose a place.</b> Drag to rotate, scroll to zoom, hold the wheel and drag to slide. Click the surface, pick a mission, or type
          coordinates.
        </li>
        <li>
          <b>Read the site.</b> Is it sunlit? Is Earth above the local terrain? Open Horizon view to see why.
        </li>
        <li>
          <b>Compare.</b> Pin up to three places, or open When to land to compare dates at one place.
        </li>
        <li>
          <b>Explore.</b> Find a site ranks ground against mission needs; the layers show long-term sunlight, Earth view, shadow, height and slope.
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
        A screening tool, not mission-grade: figures depend on the terrain resolution, the period shown and an observer 2 m above the ground.{' '}
        <a href="https://github.com/daniel27-space/lunar-navigator/blob/main/docs/VALIDATION.md" target="_blank" rel="noreferrer">
          How the numbers were checked
        </a>
        .
      </p>
      <div className="intro-actions">
        {onExample && (
          <button
            type="button"
            className="btn"
            onClick={() => {
              setHelp(false)
              onExample()
            }}
          >
            Show me an example
          </button>
        )}
        <button type="button" className="btn primary" onClick={() => setHelp(false)}>
          Got it
        </button>
      </div>
    </section>
  )
}
