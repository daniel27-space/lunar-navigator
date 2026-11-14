import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { bodyVectors, ephemEndMs, ephemStartMs, loadEphem, type Ephem } from './lib/ephem'
import { R_KM, sitePosKm, SUN_RADIUS_KM, unit, type Vec3 } from './lib/geo'
import { heightAt, loadTerrain, type Terrain } from './lib/terrain'
import { MoonTerrain } from './scene/MoonTerrain'
import { useStore, type LayerMode } from './store'
import { SiteCard } from './ui/SiteCard'
import './App.css'

const BASE = `${import.meta.env.BASE_URL}data/`

function useData() {
  const [ephem, setEphem] = useState<Ephem | null>(null)
  const [terrain, setTerrain] = useState<Terrain | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    loadEphem(BASE).then(setEphem, (e) => setError(`Ephemeris failed to load: ${e.message}`))
    loadTerrain(BASE).then(setTerrain, (e) => setError(`Terrain failed to load: ${e.message}`))
  }, [])
  return { ephem, terrain, error }
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
const LAYERS: { label: string; value: LayerMode }[] = [
  { label: 'Sunlight', value: 'natural' },
  { label: 'Elevation', value: 'elevation' },
  { label: 'Slope', value: 'slope' },
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
  return (
    <>
      {pins.map((p) => {
        const pos = sitePosKm(p.lat, p.lon, p.hM + 400)
        return (
          <mesh key={p.id} position={pos}>
            <sphereGeometry args={[p.id === active ? 1.6 : 1.1, 16, 12]} />
            <meshBasicMaterial color={p.id === active ? '#ffcf4a' : '#6fd3ff'} />
          </mesh>
        )
      })}
    </>
  )
}

export default function App() {
  const { ephem, terrain, error } = useData()
  useClock(ephem)
  const tMs = useStore((s) => s.tMs)
  const layer = useStore((s) => s.layer)
  const setLayer = useStore((s) => s.setLayer)
  const pins = useStore((s) => s.pins)
  const addPin = useStore((s) => s.addPin)
  const activePin = useStore((s) => s.activePin)
  const controls = useRef(null)

  const sun = useMemo(() => {
    if (!ephem) return { dir: [1, 0, 0] as Vec3, rad: 0.00465 }
    const v = bodyVectors(ephem, tMs).sun
    return { dir: unit(v), rad: Math.asin(SUN_RADIUS_KM / Math.hypot(v[0], v[1], v[2])) }
  }, [ephem, tMs])

  const target = useMemo(() => new THREE.Vector3(0, 0, -R_KM), [])

  return (
    <div className="app">
      <Canvas
        camera={{ position: [260, -180, -(R_KM + 330)], up: [0, 0, -1], near: 0.5, far: 30000, fov: 40 }}
        gl={{ antialias: true, logarithmicDepthBuffer: true }}
        dpr={[1, 2]}
      >
        <color attach="background" args={['#000']} />
        {terrain && (
          <MoonTerrain
            terrain={terrain}
            sunDir={sun.dir}
            sunRad={sun.rad}
            layer={layer}
            onPick={(lat, lon) => addPin({ lat, lon, hM: heightAt(terrain, lat, lon) })}
          />
        )}
        <PinMarkers />
        <OrbitControls
          ref={controls}
          target={target}
          minDistance={8}
          maxDistance={4000}
          enableDamping
          dampingFactor={0.08}
          rotateSpeed={0.5}
        />
      </Canvas>

      <header className="top">
        <h1>Lunar Landing Site Navigator</h1>
        <div className="layers" role="group" aria-label="Map layer">
          {LAYERS.map((l) => (
            <button key={l.value} className={l.value === layer ? 'on' : ''} onClick={() => setLayer(l.value)}>
              {l.label}
            </button>
          ))}
        </div>
      </header>

      <aside className="panel">
        {pins.length === 0 && (
          <p className="hint">Click the surface to pin a point. Up to three can be compared.</p>
        )}
        {ephem &&
          terrain &&
          pins.map((p) => <SiteCard key={p.id} pin={p} ephem={ephem} terrain={terrain} active={p.id === activePin} />)}
      </aside>

      {(!ephem || !terrain) && !error && <div className="status">Loading NASA terrain and ephemeris…</div>}
      {error && <div className="status error">{error}</div>}
      {ephem && <TimeBar ephem={ephem} />}
    </div>
  )
}
