// Gathers what the scenario export needs from the pinned sites and the store, and hands the
// finished text to the browser as a download. The text itself is built in lib/exportScenario.ts.
import { scenarioCsv, scenarioFileName, type ExportStays, type ScenarioInput } from '../lib/exportScenario'
import type { FinderCriteria } from '../lib/finder'
import { assumptionsOf, useStore } from '../store'
import { SITE_LETTERS } from './controls'
import { importanceText } from './importance'
import { TERRAIN, TIER_NOTE } from './tiers'
import { WINDOW_DAYS, type SiteAnalysis } from './useSiteAnalysis'
import { MISSION } from './verdictSentence'

const pct = (share: number) => `${Math.round(share * 100)}%`
/** Custom finder limits written out, so the file records what the shortlist was ranked against. */
function customGoal(f: FinderCriteria): string {
  return `Custom limits: slope at most ${f.maxSlopeDeg} deg, sunlight ${pct(f.sunMin)} to ${pct(f.sunMax)}, Earth view ${pct(f.earthMin)} to ${pct(f.earthMax)}, permanent shadow ${f.psr}${f.maxPsrKm !== null ? `, within ${f.maxPsrKm} km of shadow` : ''}${importanceText(f) ? `. Ranking: ${importanceText(f)}` : ''}`
}

export function scenarioInput(sites: SiteAnalysis[], stays?: ExportStays): ScenarioInput {
  const s = useStore.getState()
  return {
    exportedAtMs: Date.now(),
    clockMs: s.tMs,
    periodStartMs: sites[0].series.t0Ms,
    periodDays: WINDOW_DAYS,
    goal: s.preset === 'custom' ? customGoal(s.finder) : (MISSION[s.preset] ?? MISSION.custom)[1],
    assumptions: assumptionsOf(s),
    kernels: sites[0].ephem.kernels ?? [],
    sites: sites.map((a) => ({
      letter: SITE_LETTERS[a.pin.slot],
      name: a.pin.label,
      lat: a.pin.lat,
      lon: a.pin.lon,
      elevationM: a.hM,
      slopeDeg: a.slope,
      terrain: a.tier === 'none' ? 'none' : TERRAIN[a.tier],
      terrainNote: TIER_NOTE[a.tier],
      series: a.series,
      sunElNowDeg: a.sky.sun.el,
      earthClearNowDeg: a.earthClear,
    })),
    stays,
  }
}

/** Saves text as a file from the page itself: no request leaves the browser. */
function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.hidden = true
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Downloads one CSV for the pinned sites (and, from "When to land", the stays compared). */
export function exportScenario(sites: SiteAnalysis[], stays?: ExportStays) {
  if (sites.length === 0) return
  const input = scenarioInput(sites, stays)
  download(scenarioFileName(input.exportedAtMs), scenarioCsv(input))
}
