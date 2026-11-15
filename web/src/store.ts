import { useMemo } from 'react'
import { create } from 'zustand'
import { DEFAULT_ASSUMPTIONS, type Assumptions } from './lib/assumptions'
import { PRESETS, type FinderCriteria } from './lib/finder'
import type { Criteria } from './lib/windows'

export type LayerMode = 'natural' | 'elevation' | 'slope' | 'sunavg' | 'earthavg' | 'psr' | 'finder'

/**
 * How much detail the 3D view draws. It changes only the picture (sharpness, shadow steps,
 * mesh density), never the numbers on the cards.
 */
export type Quality = 'low' | 'medium' | 'high'
export interface Detail {
  /** cap on device pixels per CSS pixel */
  dpr: number
  /** shadow ray-march steps per pixel and their growth factor (fewer, longer steps reach as far) */
  steps: number
  growth: number
  /** quads per side of the south-pole mesh */
  grid: number
  globe: [number, number]
  /** draw the fine south-pole tile at half resolution (a quarter of the video memory) */
  halfFine: boolean
}
export const DETAIL: Record<Quality, Detail> = {
  low: { dpr: 1, steps: 48, growth: 1.2, grid: 384, globe: [384, 192], halfFine: true },
  medium: { dpr: 1.5, steps: 80, growth: 1.125, grid: 512, globe: [768, 384], halfFine: false },
  high: { dpr: 2, steps: 120, growth: 1.08, grid: 768, globe: [1024, 512], halfFine: false },
}

/** True on touch-first devices (phones, tablets): chooses the starting detail level and the wording of gestures. */
export const coarsePointer = () => typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches
const narrowScreen = () => typeof matchMedia !== 'undefined' && matchMedia('(max-width: 760px)').matches

const QUALITY_KEY = 'lunar-navigator.quality'
function initialQuality(): Quality {
  try {
    const saved = localStorage.getItem(QUALITY_KEY)
    if (saved === 'low' || saved === 'medium' || saved === 'high') return saved
  } catch {
    // storage can be blocked; fall through to a guess
  }
  if (typeof window === 'undefined' || typeof matchMedia === 'undefined') return 'high'
  // Phones and tablets start low; small laptops in the middle.
  if (coarsePointer() || window.innerWidth < 760) return 'low'
  const cores = navigator.hardwareConcurrency ?? 8
  const memory = (navigator as { deviceMemory?: number }).deviceMemory ?? 8
  return cores <= 4 || memory <= 4 ? 'medium' : 'high'
}

/** One colour per pinned site (A, B, C), used for its 3D marker; panels use the CSS tokens --site-a/b/c. */
export const SITE_COLORS = ['#6afbcb', '#826afb', '#cb4dcb']

/** Phone layout: how far the bottom sheet is pulled up, and which panel it shows. */
export type SheetState = 'peek' | 'half' | 'full'
export type PanelTab = 'find' | 'sites'

/** Where the camera should go. `seq` changes on every request so repeats still animate. */
export type ViewGoal =
  | { kind: 'pole'; seq: number }
  | { kind: 'globe'; seq: number; lat?: number; lon?: number }
  | { kind: 'site'; seq: number; lat: number; lon: number; hM: number }
  /** closer and lower than 'site': the last leg down to a mission's ground-level view */
  | { kind: 'approach'; seq: number; lat: number; lon: number; hM: number }

/** A camera request without its sequence number. */
export type ViewRequest =
  | { kind: 'pole' }
  | { kind: 'globe'; lat?: number; lon?: number }
  | { kind: 'site'; lat: number; lon: number; hM: number }
  | { kind: 'approach'; lat: number; lon: number; hM: number }

/**
 * Steps of the mission view: the normal flight to the site, the approach down to it, the
 * ground-level scene, and leaving it again. 'request' asks for it from a site card.
 */
export type ShowcasePhase = 'flight' | 'request' | 'approach' | 'ground' | 'leaving'

/** What the ground-level scene needs from the site's analysis: the sky bodies and the terrain skyline. */
export interface ShowcaseSky {
  pinId: number
  sun: { az: number; el: number; radius: number; up: boolean }
  earth: { az: number; el: number; radius: number }
  /** terrain skyline in degrees above level, one value per `azStepDeg` clockwise from north */
  horizon: Float32Array
  azStepDeg: number
}

export interface Pin {
  id: number
  lat: number
  lon: number
  hM: number
  label: string
  /** which of the three site colours this pin holds */
  slot: number
}

interface State {
  /** current simulated UTC time, ms since epoch */
  tMs: number
  playing: boolean
  /** simulated seconds per real second */
  rate: number
  layer: LayerMode
  quality: Quality
  setQuality: (q: Quality) => void
  /** site finder: what the user needs from a site, and the preset it came from ('custom' once edited) */
  finder: FinderCriteria
  preset: string
  setFinder: (f: Partial<FinderCriteria>) => void
  applyPreset: (id: string) => void
  /** start of the 60-day analysis window shared by every site card and the comparison */
  windowStart: number
  setWindowStart: (t: number) => void
  pins: Pin[]
  activePin: number | null
  view: ViewGoal
  goTo: (v: ViewRequest) => void
  /** set by the camera rig: the `seq` of the last camera move that finished */
  arrivedSeq: number
  setArrived: (seq: number) => void
  /** dates the clock may take: the ephemeris, less room for the 60-day analysis window; null until loaded */
  timeRange: [number, number] | null
  setTimeRange: (r: [number, number]) => void
  setTime: (t: number) => void
  setPlaying: (p: boolean) => void
  setRate: (r: number) => void
  setLayer: (l: LayerMode) => void
  addPin: (p: Omit<Pin, 'id' | 'label' | 'slot'> & { label?: string }) => void
  removePin: (id: number) => void
  setActivePin: (id: number | null) => void
  /** interface only: bottom sheet height (phone) and the panel in view (phone and tablet) */
  sheet: SheetState
  setSheet: (s: SheetState) => void
  tab: PanelTab
  setTab: (t: PanelTab) => void
  /** interface only: ids of pins that came from the finder's shortlist (their card opens on "When to land") */
  fromFinder: Record<number, true>
  markFromFinder: (id: number) => void
  /** interface only: the pin whose "When to land" should be brought into view (a single shortlist pick) */
  landingFocus: number | null
  focusLanding: (id: number | null) => void
  /**
   * interface only: what the last pin(s) pushed out, so the notice can name it and Undo can put
   * it back. Cleared by Undo, by dismissing the notice, or by the next pin that replaces nothing.
   */
  replaced: Replaced | null
  undoReplace: () => void
  dismissReplace: () => void
  /** interface only: per pin id, a landing time kept as the baseline for a schedule slip */
  baselines: Record<number, number>
  setBaseline: (pinId: number, tMs: number | null) => void
  /** interface only: the mission whose showcase is open (its id), and which pin stands for which mission */
  showcase: string | null
  /** where the mission view is in its sequence; null when it is not in use */
  showcasePhase: ShowcasePhase | null
  /** the camera request the sequence is waiting on or last made (any other request cancels the sequence) */
  showcaseSeq: number
  /** where the camera returns to when the mission view closes */
  showcaseHome: ViewRequest | null
  /** start the sequence for a mission: 'flight' right after a pick (the camera is on its way), 'request' from a card */
  startShowcase: (missionId: string, phase: 'flight' | 'request') => void
  setShowcase: (p: Partial<Pick<State, 'showcase' | 'showcasePhase' | 'showcaseSeq' | 'showcaseHome'>>) => void
  /** true once the ground-level scene has been shown in this opening (it then fades out when leaving) */
  showcaseUp: boolean
  /** ask to close: the scene dollies back and fades while the camera rises; during the flight in, the sequence just stops */
  closeShowcase: () => void
  /**
   * A pick made while a mission view is open or opening (another mission, a place, South Pole...):
   * it waits here until the view has closed and the camera is back up, then runs. Only the latest is kept.
   */
  afterShowcase: (() => void) | null
  /** run `go` now, or, if a mission view is open or opening, close the view first and run it afterwards */
  whenShowcaseClosed: (go: () => void) => void
  pinMission: Record<number, string>
  linkMission: (pinId: number, missionId: string) => void
  /** interface only: the Sun at the showcased mission's pin, taken from its site analysis for the model's light */
  showcaseSky: ShowcaseSky | null
  setShowcaseSky: (s: ShowcaseSky | null) => void
  /**
   * The planner's assumptions (lib/assumptions.ts): what counts as sunlit and as Earth in view,
   * and the height of the panel and antenna. Every card, comparison and landing-date figure
   * follows them; the site finder does not.
   */
  criteria: Criteria
  observerM: number
  setAssumptions: (a: Partial<Criteria> & { observerM?: number }) => void
  resetAssumptions: () => void
  /** interface only: the Assumptions section of the sites panel is open */
  assumeOpen: boolean
  setAssumeOpen: (open: boolean) => void
  /** interface only: the first-use guide is showing */
  help: boolean
  /** counts each opening of the guide, so opening it again starts it afresh */
  helpSeq: number
  setHelp: (on: boolean) => void
  /** interface only: the guide that is running and its step (0 is the first-visit welcome; past the last step is the finish), or null */
  /** interface only: the welcome cards are up (they also cover the app while its data loads) */
  welcome: boolean
  setWelcome: (on: boolean) => void
  mode: Mode
  setMode: (mode: Mode) => void
  tour: { guide: string; step: number } | null
  setTour: (tour: { guide: string; step: number } | null) => void
}

export interface Replaced {
  removed: Pin[]
  /** ids of the pins that took their places */
  added: number[]
  at: number
}

// Every load is treated as a new visitor: the welcome cards always show. The one exception is
// this key, which only the automated screen checks set, so they can go straight to the app.
const HELP_KEY = 'lunar-navigator.intro-seen'
function firstVisit(): boolean {
  try {
    return localStorage.getItem(HELP_KEY) === null
  } catch {
    return true
  }
}

/** Who the app is laid out for: someone exploring, or someone planning a mission. Same data either way. */
export type Mode = 'explore' | 'plan'

/** Kept for callers; nothing is remembered between visits any more (every load starts with the welcome). */
export function rememberIntroSeen() {}

/** The current assumptions as one object (for captions and the export). */
export const assumptionsOf = (s: { criteria: Criteria; observerM: number }): Assumptions => ({ criteria: s.criteria, observerM: s.observerM })

const MAX_PINS = 3
let nextId = 1

export const useStore = create<State>((set, get) => ({
  tMs: Date.now(),
  playing: false,
  rate: 6 * 3600,
  layer: 'natural',
  quality: initialQuality(),
  setQuality: (quality) => {
    try {
      localStorage.setItem(QUALITY_KEY, quality)
    } catch {
      // not saved; the choice still applies for this visit
    }
    set({ quality })
  },
  finder: PRESETS[0].criteria,
  preset: PRESETS[0].id,
  setFinder: (f) => set((s) => ({ finder: { ...s.finder, ...f }, preset: 'custom' })),
  applyPreset: (id) =>
    set((s) => {
      const p = PRESETS.find((x) => x.id === id)
      return p ? { finder: p.criteria, preset: id } : s
    }),
  windowStart: Math.floor(Date.now() / 3600000) * 3600000 - 2 * 86400000,
  setWindowStart: (windowStart) => set({ windowStart }),
  pins: [],
  activePin: null,
  view: { kind: 'pole', seq: 0 },
  goTo: (v) => set((s) => ({ view: { ...v, seq: s.view.seq + 1 } as ViewGoal })),
  arrivedSeq: 0,
  setArrived: (arrivedSeq) => set({ arrivedSeq }),
  timeRange: null,
  setTimeRange: (timeRange) => set((s) => ({ timeRange, tMs: Math.min(Math.max(s.tMs, timeRange[0]), timeRange[1]) })),
  // A date outside the supported range is pulled back to its nearest end, never used as is:
  // beyond the ephemeris there are no Sun and Earth positions to compute from.
  setTime: (t) => set((s) => ({ tMs: s.timeRange ? Math.min(Math.max(t, s.timeRange[0]), s.timeRange[1]) : t })),
  setPlaying: (playing) => set({ playing }),
  setRate: (rate) => set({ rate }),
  setLayer: (layer) => set({ layer }),
  addPin: (p) =>
    set((s) => {
      const id = nextId++
      // Keep the most recent pins so comparison stays readable; the new pin takes a free colour.
      const kept = s.pins.slice(-(MAX_PINS - 1))
      const slot = [0, 1, 2].find((k) => !kept.some((q) => q.slot === k)) ?? 0
      const pin: Pin = { ...p, id, slot, label: p.label ?? `Point ${String.fromCharCode(64 + ((id - 1) % 26) + 1)}` }
      const pins = [...kept, pin]
      // Remember what was pushed out. Pins added in one go (Compare top 3) share one record.
      const out = s.pins.slice(0, s.pins.length - kept.length)
      const now = Date.now()
      const batch = s.replaced && now - s.replaced.at < 250 ? s.replaced : null
      const replaced: Replaced | null = out.length
        ? { removed: [...(batch?.removed ?? []), ...out.filter((q) => !batch?.added.includes(q.id))], added: [...(batch?.added ?? []).filter((a) => !out.some((q) => q.id === a)), id], at: now }
        : batch
          ? { ...batch, added: [...batch.added, id], at: now }
          : null
      return { pins, activePin: id, replaced: replaced && replaced.removed.length ? replaced : null }
    }),
  removePin: (id) =>
    set((s) => {
      const pins = s.pins.filter((p) => p.id !== id)
      return { pins, activePin: s.activePin === id ? (pins.at(-1)?.id ?? null) : s.activePin, replaced: s.replaced?.added.includes(id) ? null : s.replaced }
    }),
  setActivePin: (activePin) => set({ activePin }),
  // A first visit on a phone opens the sheet far enough to show the start card's actions.
  sheet: firstVisit() && narrowScreen() ? 'half' : 'peek',
  setSheet: (sheet) => set({ sheet }),
  tab: 'sites',
  setTab: (tab) => set({ tab }),
  fromFinder: {},
  markFromFinder: (id) => set((s) => ({ fromFinder: { ...s.fromFinder, [id]: true } })),
  landingFocus: null,
  focusLanding: (landingFocus) => set({ landingFocus }),
  replaced: null,
  undoReplace: () =>
    set((s) => {
      if (!s.replaced) return s
      const { removed, added } = s.replaced
      // The removed pins come back with their own id, colour and label; the newcomers go.
      const pins = [...removed, ...s.pins.filter((p) => !added.includes(p.id) && !removed.some((r) => r.id === p.id))].slice(-MAX_PINS)
      return { pins, activePin: pins.at(-1)?.id ?? null, replaced: null }
    }),
  dismissReplace: () => set({ replaced: null }),
  baselines: {},
  setBaseline: (pinId, tMs) =>
    set((s) => {
      const baselines = { ...s.baselines }
      if (tMs === null) delete baselines[pinId]
      else baselines[pinId] = tMs
      return { baselines }
    }),
  showcase: null,
  showcasePhase: null,
  showcaseSeq: 0,
  showcaseHome: null,
  startShowcase: (showcase, showcasePhase) => set((s) => ({ showcase, showcasePhase, showcaseSeq: s.view.seq, tab: 'sites' })),
  setShowcase: (p) => set(p.showcasePhase === 'ground' ? { ...p, showcaseUp: true } : p.showcasePhase === null ? { ...p, showcaseUp: false } : p),
  showcaseUp: false,
  // From the ground scene or the approach down to it, closing plays the way out; earlier, the camera
  // is still on its normal flight and the sequence just stops.
  closeShowcase: () =>
    set((s) =>
      s.showcasePhase === 'ground' || s.showcasePhase === 'approach'
        ? { showcasePhase: 'leaving' }
        : s.showcasePhase === 'leaving'
          ? s
          : { showcase: null, showcasePhase: null, showcaseUp: false },
    ),
  afterShowcase: null,
  whenShowcaseClosed: (go) => {
    const s = get()
    const open = s.showcasePhase === 'approach' || s.showcasePhase === 'ground' || s.showcasePhase === 'leaving'
    // Nothing to close and nothing already waiting: go at once.
    if (!open && !s.afterShowcase) return go()
    set({ afterShowcase: go })
    if (open) get().closeShowcase()
  },
  pinMission: {},
  linkMission: (pinId, missionId) => set((s) => ({ pinMission: { ...s.pinMission, [pinId]: missionId } })),
  showcaseSky: null,
  setShowcaseSky: (showcaseSky) => set({ showcaseSky }),
  criteria: DEFAULT_ASSUMPTIONS.criteria,
  observerM: DEFAULT_ASSUMPTIONS.observerM,
  setAssumptions: ({ observerM, ...c }) => set((s) => ({ criteria: { ...s.criteria, ...c }, observerM: observerM ?? s.observerM })),
  resetAssumptions: () => set({ criteria: DEFAULT_ASSUMPTIONS.criteria, observerM: DEFAULT_ASSUMPTIONS.observerM }),
  assumeOpen: false,
  setAssumeOpen: (assumeOpen) => set({ assumeOpen }),
  // A first visit opens with the tour; the start card is what Help (or skipping the tour) shows.
  help: false,
  tour: null,
  welcome: firstVisit(),
  setWelcome: (welcome) => set({ welcome }),
  mode: 'plan',
  setMode: (mode) => set({ mode }),
  setTour: (tour) => {
    if (tour === null) rememberIntroSeen()
    set({ tour })
  },
  helpSeq: 0,
  setHelp: (help) => {
    if (!help) rememberIntroSeen()
    set((s) => ({ help, helpSeq: help ? s.helpSeq + 1 : s.helpSeq }))
  },
}))

/** The current assumptions as one stable object (for captions and the export). */
export function useAssumptions(): Assumptions {
  const criteria = useStore((s) => s.criteria)
  const observerM = useStore((s) => s.observerM)
  return useMemo(() => ({ criteria, observerM }), [criteria, observerM])
}
