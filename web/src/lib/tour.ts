// The first-run tour: what counts as having done each camera action. The scene reports the
// camera each frame it draws; the tour card reads the running totals. Kept outside the store
// so a moving camera does not re-render the interface.

/** Camera position and the point it looks at, km from the Moon's centre. */
export interface Sample {
  pos: [number, number, number]
  target: [number, number, number]
}

export interface Progress {
  /** degrees the view has been turned about the point it looks at */
  turnDeg: number
  /** how much the distance has changed, as the sum of |ln(ratio)| */
  zoom: number
  /** how far the view has slid, in screen heights */
  slide: number
}

/**
 * How much of each action completes its step: enough to have got the feel of it, not a first
 * nudge. A quarter turn, zooming to half or double the distance, and sliding most of a screen.
 */
export const NEED: Progress = { turnDeg: 90, zoom: Math.log(2), slide: 0.6 }

const sub = (a: number[], b: number[]) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const len = (a: number[]) => Math.hypot(a[0], a[1], a[2])

/**
 * What the user did between two camera samples. A moved look-at point is a slide; otherwise
 * a changed distance is a zoom and a changed direction is a turn.
 */
export function cameraDelta(prev: Sample, now: Sample): Progress {
  const a = sub(prev.pos, prev.target)
  const b = sub(now.pos, now.target)
  const da = len(a)
  const db = len(b)
  if (da < 1e-9 || db < 1e-9) return { turnDeg: 0, zoom: 0, slide: 0 }
  const moved = len(sub(now.target, prev.target))
  if (moved > 1e-6 * db) return { turnDeg: 0, zoom: 0, slide: moved / db }
  const cos = Math.min(1, Math.max(-1, (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (da * db)))
  return { turnDeg: (Math.acos(cos) * 180) / Math.PI, zoom: Math.abs(Math.log(db / da)), slide: 0 }
}

let total: Progress = { turnDeg: 0, zoom: 0, slide: 0 }
let last: Sample | null = null

/** Called by the scene on each drawn frame while the user (not a camera flight) is in control. */
export function sampleCamera(now: Sample) {
  if (last) {
    const d = cameraDelta(last, now)
    total = { turnDeg: total.turnDeg + d.turnDeg, zoom: total.zoom + d.zoom, slide: total.slide + d.slide }
  }
  last = now
}
/** The next sample starts afresh: the camera was moved by a flight or by the slide gesture itself. */
export function skipSample() {
  last = null
}
/** The slide gesture reports itself (over the whole Moon it looks the same as a turn). */
export function addSlide(screenHeights: number) {
  total = { ...total, slide: total.slide + screenHeights }
  last = null
}
export function readProgress(): Progress {
  return total
}
export function clearProgress() {
  total = { turnDeg: 0, zoom: 0, slide: 0 }
  last = null
}
