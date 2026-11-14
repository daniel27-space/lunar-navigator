// The one plain sentence above the "When to land" grid, composed from lib/landing.ts stats.
import { fmtDay, fmtDurationWords } from '../lib/format'
import type { Wants, WindowStats } from '../lib/landing'

const FULL = 0.9995
const CLOSE = 0.005

/** Sunlit time of a stay in words, e.g. "6.0 days". */
const sunTime = (w: WindowStats) => fmtDurationWords(w.sunShare * w.days * 24)

export function landingSentence(best: WindowStats | null, selected: WindowStats | null, days: number, wants: Wants): string {
  if (!best) return `There is not enough data ahead to check a ${days}-day stay.`
  const sameStay = selected !== null && Math.abs(selected.startMs - best.startMs) < 6 * 3600000
  const tail = (clause: string) => (!selected ? '; the selected time is outside the period that can be checked.' : sameStay ? '. That is the selected time.' : clause)

  if (wants.sunHigh) {
    if (best.sunShare === 0) return `No ${days}-day stay in the period checked gets any sunlight here.`
    const lead =
      best.sunShare >= FULL
        ? `Landing ${fmtDay(best.startMs)} gives ${days} days of unbroken sunlight`
        : `Landing ${fmtDay(best.startMs)} gives the most sunlight, ${sunTime(best)} of ${days}, with a night of ${fmtDurationWords(best.longestDarkH)}`
    if (!selected || sameStay) return lead + tail('')
    if (selected.sunShare >= best.sunShare - CLOSE) return `${lead}; the selected time is as good.`
    if (selected.sunShare === 0) return `${lead}; at the selected time the whole stay would be dark.`
    const night = selected.longestDarkH > 0 ? ` and a night of ${fmtDurationWords(selected.longestDarkH)}` : ''
    return `${lead}; at the selected time you would get ${sunTime(selected)}${night}.`
  }

  const lead =
    best.sunShare === 0
      ? `Landing ${fmtDay(best.startMs)} gives ${days} days without direct sunlight`
      : `Landing ${fmtDay(best.startMs)} is the darkest stay, sunlit for ${sunTime(best)} of ${days}`
  if (!selected || sameStay) return lead + tail('')
  if (selected.sunShare <= best.sunShare + CLOSE) return `${lead}; the selected time is as good.`
  return `${lead}; at the selected time the site would be sunlit for ${sunTime(selected)}.`
}
