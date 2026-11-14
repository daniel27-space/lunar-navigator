// Comparison of two or three sites in plain words: which one wins on each measure that
// differs enough to matter, and by how much. Near-equal measures are left out on purpose.
import type { Summary } from './windows'

export interface SiteFacts {
  label: string
  summary: Summary
  /** degrees; NaN when no detailed terrain covers the site */
  slopeDeg: number
}

export interface Measure {
  id: 'sun' | 'night' | 'earth' | 'outage' | 'slope'
  label: string
  /** value per site, in display units (percent, days or degrees); NaN = unknown */
  values: number[]
  unit: '%' | 'd' | '°'
  /** true when a larger value is better for this mission */
  higherIsBetter: boolean
  /** index of the best site, or -1 when the sites are too close to call or a value is unknown */
  winner: number
  /** smallest difference that counts as a real difference, in display units */
  threshold: number
}

export interface Wants {
  /** false when the mission wants as little sunlight as possible (ice prospecting) */
  sunHigh: boolean
  /** false when the mission wants to be hidden from Earth (radio-quiet) */
  earthHigh: boolean
}

export function measures(sites: SiteFacts[], wants: Wants): Measure[] {
  const m = (
    id: Measure['id'],
    label: string,
    unit: Measure['unit'],
    higherIsBetter: boolean,
    threshold: number,
    f: (s: SiteFacts) => number,
  ): Measure => {
    const values = sites.map(f)
    let winner = -1
    if (values.every((v) => !Number.isNaN(v))) {
      const sign = higherIsBetter ? 1 : -1
      const order = values.map((v, i) => [v * sign, i]).sort((a, b) => b[0] - a[0])
      if (order.length > 1 && order[0][0] - order[1][0] >= threshold) winner = order[0][1]
    }
    return { id, label, values, unit, higherIsBetter, winner, threshold }
  }
  return [
    m('sun', 'Time in sunlight', '%', wants.sunHigh, 3, (s) => s.summary.sunShare * 100),
    m('night', 'Longest night', 'd', !wants.sunHigh, 0.5, (s) => s.summary.longestDarkH / 24),
    m('earth', 'Time with Earth in view', '%', wants.earthHigh, 3, (s) => s.summary.commShare * 100),
    m('outage', 'Longest gap without Earth', 'd', !wants.earthHigh, 0.5, (s) => s.summary.longestNoCommH / 24),
    m('slope', 'Slope', '°', false, 1, (s) => s.slopeDeg),
  ]
}

const fmt = (v: number, unit: Measure['unit']) =>
  unit === '%' ? `${Math.round(v)}%` : unit === 'd' ? `${v.toFixed(1)} days` : `${v.toFixed(1)}°`

const PHRASE: Record<Measure['id'], [string, string]> = {
  // [when higher is better, when lower is better]
  sun: ['gets the most sunlight', 'gets the least sunlight'],
  night: ['has the longest night', 'has the shortest night'],
  earth: ['sees Earth the most', 'is the most hidden from Earth'],
  outage: ['has the longest stretch hidden from Earth', 'has the shortest gap without Earth'],
  slope: ['is the steepest', 'is the flattest'],
}

/** One sentence per measure with a clear winner, then an overall line. */
export function verdict(sites: SiteFacts[], wants: Wants): { lines: { winner: number; text: string }[]; overall: string } {
  const ms = measures(sites, wants)
  const lines = ms
    .filter((m) => m.winner >= 0)
    .map((m) => {
      const w = m.winner
      const others = sites
        .map((s, i) => (i === w ? null : `${fmt(m.values[i], m.unit)} for ${s.label}`))
        .filter(Boolean)
        .join(' and ')
      return {
        winner: w,
        text: `${sites[w].label} ${PHRASE[m.id][m.higherIsBetter ? 0 : 1]}: ${fmt(m.values[w], m.unit)}, against ${others}.`,
      }
    })
  const wins = sites.map((_, i) => ms.filter((m) => m.winner === i).length)
  const top = Math.max(...wins)
  let overall: string
  if (lines.length === 0) overall = 'These sites are too close to separate on anything measured here.'
  else if (wins.filter((w) => w === top).length > 1) overall = 'No single site leads: each wins on different measures, so the choice depends on which matters most.'
  else overall = `${sites[wins.indexOf(top)].label} leads on ${top} of ${ms.length} measures.`
  return { lines, overall }
}
