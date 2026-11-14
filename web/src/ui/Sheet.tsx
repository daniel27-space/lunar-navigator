// Phone layout: the head of the single bottom sheet (drag handle, Find | Sites switch, minimise)
// and the Find | Sites switch reused in the tablet header. The sheet's heights are in App.css;
// this file only decides which of peek / half / full it is in.
import { useEffect, useRef } from 'react'
import { useStore, type PanelTab, type SheetState } from '../store'
import { Segmented } from './controls'

const ORDER: SheetState[] = ['peek', 'half', 'full']

export const isPhone = () => typeof matchMedia !== 'undefined' && matchMedia('(max-width: 760px)').matches

/** Sheet heights in px for the current window: peek, half, full (the same numbers as App.css). */
function snapHeights(): number[] {
  const peek = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sheet-peek')) || 120
  return [peek, window.innerHeight * 0.5, window.innerHeight * 0.88]
}

const TABS: readonly (readonly [PanelTab, string])[] = [
  ['find', 'Find'],
  ['sites', 'Sites'],
]

export function TabSwitch({ finderOn, className }: { finderOn: boolean; className?: string }) {
  const tab = useStore((s) => s.tab)
  const setTab = useStore((s) => s.setTab)
  const setLayer = useStore((s) => s.setLayer)
  const sheet = useStore((s) => s.sheet)
  const setSheet = useStore((s) => s.setSheet)
  return (
    <Segmented
      className={className}
      label="Panel"
      options={TABS}
      value={finderOn && tab === 'find' ? 'find' : 'sites'}
      onChange={(v) => {
        setTab(v)
        if (v === 'find' && !finderOn) setLayer('finder')
        if (isPhone() && sheet === 'peek') setSheet('half')
      }}
    />
  )
}

/** Opens a peeking sheet when its content is tapped. */
export function useExpandOnTap() {
  const sheet = useStore((s) => s.sheet)
  const setSheet = useStore((s) => s.setSheet)
  return () => {
    if (sheet === 'peek' && isPhone()) setSheet('half')
  }
}

export function SheetHead({ finderOn }: { finderOn: boolean }) {
  const sheet = useStore((s) => s.sheet)
  const setSheet = useStore((s) => s.setSheet)
  const drag = useRef<{ y: number; h: number; moved: boolean; el: HTMLElement } | null>(null)
  const cycle = () => setSheet(ORDER[(ORDER.indexOf(sheet) + 1) % ORDER.length])

  // The browser's Back gesture collapses an open sheet instead of leaving the page.
  const pushed = useRef(false)
  useEffect(() => {
    const onPop = () => {
      pushed.current = false
      setSheet('peek')
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [setSheet])
  useEffect(() => {
    if (sheet !== 'peek' && !pushed.current && isPhone()) {
      history.pushState({ sheet: true }, '')
      pushed.current = true
    } else if (sheet === 'peek' && pushed.current) {
      pushed.current = false
      history.back()
    }
  }, [sheet])

  const end = (snap: boolean) => {
    const d = drag.current
    drag.current = null
    if (!d) return
    if (d.moved) {
      const h = d.el.getBoundingClientRect().height
      d.el.style.height = ''
      d.el.style.transition = ''
      if (snap) {
        const snaps = snapHeights()
        let best = 0
        snaps.forEach((s, i) => {
          if (Math.abs(s - h) < Math.abs(snaps[best] - h)) best = i
        })
        setSheet(ORDER[best])
      }
    } else if (snap) cycle()
  }

  return (
    <div
      className="sheet-head"
      onPointerDown={(ev) => {
        if ((ev.target as HTMLElement).closest('button:not(.sheet-handle)')) return
        const el = ev.currentTarget.parentElement!
        drag.current = { y: ev.clientY, h: el.getBoundingClientRect().height, moved: false, el }
        ev.currentTarget.setPointerCapture(ev.pointerId)
      }}
      onPointerMove={(ev) => {
        const d = drag.current
        if (!d) return
        const dy = ev.clientY - d.y
        if (Math.abs(dy) > 6) d.moved = true
        if (!d.moved) return
        const [lo, , hi] = snapHeights()
        d.el.style.transition = 'none'
        d.el.style.height = `${Math.min(Math.max(d.h - dy, lo), hi)}px`
      }}
      onPointerUp={() => end(true)}
      onPointerCancel={() => end(false)}
    >
      <button
        type="button"
        className="sheet-handle"
        aria-label={`Resize panel (now ${sheet === 'peek' ? 'minimised' : sheet === 'half' ? 'half height' : 'full height'})`}
        // Pointer taps are handled above (they may turn into a drag); this is for the keyboard.
        onClick={(ev) => ev.detail === 0 && cycle()}
      />
      <TabSwitch finderOn={finderOn} />
      <button
        type="button"
        className="btn ghost icon"
        aria-label={sheet === 'peek' ? 'Expand panel' : 'Minimise panel'}
        onClick={() => setSheet(sheet === 'peek' ? 'half' : 'peek')}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d={sheet === 'peek' ? 'M3 10l5-5 5 5' : 'M3 6l5 5 5-5'} />
        </svg>
      </button>
    </div>
  )
}
