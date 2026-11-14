import { useCallback, useEffect, useMemo, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import { bodyVectors, ephemEndMs, ephemStartMs, loadEphem, type Ephem } from './lib/ephem'
import { sitePosKm, SUN_RADIUS_KM, unit, type Vec3 } from './lib/geo'
import { heightAt, loadTerrain, terrainTier, type Terrain } from './lib/terrain'
import { Globe } from './scene/Globe'
import { Missions, STATUS_COLOR, type Mission } from './scene/Missions'
import { MoonTerrain } from './scene/MoonTerrain'
import { POLE_POSE, Rig } from './scene/Rig'
import { useStore, type LayerMode } from './store'
import { SiteCard } from './ui/SiteCard'
import './App.css'

const BASE = `${import.meta.env.BASE_URL}data/`

function useData() {
  const [ephem, setEphem] = useState<Ephem | null>(null)
  const [terrain, setTerrain] = useState<Terrain | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [missions, setMissions] = useState<Mission[]>([])
  useEffect(() => {
    fetch(`${BASE}missions.json`)
      .then((r) => r.json())
      .then(setMissions, () => setMissions([]))
    loadEphem(BASE).then(setEphem, (e) => setError(`Ephemeris failed to load: ${e.message}`))
    loadTerrain(BASE).then(setTerrain, (e) => setError(`Terrain failed to load: ${e.message}`))
  }, [])
  return { ephem, terrain, error, missions }
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

function PinMarkers() {
  const pins = useStore((s) => s.pins)
  const active = useStore((s) => s.activePin)
  const map = useMemo(ringTexture, [])
  return (
    <>
      {pins.map((p) => (
        <sprite key={p.id} position={sitePosKm(p.lat, p.lon, p.hM + 250)} scale={[0.05, 0.05, 1]} renderOrder={6}>
          <spriteMaterial
            map={map}
            color={p.id === active ? '#ffcf4a' : '#6fd3ff'}
            sizeAttenuation={false}
            depthTest={false}
            transparent
          />
        </sprite>
      ))}
    </>
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
  const { ephem, terrain, error, missions } = useData()
  useClock(ephem)
  const tMs = useStore((s) => s.tMs)
  const layer = useStore((s) => s.layer)
  const setLayer = useStore((s) => s.setLayer)
  const pins = useStore((s) => s.pins)
  const addPin = useStore((s) => s.addPin)
  const activePin = useStore((s) => s.activePin)
  const goTo = useStore((s) => s.goTo)

  const sun = useMemo(() => {
    if (!ephem) return { dir: [1, 0, 0] as Vec3, rad: 0.00465 }
    const v = bodyVectors(ephem, tMs).sun
    return { dir: unit(v), rad: Math.asin(SUN_RADIUS_KM / Math.hypot(v[0], v[1], v[2])) }
  }, [ephem, tMs])

  const elevation = useCallback(
    (lat: number, lon: number) => {
      const h = terrain ? heightAt(terrain, lat, lon) : NaN
      return Number.isNaN(h) ? 0 : h
    },
    [terrain],
  )
  const pick = useCallback(
    (lat: number, lon: number, label?: string) => addPin({ lat, lon, hM: elevation(lat, lon), label }),
    [addPin, elevation],
  )
  const selectMission = useCallback(
    (m: Mission) => {
      pick(m.lat, m.lon, m.name)
      if (terrain && terrainTier(terrain, m.lat, m.lon) !== 'none') {
        goTo({ kind: 'site', lat: m.lat, lon: m.lon, hM: elevation(m.lat, m.lon) })
      } else {
        goTo({ kind: 'globe', lat: m.lat, lon: m.lon })
      }
    },
    [pick, goTo, terrain, elevation],
  )
  const missionHeights = useMemo(() => missions.map((m) => elevation(m.lat, m.lon)), [missions, elevation])
  const [hover, setHover] = useState<{ m: Mission; x: number; y: number } | null>(null)
  const onHover = useCallback((m: Mission | null, x: number, y: number) => setHover(m ? { m, x, y } : null), [])
  const current = LAYERS.find((l) => l.value === layer)!

  return (
    <div className="app">
      <Canvas camera={{ position: POLE_POSE.pos, up: POLE_POSE.up, near: 1, far: 30000, fov: 40 }} gl={{ antialias: true }} dpr={[1, 2]}>
        <color attach="background" args={['#000']} />
        <Globe sunDir={sun.dir} cutKm={terrain ? terrain.levels[0].xMax / 1000 : 0} dataBase={BASE} onPick={pick} />
        {terrain && (
          <MoonTerrain terrain={terrain} sunDir={sun.dir} sunRad={sun.rad} layer={layer} dataBase={BASE} onPick={pick} />
        )}
        <Missions missions={missions} heights={missionHeights} onSelect={selectMission} onHover={onHover} />
        <PinMarkers />
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
          }}
        >
          <option value="">Go to a mission site…</option>
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
        </select>
        <div className="layers" role="group" aria-label="Map layer">
          {LAYERS.map((l) => (
            <button key={l.value} className={l.value === layer ? 'on' : ''} onClick={() => setLayer(l.value)}>
              {l.label}
            </button>
          ))}
        </div>
      </header>

      <div className="legend">
        {current.ramp && (
          <div className="ramp">
            <span>{current.ends![0]}</span>
            <i style={{ background: current.ramp }} />
            <span>{current.ends![1]}</span>
          </div>
        )}
        <p>{current.legend}</p>
      </div>

      <aside className="panel">
        {pins.length === 0 && (
          <p className="hint">Click the surface or a mission marker to pin a point. Up to three can be compared.</p>
        )}
        {ephem &&
          terrain &&
          pins.map((p) => <SiteCard key={p.id} pin={p} ephem={ephem} terrain={terrain} active={p.id === activePin} />)}
      </aside>

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
