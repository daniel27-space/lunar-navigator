// Where an edge marker for a body in the sky goes: given where the body lands on the screen,
// the marker sits on the edge of the free part of the view, on the line from the middle of
// that part towards the body, and its wedge points along that line.

export interface EdgeInput {
  /** the body in normalised device coordinates, as `Vector3.project(camera)` returns it */
  ndc: { x: number; y: number; z: number }
  /** true when the Moon is between the camera and the body */
  occluded: boolean
  /** size of the 3D view, px */
  width: number
  height: number
  /** the part of the view the marker may use, px from the view's top left corner */
  rect: { left: number; top: number; right: number; bottom: number }
  /** half the marker's size including its wedge, px */
  half: { w: number; h: number }
}

export interface EdgeMarker {
  /** false when the body itself can be seen, so no marker is wanted */
  show: boolean
  /** centre of the marker, px from the view's top left corner */
  x: number
  y: number
  /** direction of the wedge, radians clockwise from screen right (the CSS rotate convention) */
  angle: number
}

/** How far out a point behind the camera is pushed, in half-screens; anything well over 1. */
const FAR = 8

export function edgeMarker({ ndc, occluded, width, height, rect, half }: EdgeInput): EdgeMarker {
  let { x, y } = ndc
  // A point behind the camera projects mirrored through the centre. Turn it back and push it
  // out past the edge, or the wedge would point away from the body.
  const behind = ndc.z > 1 || !Number.isFinite(x) || !Number.isFinite(y)
  if (behind) {
    const len = Math.hypot(x, y)
    if (!Number.isFinite(len) || len < 1e-6) {
      x = 0
      y = -FAR // straight behind: any side is as good as another; use the bottom
    } else {
      x = (-x / len) * FAR
      y = (-y / len) * FAR
    }
  }
  const onScreen = !behind && Math.abs(x) <= 1 && Math.abs(y) <= 1
  const px = ((x + 1) / 2) * width
  const py = ((1 - y) / 2) * height
  const cx = (rect.left + rect.right) / 2
  const cy = (rect.top + rect.bottom) / 2
  let dx = px - cx
  let dy = py - cy
  if (Math.hypot(dx, dy) < 1e-6) {
    dx = 0
    dy = -1
  }
  const hx = Math.max(0, (rect.right - rect.left) / 2 - half.w)
  const hy = Math.max(0, (rect.bottom - rect.top) / 2 - half.h)
  const t = Math.min(dx === 0 ? Infinity : hx / Math.abs(dx), dy === 0 ? Infinity : hy / Math.abs(dy))
  return {
    show: !onScreen || occluded,
    x: cx + dx * t,
    y: cy + dy * t,
    angle: Math.atan2(dy, dx),
  }
}

/** True when a sphere of the given radius about the origin lies between `from` and `to`. */
export function sphereBlocks(from: readonly [number, number, number], to: readonly [number, number, number], radius: number): boolean {
  const d = [to[0] - from[0], to[1] - from[1], to[2] - from[2]]
  const dd = d[0] * d[0] + d[1] * d[1] + d[2] * d[2]
  if (dd === 0) return false
  // nearest point of the segment to the centre
  const s = Math.min(1, Math.max(0, -(from[0] * d[0] + from[1] * d[1] + from[2] * d[2]) / dd))
  const p = [from[0] + d[0] * s, from[1] + d[1] * s, from[2] + d[2] * s]
  return p[0] * p[0] + p[1] * p[1] + p[2] * p[2] < radius * radius
}

/** Distance from the centre of a w x h box to its edge in the direction `angle`. */
export function boxReach(halfW: number, halfH: number, angle: number): number {
  const c = Math.abs(Math.cos(angle))
  const s = Math.abs(Math.sin(angle))
  return Math.min(c < 1e-9 ? Infinity : halfW / c, s < 1e-9 ? Infinity : halfH / s)
}
