// Past, failed and planned landing sites, drawn as dots that keep a constant size on screen.
import { memo, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { sitePosKm } from '../lib/geo'
import { insideDisc, MARKER } from './markers'

export interface Mission {
  id: string
  name: string
  agency: string
  country: string
  date_utc: string
  lat: number
  lon: number
  status: 'landed' | 'crashed' | 'planned' | 'candidate'
  kind: 'crewed' | 'robotic'
  summary: string
  source_url: string
  // Mission showcase fields (docs/DATA_CONTRACT.md); every one is optional.
  about?: string
  facts?: [label: string, value: string][]
  image?: { file: string; caption?: string; credit?: string; license?: string; source_url?: string }
  model?:
    | { kind: 'glb'; file: string; height_m: number; credit?: string; license?: string; source_url?: string }
    | { kind: 'archetype'; archetype: string; height_m: number; height_estimated?: boolean }
}

export const STATUS_COLOR: Record<Mission['status'], string> = {
  landed: '#4fc38a', // --data-ok
  crashed: '#ff7a6b', // --data-danger
  planned: '#eceef2', // neutral ink: yellow is reserved for the Sun
  candidate: '#8e95a1',
}

/** Width of the unseen disc that takes a marker's clicks, in the same units as a sprite's scale. */
export const HIT_SCALE = 0.045

function dotTexture(): THREE.Texture {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  g.beginPath()
  g.arc(32, 32, 24, 0, Math.PI * 2)
  g.fillStyle = '#fff'
  g.fill()
  g.lineWidth = 7
  g.strokeStyle = '#0b0c0f'
  g.stroke()
  return new THREE.CanvasTexture(c)
}

interface Props {
  missions: Mission[]
  /** elevation in metres at each mission site (0 where there is no terrain data) */
  heights: number[]
  onSelect: (m: Mission) => void
  onHover: (m: Mission | null, x: number, y: number) => void
}

export const Missions = memo(function Missions({ missions, heights, onSelect, onHover }: Props) {
  const map = useMemo(dotTexture, [])
  const sprites = useRef<(THREE.Sprite | null)[]>([])
  // Dots are drawn on top of the terrain so they are never half-buried, which means the
  // ones on the far side of the Moon have to be hidden by hand.
  useFrame(({ camera }) => {
    for (const s of sprites.current) {
      if (s) s.visible = s.position.dot(camera.position) - s.position.lengthSq() > 0
    }
  })
  return (
    <>
      {missions.map((m, i) => {
        const at = sitePosKm(m.lat, m.lon, (heights[i] ?? 0) + 250)
        return (
          <group key={m.id}>
            <sprite
              ref={(el) => {
                sprites.current[i] = el
              }}
              renderOrder={5}
              position={at}
              scale={[0.022, 0.022, 1]}
            >
              <spriteMaterial map={map} color={STATUS_COLOR[m.status]} sizeAttenuation={false} depthTest={false} />
            </sprite>
            {/* The dot is small; what takes the click is an unseen disc about twice its width, so a
                near miss opens the mission instead of pinning a new point beside it. */}
            <sprite
              ref={(el) => {
                sprites.current[missions.length + i] = el
              }}
              position={at}
              scale={[HIT_SCALE, HIT_SCALE, 1]}
              userData={MARKER}
              onClick={(e) => {
                if (e.delta > 4 || !e.object.visible || !insideDisc(e)) return
                e.stopPropagation()
                onSelect(m)
              }}
              onPointerOver={(e) => {
                if (!e.object.visible) return
                e.stopPropagation()
                onHover(m, e.clientX, e.clientY)
                document.body.dataset.over = 'marker'
              }}
              onPointerOut={() => {
                onHover(null, 0, 0)
                delete document.body.dataset.over
              }}
            >
              <spriteMaterial sizeAttenuation={false} depthTest={false} depthWrite={false} transparent opacity={0} />
            </sprite>
          </group>
        )
      })}
    </>
  )
})
