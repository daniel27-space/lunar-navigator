// The time bar's date and time editor: a small panel in the app's own style (never the
// browser's date picker). It opens only when the date button is pressed and stays open while
// the clock plays. Typed fields are a draft until "Set" or Enter; the step buttons and "Now"
// apply at once; Escape or a press outside closes it without applying the draft.
import { useEffect, useRef, useState } from 'react'
import { clampTime, commitFields, fieldsOf, stepTime, STEPS, type DateFields, type Range } from '../lib/dateEntry'
import { fmtDateTime, fmtDay, MINUS } from '../lib/format'
import { coarsePointer, useStore } from '../store'

const FIELDS: readonly (readonly [keyof DateFields, string, number])[] = [
  ['year', 'Year', 4],
  ['month', 'Month', 2],
  ['day', 'Day', 2],
  ['hour', 'Hour', 2],
  ['minute', 'Minute', 2],
]

interface Props {
  range: Range
  /** called after any time has been set, so the time bar can centre its slider there */
  onSet: (tMs: number) => void
  onClose: () => void
}

export function DateEditor({ range, onSet, onClose }: Props) {
  const tMs = useStore((s) => s.tMs)
  const setTime = useStore((s) => s.setTime)
  // The fields follow the clock until one is typed in; from then on they are the user's draft.
  const [draft, setDraft] = useState<DateFields | null>(null)
  const fields = draft ?? fieldsOf(tMs)
  const [error, setError] = useState<{ field: keyof DateFields; text: string } | null>(null)
  // The end of the range the last request was pulled back to; the note shows while the clock is still there.
  const [clampedTo, setClampedTo] = useState<number | null>(null)
  const box = useRef<HTMLFormElement>(null)

  // A press anywhere outside closes the editor (the date button itself toggles it, so it is left alone).
  useEffect(() => {
    const outside = (e: PointerEvent) => {
      const t = e.target as Element | null
      if (t && !box.current?.contains(t) && !t.closest?.('.timebar .date')) onClose()
    }
    document.addEventListener('pointerdown', outside, true)
    return () => document.removeEventListener('pointerdown', outside, true)
  }, [onClose])
  // With a keyboard at hand, typing can start at once; on touch the keyboard stays down until a field is tapped.
  useEffect(() => {
    if (!coarsePointer()) box.current?.querySelector('input')?.select()
  }, [])

  const apply = (c: { tMs: number; clamped: boolean }) => {
    setTime(c.tMs)
    onSet(c.tMs)
    setClampedTo(c.clamped ? c.tMs : null)
    setDraft(null)
    setError(null)
  }
  const set = () => {
    const c = commitFields(fields, range)
    if (c.ok) apply(c)
    else {
      setError({ field: c.field, text: c.error })
      box.current?.querySelector<HTMLInputElement>(`input[name="${c.field}"]`)?.select()
    }
  }

  return (
    <form
      ref={box}
      className="date-editor panel-surface"
      role="dialog"
      aria-label="Set the date and time (UTC)"
      onSubmit={(e) => {
        e.preventDefault()
        set()
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return
        e.stopPropagation()
        onClose()
      }}
    >
      <header>
        <h2>
          <span className="caption">Clock, UTC</span>
          <b>{fmtDateTime(tMs).replace(' UTC', '')}</b>
        </h2>
        <button type="button" className="btn ghost icon" aria-label="Close the date editor" onClick={onClose}>
          ×
        </button>
      </header>

      <div className="de-fields">
        {FIELDS.map(([name, label, digits]) => (
          <label key={name}>
            <span>{label}</span>
            <input
              name={name}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              maxLength={digits}
              value={fields[name]}
              aria-invalid={error?.field === name}
              onFocus={(e) => e.target.select()}
              onChange={(e) => {
                setDraft({ ...fields, [name]: e.target.value.replace(/\D/g, '') })
                setError(null)
              }}
            />
          </label>
        ))}
        <button type="submit" className="btn primary">
          Set
        </button>
      </div>
      {error && (
        <p className="caption de-note" role="alert">
          <i className="dot danger" /> {error.text}
        </p>
      )}

      <div className="de-steps" role="group" aria-label="Move the clock by">
        {[-1, 1].map((sign) =>
          STEPS.map(([label, ms]) => (
            <button
              key={sign * ms}
              type="button"
              className="btn"
              aria-label={`${sign < 0 ? 'Back' : 'Forward'} ${label.replace(' h', ' hour').replace(' d', label === '1 d' ? ' day' : ' days')}`}
              disabled={sign < 0 ? tMs <= range[0] : tMs >= range[1]}
              onClick={() => apply(stepTime(tMs, sign * ms, range))}
            >
              {sign < 0 ? MINUS : '+'}
              {label}
            </button>
          )),
        )}
      </div>

      <div className="de-foot">
        <p className="caption">
          Sun and Earth positions cover {fmtDay(range[0])} to {fmtDay(range[1])}.
        </p>
        <button type="button" className="btn" onClick={() => apply(clampTime(Math.floor(Date.now() / 60000) * 60000, range))}>
          Now
        </button>
      </div>
      {clampedTo !== null && tMs === clampedTo && (
        <p className="caption de-note" role="status">
          <i className="dot warn" /> That is outside the dates covered, so the clock was set to the nearest end.
        </p>
      )}
    </form>
  )
}
