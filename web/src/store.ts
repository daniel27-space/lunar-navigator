import { create } from 'zustand'
import { PRESETS, type FinderCriteria } from './lib/finder'

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
  if (matchMedia('(pointer: coarse)').matches || window.innerWidth < 760) return 'low'
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
  goTo: (v: { kind: 'pole' } | { kind: 'globe'; lat?: number; lon?: number } | { kind: 'site'; lat: number; lon: number; hM: number }) => void
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
}

const MAX_PINS = 3
let nextId = 1

export const useStore = create<State>((set) => ({
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
      return { pins, activePin: id }
    }),
  removePin: (id) =>
    set((s) => {
      const pins = s.pins.filter((p) => p.id !== id)
      return { pins, activePin: s.activePin === id ? (pins.at(-1)?.id ?? null) : s.activePin }
    }),
  setActivePin: (activePin) => set({ activePin }),
  sheet: 'peek',
  setSheet: (sheet) => set({ sheet }),
  tab: 'sites',
  setTab: (tab) => set({ tab }),
  fromFinder: {},
  markFromFinder: (id) => set((s) => ({ fromFinder: { ...s.fromFinder, [id]: true } })),
}))
