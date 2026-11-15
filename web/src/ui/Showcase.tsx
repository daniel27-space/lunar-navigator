// The mission view: after a mission is picked the camera flies to its site, goes on down towards
// it, and the view cross-fades into a ground-level scene of the craft (hero) with a panel of its
// picture, key facts and what it did. Closing reverses it and leaves the site card.
//
// The sequence is a small state machine kept in the store (`showcasePhase`):
//   flight   -> the normal fly-in is under way; nothing of the mission view shows
//   request  -> asked for from a site card; the camera is wherever the user left it
//   approach -> the camera's second, shorter move down to a few km from the site
//   ground   -> the ground-level scene and the panel are up
//   leaving  -> the scene dollies back and fades while the camera flies back up
// `useShowcaseSequence` moves it on. The camera rig reports the end of each move through
// `arrivedSeq`; any camera request that is not part of the sequence cancels it.
import { useMemo, useCallback, useEffect, useState } from 'react'
import { skyAt, type Ephem } from '../lib/ephem'
import { fmtMissionDate } from '../lib/format'
import { defaultModel, fetchModel, LanderView, type Archetype, type ModelState, type SceneSky } from '../scene/LanderModel'
import { subLunarLonDeg } from '../scene/landers/earth'
import { restNote, groundStyle } from '../scene/landers/ground'
import { isWrecked, WRECK_NOTE } from '../scene/landers/wreck'
import { STATUS_COLOR, type Mission } from '../scene/Missions'
import { useStore, type ViewRequest } from '../store'
import { isPhone } from './Sheet'

const STATUS_WORD: Record<Mission['status'], string> = { landed: 'Landed', crashed: 'Lost on landing', planned: 'Planned', candidate: 'Candidate site' }

/** The label over a mission's date in the panel's strip of three facts. */
const WHEN_WORD: Record<Mission['status'], string> = { landed: 'Landed', crashed: 'Lost', planned: 'Planned', candidate: 'Date' }
/** Facts the panel's header and strip already show, so the list below does not repeat them. */
const IN_HEADER = new Set(['Landed', 'Impact', 'Planned landing', 'Operator', 'Country'])

/** The date for the strip: a real date as "20 Jul 1969"; a planned one in the words of its own fact ("Not before 2027"). */
function whenText(m: Mission): string {
  const planned = m.status === 'planned' ? m.facts?.find(([label]) => label === 'Planned landing')?.[1] : undefined
  const text = planned ?? fmtMissionDate(m.date_utc).replace(/\s*\(planned\)$/, '')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** How long the scene and panel take to fade out, ms (the same figure as the CSS animation). */
const LEAVE_MS = 550
/** The cross-fade starts this long before the approach ends, ms, so the two moves read as one. */
const OVERLAP_MS = 450
const APPROACH_MS = 1400
/** The approach from far away (Rig.tsx gives it 2.4 s), so the ground scene does not fade in over a distant Moon. */
const FAR_APPROACH_MS = 2400
/** The length of the approach under way. */
let approachMs = APPROACH_MS
/** Longest a queued pick waits for the camera to finish rising after the view has closed, ms. */
const RISE_LIMIT_MS = 3000

const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** The pin that stands for this mission, if it is still pinned. */
function useMissionPin(missionId: string | null) {
  return useStore((s) => (missionId ? (s.pins.find((p) => s.pinMission[p.id] === missionId) ?? null) : null))
}

/** Drives the mission view through its steps. Mounted once, in App. */
export function useShowcaseSequence() {
  const phase = useStore((s) => s.showcasePhase)
  const missionId = useStore((s) => s.showcase)
  const seq = useStore((s) => s.showcaseSeq)
  const viewSeq = useStore((s) => s.view.seq)
  const arrived = useStore((s) => s.arrivedSeq)
  const pin = useMissionPin(missionId)

  // The camera was sent somewhere else (South Pole, another site...): the mission view gives way.
  useEffect(() => {
    if (phase && phase !== 'request' && viewSeq !== seq) useStore.getState().setShowcase({ showcase: null, showcasePhase: null })
  }, [phase, viewSeq, seq])

  // On the way in there is no panel yet and so no close button: Escape still calls it off.
  const inbound = phase === 'flight' || phase === 'approach'
  useEffect(() => {
    if (!inbound) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !e.defaultPrevented && useStore.getState().closeShowcase()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [inbound])

  // The flight has ended (or the view was asked for from a card): go on down to the site.
  const ready = phase === 'request' || (phase === 'flight' && arrived === seq)
  useEffect(() => {
    if (!ready) return
    const st = useStore.getState()
    const home: ViewRequest = st.view.kind === 'approach' ? (st.showcaseHome ?? { kind: 'pole' }) : (({ seq: _, ...v }) => v as ViewRequest)(st.view)
    if (isPhone() && st.sheet !== 'half') st.setSheet('half')
    if (!pin || reducedMotion()) {
      // No approach: the scene simply fades in over the site view.
      st.setShowcase({ showcasePhase: 'ground', showcaseHome: home, showcaseSeq: st.view.seq })
      return
    }
    // From the site view the way down is short; asked for from anywhere else it is the long one.
    const atSite = st.view.kind === 'site' && Math.abs(st.view.lat - pin.lat) < 0.01 && Math.abs(st.view.lon - pin.lon) < 0.01
    approachMs = atSite ? APPROACH_MS : FAR_APPROACH_MS
    st.goTo({ kind: 'approach', lat: pin.lat, lon: pin.lon, hM: pin.hM })
    st.setShowcase({ showcasePhase: 'approach', showcaseHome: home, showcaseSeq: useStore.getState().view.seq })
  }, [ready, pin])

  // Near the end of the approach the view cross-fades into the ground-level scene.
  useEffect(() => {
    if (phase !== 'approach') return
    const up = () => useStore.getState().showcasePhase === 'approach' && useStore.getState().setShowcase({ showcasePhase: 'ground' })
    if (arrived === seq) return void up()
    const t = setTimeout(up, approachMs - OVERLAP_MS)
    return () => clearTimeout(t)
  }, [phase, arrived, seq])

  // Leaving: the camera flies back up to where a mission pick ends, while the scene fades out.
  useEffect(() => {
    if (phase !== 'leaving') return
    const st = useStore.getState()
    if (!reducedMotion() && st.showcaseHome && st.view.kind === 'approach') {
      st.goTo(st.showcaseHome)
      st.setShowcase({ showcaseSeq: useStore.getState().view.seq })
    }
    // Left during the approach, there is no scene to fade: the sequence ends at once (the camera still rises).
    const t = setTimeout(() => useStore.getState().setShowcase({ showcase: null, showcasePhase: null }), st.showcaseUp ? LEAVE_MS : 0)
    return () => clearTimeout(t)
  }, [phase])

  // A pick made while the view was open (store.whenShowcaseClosed) goes ahead once the view has
  // closed and the camera has finished rising, so the new flight starts from the site pose.
  const queued = useStore((s) => s.afterShowcase)
  useEffect(() => {
    if (!queued || phase !== null) return
    const run = () => {
      const go = useStore.getState().afterShowcase
      if (!go) return
      useStore.setState({ afterShowcase: null })
      go()
    }
    if (arrived === viewSeq) return void run()
    // The rise normally ends within its two seconds; if it was interrupted, go anyway.
    const t = setTimeout(run, RISE_LIMIT_MS)
    return () => clearTimeout(t)
  }, [queued, phase, arrived, viewSeq])
}

/** Fetches a mission's model file while the camera is still on its way, so the craft does not pop in later. */
export function usePreloadModel(m: Mission | null, baseUrl: string) {
  const file = m?.model?.kind === 'glb' ? m.model.file : null
  useEffect(() => {
    if (file) fetchModel(baseUrl, file).catch(() => {}) // a failure is reported when the scene tries to show it
  }, [file, baseUrl])
}

/** The sky for the scene: from the site's analysis when it has one, else straight from the ephemeris with a flat skyline. */
function useSky(m: Mission, ephem: Ephem | null): SceneSky {
  const pin = useMissionPin(m.id)
  const fromSite = useStore((s) => (pin && s.showcaseSky && s.showcaseSky.pinId === pin.id ? s.showcaseSky : null))
  const tMs = useStore((s) => s.tMs)
  if (fromSite) return fromSite
  if (!ephem) return FLAT_SKY
  const sky = skyAt(ephem, tMs, m.lat, m.lon, (pin?.hM ?? 0) + 2)
  return { sun: { az: sky.sun.az, el: sky.sun.el, radius: sky.sun.radius, up: sky.sun.el > 0 }, earth: { az: sky.earth.az, el: sky.earth.el, radius: sky.earth.radius }, horizon: null, azStepDeg: 0.5 }
}
const FLAT_SKY: SceneSky = { sun: { az: 90, el: 30, radius: 0.27, up: true }, earth: { az: 0, el: -10, radius: 0.95 }, horizon: null, azStepDeg: 0.5 }

/** A long licence statement cut to its first clause; the full text goes in the tooltip. */
function shortLicence(text: string): string {
  const first = text.split(/[;(]/)[0].trim()
  return first.length > 48 ? `${first.slice(0, 46).trimEnd()}…` : first
}

export function ShowcaseHero({ mission: m, ephem, baseUrl }: { mission: Mission; ephem: Ephem | null; baseUrl: string }) {
  const sky = useSky(m, ephem)
  const pin = useMissionPin(m.id)
  const leaving = useStore((s) => s.showcasePhase === 'leaving')
  const quality = useStore((s) => s.quality)
  const fallback = defaultModel(m)
  const model = m.model ?? fallback
  const [state, setState] = useState<ModelState>(model.kind === 'glb' ? 'loading' : 'simplified')
  const onState = useCallback((s: ModelState) => setState(s), [])
  // Decided once per opening, so the ground does not change under the viewer if the pin's height is refined.
  const [style] = useState(() => groundStyle(m.id, m.lat, pin?.hM ?? 0))
  // The same object while the sky is unchanged, so the scene does not rebuild on every render.
  const clock = useStore((st) => st.tMs)
  // The side of the Earth facing the Moon turns by about 14.5 degrees an hour; a new sky only once it has moved a degree.
  const earthFace = Math.round(subLunarLonDeg(clock))
  const sceneSky = useMemo(() => ({ ...sky, latDeg: m.lat, earthFaceLonDeg: earthFace }), [sky, m.lat, earthFace])
  const [motion] = useState(() => !reducedMotion())
  const [narrow] = useState(isPhone)
  return (
    <div className={leaving ? 'mission-hero leaving' : 'mission-hero'} data-ground={style}>
      <LanderView
        key={m.id}
        model={model}
        fallback={fallback.archetype as Archetype}
        baseUrl={baseUrl}
        seed={m.id}
        style={style}
        wrecked={isWrecked(m)}
        planned={m.status === 'planned'}
        sky={sceneSky}
        detail={quality}
        shift={narrow ? 0 : 0.12}
        back={narrow ? 2.6 : 3.5}
        motion={motion}
        leaving={leaving}
        onState={onState}
      />
      <div className="hero-notes">
        <p className="not-phone">
          {sky.sun.up
            ? `Skyline, Sun and Earth: real directions and sizes for this site and time. Ground near the craft is illustrative.`
            : `The Sun is below the skyline here now: soft fill light shows the craft. Skyline and Earth are real; the ground is illustrative.`}
        </p>
        <p className="phone-only">
          {sky.sun.up ? `Skyline, Sun and Earth are real, at true size; ground is illustrative.` : `Sun is down: fill light. Skyline and Earth are real; ground is illustrative.`}
        </p>
        <p>
          {state === 'loading' && <span role="status">Loading the 3D model…</span>}
          {state === 'simplified' && m.status === 'planned' && 'Planned: nothing has landed here yet. The outline shows the size of the craft at its target area.'}
          {state === 'simplified' && !isWrecked(m) && m.status !== 'planned' && 'Simplified model, not to scale in detail.'}
          {state === 'simplified' && isWrecked(m) && WRECK_NOTE}
          {restNote(m.id) && <> {restNote(m.id)}</>}
          {state === 'file' && model.kind === 'glb' && (
            <span title={model.license}>
              3D model:{' '}
              {model.source_url ? (
                <a href={model.source_url} target="_blank" rel="noreferrer">
                  {model.credit ?? 'source'}
                </a>
              ) : (
                (model.credit ?? 'credit not recorded')
              )}
              <span className="not-phone">{model.license ? ` · ${shortLicence(model.license)}` : ''}</span>
            </span>
          )}
          <span className="not-phone"> Drag to look around, scroll to move closer.</span>
        </p>
      </div>
    </div>
  )
}

function useClose() {
  const close = useStore((s) => s.closeShowcase)
  useEffect(() => {
    // An Escape already used by a dialog or menu on top does not also close the mission view.
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !e.defaultPrevented && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])
  return close
}

export function ShowcasePanel({ mission: m, baseUrl }: { mission: Mission; baseUrl: string }) {
  const close = useClose()
  const pin = useMissionPin(m.id)
  const setActivePin = useStore((s) => s.setActivePin)
  const focusLanding = useStore((s) => s.focusLanding)
  const leaving = useStore((s) => s.showcasePhase === 'leaving')
  const [badImage, setBadImage] = useState<string | null>(null)
  const image = m.image && m.image.file !== badImage ? m.image : null
  // The strip under the name already gives the date and country, and the line under it the operator.
  const facts = (m.facts ?? []).filter(([label]) => !IN_HEADER.has(label))
  const toSite = (landing: boolean) => {
    if (pin) {
      setActivePin(pin.id)
      if (landing) focusLanding(pin.id)
    }
    close()
  }
  return (
    <aside className={leaving ? 'panel showcase leaving' : 'panel showcase'} aria-label={`${m.name}: mission details`}>
      {image && (
        <figure className="showcase-cover">
          {/* The caption below says what the picture shows, so the picture itself is not read out twice. */}
          <img src={`${baseUrl}data/${image.file}`} alt={image.caption ? '' : m.name} onError={() => setBadImage(image.file)} />
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
      <header className="panel-head showcase-head">
        <h2>{m.name}</h2>
        <button type="button" className="btn ghost icon" aria-label="Close mission details" onClick={close}>
          ×
        </button>
        <p className="caption">
          <span className="chip">
            <i className="dot" style={{ background: STATUS_COLOR[m.status] }} />
            {STATUS_WORD[m.status]}
          </span>
          <span>
            {m.agency} · {m.kind}
          </span>
        </p>
      </header>
      <div className="panel-body showcase-body">
        <dl className="showcase-stats">
          <div>
            <dt>{WHEN_WORD[m.status]}</dt>
            <dd>{whenText(m)}</dd>
          </div>
          <div>
            <dt>Craft height</dt>
            <dd>{(m.model ?? defaultModel(m)).height_m} m</dd>
          </div>
          <div>
            <dt>Country</dt>
            <dd>{m.country}</dd>
          </div>
        </dl>
        {facts.length > 0 && (
          <dl className="facts">
            {facts.slice(0, 6).map(([label, value]) => (
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
