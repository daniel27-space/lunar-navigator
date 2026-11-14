// The comparison's one-sentence verdict, composed from the measures in lib/verdict.ts.
import { fmtMeasure } from '../lib/format'
import type { Measure } from '../lib/verdict'

/** [in a sentence, as a label] per finder preset. */
export const MISSION: Record<string, [string, string]> = {
  solar: ['a solar lander', 'Solar lander'],
  ice: ['ice prospecting', 'Ice prospecting'],
  base: ['a base near ice', 'Base near ice'],
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

// Sunlight share and longest night are the same evidence, as are Earth view and the longest
// gap without Earth, so each pair counts as one win when the leader is decided.
const GROUPS: { name: string; ids: Measure['id'][] }[] = [
  { name: 'sunlight', ids: ['sun', 'night'] },
  { name: 'Earth link', ids: ['earth', 'outage'] },
  { name: 'slope', ids: ['slope'] },
]

const list = (parts: string[]) => (parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`)

/** A serious shortfall of site i on something the mission wants, in words; empty when there is none. */
function weakness(ms: Measure[], i: number): string {
  const sun = ms.find((m) => m.id === 'sun')
  const earth = ms.find((m) => m.id === 'earth')
  const out: string[] = []
  if (sun && !Number.isNaN(sun.values[i])) {
    if (sun.higherIsBetter && sun.values[i] < 30) out.push(`it is sunlit only ${fmtMeasure(sun.values[i], '%')} of the time`)
    if (!sun.higherIsBetter && sun.values[i] > 70) out.push(`it is sunlit ${fmtMeasure(sun.values[i], '%')} of the time`)
  }
  if (earth && !Number.isNaN(earth.values[i])) {
    if (earth.higherIsBetter && earth.values[i] < 50) out.push(`Earth is in view only ${fmtMeasure(earth.values[i], '%')} of the time`)
    if (!earth.higherIsBetter && earth.values[i] > 50) out.push(`Earth is in view ${fmtMeasure(earth.values[i], '%')} of the time`)
  }
  return out.length ? `, but ${list(out)}` : ''
}

export function verdictSentence(ms: Measure[], letters: string[], mission: string): VerdictSentence {
  // Per site: for each group it wins, the first measure of that group it wins on.
  const won = letters.map((_, i) =>
    GROUPS.map((g) => ({ name: g.name, m: ms.find((m) => g.ids.includes(m.id) && m.winner === i) })).filter((x): x is { name: string; m: Measure } => !!x.m),
  )
  const top = Math.max(...won.map((w) => w.length))
  if (top === 0) return { leader: -1, text: 'Too close to call: nothing measured here separates these sites.', sub: '' }
  const leaders = won.map((w, i) => (w.length === top ? i : -1)).filter((i) => i >= 0)
  if (leaders.length > 1) {
    const parts = won.map((w, i) => (w.length ? `${letters[i]}: ${reason(w[0].m)}` : null)).filter(Boolean)
    return { leader: -1, text: `No single site leads. ${parts.join('; ')}.`, sub: 'Each wins on different measures.' }
  }
  const i = leaders[0]
  const why = won[i]
    .slice(0, 2)
    .map((w) => reason(w.m))
    .join(' and ')
  const among = letters.length === 2 ? 'the better of these two' : `the best of these ${letters.length === 3 ? 'three' : letters.length}`
  return { leader: i, text: `is ${among} for ${mission}: ${why}${weakness(ms, i)}.`, sub: `Leads on ${list(won[i].map((w) => w.name))}.` }
}
