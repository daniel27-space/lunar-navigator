// The plain sentences above the "When to land" grid, composed from lib/landing.ts stats. They
// follow the same rule as the ranking and the grid: sunlight and Earth view both count, and two
// stays are only called "as good" when no row of the grid differs by its threshold.
import { fmtDay, fmtDurationWords, fmtShare, fmtTick } from '../lib/format'
import { fitScore, type Wants, type WindowStats } from '../lib/landing'

const FULL = 0.9995
/** Smallest differences that count, as in the grid: 3 points of share, 12 hours of duration. */
const SHARE_PTS = 3
const DURATION_H = 12

/** Sunlit time of a stay in words, e.g. "6.0 days". */
const sunTime = (w: WindowStats) => fmtDurationWords(w.sunShare * w.days * 24)

const list = (parts: string[]) => (parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`)

function differs(a: WindowStats, b: WindowStats) {
  return {
    sun: Math.abs(a.sunShare - b.sunShare) * 100 >= SHARE_PTS || Math.abs(a.longestDarkH - b.longestDarkH) >= DURATION_H,
    earth: Math.abs(a.commShare - b.commShare) * 100 >= SHARE_PTS || Math.abs(a.longestNoCommH - b.longestNoCommH) >= DURATION_H,
  }
}

/**
 * The best-ranked stay against landing at the selected time. `everLit` is false when the site
 * gets no sunlight at all in the period checked.
 */
export function landingSentence(best: WindowStats | null, selected: WindowStats | null, days: number, wants: Wants, everLit = true): string {
  if (!best) return `There is not enough data ahead to check a ${days}-day stay.`
  const d = fmtDay(best.startMs)
  let lead: string
  if (!everLit) lead = `No ${days}-day stay in the period checked gets any sunlight here`
  else if (wants.sunHigh)
    lead =
      best.sunShare >= FULL
        ? `Landing ${d} gives ${days} days of unbroken sunlight`
        : best.sunShare === 0
          ? `The best-ranked stay, landing ${d}, gets no sunlight`
          : `Landing ${d} ranks best, with ${sunTime(best)} of sunlight in ${days} and a night of ${fmtDurationWords(best.longestDarkH)}`
  else lead = best.sunShare === 0 ? `Landing ${d} gives ${days} days without direct sunlight` : `Landing ${d} ranks best, sunlit for ${sunTime(best)} of ${days} days`

  if (!selected) return `${lead}; the selected time is outside the period that can be checked.`
  if (Math.abs(selected.startMs - best.startMs) < 6 * 3600000) return `${lead}. That is the selected time.`

  const diff = differs(best, selected)
  if (!diff.sun && !diff.earth && Math.abs(fitScore(best, wants) - fitScore(selected, wants)) < 0.03) return `${lead}; the selected time is as good.`

  const gap =
    Math.abs(best.longestNoCommH - selected.longestNoCommH) >= DURATION_H
      ? ` (longest gap ${fmtDurationWords(best.longestNoCommH)} against ${fmtDurationWords(selected.longestNoCommH)})`
      : ''
  const better = wants.earthHigh ? best.commShare > selected.commShare : best.commShare < selected.commShare
  const earth = `landing ${d} ${better && wants.earthHigh ? 'keeps' : 'has'} Earth in view ${fmtShare(best.commShare)} of the stay against ${fmtShare(selected.commShare)} at the selected time${gap}`

  if (!diff.sun) {
    if (!everLit) return `${lead}; ${earth}.`
    const same =
      best.sunShare === 0 && selected.sunShare === 0
        ? 'Both stays get no direct sunlight'
        : best.sunShare >= FULL && selected.sunShare >= FULL
          ? 'Both stays are sunlit throughout'
          : `Both stays get about ${sunTime(best)} of sunlight`
    return `${same}, but ${earth}.`
  }

  let sun: string
  if (!wants.sunHigh) sun = `at the selected time the site would be sunlit for ${sunTime(selected)}`
  else if (selected.sunShare === 0) sun = 'at the selected time the whole stay would be dark'
  else sun = `at the selected time you would get ${sunTime(selected)}${selected.longestDarkH > 0 ? ` and a night of ${fmtDurationWords(selected.longestDarkH)}` : ''}`
  const also = diff.earth ? ` Earth is in view ${fmtShare(best.commShare)} of that stay against ${fmtShare(selected.commShare)} at the selected time${gap}.` : ''
  return `${lead}; ${sun}.${also}`
}

/**
 * A schedule slip in one sentence: what landing at the selected time keeps, gains and loses
 * against the baseline date kept earlier.
 */
export function slipSentence(baseline: WindowStats | null, selected: WindowStats | null, wants: Wants): string {
  if (!baseline) return 'The baseline date is outside the period shown, so it cannot be compared.'
  if (!selected) return 'The selected time is outside the period that can be checked against the baseline.'
  if (Math.abs(selected.startMs - baseline.startMs) < 3600000)
    return `The selected time is the baseline: sunlight ${fmtShare(baseline.sunShare)}, Earth view ${fmtShare(baseline.commShare)}. Move the clock to see what a slip costs.`
  const keeps: string[] = []
  const gains: string[] = []
  const losses: string[] = []
  const share = (name: string, a: number, b: number, wantHigh: boolean) => {
    if (Math.abs(a - b) * 100 < SHARE_PTS) keeps.push(`keeps ${name} at ${fmtShare(b)}`)
    else (b > a === wantHigh ? gains : losses).push(`${b > a ? 'raises' : 'cuts'} ${name} from ${fmtShare(a)} to ${fmtShare(b)}`)
  }
  const duration = (name: string, a: number, b: number, wantLong: boolean) => {
    if (Math.abs(a - b) < DURATION_H) return
    ;(b > a === wantLong ? gains : losses).push(`${b > a ? 'lengthens' : 'shortens'} the ${name} from ${fmtDurationWords(a)} to ${fmtDurationWords(b)}`)
  }
  share('sunlight', baseline.sunShare, selected.sunShare, wants.sunHigh)
  duration('longest night', baseline.longestDarkH, selected.longestDarkH, !wants.sunHigh)
  share('Earth view', baseline.commShare, selected.commShare, wants.earthHigh)
  duration('longest Earth gap', baseline.longestNoCommH, selected.longestNoCommH, !wants.earthHigh)
  const sameYear = new Date(baseline.startMs).getUTCFullYear() === new Date(selected.startMs).getUTCFullYear()
  const date = sameYear ? fmtTick : fmtDay
  const head = `${selected.startMs > baseline.startMs ? 'Slipping' : 'Moving earlier,'} from ${date(baseline.startMs)} to ${date(selected.startMs)}`
  const good = [...keeps, ...gains]
  if (losses.length === 0) return `${head} ${list(good)}.`
  if (good.length === 0) return `${head} ${list(losses)}.`
  return `${head} ${list(good)} but ${list(losses)}.`
}
