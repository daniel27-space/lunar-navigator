// Wreckage layout: pieces must rest on the ground that is drawn (never hang above it), must not
// be stacked on each other, and must be the same on every visit.
import { describe, expect, it } from 'vitest'
import { ARCHETYPES } from '../LanderModel'
import { WRECK_REACH, makeGround, wreckScar } from './ground'
import { isWrecked, lowestPoint, wreckLayout } from './wreck'

const CRASHED: [id: string, archetype: (typeof ARCHETYPES)[number], heightM: number][] = [
  ['beresheet', 'small-lander', 1.5],
  ['vikram-chandrayaan-2', 'small-lander', 1.2],
  ['hakuto-r-m1', 'small-lander', 2.3],
  ['luna-25', 'small-lander', 2.0],
  ['hakuto-r-m2', 'small-lander', 2.3],
  ['lcross-centaur', 'impactor', 12.7],
]
// Every stand-in can be wrecked, also those no crashed mission uses today.
const ALL: typeof CRASHED = [...CRASHED, ...ARCHETYPES.map((a, i): (typeof CRASHED)[number] => [`test-${a}`, a, 2 + i])]

const build = (id: string, a: (typeof ARCHETYPES)[number], h: number, style: 'mare' | 'highland' | 'polar' = 'polar') => {
  const ground = makeGround(id, h, style, true)
  return { ground, wreck: wreckLayout(id, a, h, ground.height) }
}

describe('wreckage layout', () => {
  it('rests every piece on the ground at its own position, partly dug in, never floating', () => {
    for (const [id, a, h] of ALL)
      for (const style of ['mare', 'highland', 'polar'] as const) {
        const { ground, wreck } = build(id, a, h, style)
        for (const p of wreck.pieces) {
          const g = ground.height(p.pos[0], p.pos[2])
          // lowest point is under the ground by exactly the stated sink
          expect(lowestPoint(p)).toBeCloseTo(g - p.sinkM, 9)
          expect(p.sinkM).toBeGreaterThan(0)
          // but the piece is not buried: its middle is above the ground
          expect(p.pos[1]).toBeGreaterThan(g)
        }
      }
  })

  it('has one crumpled body in the scar and many pieces scattered around it, more of them near', () => {
    for (const [id, a, h] of ALL) {
      const { wreck } = build(id, a, h)
      const main = wreck.pieces.filter((p) => p.main)
      expect(main).toHaveLength(1)
      expect(Math.hypot(main[0].pos[0], main[0].pos[2])).toBeLessThan(wreckScar(h).r * 0.3)
      expect(wreck.pieces.length).toBeGreaterThanOrEqual(20)
      const dist = wreck.pieces.filter((p) => !p.main).map((p) => Math.hypot(p.pos[0], p.pos[2]) / h)
      expect(Math.max(...dist)).toBeLessThanOrEqual(WRECK_REACH)
      expect(Math.max(...dist)).toBeGreaterThan(1.5)
      // denser near the centre: the inner half of the radius is a quarter of the field's area,
      // yet it holds well over a quarter of the pieces
      const inner = dist.filter((d) => d < WRECK_REACH / 2).length
      expect(inner / dist.length).toBeGreaterThan(0.33)
    }
  })

  it('never lays a piece on top of a large piece or on the body at the centre', () => {
    for (const [id, a, h] of ALL) {
      const { wreck } = build(id, a, h)
      const ps = wreck.pieces
      for (let i = 0; i < ps.length; i++)
        for (let j = i + 1; j < ps.length; j++) {
          if (!ps[i].big && !ps[j].big) continue
          expect(Math.hypot(ps[i].pos[0] - ps[j].pos[0], ps[i].pos[2] - ps[j].pos[2])).toBeGreaterThan(ps[i].reachM + ps[j].reachM)
        }
    }
  })

  it('is the same wreck on every visit and a different one for another mission', () => {
    const a = build('vikram-chandrayaan-2', 'small-lander', 1.2).wreck
    const b = build('vikram-chandrayaan-2', 'small-lander', 1.2).wreck
    const c = build('beresheet', 'small-lander', 1.2).wreck
    expect(a.pieces).toEqual(b.pieces)
    expect(a.soil(1.3, -0.7)).toBe(b.soil(1.3, -0.7))
    expect(a.pieces.map((p) => p.pos)).not.toEqual(c.pieces.map((p) => p.pos))
  })

  it('keeps the parts of the craft: legs, tanks, panels and a dish for a small lander', () => {
    const parts = build('hakuto-r-m1', 'small-lander', 2.3).wreck.pieces.map((p) => p.part)
    expect(parts.filter((p) => p === 'leg')).toHaveLength(4)
    for (const want of ['body', 'panel', 'tank', 'dish', 'engine', 'scrap']) expect(parts).toContain(want)
  })

  it('darkens the soil in the scar and nowhere far from it', () => {
    const { wreck } = build('luna-25', 'small-lander', 2)
    expect(wreck.soil(0, 0)).toBeGreaterThan(0.33)
    for (let i = 0; i < 24; i++) {
      const t = (i / 24) * Math.PI * 2
      const far = wreckScar(2).r * 3
      expect(wreck.soil(Math.cos(t) * far, Math.sin(t) * far)).toBe(0)
      for (const d of [0.5, 1, 2, 4]) {
        const v = wreck.soil(Math.cos(t) * d, Math.sin(t) * d)
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(1)
      }
    }
  })
})

describe('wrecked ground', () => {
  it('has a shallow scar at the centre and is otherwise level across the debris field', () => {
    for (const h of [1.2, 2.3, 12.7]) {
      const g = makeGround('luna-25', h, 'polar', true)
      const scar = wreckScar(h)
      expect(g.height(0, 0)).toBeCloseTo(-scar.depth, 5)
      expect(scar.depth / scar.r).toBeLessThan(0.1)
      expect(g.padM).toBeGreaterThanOrEqual(h * WRECK_REACH)
      // no rock in the field, where it could sit inside a piece of wreckage
      for (const k of g.rocks) expect(Math.hypot(k.x, k.z)).toBeGreaterThan(g.padM)
    }
  })

  it('leaves the ground of an intact craft exactly as it was', () => {
    const a = makeGround('apollo-15', 7, 'mare')
    const b = makeGround('apollo-15', 7, 'mare', false)
    expect(a.padM).toBe(Math.max(7 * 0.95, 3))
    expect(a.height(0, 0)).toBe(0)
    expect(a.height(20, 5)).toBe(b.height(20, 5))
  })

  it('applies to crashed missions only', () => {
    expect(isWrecked({ status: 'crashed' })).toBe(true)
    expect(isWrecked({ status: 'landed' })).toBe(false)
    expect(isWrecked({ status: 'planned' })).toBe(false)
  })
})
