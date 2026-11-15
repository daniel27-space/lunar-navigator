import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, invalidate } from '@react-three/fiber'
import * as THREE from 'three'
import { fmtDateTime, fmtTick } from './lib/format'
import { bodyVectors, clockRange, loadEphem, type Ephem } from './lib/ephem'
import { loadFinderGrid, PRESETS, runFinder, type Candidate, type FinderGrid } from './lib/finder'
import { latLonOf, sitePosKm, SUN_RADIUS_KM, unit, type Vec3 } from './lib/geo'
import { SUN_RULES } from './lib/assumptions'
import { decodeShare } from './lib/shareLink'
import type { GlobalDem } from './lib/globalDem'
import {
  frameDirection,
  heightAt,
  loadPatch,
  loadPatchIndex,
  loadTerrain,
  patchesCovering,
  terrainTier,
  type PatchIndex,
  type Terrain,
} from './lib/terrain'
import { Globe } from './scene/Globe'
import { insideDisc, MARKER } from './scene/markers'
import { Missions, STATUS_COLOR, type Mission } from './scene/Missions'
import { MoonTerrain } from './scene/MoonTerrain'
import { POLE_POSE, Rig } from './scene/Rig'
import { SkyBodies } from './scene/SkyBodies'
import { SkyCompassChips, SkyCompassDriver } from './scene/SkyCompass'
import { globalHeightAt } from './lib/globalDem'
import { useGlobeMap, useGlobeRelief, type Cut } from './scene/shading'
import { DETAIL, SITE_COLORS, useStore, type LayerMode, type Pin, type Quality } from './store'
import { AddByCoords } from './ui/AddByCoords'
import { AssumptionsHead, AssumptionsPanel } from './ui/Assumptions'
import { Compare } from './ui/Compare'
import { DateEditor } from './ui/DateEditor'
import { INK, ON_ACCENT, Segmented, SITE_LETTERS } from './ui/controls'
import { ErrorBoundary } from './ui/ErrorBoundary'
import { FinderPanel } from './ui/FinderPanel'
import { PRESET_IDS } from './ui/CopyLink'
import { CRATER_LABEL, Intro } from './ui/Intro'
import { GUIDES, startGuide, Tutorial } from './ui/Tutorial'
import { Welcome } from './ui/Welcome'
import { ReplacedNotice } from './ui/ReplacedNotice'
import { isPhone, SheetHead, TabSwitch, useExpandOnTap } from './ui/Sheet'
import { DataMethod } from './ui/DataMethod'
import { ShowcaseHero, ShowcasePanel, usePreloadModel, useShowcaseSequence } from './ui/Showcase'
import { SiteCard } from './ui/SiteCard'
import { useSiteAnalysis, type SiteAnalysis } from './ui/useSiteAnalysis'
import './App.css'

const BASE = `${import.meta.env.BASE_URL}data/`

function useData() {
  const [ephem, setEphem] = useState<Ephem | null>(null)
  const [terrain, setTerrain] = useState<Terrain | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [missions, setMissions] = useState<Mission[]>([])
  const [patchIndex, setPatchIndex] = useState<PatchIndex | null>(null)
  useEffect(() => {
    fetch(`${BASE}missions.json`)
      .then((r) => r.json())
      .then(setMissions, () => setMissions([]))
    loadEphem(BASE).then(setEphem, (e) => setError(`Sun and Earth positions failed to load: ${e.message}`))
    loadTerrain(BASE).then(setTerrain, (e) => setError(`Terrain failed to load: ${e.message}`))
    loadPatchIndex(BASE).then(setPatchIndex, () => setPatchIndex(null))
  }, [])
  return { ephem, terrain, error, missions, patchIndex }
}

/** Advances simulated time while playing. */
function useClock(ephem: Ephem | null) {
  const playing = useStore((s) => s.playing)
  useEffect(() => {
    if (!playing || !ephem) return
    let last = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const { tMs, rate, setTime, setPlaying } = useStore.getState()
      const next = tMs + (now - last) * rate
      last = now
      if (next >= clockRange(ephem)[1]) setPlaying(false)
      else setTime(next)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, ephem])
}

const RATES: readonly (readonly [number, string, string])[] = [
  [3600, '1 h/s', 'One hour of Moon time per second'],
  [6 * 3600, '6 h/s', 'Six hours per second'],
  [86400, '1 d/s', 'One day per second'],
  [7 * 86400, '7 d/s', 'One week per second'],
]
/** `hint` is the one-line description in the phone's layer list; `legend` the full note with sources. */
const LAYERS: { label: string; full?: string; value: LayerMode; hint: string; legend: string; ramp?: string; ends?: [string, string] }[] = [
  {
    label: 'Find a site',
    value: 'finder',
    hint: 'Rank the ground against what your mission needs',
    legend: 'Ground that meets every limit, brightest where it fits best. Slope from LOLA; long-term sunlight, Earth view and permanent shadow from NASA GSFC.',
  },
  { label: 'Sun now', full: 'Sunlight now', value: 'natural', hint: 'Light and shadow at the selected time', legend: 'Sunlight and shadow at the selected time, from LOLA terrain and Sun and Earth positions (JPL).' },
  {
    label: 'Avg sunlight',
    full: 'Average sunlight',
    value: 'sunavg',
    hint: 'Share of time the Sun is visible',
    legend: 'Share of time the Sun is visible, averaged over 18.6 years. NASA GSFC (Mazarico et al. 2011).',
    ramp: 'linear-gradient(90deg,#08051a,#59197a,#e66633,#fff299)',
    ends: ['never', 'always'],
  },
  {
    label: 'Avg Earth view',
    full: 'Average Earth view',
    value: 'earthavg',
    hint: 'Share of time Earth is visible',
    legend: 'Share of time Earth is visible, averaged over 18.6 years. NASA GSFC (Mazarico et al. 2011).',
    ramp: 'linear-gradient(90deg,#0a0a0f,#1a4d99,#bfebff)',
    ends: ['never', 'always'],
  },
  {
    label: 'Shadow',
    full: 'Permanent shadow',
    value: 'psr',
    hint: 'Ground that never sees the Sun',
    legend: 'Ice-blue areas are in permanent shadow, they never see the Sun: cold enough for water ice to survive. NASA GSFC LOLA.',
  },
  {
    label: 'Height',
    full: 'Elevation',
    value: 'elevation',
    hint: 'Elevation above the reference sphere',
    legend: 'Height relative to the 1737.4 km reference sphere (LOLA).',
    ramp: 'linear-gradient(90deg,#171c54,#1a738c,#c7b373,#faf7f0)',
    ends: ['−4.5 km', '+4.5 km'],
  },
  {
    label: 'Slope',
    value: 'slope',
    hint: 'How steep the ground is',
    legend: 'Surface slope over a ~160 m baseline (LOLA 80 m).',
    ramp: 'linear-gradient(90deg,#1a8c4d,#8cbf40 27%,#f2b326 50%,#bf1f1a)',
    ends: ['0°', '30°+'],
  },
]
const WINDOW_MS = 30 * 86400 * 1000

function TimeBar({ ephem }: { ephem: Ephem }) {
  const { tMs, playing, rate, setTime, setPlaying, setRate } = useStore()
  // The slider scrubs a 60-day window centred where the user last jumped to.
  const [centre, setCentre] = useState(tMs)
  const [first, last] = clockRange(ephem)
  const lo = Math.max(centre - WINDOW_MS, first)
  const hi = Math.min(centre + WINDOW_MS, last)
  useEffect(() => {
    if (tMs < lo || tMs > hi) setCentre(tMs)
  }, [tMs, lo, hi])
  // The date editor opens only when its button is pressed, and stays open while the clock runs:
  // this flag does not depend on the clock, and the editor is not remounted on a tick.
  const [editing, setEditing] = useState(false)
  const range = useMemo(() => [first, last] as const, [first, last])
  const dateButton = useRef<HTMLButtonElement>(null)
  const closeEditor = useCallback(() => {
    setEditing(false)
    dateButton.current?.focus()
  }, [])
  return (
    <>
      <div className="timebar panel-surface">
        <button className="btn ghost icon play" onClick={() => setPlaying(!playing)} aria-label={playing ? 'Pause' : 'Play'}>
          <svg viewBox="0 0 16 16" aria-hidden="true" className="solid">
            <path d={playing ? 'M4 3h3v10H4zM9 3h3v10H9z' : 'M5 3l8 5-8 5z'} />
          </svg>
        </button>
        <Segmented className="rates" label="Playback speed" options={RATES} value={rate} onChange={setRate} />
        <input
          className="slider scrub"
          type="range"
          min={lo}
          max={hi}
          step={600000}
          value={tMs}
          onChange={(e) => setTime(Number(e.target.value))}
          aria-label="Time"
          aria-valuetext={fmtDateTime(tMs)}
        />
        <button
          ref={dateButton}
          className="btn date"
          aria-haspopup="dialog"
          aria-expanded={editing}
          aria-label={`Date and time: ${fmtDateTime(tMs)}. Change`}
          onClick={() => setEditing((on) => !on)}
        >
          <span className="not-phone">{fmtDateTime(tMs)}</span>
          {/* A phone's one-row time bar has room for the day and the time, still UTC. */}
          <span className="phone-only">
            {fmtTick(tMs)} {fmtDateTime(tMs).slice(11)}
          </span>
        </button>
      </div>
      {editing && <DateEditor range={range} onSet={setCentre} onClose={closeEditor} />}
    </>
  )
}

function PinMarkers({ elevation }: { elevation: (lat: number, lon: number) => number }) {
  const pins = useStore((s) => s.pins)
  const active = useStore((s) => s.activePin)
  const maps = useMemo(() => SITE_COLORS.map((c, i) => badgeTexture(SITE_LETTERS[i], c)), [])
  return (
    <>
      {pins.map((p) => (
        <sprite key={p.id} position={sitePosKm(p.lat, p.lon, elevation(p.lat, p.lon) + 250)} scale={p.id === active ? [0.05, 0.05, 1] : [0.04, 0.04, 1]}
          renderOrder={6}
          // Clicking a site's badge selects that site (not a new point beside it).
          userData={MARKER}
          onClick={(e) => {
            if (e.delta > 4 || !insideDisc(e)) return
            e.stopPropagation()
            useStore.getState().setActivePin(p.id)
          }}
        >
          <spriteMaterial
            map={maps[p.slot]}
            opacity={p.id === active ? 1 : 0.8}
            sizeAttenuation={false}
            depthTest={false}
            transparent
          />
        </sprite>
      ))}
    </>
  )
}

/** Latitude and longitude of the highest cell within `radiusM` of a patch's centre. */
function highestNear(t: Terrain, radiusM: number): { lat: number; lon: number } {
  const l = t.levels[0]
  let best = -Infinity
  let bx = 0
  let by = 0
  for (let r = 0; r < l.size; r++) {
    const y = l.yMax - (r + 0.5) * l.pixel
    if (Math.abs(y) > radiusM) continue
    for (let c = 0; c < l.size; c++) {
      const x = l.xMin + (c + 0.5) * l.pixel
      const h = l.h[r * l.size + c]
      if (x * x + y * y <= radiusM * radiusM && h > best) {
        best = h
        bx = x
        by = y
      }
    }
  }
  return latLonOf(frameDirection(t.frame, bx, by, t.radiusM))
}

/** Numbered markers for the site finder's shortlist. */
function CandidateMarkers({ candidates, elevation, onPick }: { candidates: Candidate[]; elevation: (lat: number, lon: number) => number; onPick: (k: Candidate) => void }) {
  const maps = useMemo(() => Array.from({ length: 8 }, (_, i) => numberTexture(i + 1)), [])
  return (
    <>
      {candidates.map((k) => (
        <sprite
          key={k.rank}
          position={sitePosKm(k.lat, k.lon, elevation(k.lat, k.lon) + 250)}
          scale={[0.04, 0.04, 1]}
          renderOrder={5}
          // Clicking the numbered marker pins that shortlisted place (not a new point beside it).
          userData={MARKER}
          onClick={(e) => {
            if (e.delta > 4 || !insideDisc(e)) return
            e.stopPropagation()
            onPick(k)
          }}
        >
          <spriteMaterial map={maps[(k.rank - 1) % 8]} sizeAttenuation={false} depthTest={false} transparent />
        </sprite>
      ))}
    </>
  )
}

function numberTexture(n: number): THREE.Texture {
  const c = document.createElement('canvas')
  c.width = c.height = 96
  const g = c.getContext('2d')!
  g.fillStyle = ON_ACCENT
  g.beginPath()
  g.arc(48, 48, 40, 0, Math.PI * 2)
  g.fill()
  g.lineWidth = 6
  g.strokeStyle = INK
  g.stroke()
  g.fillStyle = INK
  g.font = '600 52px system-ui, sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(String(n), 48, 51)
  return new THREE.CanvasTexture(c)
}

interface SitesPanelProps {
  pins: Pin[]
  activePin: number | null
  ephem: Ephem
  terrain: Terrain
  /** the loaded patches a point uses, finest first */
  patchOf: (lat: number, lon: number) => Terrain[]
  /** true while the terrain a point's figures depend on is still downloading */
  pending: (lat: number, lon: number) => boolean
  global: GlobalDem | null
  onAddCoords: (lat: number, lon: number) => void
  /** the start card's actions (ui/Intro.tsx) */
  intro: Parameters<typeof Intro>[0]
}

const NO_PATCHES: Terrain[] = []

/** Right-hand panel: one card per pinned site, or the comparison once there are two or more. */
function SitesPanel({ pins, activePin, ephem, terrain, patchOf, pending, global, onAddCoords, intro }: SitesPanelProps) {
  const [mode, setMode] = useState<'compare' | 'cards'>('compare')
  const setTab = useStore((s) => s.setTab)
  // Sites are listed in badge order (A, B, C), whatever order they were pinned in.
  const p = useMemo(() => {
    const sorted = [...pins].sort((x, y) => x.slot - y.slot)
    return [sorted[0] ?? null, sorted[1] ?? null, sorted[2] ?? null]
  }, [pins])
  // Always three calls (hooks cannot be called in a loop of changing length).
  // A point whose terrain is still downloading is not analysed yet (it shows as loading).
  const ready = p.map((x) => (x && !pending(x.lat, x.lon) ? x : null))
  const waiting = p.filter((x, i): x is Pin => x !== null && ready[i] === null)
  const a0 = useSiteAnalysis(ready[0], ephem, terrain, ready[0] ? patchOf(ready[0].lat, ready[0].lon) : NO_PATCHES, global)
  const a1 = useSiteAnalysis(ready[1], ephem, terrain, ready[1] ? patchOf(ready[1].lat, ready[1].lon) : NO_PATCHES, global)
  const a2 = useSiteAnalysis(ready[2], ephem, terrain, ready[2] ? patchOf(ready[2].lat, ready[2].lon) : NO_PATCHES, global)
  const sites = [a0, a1, a2].filter((a): a is SiteAnalysis => a !== null)
  // The comparison waits until every pinned site has its figures, so a verdict never changes under the user.
  const comparing = sites.length >= 2 && waiting.length === 0 && mode === 'compare'
  // A newly pinned point brings this panel forward where only one panel fits (phone, tablet).
  const newest = pins.at(-1)?.id ?? null
  useEffect(() => {
    if (newest !== null) setTab('sites')
  }, [newest, setTab])
  // The mission showcase lights its model from the Sun as this panel works it out for that site.
  const shown = useStore((s) => (s.showcase ? (s.pins.find((x) => s.pinMission[x.id] === s.showcase)?.id ?? null) : null))
  const shownSite = shown === null ? undefined : sites.find((a) => a.pin.id === shown)
  const sun = shownSite?.sky.sun
  const earth = shownSite?.sky.earth
  const sunUp = shownSite?.sunNext.now
  const skyline = shownSite?.horizon
  useEffect(() => {
    useStore.getState().setShowcaseSky(
      shown !== null && sun && earth && skyline
        ? {
            pinId: shown,
            sun: { az: sun.az, el: sun.el, radius: sun.radius, up: !!sunUp },
            earth: { az: earth.az, el: earth.el, radius: earth.radius },
            horizon: skyline.elevDeg,
            azStepDeg: skyline.azStepDeg,
          }
        : null,
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, sun?.az, sun?.el, sun?.radius, earth?.az, earth?.el, earth?.radius, sunUp, skyline])
  return (
    <aside className={`panel sites ${comparing ? 'wide' : ''}`} aria-label="Pinned sites">
      <Intro {...intro} />
      <AssumptionsHead />
      {waiting.map((x) => (
        <p key={x.id} className="empty loading" role="status">
          <i className="dot pulse" /> Loading detailed terrain for {x.label}…
        </p>
      ))}
      {sites.length === 0 && waiting.length === 0 && (
        <div className="empty">
          <p>Click or tap the surface, or a mission marker, to pin a point. Pin two or three to compare them.</p>
          <details className="disclosure pro-only" onClick={(e) => e.stopPropagation()}>
            <summary>Add a point by coordinates</summary>
            <AddByCoords onAdd={onAddCoords} />
          </details>
        </div>
      )}
      {sites.length >= 2 && (
        <div className="tabs panel-head" role="tablist">
          <button role="tab" aria-selected={mode === 'compare'} onClick={() => setMode('compare')}>
            Compare
          </button>
          <button role="tab" aria-selected={mode === 'cards'} onClick={() => setMode('cards')}>
            Site by site
          </button>
        </div>
      )}
      {comparing ? (
        <Compare sites={sites} />
      ) : (
        sites.length > 0 && (
          <div className="cards">
            {sites.map((a) => (
              <SiteCard key={a.pin.id} a={a} active={a.pin.id === activePin} all={sites} />
            ))}
          </div>
        )
      )}
      {sites.length > 0 && (
        <details className="disclosure add-more pro-only">
          <summary>Add a point by coordinates</summary>
          <AddByCoords onAdd={onAddCoords} />
        </details>
      )}
      {/* Last, and pinned to the bottom edge of the panel, so it is seen wherever the panel is scrolled. */}
      <ReplacedNotice />
    </aside>
  )
}

/** A pinned site's marker: its letter on its colour, with a dark outline so it reads on any ground. */
function badgeTexture(letter: string, color: string): THREE.Texture {
  const c = document.createElement('canvas')
  c.width = c.height = 96
  const g = c.getContext('2d')!
  g.beginPath()
  g.arc(48, 48, 38, 0, Math.PI * 2)
  g.fillStyle = color
  g.fill()
  g.lineWidth = 8
  g.strokeStyle = ON_ACCENT
  g.stroke()
  g.fillStyle = ON_ACCENT
  g.font = '600 50px system-ui, sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(letter, 48, 51)
  return new THREE.CanvasTexture(c)
}

export default function App() {
  const { ephem, terrain, error, missions, patchIndex } = useData()
  useClock(ephem)
  const globeMap = useGlobeMap(BASE)
  const { relief: globeRelief, settled: reliefSettled } = useGlobeRelief(BASE)
  const setTimeRange = useStore((s) => s.setTimeRange)
  useEffect(() => {
    if (ephem) setTimeRange(clockRange(ephem))
  }, [ephem, setTimeRange])
  const tMs = useStore((s) => s.tMs)
  const layer = useStore((s) => s.layer)
  const setLayer = useStore((s) => s.setLayer)
  const pins = useStore((s) => s.pins)
  const addPin = useStore((s) => s.addPin)
  const activePin = useStore((s) => s.activePin)
  const goTo = useStore((s) => s.goTo)
  const quality = useStore((s) => s.quality)
  const setQuality = useStore((s) => s.setQuality)
  // Interface-only state: the phone's bottom sheet, the panel in view, and the header's pop-up menus.
  const sheet = useStore((s) => s.sheet)
  const setSheet = useStore((s) => s.setSheet)
  const tab = useStore((s) => s.tab)
  const setTab = useStore((s) => s.setTab)
  const viewKind = useStore((s) => s.view.kind)
  const rate = useStore((s) => s.rate)
  const setRate = useStore((s) => s.setRate)
  const [menu, setMenu] = useState<'layers' | 'more' | null>(null)
  const [about, setAbout] = useState(false)
  const closeAbout = useCallback(() => setAbout(false), [])
  const expandOnTap = useExpandOnTap()
  const detail = DETAIL[quality]
  // The 3D view is drawn only when something changes (not 60 times a second), so every
  // React update asks for one fresh frame.
  useEffect(() => {
    invalidate()
  })
  const finder = useStore((s) => s.finder)
  const preset = useStore((s) => s.preset)
  const setWindowStart = useStore((s) => s.setWindowStart)
  const windowStart = useStore((s) => s.windowStart)

  // The 60-day analysis window only moves when the clock leaves it, so playback stays smooth.
  useEffect(() => {
    if (tMs < windowStart || tMs > windowStart + 57 * 86400000) setWindowStart(Math.floor(tMs / 3600000) * 3600000 - 2 * 86400000)
  }, [tMs, windowStart, setWindowStart])

  // Site finder: the layers are fetched the first time it is opened, then every change of
  // the limits re-scores the whole grid (about 0.1 s).
  const [finderGrid, setFinderGrid] = useState<FinderGrid | null>(null)
  const finderOn = layer === 'finder'
  useEffect(() => {
    if (finderOn && !finderGrid) loadFinderGrid(BASE).then(setFinderGrid, () => {})
  }, [finderOn, finderGrid])
  const criteria = useDeferredValue(finder)
  const finderResult = useMemo(() => (finderOn && finderGrid ? runFinder(finderGrid, criteria) : null), [finderOn, finderGrid, criteria])
  const scoreTex = useMemo(() => {
    if (!finderGrid) return null
    const t = new THREE.DataTexture(new Uint8Array(finderGrid.size * finderGrid.size), finderGrid.size, finderGrid.size, THREE.RedFormat, THREE.UnsignedByteType)
    t.minFilter = t.magFilter = THREE.LinearFilter
    return t
  }, [finderGrid])
  const score = useMemo(() => {
    if (!scoreTex || !finderResult) return null
    ;(scoreTex.image.data as Uint8Array).set(finderResult.score)
    scoreTex.needsUpdate = true
    return { tex: scoreTex, min: finderResult.minPref, max: finderResult.maxPref }
  }, [scoreTex, finderResult])

  const sun = useMemo(() => {
    if (!ephem) return { dir: [1, 0, 0] as Vec3, rad: 0.00465 }
    const v = bodyVectors(ephem, tMs).sun
    return { dir: unit(v), rad: Math.asin(SUN_RADIUS_KM / Math.hypot(v[0], v[1], v[2])) }
  }, [ephem, tMs])
  // Where the Sun and the Earth are from the Moon now, for drawing them in the main view.
  const bodies = useMemo(() => (ephem ? bodyVectors(ephem, tMs) : null), [ephem, tMs])

  // 80 m patches around mission sites, fetched when a pinned point needs one.
  // null marks a patch that failed to load: the point then keeps the coarser data.
  const [patches, setPatches] = useState<Record<string, Terrain | null>>({})
  // The patches a point uses, finest first: a polar lander has a 20 m patch (to 5 km) and an
  // 80 m one (to 61 km); most sites have just the 80 m one.
  const patchIdsFor = useCallback(
    (lat: number, lon: number): string[] => {
      if (!patchIndex || !terrain) return []
      const fine = terrainTier(terrain, lat, lon) === 'fine'
      // Inside the 80 m south-pole tile only a finer (20 m) patch adds anything.
      return patchesCovering(patchIndex, lat, lon)
        .filter((e) => e.kind === 'crest20' || !fine)
        .map((e) => e.id)
    },
    [patchIndex, terrain],
  )
  const patchIdFor = useCallback((lat: number, lon: number) => patchIdsFor(lat, lon)[0] ?? null, [patchIdsFor])
  useEffect(() => {
    if (!patchIndex) return
    for (const p of pins) {
      for (const id of patchIdsFor(p.lat, p.lon)) {
        const entry = !(id in patches) ? patchIndex.patches.find((e) => e.id === id) : null
        if (!entry) continue
        loadPatch(BASE, patchIndex, entry).then(
          (t) => setPatches((m) => (entry.id in m ? m : { ...m, [entry.id]: t })),
          () => setPatches((m) => (entry.id in m ? m : { ...m, [entry.id]: null })),
        )
      }
    }
  }, [pins, patchIndex, patchIdsFor, patches])
  const patchOf = useCallback(
    (lat: number, lon: number): Terrain[] =>
      patchIdsFor(lat, lon)
        .map((id) => patches[id])
        .filter((t): t is Terrain => !!t),
    [patchIdsFor, patches],
  )
  // A point's figures are held back until the terrain they depend on has arrived (its detailed
  // patch and the whole-Moon map), so numbers never appear from coarse data and then change.
  const terrainPending = useCallback(
    (lat: number, lon: number) => {
      if (!reliefSettled) return true
      return patchIdsFor(lat, lon).some((id) => !(id in patches))
    },
    [reliefSettled, patchIdsFor, patches],
  )
  // Patches on screen: those under the pinned points.
  const shownPatches = useMemo(() => {
    const ids = new Set<string>()
    for (const p of pins) {
      for (const id of patchIdsFor(p.lat, p.lon)) {
        if (patches[id] && patches[id].render !== false) ids.add(id)
      }
    }
    return [...ids].map((id) => patches[id] as Terrain)
  }, [pins, patchIdsFor, patches])
  const patchCuts: Cut[] = useMemo(
    () => shownPatches.map((t) => ({ frame: t.frame, halfKm: t.levels[0].xMax / 1000 })),
    [shownPatches],
  )
  const cuts: Cut[] = useMemo(
    () => [...(terrain ? [{ frame: terrain.frame, halfKm: terrain.levels[0].xMax / 1000 }] : []), ...patchCuts],
    [terrain, patchCuts],
  )

  const elevation = useCallback(
    (lat: number, lon: number) => {
      let h = NaN
      for (const patch of patchOf(lat, lon)) {
        h = heightAt(patch, lat, lon)
        if (!Number.isNaN(h)) break
      }
      if (Number.isNaN(h)) h = terrain ? heightAt(terrain, lat, lon) : NaN
      if (!Number.isNaN(h)) return h
      // Outside the south-pole tiles: the whole-Moon map (about 2.7 km per pixel).
      return globeRelief ? globalHeightAt(globeRelief.dem, lat, lon) : 0
    },
    [terrain, globeRelief, patchOf],
  )
  const pick = useCallback(
    (lat: number, lon: number, label?: string) => addPin({ lat, lon, hM: elevation(lat, lon), label }),
    [addPin, elevation],
  )
  // A pick made while a mission view is open first closes it (the same way out as its close
  // button), and goes ahead when the camera is back up; see store.whenShowcaseClosed.
  const later = useStore((s) => s.whenShowcaseClosed)
  const selectMission = useCallback(
    (m: Mission) => later(() => {
      pick(m.lat, m.lon, m.name)
      if (terrain && (terrainTier(terrain, m.lat, m.lon) !== 'none' || patchIdFor(m.lat, m.lon))) {
        goTo({ kind: 'site', lat: m.lat, lon: m.lon, hM: elevation(m.lat, m.lon) })
      } else {
        goTo({ kind: 'globe', lat: m.lat, lon: m.lon })
      }
      // The showcase opens over the site; the pin underneath remembers which mission it is.
      const st = useStore.getState()
      if (st.activePin !== null) st.linkMission(st.activePin, m.id)
      // The mission view follows once this flight has ended (ui/Showcase.tsx drives the sequence).
      st.startShowcase(m.id, 'flight')
    }),
    [later, pick, goTo, terrain, elevation, patchIdFor],
  )
  // Typed coordinates: pinned like a map click, then flown to like a mission site.
  const addByCoords = useCallback(
    (lat: number, lon: number, label?: string) => later(() => {
      pick(lat, lon, label)
      if (terrain && (terrainTier(terrain, lat, lon) !== 'none' || patchIdFor(lat, lon))) {
        goTo({ kind: 'site', lat, lon, hM: elevation(lat, lon) })
      } else {
        goTo({ kind: 'globe', lat, lon })
      }
    }),
    [later, pick, goTo, terrain, elevation, patchIdFor],
  )
  // A shared link (ui/CopyLink.tsx) is restored once, when the data the pins need has loaded.
  // Everything in it has been checked by decodeShare; then the hash is removed from the address.
  const restored = useRef(false)
  useEffect(() => {
    if (restored.current || !ephem || !terrain || !reliefSettled) return
    restored.current = true
    const shared = decodeShare(location.hash, PRESET_IDS)
    if (!shared) return
    const st = useStore.getState()
    st.setAssumptions({
      ...(shared.sun ? { minSunFrac: SUN_RULES.find((r) => r.id === shared.sun)!.minSunFrac } : {}),
      ...(shared.earthMaskDeg !== undefined ? { earthMaskDeg: shared.earthMaskDeg } : {}),
      ...(shared.observerM !== undefined ? { observerM: shared.observerM } : {}),
    })
    if (shared.preset) st.applyPreset(shared.preset)
    if (shared.tMs !== undefined) {
      const [first, last] = clockRange(ephem)
      st.setTime(Math.min(Math.max(shared.tMs, first), last))
    }
    if (shared.layer) st.setLayer(shared.layer)
    for (const s of shared.sites) pick(s.lat, s.lon, s.label)
    const last = shared.sites.at(-1)
    if (last) {
      if (terrainTier(terrain, last.lat, last.lon) !== 'none' || patchIdFor(last.lat, last.lon)) goTo({ kind: 'site', lat: last.lat, lon: last.lon, hM: elevation(last.lat, last.lon) })
      else goTo({ kind: 'globe', lat: last.lat, lon: last.lon })
      // The sites are what was shared: show them rather than the start card (it is not marked as seen).
      useStore.setState({ help: false, tour: null, welcome: false })
      if (isPhone()) st.setSheet('half')
    } else if (shared.layer === 'finder') st.setTab('find')
    history.replaceState(history.state, '', location.pathname + location.search)
  }, [ephem, terrain, reliefSettled, pick, goTo, elevation, patchIdFor])

  const pickCandidates = useCallback(
    (ks: Candidate[], fly = true) => later(() => ks.forEach((k) => {
      const name = PRESETS.find((p) => p.id === preset)?.short ?? 'Custom'
      pick(k.lat, k.lon, `${name} #${k.rank}`)
      // Remember that this pin came from the finder: its card opens on "When to land".
      const id = useStore.getState().activePin
      if (id !== null) useStore.getState().markFromFinder(id)
      // A single pick (not "Compare top 3") goes on to its landing dates.
      if (id !== null && fly) useStore.getState().focusLanding(id)
      if (fly) goTo({ kind: 'site', lat: k.lat, lon: k.lon, hM: elevation(k.lat, k.lon) })
    })),
    [later, pick, goTo, elevation, preset],
  )
  const missionHeights = useMemo(() => missions.map((m) => elevation(m.lat, m.lon)), [missions, elevation])
  const [hover, setHover] = useState<{ m: Mission; x: number; y: number } | null>(null)
  const onHover = useCallback((m: Mission | null, x: number, y: number) => setHover(m ? { m, x, y } : null), [])
  const current = LAYERS.find((l) => l.value === layer)!

  // A place that is already pinned is flown to again rather than pinned twice.
  const flyToPinned = (label: string) => {
    const st = useStore.getState()
    const had = st.pins.find((x) => x.label === label)
    if (!had) return false
    st.setActivePin(had.id)
    goTo({ kind: 'site', lat: had.lat, lon: had.lon, hM: had.hM })
    return true
  }
  // A named crest is pinned at the highest ground within 300 m of its listed coordinates: the
  // listed point itself can sit in a small pit beside the crest.
  const pinPlace = (place: PatchIndex['patches'][number]) => later(() => pinPlaceNow(place))
  const pinPlaceNow = (place: PatchIndex['patches'][number]) => {
    if (!patchIndex) return
    if (flyToPinned(place.name ?? place.id)) return
    const pin = (t: Terrain | null) => {
      const at = t ? highestNear(t, 300) : { lat: place.lat, lon: place.lon }
      pick(at.lat, at.lon, place.name ?? place.id)
      goTo({ kind: 'site', lat: at.lat, lon: at.lon, hM: elevation(at.lat, at.lon) })
    }
    const have = patches[place.id]
    if (have !== undefined) pin(have)
    else
      loadPatch(BASE, patchIndex, place).then(
        (t) => {
          setPatches((m) => (place.id in m ? m : { ...m, [place.id]: t }))
          pin(t)
        },
        () => pin(null),
      )
  }
  // The start card's examples: a polar crest with long sunlight, and a crater floor the Sun never reaches.
  const examplePlace = patchIndex?.patches.find((x) => x.id === 'connecting-ridge') ?? patchIndex?.patches.find((x) => x.kind === 'crest20')
  const mainMenu = useRef<HTMLDetailsElement>(null)
  const mode = useStore((s) => s.mode)
  const setMode = useStore((s) => s.setMode)
  const welcome = useStore((s) => s.welcome)
  const closeMenus = () => {
    if (mainMenu.current) mainMenu.current.open = false
    setMenu(null)
  }
  const openHelp = () => {
    useStore.getState().setHelp(true)
    setTab('sites')
    setMenu(null)
    if (isPhone()) setSheet('full')
  }

  const showcaseId = useStore((s) => s.showcase)
  // The mission view is on screen only in its ground-level steps; before that the camera is still travelling.
  const showcasePhase = useStore((s) => s.showcasePhase)
  useShowcaseSequence()
  usePreloadModel(showcaseId ? (missions.find((m) => m.id === showcaseId) ?? null) : null, import.meta.env.BASE_URL)
  const showcaseUp = useStore((s) => s.showcaseUp)
  const showcased = showcaseId && showcaseUp && (showcasePhase === 'ground' || showcasePhase === 'leaving') ? (missions.find((m) => m.id === showcaseId) ?? null) : null

  const intro: Parameters<typeof Intro>[0] = {
    onRidge: examplePlace ? () => pinPlace(examplePlace) : undefined,
    ridgeLabel: examplePlace ? (examplePlace.name ?? examplePlace.id) : undefined,
    onCrater: () => later(() => void (flyToPinned(CRATER_LABEL) || addByCoords(-89.67, 129.2, CRATER_LABEL))),
    onPlan: () => chooseLayer('finder'),
  }
  const chooseLayer = (l: LayerMode) => {
    setLayer(l)
    setMenu(null)
    if (l === 'finder') {
      setTab('find')
      if (sheet === 'peek' && isPhone()) setSheet('half')
    }
  }

  return (
    <div className="app" data-mode={mode} data-welcome={welcome ? 'on' : 'off'} data-sheet={sheet} data-tab={finderOn && tab === 'find' ? 'find' : 'sites'} data-finder={finderOn ? 'on' : 'off'} data-showcase={showcased ? 'on' : 'off'}>
      <div className="viewport">
        <Canvas
          frameloop="demand"
          camera={{ position: POLE_POSE.pos, up: POLE_POSE.up, near: 1, far: 30000, fov: 40 }}
          gl={{ antialias: quality !== 'low', powerPreference: 'high-performance' }}
          dpr={[1, detail.dpr]}
        >
          <color attach="background" args={['#000']} />
          <Globe sunDir={sun.dir} cuts={cuts} map={globeMap} relief={globeRelief} segments={detail.globe} onPick={pick} />
          {terrain && (
            <MoonTerrain terrain={terrain} sunDir={sun.dir} sunRad={sun.rad} layer={layer} score={score} dataBase={BASE} map={globeMap} relief={globeRelief} overlays cuts={patchCuts} detail={detail} onPick={pick} />
          )}
          {shownPatches.map((t) => (
            <MoonTerrain key={t.id} terrain={t} sunDir={sun.dir} sunRad={sun.rad} layer={layer} dataBase={BASE} map={globeMap} relief={globeRelief} overlays={false} detail={detail} onPick={pick} />
          ))}
          <Missions missions={missions} heights={missionHeights} onSelect={selectMission} onHover={onHover} />
          {bodies && <SkyBodies sun={bodies.sun} earth={bodies.earth} tMs={tMs} />}
          <PinMarkers elevation={elevation} />
          {finderResult && <CandidateMarkers candidates={finderResult.candidates} elevation={elevation} onPick={(k) => pickCandidates([k])} />}
          <Rig elevation={elevation} />
          {bodies && <SkyCompassDriver sun={bodies.sun} earth={bodies.earth} />}
        </Canvas>
        <SkyCompassChips />
      </div>

      <div className="chrome">
        {menu && <div className="scrim" onClick={() => setMenu(null)} />}
        <header className="top" onKeyDown={(e) => e.key === 'Escape' && setMenu(null)}>
          <h1>
            <span className="not-phone">Lunar Landing Site Navigator</span>
            <span className="phone-only">Lunar Navigator</span>
          </h1>
          <button
            className="btn phone-only layers-btn"
            aria-haspopup="true"
            aria-expanded={menu === 'layers'}
            aria-label={`Map layer: ${current.label}. Change`}
            onClick={() => setMenu(menu === 'layers' ? null : 'layers')}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M8 2l6 3-6 3-6-3zM2 8l6 3 6-3M2 11l6 3 6-3" />
            </svg>
            {current.label}
          </button>
          <button
            className="btn ghost icon phone-only"
            aria-haspopup="true"
            aria-expanded={menu === 'more'}
            aria-label="More: view, missions, detail and playback speed"
            onClick={() => setMenu(menu === 'more' ? null : 'more')}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true" className="solid">
              <circle cx="3" cy="8" r="1.5" />
              <circle cx="8" cy="8" r="1.5" />
              <circle cx="13" cy="8" r="1.5" />
            </svg>
          </button>

          <div className="menu" data-open={menu === 'more'}>
            <Segmented
              label="View"
              options={[
                ['pole', 'South Pole'],
                ['globe', 'Whole Moon'],
              ]}
              value={viewKind === 'pole' || viewKind === 'globe' ? viewKind : null}
              onChange={(k) => {
                later(() => goTo({ kind: k }))
                setMenu(null)
              }}
            />
            {finderOn && <TabSwitch finderOn className="tablet-only" />}
            <select
              className="missions"
              aria-label="Go to a mission site"
              value=""
              onChange={(e) => {
                const m = missions.find((x) => x.id === e.target.value)
                if (m) selectMission(m)
                const place = patchIndex?.patches.find((x) => `place:${x.id}` === e.target.value)
                if (place) pinPlace(place)
                setMenu(null)
              }}
            >
              <option value="">Go to a mission site or place…</option>
              {(['landed', 'crashed', 'planned'] as const).map((st) => (
                <optgroup key={st} label={st === 'landed' ? 'Landed' : st === 'crashed' ? 'Lost on landing' : 'Planned (target area)'}>
                  {missions
                    .filter((m) => m.status === st)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({/\b(?:19|20)\d{2}\b/.exec(m.date_utc)?.[0] ?? 'planned'})
                      </option>
                    ))}
                </optgroup>
              ))}
              {patchIndex?.patches.some((x) => x.kind === 'crest20') && (
                <optgroup label="Crests and rims (20 m terrain)">
                  {patchIndex.patches
                    .filter((x) => x.kind === 'crest20')
                    .map((x) => (
                      <option key={x.id} value={`place:${x.id}`}>
                        {x.name ?? x.id}
                      </option>
                    ))}
                </optgroup>
              )}
            </select>
            <details className="mainmenu" ref={mainMenu}>
              <summary className="btn" aria-label="Menu: guides, detail and about">
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M2 4h12M2 8h12M2 12h12" />
                </svg>
                Guides and settings
              </summary>
              <div className="mainmenu-body panel-surface">
                <h3 className="section">Guides: learn by doing</h3>
                <ul className="guide-list">
                  {GUIDES.map((g) => (
                    <li key={g.id}>
                      <button
                        type="button"
                        onClick={() => {
                          closeMenus()
                          startGuide(g.id)
                        }}
                      >
                        <b>{g.title}</b>
                        <small>{g.about}</small>
                      </button>
                    </li>
                  ))}
                </ul>
                <h3 className="section">Settings</h3>
                <div className="quality">
                  <span>View</span>
                  <Segmented
                    label="View"
                    options={[
                      ['explore', 'Explorer'],
                      ['plan', 'Mission planner'],
                    ]}
                    value={mode}
                    onChange={setMode}
                  />
                </div>
                <label className="quality">
                  <span>3D detail</span>
                  <select value={quality} onChange={(e) => setQuality(e.target.value as Quality)} aria-label="3D detail level">
                    <option value="low">Low (phones)</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </label>
                <div className="pro-only menu-assume">
                  <h3 className="section">Assumptions</h3>
                  <AssumptionsPanel />
                </div>
                <button
                  className="btn help-btn"
                  onClick={() => {
                    closeMenus()
                    setAbout(true)
                  }}
                >
                  Data and method: sources and checks
                </button>
                <button
                  className="btn ghost help-btn"
                  onClick={() => {
                    closeMenus()
                    openHelp()
                  }}
                >
                  About this app and how it works
                </button>
              </div>
            </details>
            <div className="quality phone-only">
              <span>Speed</span>
              <Segmented label="Playback speed" options={RATES} value={rate} onChange={setRate} />
            </div>
          </div>

          <i className="brk" />
          <div className="layerbar" data-open={menu === 'layers'}>
            <button className="btn find-btn" aria-pressed={layer === 'finder'} title={`${LAYERS[0].label}. ${LAYERS[0].legend}`} onClick={() => chooseLayer(layer === 'finder' ? 'natural' : 'finder')}>
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <circle cx="7" cy="7" r="4.5" />
                <path d="M10.5 10.5L14 14" />
              </svg>
              <span>{LAYERS[0].label}</span>
              <small>{LAYERS[0].hint}</small>
            </button>
            <span className="bar-label">Map layers</span>
            <div className="seg" role="group" aria-label="Map layer">
              {LAYERS.slice(1).map((l) => (
                <button
                  key={l.value}
                  className={l.value === 'elevation' || l.value === 'slope' ? 'pro-only' : undefined}
                  aria-pressed={l.value === layer}
                  aria-label={`${l.full ?? l.label}: ${l.hint}`}
                  title={`${l.full ?? l.label}. ${l.legend}`}
                  onClick={() => chooseLayer(l.value)}
                >
                  <span>{l.label}</span>
                  <small>{l.hint}</small>
                  {l.value === layer && l.ramp && (
                    <span className="ramp">
                      <span>{l.ends![0]}</span>
                      <i style={{ background: l.ramp }} />
                      <span>{l.ends![1]}</span>
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </header>

        <div className="stage">
          <SheetHead finderOn={finderOn} />
          <div className="dock dock-left" onClick={expandOnTap}>
            {finderOn ? (
              <ErrorBoundary what="The site finder">
                <FinderPanel result={finderResult} onPick={(k) => pickCandidates([k])} onCompareTop={(cs) => pickCandidates(cs, false)} />
              </ErrorBoundary>
            ) : (
              <div className="legend panel-surface">
                {current.ramp && (
                  <div className="ramp">
                    <span>{current.ends![0]}</span>
                    <i style={{ background: current.ramp }} />
                    <span>{current.ends![1]}</span>
                  </div>
                )}
                <p>{current.legend}</p>
                <p className="credit-line">
                  Data: NASA LOLA terrain, JPL DE440 Sun and Earth positions, NASA GSFC sunlight maps.{' '}
                  <button type="button" className="link" onClick={() => setAbout(true)}>
                    Data and method
                  </button>
                </p>
              </div>
            )}
          </div>
          {showcased && <ShowcaseHero mission={showcased} ephem={ephem} baseUrl={import.meta.env.BASE_URL} />}
          <div className="dock dock-right" onClick={expandOnTap}>
            {showcased && <ShowcasePanel mission={showcased} baseUrl={import.meta.env.BASE_URL} />}
            {ephem && terrain ? (
              <ErrorBoundary what="The sites panel">
                <SitesPanel pins={pins} activePin={activePin} ephem={ephem} terrain={terrain} patchOf={patchOf} pending={terrainPending} global={globeRelief ? globeRelief.dem : null} onAddCoords={addByCoords} intro={intro} />
              </ErrorBoundary>
            ) : null}
          </div>
        </div>

        {ephem && <TimeBar ephem={ephem} />}
      </div>

      {ephem && terrain && !welcome && <Tutorial />}
      {welcome && <Welcome ready={!!ephem && !!terrain} />}
      {about && <DataMethod onClose={closeAbout} />}

      {hover && (
        <div className="tip" style={{ left: hover.x + 12, top: hover.y + 12 }}>
          <b>
            <i style={{ background: STATUS_COLOR[hover.m.status] }} />
            {hover.m.name}
          </b>
          <span>
            {hover.m.agency} · {/^\d{4}-\d\d-\d\d/.test(hover.m.date_utc) ? hover.m.date_utc.slice(0, 10) : hover.m.date_utc} · {hover.m.status}
          </span>
          <span>{hover.m.summary}</span>
        </div>
      )}

      {(!ephem || !terrain) && !error && <div className="status panel-surface">Loading NASA terrain and Sun and Earth positions…</div>}
      {error && (
        <div className="status panel-surface error" role="alert">
          <i className="dot danger" />
          {error}
        </div>
      )}
    </div>
  )
}
