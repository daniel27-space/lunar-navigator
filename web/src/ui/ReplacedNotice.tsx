// Only three sites can be pinned. When a new pin pushes one out, say so and offer to undo it.
// The same notice offers to put back a site removed by hand.
import { useStore } from '../store'
import { SITE_LETTERS } from './controls'

export function ReplacedNotice() {
  const replaced = useStore((s) => s.replaced)
  const pins = useStore((s) => s.pins)
  const undo = useStore((s) => s.undoReplace)
  const dismiss = useStore((s) => s.dismissReplace)
  if (!replaced) return null
  const added = pins.filter((p) => replaced.added.includes(p.id))
  const out = replaced.removed
  const byHand = replaced.added.length === 0
  const text = byHand
    ? `Removed ${out.map((p) => `${SITE_LETTERS[p.slot]} · ${p.label}`).join(', ')}.`
    : out.length === 1 && added.length === 1
      ? `Replaced ${SITE_LETTERS[out[0].slot]} · ${out[0].label} with ${added[0].label}.`
      : `Replaced ${out.map((p) => `${SITE_LETTERS[p.slot]} · ${p.label}`).join(', ')} with ${added.length} new ${added.length === 1 ? 'site' : 'sites'}.`
  return (
    <div className="notice" role="status">
      <p>
        {text} {!byHand && <span className="quiet">Only three sites can be pinned.</span>}{' '}
        <button type="button" className="link" onClick={undo}>
          Undo
        </button>
      </p>
      <button type="button" className="btn ghost icon" aria-label="Dismiss this notice" onClick={dismiss}>
        ×
      </button>
    </div>
  )
}
