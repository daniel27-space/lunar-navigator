// Markers (mission dots, shortlist numbers, site badges) are drawn on top of the ground at a
// fixed size on screen, so part of each one usually lies behind a hill or below the surface.
// A click there reaches the ground first. The ground therefore asks, before pinning a point,
// whether the click is also over a marker, and if so leaves the click to the marker.
import type { Intersection } from 'three'

/** Marks an object as a clickable marker: `userData={MARKER}`. */
export const MARKER = { marker: true }

/** True when a hit on a marker's square is inside the round disc that is drawn. */
export function insideDisc(hit: { uv?: { x: number; y: number } | null }): boolean {
  if (!hit.uv) return true
  return Math.hypot(hit.uv.x - 0.5, hit.uv.y - 0.5) <= 0.5
}

/** True when any of the things under the pointer is a visible marker. */
export function overMarker(hits: Pick<Intersection, 'object' | 'uv'>[]): boolean {
  return hits.some((h) => h.object.userData.marker === true && h.object.visible && insideDisc(h))
}
