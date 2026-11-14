// What counts as "better" for the mission in hand. It follows the site finder's mission when
// the finder is in use (or the site was pinned from it); otherwise sunlight and Earth view are good.
import { useMemo } from 'react'
import type { Wants } from '../lib/verdict'
import { useStore } from '../store'

export function useWants(pinnedFromFinder = false): Wants {
  const finder = useStore((s) => s.finder)
  const preset = useStore((s) => s.preset)
  const layer = useStore((s) => s.layer)
  return useMemo(
    () =>
      pinnedFromFinder || layer === 'finder' || preset !== 'solar'
        ? { sunHigh: finder.sunPrefer !== 'low', earthHigh: finder.earthPrefer !== 'low' }
        : { sunHigh: true, earthHigh: true },
    [finder, preset, layer, pinnedFromFinder],
  )
}
