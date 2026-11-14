// The planner's assumptions (lib/assumptions.ts): a quiet button in the sites panel's head, a
// marker beside it whenever a setting is not the default, and the small section it opens.
import { EARTH_MASKS, isDefaultAssumptions, OBSERVER_HEIGHTS, SUN_RULES, sunRuleOf } from '../lib/assumptions'
import { fmtDegrees } from '../lib/format'
import { assumptionsOf, useStore } from '../store'
import { Segmented } from './controls'

/** True when any assumption differs from the default. */
export function useAssumptionsChanged(): boolean {
  return useStore((s) => !isDefaultAssumptions(assumptionsOf(s)))
}

/** The head row of the sites panel: the marker (only when something is changed) and the button. */
export function AssumptionsHead() {
  const open = useStore((s) => s.assumeOpen)
  const setOpen = useStore((s) => s.setAssumeOpen)
  const changed = useAssumptionsChanged()
  return (
    <div className="sites-head panel-head" data-changed={changed}>
      {changed && (
        <span className="assume-flag" role="status">
          <i className="dot warn" /> Assumptions changed
        </span>
      )}
      <button type="button" className="disc" aria-expanded={open} aria-controls="assumptions" onClick={() => setOpen(!open)}>
        Assumptions
      </button>
    </div>
  )
}

export function AssumptionsPanel() {
  const open = useStore((s) => s.assumeOpen)
  const criteria = useStore((s) => s.criteria)
  const observerM = useStore((s) => s.observerM)
  const set = useStore((s) => s.setAssumptions)
  const reset = useStore((s) => s.resetAssumptions)
  const changed = useAssumptionsChanged()
  if (!open) return null
  return (
    <section className="assume" id="assumptions" aria-label="Assumptions">
      <div className="field">
        <span className="field-head">
          <span>Sunlit when this much of the Sun's disc is visible</span>
        </span>
        <Segmented
          label="Sunlit when"
          options={SUN_RULES.map((r) => [r.id, r.label, `Sunlit when ${r.text}${r.id === 'half' ? ' (default)' : ''}`] as const)}
          value={sunRuleOf(criteria)}
          onChange={(id) => set({ minSunFrac: SUN_RULES.find((r) => r.id === id)!.minSunFrac })}
        />
      </div>
      <div className="field">
        <span className="field-head">
          <span>Earth link needs Earth at least this far above the terrain</span>
        </span>
        <Segmented
          label="Earth link needs Earth at least"
          options={EARTH_MASKS.map((d) => [d, fmtDegrees(d), `Earth's centre at least ${d}° above the terrain${d === 0 ? ' (default)' : ''}`] as const)}
          value={criteria.earthMaskDeg}
          onChange={(earthMaskDeg) => set({ earthMaskDeg })}
        />
      </div>
      <div className="field">
        <span className="field-head">
          <span>Height of the panel and antenna above the ground</span>
        </span>
        <Segmented
          label="Height of the panel and antenna above the ground"
          options={OBSERVER_HEIGHTS.map((h) => [h, `${h} m`, h === 2 ? 'About the top of a small lander (default)' : 'A taller mast sees over more hills'] as const)}
          value={observerM}
          onChange={(h) => set({ observerM: h })}
        />
      </div>
      <div className="assume-foot">
        <p className="caption">
          These change the figures on every card, comparison and landing-date ranking. The site finder is not affected: it uses NASA's long-term maps. The
          comparison with published work in the validation write-up uses “any part”.
        </p>
        <button type="button" className="btn" disabled={!changed} onClick={reset}>
          Reset to defaults
        </button>
      </div>
    </section>
  )
}
