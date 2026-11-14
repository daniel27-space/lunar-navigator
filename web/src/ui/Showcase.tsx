// Mission showcase: the craft in its own small 3D view (hero) and a panel with its picture, key
// facts and what it did. It opens after a mission is chosen; the site stays pinned underneath,
// so closing it leaves the user on the site with its card.
import { useCallback, useEffect, useState } from 'react'
import { skyAt, type Ephem } from '../lib/ephem'
import { fmtMissionDate } from '../lib/format'
import { defaultModel, LanderView, type Archetype, type ModelState } from '../scene/LanderModel'
import { STATUS_COLOR, type Mission } from '../scene/Missions'
import { useStore } from '../store'

const STATUS_WORD: Record<Mission['status'], string> = { landed: 'Landed', crashed: 'Lost on landing', planned: 'Planned', candidate: 'Candidate site' }

/** The pin that stands for this mission, if it is still pinned. */
function useMissionPin(missionId: string) {
  return useStore((s) => s.pins.find((p) => s.pinMission[p.id] === missionId) ?? null)
}

/** Sun direction at the site: from the site's analysis when it has one, else straight from the ephemeris. */
function useSun(m: Mission, ephem: Ephem | null) {
  const pin = useMissionPin(m.id)
  const fromSite = useStore((s) => (pin && s.showcaseSun && s.showcaseSun.pinId === pin.id ? s.showcaseSun : null))
  const tMs = useStore((s) => s.tMs)
  if (fromSite) return { az: fromSite.az, el: fromSite.el, up: fromSite.up }
  if (!ephem) return { az: 90, el: 30, up: true }
  const sun = skyAt(ephem, tMs, m.lat, m.lon, pin?.hM ?? 0).sun
  return { az: sun.az, el: sun.el, up: sun.el > 0 }
}

function useClose() {
  const close = useStore((s) => s.closeShowcase)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])
  return close
}

export function ShowcaseHero({ mission: m, ephem, baseUrl }: { mission: Mission; ephem: Ephem | null; baseUrl: string }) {
  const sun = useSun(m, ephem)
  const fallback = defaultModel(m)
  const model = m.model ?? fallback
  const [state, setState] = useState<ModelState>(model.kind === 'glb' ? 'loading' : 'simplified')
  const onState = useCallback((s: ModelState) => setState(s), [])
  return (
    <div className="mission-hero">
      <div className="hero-title">
        <h2>{m.name}</h2>
        <p>
          {m.agency} · {fmtMissionDate(m.date_utc)}
        </p>
      </div>
      <LanderView key={m.id} model={model} fallback={fallback.archetype as Archetype} baseUrl={baseUrl} sun={sun} onState={onState} />
      <div className="hero-notes">
        {state === 'loading' && <p role="status">Loading the 3D model…</p>}
        {state === 'simplified' && <p>Simplified model, not to scale in detail</p>}
        {state === 'file' && model.kind === 'glb' && (
          <p>
            3D model:{' '}
            {model.source_url ? (
              <a href={model.source_url} target="_blank" rel="noreferrer">
                {model.credit ?? 'source'}
              </a>
            ) : (
              (model.credit ?? 'credit not recorded')
            )}
            {model.license ? ` · ${model.license}` : ''}
          </p>
        )}
        <p>{sun.up ? 'Lit from the real Sun direction at this site and the selected time' : 'The Sun is below the horizon here now'}</p>
      </div>
    </div>
  )
}

export function ShowcasePanel({ mission: m, baseUrl }: { mission: Mission; baseUrl: string }) {
  const close = useClose()
  const pin = useMissionPin(m.id)
  const setActivePin = useStore((s) => s.setActivePin)
  const focusLanding = useStore((s) => s.focusLanding)
  const [badImage, setBadImage] = useState<string | null>(null)
  const image = m.image && m.image.file !== badImage ? m.image : null
  const toSite = (landing: boolean) => {
    if (pin) {
      setActivePin(pin.id)
      if (landing) focusLanding(pin.id)
    }
    close()
  }
  return (
    <aside className="panel showcase" aria-label={`${m.name}: mission details`}>
      <header className="panel-head showcase-head">
        <h2>{m.name}</h2>
        <span className="chip">
          <i className="dot" style={{ background: STATUS_COLOR[m.status] }} />
          {STATUS_WORD[m.status]}
        </span>
        <button type="button" className="btn ghost icon" aria-label="Close mission details" onClick={close}>
          ×
        </button>
        <p className="caption">
          {m.agency} · {fmtMissionDate(m.date_utc)} · {m.kind}
        </p>
      </header>
      <div className="panel-body showcase-body">
        {image && (
          <figure>
            <img src={`${baseUrl}data/${image.file}`} alt={image.caption ?? m.name} onError={() => setBadImage(image.file)} />
            <figcaption>
              {image.caption && <span>{image.caption}</span>}
              <span className="credit">
                Picture:{' '}
                {image.source_url ? (
                  <a href={image.source_url} target="_blank" rel="noreferrer">
                    {image.credit ?? 'source'}
                  </a>
                ) : (
                  (image.credit ?? 'credit not recorded')
                )}
                {image.license ? ` · ${image.license}` : ''}
              </span>
            </figcaption>
          </figure>
        )}
        {m.facts && m.facts.length > 0 && (
          <dl className="facts">
            {m.facts.slice(0, 6).map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        )}
        <p className="about">{m.about ?? m.summary}</p>
        <div className="showcase-actions">
          <button type="button" className="btn primary" onClick={() => toSite(false)}>
            Analyse this site
          </button>
          <button type="button" className="btn" onClick={() => toSite(true)} disabled={!pin}>
            When to land here
          </button>
        </div>
        <p className="caption">
          <a href={m.source_url} target="_blank" rel="noreferrer">
            Source for the landing coordinates
          </a>
        </p>
      </div>
    </aside>
  )
}
