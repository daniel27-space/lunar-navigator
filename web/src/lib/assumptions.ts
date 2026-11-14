// The planner's assumptions behind every card, comparison and landing-date figure: how much of
// the Sun's disc counts as "sunlit", how high Earth must be for a link, and how high the panel
// and antenna stand. The site finder does not use them (it reads NASA's long-term maps).
import { DEFAULT_CRITERIA, type Criteria } from './windows'

export interface Assumptions {
  criteria: Criteria
  /** height of the solar panel and antenna above the ground, metres */
  observerM: number
}

export const DEFAULT_OBSERVER_M = 2
export const DEFAULT_ASSUMPTIONS: Assumptions = { criteria: DEFAULT_CRITERIA, observerM: DEFAULT_OBSERVER_M }

export type SunRule = 'any' | 'half' | 'all'

/** The three sunlit rules: [id, least fraction of the disc, short label, the rule in a sentence]. */
export const SUN_RULES: readonly { id: SunRule; minSunFrac: number; label: string; text: string }[] = [
  { id: 'any', minSunFrac: 0.001, label: 'Any part', text: "any part of the Sun's disc is above the terrain" },
  { id: 'half', minSunFrac: 0.5, label: 'At least half', text: "at least half the Sun's disc is above the terrain" },
  { id: 'all', minSunFrac: 0.999, label: 'All of it', text: "all of the Sun's disc is above the terrain" },
]
/** Least height of Earth's centre above the terrain for a link, degrees. */
export const EARTH_MASKS: readonly number[] = [0, 2, 5, 10]
export const OBSERVER_HEIGHTS: readonly number[] = [2, 5, 10]

/** The rule a threshold stands for (the nearest of the three). */
export function sunRuleOf(c: Criteria): SunRule {
  return SUN_RULES.reduce((best, r) => (Math.abs(r.minSunFrac - c.minSunFrac) < Math.abs(best.minSunFrac - c.minSunFrac) ? r : best)).id
}

/** "at least half the Sun's disc is above the terrain" */
export function sunRuleText(c: Criteria): string {
  return SUN_RULES.find((r) => r.id === sunRuleOf(c))!.text
}

/** "Earth's centre is above the terrain" or "... is at least 5° above the terrain"; `deg` is the degree sign to use. */
export function earthRuleText(c: Criteria, deg = '°'): string {
  return c.earthMaskDeg > 0 ? `Earth's centre is at least ${c.earthMaskDeg}${deg} above the terrain` : "Earth's centre is above the terrain"
}

/** One sentence stating all three, for captions: "Sunlit means ...; Earth in view means ...; panel and antenna 2 m above the ground." */
export function assumptionsText(a: Assumptions, deg = '°'): string {
  return `Sunlit means ${sunRuleText(a.criteria)}; Earth in view means ${earthRuleText(a.criteria, deg)}; panel and antenna ${a.observerM} m above the ground.`
}

export function isDefaultAssumptions(a: Assumptions): boolean {
  return a.criteria.minSunFrac === DEFAULT_CRITERIA.minSunFrac && a.criteria.earthMaskDeg === DEFAULT_CRITERIA.earthMaskDeg && a.observerM === DEFAULT_OBSERVER_M
}

/**
 * The key a site's horizon is cached under. It includes the observer height: a taller panel
 * sees over more hills, so its horizon is a different one.
 */
export function horizonKey(lat: number, lon: number, patchKey: string, hasGlobal: boolean, observerM: number): string {
  return `${lat},${lon},${patchKey || '-'},${hasGlobal ? 1 : 0},${observerM}`
}
