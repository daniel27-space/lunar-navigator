// "Copy link": the pinned sites, clock, layer, finder preset and any changed assumptions as a
// URL that restores them (lib/shareLink.ts). If the browser will not let the page write to the
// clipboard, the link is shown in a field to copy by hand.
import { useState } from 'react'
import { PRESETS } from '../lib/finder'
import { encodeShare, shareStateOf } from '../lib/shareLink'
import { assumptionsOf, useStore } from '../store'
import type { SiteAnalysis } from './useSiteAnalysis'

export const PRESET_IDS = PRESETS.map((p) => p.id)

export function shareUrl(sites: SiteAnalysis[]): string {
  const s = useStore.getState()
  const state = shareStateOf(
    { sites: sites.map((a) => ({ lat: a.pin.lat, lon: a.pin.lon, label: a.pin.label })), tMs: s.tMs, layer: s.layer, preset: s.preset, assumptions: assumptionsOf(s), finder: s.finder, baselines: sites.map((a) => s.baselines[a.pin.id]) },
    PRESET_IDS,
  )
  return `${location.origin}${location.pathname}#${encodeShare(state)}`
}

export function CopyLink({ sites }: { sites: SiteAnalysis[] }) {
  // null = nothing done yet; 'copied' = on the clipboard; otherwise the link, shown to copy by hand
  const [done, setDone] = useState<string | null>(null)
  const copy = () => {
    const url = shareUrl(sites)
    const shown = () => setDone(url)
    if (!navigator.clipboard) return shown()
    navigator.clipboard.writeText(url).then(() => setDone('copied'), shown)
  }
  return (
    <div className="export-row">
      <button type="button" className="btn" title="Copy a link that opens these sites at this time, with this layer, mission and assumptions" onClick={copy}>
        Copy link
      </button>
      {done === null ? (
        <span className="caption">A link that reopens these sites at this time, with the same layer, mission and assumptions.</span>
      ) : done === 'copied' ? (
        <span className="caption" role="status">
          Link copied.
        </span>
      ) : (
        <input className="share-url" type="text" readOnly value={done} aria-label="Link to these sites: select and copy" onFocus={(e) => e.target.select()} />
      )}
    </div>
  )
}
