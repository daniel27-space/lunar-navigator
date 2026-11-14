// Past, failed and planned landing sites, drawn as dots that keep a constant size on screen.
import { memo, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { sitePosKm } from '../lib/geo'

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
}

export const STATUS_COLOR: Record<Mission['status'], string> = {
  landed: '#4fc38a',
  crashed: '#e0625a',
  planned: '#ffcf4a',
  candidate: '#ffcf4a',
}

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
      {missions.map((m, i) => (
        <sprite
          key={m.id}
          ref={(el) => {
            sprites.current[i] = el
          }}
          renderOrder={5}
          position={sitePosKm(m.lat, m.lon, (heights[i] ?? 0) + 250)}
          scale={[0.022, 0.022, 1]}
          onClick={(e) => {
            if (e.delta > 4) return
            e.stopPropagation()
            onSelect(m)
          }}
          onPointerOver={(e) => {
            e.stopPropagation()
            onHover(m, e.clientX, e.clientY)
          }}
          onPointerOut={() => onHover(null, 0, 0)}
        >
          <spriteMaterial map={map} color={STATUS_COLOR[m.status]} sizeAttenuation={false} depthTest={false} />
        </sprite>
      ))}
    </>
  )
})
