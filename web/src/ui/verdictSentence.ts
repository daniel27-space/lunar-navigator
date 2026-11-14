// The comparison's one-sentence verdict, composed from the measures in lib/verdict.ts.
import { fmtMeasure } from '../lib/format'
import type { Measure } from '../lib/verdict'

/** [in a sentence, as a label] per finder preset. */
export const MISSION: Record<string, [string, string]> = {
  solar: ['a solar lander', 'Solar lander'],
  ice: ['ice prospecting', 'Ice prospecting'],
  base: ['a base near ice', 'Base near ice'],
  quiet: ['a radio-quiet site', 'Radio-quiet site'],
  custom: ['your limits', 'Custom limits'],
}

const PHRASE: Record<Measure['id'], [string, string]> = {
  // [when higher is better, when lower is better]
  sun: ['most sunlight', 'least sunlight'],
  night: ['longest night', 'shortest night'],
  earth: ['most time with Earth in view', 'least time with Earth in view'],
  outage: ['longest gap without Earth', 'shortest gap without Earth'],
  slope: ['steepest ground', 'flattest ground'],
}

function reason(m: Measure): string {
  const v = m.values[m.winner]
  if (m.id === 'earth' && m.higherIsBetter && v >= 99.95) return 'Earth always in view'
  return `${PHRASE[m.id][m.higherIsBetter ? 0 : 1]} (${fmtMeasure(v, m.unit)})`
}

export interface VerdictSentence {
  /** index of the leading site, or -1 when no single site leads */
  leader: number
  /** the sentence; when there is a leader it follows that site's badge */
  text: string
  /** one quieter line under it, may be empty */
  sub: string
}

export function verdictSentence(ms: Measure[], letters: string[], mission: string): VerdictSentence {
  const won = letters.map((_, i) => ms.filter((m) => m.winner === i))
  const top = Math.max(...won.map((w) => w.length))
  if (top === 0) return { leader: -1, text: 'Too close to call: nothing measured here separates these sites.', sub: '' }
  const leaders = won.map((w, i) => (w.length === top ? i : -1)).filter((i) => i >= 0)
  if (leaders.length > 1) {
    const parts = won.map((w, i) => (w.length ? `${letters[i]}: ${reason(w[0])}` : null)).filter(Boolean)
    return { leader: -1, text: `No single site leads. ${parts.join('; ')}.`, sub: 'Each wins on different measures.' }
  }
  const i = leaders[0]
  const why = won[i].slice(0, 2).map(reason).join(' and ')
  return { leader: i, text: `suits ${mission} best: ${why}.`, sub: `Leads on ${top} of ${ms.length} measures.` }
}
