import { create } from 'zustand'
import { PRESETS, type FinderCriteria } from './lib/finder'

export type LayerMode = 'natural' | 'elevation' | 'slope' | 'sunavg' | 'earthavg' | 'psr' | 'finder'

/** One colour per pinned site, used everywhere that site appears. */
export const SITE_COLORS = ['#b79bff', '#5fd38d', '#ff8f6b']

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
  setTime: (t: number) => void
  setPlaying: (p: boolean) => void
  setRate: (r: number) => void
  setLayer: (l: LayerMode) => void
  addPin: (p: Omit<Pin, 'id' | 'label' | 'slot'> & { label?: string }) => void
  removePin: (id: number) => void
  setActivePin: (id: number | null) => void
}

const MAX_PINS = 3
let nextId = 1

export const useStore = create<State>((set) => ({
  tMs: Date.now(),
  playing: false,
  rate: 6 * 3600,
  layer: 'natural',
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
  setTime: (tMs) => set({ tMs }),
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
}))
