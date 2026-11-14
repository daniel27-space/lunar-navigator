// Small shared controls (docs/DESIGN.md section 5): site badge, segmented control, sliders.
import type { CSSProperties, ReactNode } from 'react'

/** Colours that have to be known outside CSS (canvas textures for the 3D markers). */
export const INK = '#eceef2' // --accent
export const ON_ACCENT = '#0b0c0f' // --on-accent

export const SITE_LETTERS = ['A', 'B', 'C']

/** The one way a pinned site is identified in panels: its letter on its colour. */
export function Badge({ slot }: { slot: number }) {
  return (
    <i className="badge" data-slot={slot} role="img" aria-label={`Site ${SITE_LETTERS[slot]}`}>
      {SITE_LETTERS[slot]}
    </i>
  )
}

interface SegmentedProps<T extends string | number> {
  options: readonly (readonly [value: T, label: ReactNode, title?: string])[]
  value: T | null
  onChange: (v: T) => void
  label: string
  className?: string
}

export function Segmented<T extends string | number>({ options, value, onChange, label, className = '' }: SegmentedProps<T>) {
  return (
    <div className={`seg ${className}`} role="group" aria-label={label}>
      {options.map(([v, text, title]) => (
        <button key={String(v)} type="button" aria-pressed={v === value} title={title} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  )
}

interface SliderProps {
  label: string
  /** the current value as text, shown at the right of the label row */
  text: string
  min: number
  max: number
  step: number
  value: number
  onChange: (v: number) => void
}

export function Slider({ label, text, min, max, step, value, onChange }: SliderProps) {
  const p = ((value - min) / (max - min)) * 100
  return (
    <label className="field">
      <span className="field-head">
        <span>{label}</span>
        <b>{text}</b>
      </span>
      <input
        className="slider"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ '--p': `${p}%` } as CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  )
}

interface RangeProps {
  label: string
  text: string
  /** both 0..1 */
  lo: number
  hi: number
  onLo: (v: number) => void
  onHi: (v: number) => void
}

/** One track with two thumbs: the allowed range of a share of time. */
export function RangeSlider({ label, text, lo, hi, onLo, onHi }: RangeProps) {
  // When the thumbs sit on top of each other at the right end, the lower one must stay reachable.
  const loOnTop = lo === hi && hi >= 1
  return (
    <div className="field">
      <span className="field-head">
        <span>{label}</span>
        <b>{text}</b>
      </span>
      <div className="range2" style={{ '--lo': `${lo * 100}%`, '--hi': `${hi * 100}%` } as CSSProperties}>
        <input
          className="slider"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={lo}
          style={{ zIndex: loOnTop ? 2 : 1 }}
          aria-label={`${label}, at least`}
          onChange={(e) => onLo(Math.min(Number(e.target.value), hi))}
        />
        <input
          className="slider"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={hi}
          style={{ zIndex: loOnTop ? 1 : 2 }}
          aria-label={`${label}, at most`}
          onChange={(e) => onHi(Math.max(Number(e.target.value), lo))}
        />
      </div>
    </div>
  )
}
