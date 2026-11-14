import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import { bodyVectors, ephemEndMs, ephemStartMs, loadEphem, type Ephem } from './lib/ephem'
import { loadFinderGrid, PRESETS, runFinder, type Candidate, type FinderGrid } from './lib/finder'
import { sitePosKm, SUN_RADIUS_KM, unit, type Vec3 } from './lib/geo'
import type { GlobalDem } from './lib/globalDem'
import {
  heightAt,
  loadPatch,
  loadPatchIndex,
  loadTerrain,
  patchCovering,
  terrainTier,
  type PatchIndex,
  type Terrain,
} from './lib/terrain'
import { Globe } from './scene/Globe'
import { Missions, STATUS_COLOR, type Mission } from './scene/Missions'
import { MoonTerrain } from './scene/MoonTerrain'
import { POLE_POSE, Rig } from './scene/Rig'
import { globalHeightAt } from './lib/globalDem'
import { useGlobeMap, useGlobeRelief, type Cut } from './scene/shading'
import { SITE_COLORS, useStore, type LayerMode, type Pin } from './store'
import { Compare } from './ui/Compare'
import { FinderPanel } from './ui/FinderPanel'
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
    loadEphem(BASE).then(setEphem, (e) => setError(`Ephemeris failed to load: ${e.message}`))
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
      if (next >= ephemEndMs(ephem)) setPlaying(false)
      else setTime(next)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, ephem])
}

const RATES: { label: string; value: number }[] = [
  { label: '1 h/s', value: 3600 },
  { label: '6 h/s', value: 6 * 3600 },
  { label: '1 d/s', value: 86400 },
  { label: '7 d/s', value: 7 * 86400 },
]
const LAYERS: { label: string; value: LayerMode; legend: string; ramp?: string; ends?: [string, string] }[] = [
  {
    label: 'Find a site',
    value: 'finder',
    legend: 'Ground that meets every limit, brightest where it fits best. Slope from LOLA; long-term sunlight, Earth view and permanent shadow from NASA GSFC.',
  },
  { label: 'Sunlight now', value: 'natural', legend: 'Sunlight and shadow at the selected time, from LOLA terrain and the JPL DE440 ephemeris.' },
  {
    label: 'Average sunlight',
    value: 'sunavg',
    legend: 'Share of time the Sun is visible, averaged over 18.6 years. NASA GSFC (Mazarico et al. 2011).',
    ramp: 'linear-gradient(90deg,#08051a,#59197a,#e66633,#fff299)',
    ends: ['never', 'always'],
  },
  {
    label: 'Average Earth view',
    value: 'earthavg',
    legend: 'Share of time Earth is visible, averaged over 18.6 years. NASA GSFC (Mazarico et al. 2011).',
    ramp: 'linear-gradient(90deg,#0a0a0f,#1a4d99,#bfebff)',
    ends: ['never', 'always'],
  },
  {
    label: 'Permanent shadow',
    value: 'psr',
    legend: 'Blue areas never see the Sun: cold enough for water ice to survive. NASA GSFC LOLA.',
  },
  {
    label: 'Elevation',
    value: 'elevation',
    legend: 'Height relative to the 1737.4 km reference sphere (LOLA).',
    ramp: 'linear-gradient(90deg,#171c54,#1a738c,#c7b373,#faf7f0)',
    ends: ['−4.5 km', '+4.5 km'],
  },
  {
    label: 'Slope',
    value: 'slope',
    legend: 'Surface slope over a ~160 m baseline (LOLA 80 m).',
    ramp: 'linear-gradient(90deg,#1a8c4d,#8cbf40 27%,#f2b326 50%,#bf1f1a)',
    ends: ['0°', '30°+'],
  },
]
const WINDOW_MS = 30 * 86400 * 1000

const toInput = (ms: number) => new Date(ms).toISOString().slice(0, 16)

function TimeBar({ ephem }: { ephem: Ephem }) {
  const { tMs, playing, rate, setTime, setPlaying, setRate } = useStore()
  // The slider scrubs a 60-day window centred where the user last jumped to.
  const [centre, setCentre] = useState(tMs)
  const lo = Math.max(centre - WINDOW_MS, ephemStartMs(ephem))
  const hi = Math.min(centre + WINDOW_MS, ephemEndMs(ephem))
  useEffect(() => {
    if (tMs < lo || tMs > hi) setCentre(tMs)
  }, [tMs, lo, hi])
  return (
    <div className="timebar">
      <button className="play" onClick={() => setPlaying(!playing)} aria-label={playing ? 'Pause' : 'Play'}>
        {playing ? '❚❚' : '▶'}
      </button>
      <div className="rates">
        {RATES.map((r) => (
          <button key={r.value} className={r.value === rate ? 'on' : ''} onClick={() => setRate(r.value)}>
            {r.label}
          </button>
        ))}
      </div>
      <input
        className="scrub"
        type="range"
        min={lo}
        max={hi}
        step={600000}
        value={tMs}
        onChange={(e) => setTime(Number(e.target.value))}
        aria-label="Time"
      />
      <input
        className="date"
        type="datetime-local"
        value={toInput(tMs)}
        min={toInput(ephemStartMs(ephem))}
        max={toInput(ephemEndMs(ephem))}
        onChange={(e) => {
          const t = Date.parse(`${e.target.value}Z`)
          if (!Number.isNaN(t)) {
            setTime(t)
            setCentre(t)
          }
        }}
        aria-label="Date and time (UTC)"
      />
      <span className="utc">UTC</span>
    </div>
  )
}

function PinMarkers({ elevation }: { elevation: (lat: number, lon: number) => number }) {
  const pins = useStore((s) => s.pins)
  const active = useStore((s) => s.activePin)
  const map = useMemo(ringTexture, [])
  return (
    <>
      {pins.map((p) => (
        <sprite key={p.id} position={sitePosKm(p.lat, p.lon, elevation(p.lat, p.lon) + 250)} scale={p.id === active ? [0.058, 0.058, 1] : [0.046, 0.046, 1]} renderOrder={6}>
          <spriteMaterial
            map={map}
            color={SITE_COLORS[p.slot]}
            opacity={p.id === active ? 1 : 0.75}
            sizeAttenuation={false}
            depthTest={false}
            transparent
          />
        </sprite>
      ))}
    </>
  )
}

/** Numbered markers for the site finder's shortlist. */
function CandidateMarkers({ candidates, elevation }: { candidates: Candidate[]; elevation: (lat: number, lon: number) => number }) {
  const maps = useMemo(() => Array.from({ length: 8 }, (_, i) => numberTexture(i + 1)), [])
  return (
    <>
      {candidates.map((k) => (
        <sprite key={k.rank} position={sitePosKm(k.lat, k.lon, elevation(k.lat, k.lon) + 250)} scale={[0.04, 0.04, 1]} renderOrder={5}>
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
  g.fillStyle = '#0b0c0f'
  g.beginPath()
  g.arc(48, 48, 40, 0, Math.PI * 2)
  g.fill()
  g.lineWidth = 6
  g.strokeStyle = '#fff26b'
  g.stroke()
  g.fillStyle = '#fff'
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
  patchOf: (lat: number, lon: number) => Terrain | null
  global: GlobalDem | null
}

/** Right-hand panel: one card per pinned site, or the comparison once there are two or more. */
function SitesPanel({ pins, activePin, ephem, terrain, patchOf, global }: SitesPanelProps) {
  const [mode, setMode] = useState<'compare' | 'cards'>('compare')
  const p = [pins[0] ?? null, pins[1] ?? null, pins[2] ?? null]
  // Always three calls (hooks cannot be called in a loop of changing length).
  const a0 = useSiteAnalysis(p[0], ephem, terrain, p[0] ? patchOf(p[0].lat, p[0].lon) : null, global)
  const a1 = useSiteAnalysis(p[1], ephem, terrain, p[1] ? patchOf(p[1].lat, p[1].lon) : null, global)
  const a2 = useSiteAnalysis(p[2], ephem, terrain, p[2] ? patchOf(p[2].lat, p[2].lon) : null, global)
  const sites = [a0, a1, a2].filter((a): a is SiteAnalysis => a !== null)
  const comparing = sites.length >= 2 && mode === 'compare'
  return (
    <aside className={`panel ${comparing ? 'wide' : ''}`}>
      {sites.length === 0 && <p className="hint">Click the surface or a mission marker to pin a point. Pin two or three to compare them.</p>}
      {sites.length >= 2 && (
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={mode === 'compare'} className={mode === 'compare' ? 'on' : ''} onClick={() => setMode('compare')}>
            Compare
          </button>
          <button role="tab" aria-selected={mode === 'cards'} className={mode === 'cards' ? 'on' : ''} onClick={() => setMode('cards')}>
            Site by site
          </button>
        </div>
      )}
      {comparing ? <Compare sites={sites} /> : sites.map((a) => <SiteCard key={a.pin.id} a={a} active={a.pin.id === activePin} />)}
    </aside>
  )
}

function ringTexture(): THREE.Texture {
  const c = document.createElement('canvas')
  c.width = c.height = 96
  const g = c.getContext('2d')!
  g.lineWidth = 9
  g.strokeStyle = '#0b0c0f'
  g.beginPath()
  g.arc(48, 48, 34, 0, Math.PI * 2)
  g.stroke()
  g.lineWidth = 5
  g.strokeStyle = '#fff'
  g.stroke()
  g.fillStyle = '#fff'
  g.beginPath()
  g.arc(48, 48, 5, 0, Math.PI * 2)
  g.fill()
  return new THREE.CanvasTexture(c)
}

export default function App() {
  const { ephem, terrain, error, missions, patchIndex } = useData()
  useClock(ephem)
  const globeMap = useGlobeMap(BASE)
  const globeRelief = useGlobeRelief(BASE)
  const tMs = useStore((s) => s.tMs)
  const layer = useStore((s) => s.layer)
  const setLayer = useStore((s) => s.setLayer)
  const pins = useStore((s) => s.pins)
  const addPin = useStore((s) => s.addPin)
  const activePin = useStore((s) => s.activePin)
  const goTo = useStore((s) => s.goTo)
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

  // 80 m patches around mission sites, fetched when a pinned point needs one.
  const [patches, setPatches] = useState<Record<string, Terrain>>({})
  const patchIdFor = useCallback(
    (lat: number, lon: number) => {
      if (!patchIndex || !terrain) return null
      const entry = patchCovering(patchIndex, lat, lon)
      // Inside the 80 m south-pole tile only a finer (20 m crest) patch adds anything.
      if (!entry || (entry.kind !== 'crest20' && terrainTier(terrain, lat, lon) === 'fine')) return null
      return entry.id
    },
    [patchIndex, terrain],
  )
  useEffect(() => {
    if (!patchIndex) return
    for (const p of pins) {
      const id = patchIdFor(p.lat, p.lon)
      const entry = id && !(id in patches) ? patchIndex.patches.find((e) => e.id === id) : null
      if (!entry) continue
      loadPatch(BASE, patchIndex, entry).then(
        (t) => setPatches((m) => (entry.id in m ? m : { ...m, [entry.id]: t })),
        () => {}, // the point keeps the coarser data
      )
    }
  }, [pins, patchIndex, patchIdFor, patches])
  const patchOf = useCallback(
    (lat: number, lon: number) => {
      const id = patchIdFor(lat, lon)
      return id ? (patches[id] ?? null) : null
    },
    [patchIdFor, patches],
  )
  // Patches on screen: those under the pinned points.
  const shownPatches = useMemo(() => {
    const ids = new Set<string>()
    for (const p of pins) {
      const id = patchIdFor(p.lat, p.lon)
      if (id && patches[id] && patches[id].render !== false) ids.add(id)
    }
    return [...ids].map((id) => patches[id])
  }, [pins, patchIdFor, patches])
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
      const patch = patchOf(lat, lon)
      let h = patch ? heightAt(patch, lat, lon) : NaN
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
  const selectMission = useCallback(
    (m: Mission) => {
      pick(m.lat, m.lon, m.name)
      if (terrain && (terrainTier(terrain, m.lat, m.lon) !== 'none' || patchIdFor(m.lat, m.lon))) {
        goTo({ kind: 'site', lat: m.lat, lon: m.lon, hM: elevation(m.lat, m.lon) })
      } else {
        goTo({ kind: 'globe', lat: m.lat, lon: m.lon })
      }
    },
    [pick, goTo, terrain, elevation, patchIdFor],
  )
  const pickCandidate = useCallback(
    (k: Candidate, fly = true) => {
      const name = PRESETS.find((p) => p.id === preset)?.short ?? 'Custom'
      pick(k.lat, k.lon, `${name} #${k.rank}`)
      if (fly) goTo({ kind: 'site', lat: k.lat, lon: k.lon, hM: elevation(k.lat, k.lon) })
    },
    [pick, goTo, elevation, preset],
  )
  const missionHeights = useMemo(() => missions.map((m) => elevation(m.lat, m.lon)), [missions, elevation])
  const [hover, setHover] = useState<{ m: Mission; x: number; y: number } | null>(null)
  const onHover = useCallback((m: Mission | null, x: number, y: number) => setHover(m ? { m, x, y } : null), [])
  const current = LAYERS.find((l) => l.value === layer)!

  return (
    <div className="app">
      <Canvas camera={{ position: POLE_POSE.pos, up: POLE_POSE.up, near: 1, far: 30000, fov: 40 }} gl={{ antialias: true }} dpr={[1, 2]}>
        <color attach="background" args={['#000']} />
        <Globe sunDir={sun.dir} cuts={cuts} map={globeMap} relief={globeRelief} onPick={pick} />
        {terrain && (
          <MoonTerrain terrain={terrain} sunDir={sun.dir} sunRad={sun.rad} layer={layer} score={score} dataBase={BASE} map={globeMap} relief={globeRelief} overlays cuts={patchCuts} onPick={pick} />
        )}
        {shownPatches.map((t) => (
          <MoonTerrain key={t.id} terrain={t} sunDir={sun.dir} sunRad={sun.rad} layer={layer} dataBase={BASE} map={globeMap} relief={globeRelief} overlays={false} onPick={pick} />
        ))}
        <Missions missions={missions} heights={missionHeights} onSelect={selectMission} onHover={onHover} />
        <PinMarkers elevation={elevation} />
        {finderResult && <CandidateMarkers candidates={finderResult.candidates} elevation={elevation} />}
        <Rig />
      </Canvas>

      <header className="top">
        <h1>Lunar Landing Site Navigator</h1>
        <div className="layers" role="group" aria-label="View">
          <button onClick={() => goTo({ kind: 'pole' })}>South Pole</button>
          <button onClick={() => goTo({ kind: 'globe' })}>Whole Moon</button>
        </div>
        <select
          className="missions"
          aria-label="Go to a mission site"
          value=""
          onChange={(e) => {
            const m = missions.find((x) => x.id === e.target.value)
            if (m) selectMission(m)
            const place = patchIndex?.patches.find((x) => `place:${x.id}` === e.target.value)
            if (place) {
              pick(place.lat, place.lon, place.name ?? place.id)
              goTo({ kind: 'site', lat: place.lat, lon: place.lon, hM: elevation(place.lat, place.lon) })
            }
          }}
        >
          <option value="">Go to a mission site or place…</option>
          {(['landed', 'crashed', 'planned'] as const).map((st) => (
            <optgroup key={st} label={st === 'landed' ? 'Landed' : st === 'crashed' ? 'Lost on landing' : 'Planned (target area)'}>
              {missions
                .filter((m) => m.status === st)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.date_utc.slice(0, 4)})
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
        <div className="layers" role="group" aria-label="Map layer">
          {LAYERS.map((l) => (
            <button key={l.value} className={l.value === layer ? 'on' : ''} onClick={() => setLayer(l.value)}>
              {l.label}
            </button>
          ))}
        </div>
      </header>

      {finderOn && <FinderPanel result={finderResult} onPick={pickCandidate} onCompareTop={(cs) => cs.forEach((k) => pickCandidate(k, false))} />}

      <div className="legend" hidden={finderOn}>
        {current.ramp && (
          <div className="ramp">
            <span>{current.ends![0]}</span>
            <i style={{ background: current.ramp }} />
            <span>{current.ends![1]}</span>
          </div>
        )}
        <p>{current.legend}</p>
      </div>

      {ephem && terrain ? (
        <SitesPanel pins={pins} activePin={activePin} ephem={ephem} terrain={terrain} patchOf={patchOf} global={globeRelief ? globeRelief.dem : null} />
      ) : null}

      {hover && (
        <div className="tip" style={{ left: hover.x + 12, top: hover.y + 12 }}>
          <b>
            <i style={{ background: STATUS_COLOR[hover.m.status] }} />
            {hover.m.name}
          </b>
          <span>
            {hover.m.agency} · {hover.m.date_utc.slice(0, 10)} · {hover.m.status}
          </span>
          <span>{hover.m.summary}</span>
        </div>
      )}

      {(!ephem || !terrain) && !error && <div className="status">Loading NASA terrain and ephemeris…</div>}
      {error && <div className="status error">{error}</div>}
      {ephem && <TimeBar ephem={ephem} />}
    </div>
  )
}
