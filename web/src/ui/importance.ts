// The Custom profile's "What matters most" switches: three steps of importance for each thing
// the shortlist is ranked on, and the same in words for the panel, the CSV and the share link.
import type { FinderCriteria, FinderWeights } from '../lib/finder'

export type Importance = 'low' | 'normal' | 'high'

/** The weight each step stands for: half, the same, or double. */
export const IMPORTANCE: Record<Importance, number> = { low: 0.5, normal: 1, high: 2 }

/** The step a stored weight belongs to (a weight left out is normal). */
export function importanceOf(weight: number | undefined): Importance {
  if (weight === undefined || !Number.isFinite(weight)) return 'normal'
  return weight < 0.75 ? 'low' : weight > 1.5 ? 'high' : 'normal'
}

const NAMES: [keyof FinderWeights, string][] = [
  ['slope', 'flat ground'],
  ['sun', 'sunlight'],
  ['earth', 'Earth view'],
  ['psr', 'nearness to shadow'],
]

/** Whether a term is being ranked on at all with these limits. */
function counts(c: FinderCriteria, key: keyof FinderWeights): boolean {
  if (key === 'sun') return c.sunPrefer !== 'none'
  if (key === 'earth') return c.earthPrefer !== 'none'
  if (key === 'psr') return c.maxPsrKm !== null && c.psr !== 'inside'
  return true
}

/** "Sunlight counts double, flat ground counts half." or an empty string when everything counts the same. */
export function importanceText(c: FinderCriteria): string {
  const parts = NAMES.filter(([key]) => counts(c, key))
    .map(([key, name]) => [name, importanceOf(c.weights?.[key])] as const)
    .filter(([, step]) => step !== 'normal')
    .map(([name, step]) => `${name} counts ${step === 'high' ? 'double' : 'half'}`)
  if (parts.length === 0) return ''
  const text = parts.join(', ')
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`
}
