// A shareable link: the pinned sites, the clock, the layer, the finder preset and any
// non-default assumptions, carried in the URL hash. Everything read back from a hash is
// checked (numbers in range, at most three sites, short plain-text labels); anything malformed
// is ignored rather than trusted.
import { DEFAULT_ASSUMPTIONS, EARTH_MASKS, OBSERVER_HEIGHTS, SUN_RULES, sunRuleOf, type Assumptions, type SunRule } from './assumptions'

export const SHARE_LAYERS = ['natural', 'elevation', 'slope', 'sunavg', 'earthavg', 'psr', 'finder'] as const
export type ShareLayer = (typeof SHARE_LAYERS)[number]

export const MAX_SHARED_SITES = 3
export const MAX_LABEL = 60

export interface SharedSite {
  lat: number
  lon: number
  label: string
}

export interface ShareState {
  /** in badge order: A, B, C */
  sites: SharedSite[]
  /** clock time, ms since epoch (UTC) */
  tMs?: number
  layer?: ShareLayer
  /** a finder preset id; a custom set of limits is not carried */
  preset?: string
  /** only what differs from the defaults */
  sun?: SunRule
  earthMaskDeg?: number
  observerM?: number
}

/** A label as plain text: control characters dropped, spaces collapsed, at most MAX_LABEL characters. */
export function cleanLabel(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_LABEL)
}

/** What a link has to carry for the current state. */
export function shareStateOf(s: { sites: SharedSite[]; tMs: number; layer: string; preset: string; assumptions: Assumptions }, presetIds: readonly string[]): ShareState {
  const a = s.assumptions
  const d = DEFAULT_ASSUMPTIONS
  return {
    sites: s.sites.slice(0, MAX_SHARED_SITES),
    tMs: s.tMs,
    layer: (SHARE_LAYERS as readonly string[]).includes(s.layer) ? (s.layer as ShareLayer) : undefined,
    preset: presetIds.includes(s.preset) ? s.preset : undefined,
    sun: sunRuleOf(a.criteria) !== sunRuleOf(d.criteria) ? sunRuleOf(a.criteria) : undefined,
    earthMaskDeg: a.criteria.earthMaskDeg !== d.criteria.earthMaskDeg ? a.criteria.earthMaskDeg : undefined,
    observerM: a.observerM !== d.observerM ? a.observerM : undefined,
  }
}

/** The hash for a state, without the leading "#". */
export function encodeShare(s: ShareState): string {
  const q = new URLSearchParams()
  for (const site of s.sites.slice(0, MAX_SHARED_SITES)) q.append('s', `${site.lat.toFixed(4)},${site.lon.toFixed(4)},${cleanLabel(site.label)}`)
  if (s.tMs !== undefined && Number.isFinite(s.tMs)) q.set('t', new Date(s.tMs).toISOString().slice(0, 16) + 'Z')
  if (s.layer) q.set('layer', s.layer)
  if (s.preset) q.set('goal', s.preset)
  if (s.sun) q.set('sun', s.sun)
  if (s.earthMaskDeg !== undefined) q.set('earth', String(s.earthMaskDeg))
  if (s.observerM !== undefined) q.set('h', String(s.observerM))
  return q.toString()
}

const NUMBER = /^-?\d{1,3}(\.\d{1,8})?$/

function site(text: string): SharedSite | null {
  const parts = text.split(',')
  if (parts.length < 3 || !NUMBER.test(parts[0]) || !NUMBER.test(parts[1])) return null
  const lat = Number(parts[0])
  const lon = Number(parts[1])
  const label = cleanLabel(parts.slice(2).join(','))
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180 || !label) return null
  return { lat, lon, label }
}

/**
 * The state a hash stands for (with or without its "#"), or null when it holds nothing usable.
 * Each part is checked on its own; a malformed part is dropped and the rest is kept.
 */
export function decodeShare(hash: string, presetIds: readonly string[]): ShareState | null {
  if (hash.length > 2000) return null
  let q: URLSearchParams
  try {
    q = new URLSearchParams(hash.replace(/^#/, ''))
  } catch {
    return null
  }
  const out: ShareState = { sites: [] }
  for (const text of q.getAll('s')) {
    const s = site(text)
    if (s && out.sites.length < MAX_SHARED_SITES) out.sites.push(s)
  }
  const t = q.get('t')
  if (t && /^\d{4}-\d\d-\d\dT\d\d:\d\dZ$/.test(t)) {
    const ms = Date.parse(t)
    if (Number.isFinite(ms)) out.tMs = ms
  }
  const layer = q.get('layer')
  if (layer && (SHARE_LAYERS as readonly string[]).includes(layer)) out.layer = layer as ShareLayer
  const goal = q.get('goal')
  if (goal && presetIds.includes(goal)) out.preset = goal
  const sun = q.get('sun')
  if (sun && SUN_RULES.some((r) => r.id === sun)) out.sun = sun as SunRule
  const earth = q.get('earth')
  if (earth && /^\d{1,2}$/.test(earth) && EARTH_MASKS.includes(Number(earth))) out.earthMaskDeg = Number(earth)
  const h = q.get('h')
  if (h && /^\d{1,2}$/.test(h) && OBSERVER_HEIGHTS.includes(Number(h))) out.observerM = Number(h)
  const empty = out.sites.length === 0 && out.tMs === undefined && !out.layer && !out.preset && !out.sun && out.earthMaskDeg === undefined && out.observerM === undefined
  return empty ? null : out
}
