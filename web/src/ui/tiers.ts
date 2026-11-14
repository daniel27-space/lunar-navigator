// The terrain a site's horizon was worked out from, in words (site card, comparison, export).
import { MISSING } from '../lib/format'
import type { Tier } from './useSiteAnalysis'

export const TIER_NOTE: Record<Tier, string> = {
  crest: 'Horizon from LOLA 20 m terrain within about 5 km of this point, and 80 m terrain beyond.',
  patch: 'Horizon from 80 m terrain within about 30 km of this site, 160 m terrain out to about 60 km, and the whole-Moon map (2.7 km pixels) beyond.',
  fine: 'Horizon from LOLA 80 m terrain.',
  coarse: 'Horizon from LOLA terrain at about 300 m: rise and set times are less certain here.',
  global: 'Horizon from the whole-Moon map only (2.7 km pixels): hills smaller than a few km are missed, so treat times as rough.',
  none: 'No terrain data here: smooth-sphere horizon, so real hills are ignored.',
}
/** [short name, true when times are only approximate] */
export const TIER_SHORT: Record<Tier, [string, boolean]> = {
  crest: ['20 m terrain', false],
  patch: ['80 m terrain', false],
  fine: ['80 m terrain', false],
  coarse: ['300 m terrain, times less certain', true],
  global: ['2.7 km terrain, times are rough', true],
  none: ['No terrain data, hills ignored', true],
}
/** The finest terrain resolution used, as a table value. */
export const TERRAIN: Record<Tier, string> = { crest: '20 m', fine: '80 m', patch: '80 m', coarse: '300 m', global: '2.7 km', none: MISSING }

/** For a basis tag: "80 m terrain", or "no terrain data". */
export const terrainTag = (tier: Tier) => (tier === 'none' ? 'no terrain data' : `${TERRAIN[tier]} terrain`)
