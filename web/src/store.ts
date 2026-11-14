import { create } from 'zustand'

export type LayerMode = 'natural' | 'elevation' | 'slope'

export interface Pin {
  id: number
  lat: number
  lon: number
  hM: number
  label: string
}

interface State {
  /** current simulated UTC time, ms since epoch */
  tMs: number
  playing: boolean
  /** simulated seconds per real second */
  rate: number
  layer: LayerMode
  pins: Pin[]
  activePin: number | null
  setTime: (t: number) => void
  setPlaying: (p: boolean) => void
  setRate: (r: number) => void
  setLayer: (l: LayerMode) => void
  addPin: (p: Omit<Pin, 'id' | 'label'> & { label?: string }) => void
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
  pins: [],
  activePin: null,
  setTime: (tMs) => set({ tMs }),
  setPlaying: (playing) => set({ playing }),
  setRate: (rate) => set({ rate }),
  setLayer: (layer) => set({ layer }),
  addPin: (p) =>
    set((s) => {
      const id = nextId++
      const pin: Pin = { ...p, id, label: p.label ?? `Point ${String.fromCharCode(64 + ((id - 1) % 26) + 1)}` }
      // Keep the most recent pins so comparison stays readable.
      const pins = [...s.pins, pin].slice(-MAX_PINS)
      return { pins, activePin: id }
    }),
  removePin: (id) =>
    set((s) => {
      const pins = s.pins.filter((p) => p.id !== id)
      return { pins, activePin: s.activePin === id ? (pins.at(-1)?.id ?? null) : s.activePin }
    }),
  setActivePin: (activePin) => set({ activePin }),
}))
