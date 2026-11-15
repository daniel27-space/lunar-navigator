// A site card's headline: the one figure to read first, then Earth in a quieter clause.
// It states what was measured and does not judge; the comparison's verdict does the judging.
import { fmtShare } from '../lib/format'
import type { Summary } from '../lib/windows'

export interface SiteSentence {
  /** the large part: a share such as "78%", or "Always" / "Never" */
  lead: string
  /** the rest of the first sentence, after the large part */
  rest: string
  /** the Earth sentence */
  earth: string
}

// The same cut-off as the comparison's verdict: above it a share is printed as "always".
const ALWAYS = 0.9995

export function siteSentence(summary: Pick<Summary, 'sunShare' | 'commShare'>, days: number): SiteSentence {
  const { sunShare: sun, commShare: earth } = summary
  const whole = sun >= ALWAYS || sun <= 0
  return {
    lead: sun >= ALWAYS ? 'Always' : sun <= 0 ? 'Never' : fmtShare(sun),
    rest: whole ? `in sunlight over these ${days} days.` : `of these ${days} days in sunlight.`,
    earth: earth >= ALWAYS ? 'Earth always in view.' : earth <= 0 ? 'Earth never in view.' : `Earth in view ${fmtShare(earth)} of the time.`,
  }
}
