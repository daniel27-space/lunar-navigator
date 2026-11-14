import { describe, expect, it } from 'vitest'
import { GROUND_EDGE_M, GROUND_STYLES, groundStyle, makeGround, seedFrom, skylineShade, startViewAz, type GroundStyle } from './ground'

describe('illustrative ground', () => {
  it('is the same for the same mission and different for another', () => {
    const a = makeGround('apollo-15', 7)
    const b = makeGround('apollo-15', 7)
    const c = makeGround('luna-9', 7)
    expect(a.craters).toEqual(b.craters)
    expect(a.rocks).toEqual(b.rocks)
    expect(a.height(31.5, -12.25)).toBe(b.height(31.5, -12.25))
    expect(a.craters).not.toEqual(c.craters)
    expect(seedFrom('apollo-15')).not.toBe(seedFrom('apollo-16'))
  })

  it('is level where the craft stands, so pads neither float nor sink', () => {
    for (const h of [2, 7, 12]) {
      const g = makeGround('slim', h)
      for (let i = 0; i < 40; i++) {
        const a = (i / 40) * Math.PI * 2
        for (const r of [0, 0.4, 0.8, 0.999]) expect(g.height(Math.cos(a) * g.padM * r, Math.sin(a) * g.padM * r)).toBe(0)
      }
      // No crater or rock on the pad.
      for (const c of g.craters) expect(Math.hypot(c.x, c.z)).toBeGreaterThan(g.padM)
      for (const k of g.rocks) expect(Math.hypot(k.x, k.z)).toBeGreaterThan(g.padM)
    }
  })

  it('picks the style by latitude, then elevation, with hand-checked exceptions', () => {
    expect(groundStyle('apollo-11', 0.67, -1930)).toBe('mare')
    // Apollo 12's plain lies just above the -1.5 km line: listed by hand.
    expect(groundStyle('apollo-12', -3.01, -1430)).toBe('mare')
    expect(groundStyle('change-4', -45.4, -5900)).toBe('highland')
    expect(groundStyle('apollo-15', 26.13, -1930)).toBe('mare')
    expect(groundStyle('apollo-17', 20.19, -2630)).toBe('mare')
    expect(groundStyle('apollo-16', -8.97, 20)).toBe('highland')
    // Fra Mauro is low but highland material: the rule alone would say mare.
    expect(groundStyle('apollo-14', -3.65, -1700)).toBe('highland')
    expect(groundStyle('x', -3.65, -1700)).toBe('mare')
    expect(groundStyle('im-1-odysseus', -80.13, 2500)).toBe('polar')
    expect(groundStyle('x', 75, -3000)).toBe('polar')
    expect(groundStyle('x', -74.9, -3000)).toBe('mare')
  })

  it('makes three distinct grounds: mare smoothest with fewest rocks, polar roughest', () => {
    const rough = (style: GroundStyle) => {
      const g = makeGround('same-seed', 3, style)
      let lo = Infinity
      let hi = -Infinity
      for (let x = -70; x <= 70; x += 2.5)
        for (let z = -70; z <= 70; z += 2.5) {
          const v = g.height(x, z)
          lo = Math.min(lo, v)
          hi = Math.max(hi, v)
        }
      return { range: hi - lo, rocks: g.rocks.length, craters: g.craters.length, albedo: g.albedo }
    }
    const mare = rough('mare')
    const highland = rough('highland')
    const polar = rough('polar')
    expect(mare.range).toBeLessThan(highland.range)
    expect(highland.range).toBeLessThan(polar.range)
    expect(mare.rocks).toBeLessThan(highland.rocks)
    expect(mare.craters).toBeGreaterThan(highland.craters)
    expect(new Set([mare.albedo, highland.albedo, polar.albedo]).size).toBe(3)
    expect(mare.rocks).toBe(GROUND_STYLES.mare.rocks)
  })

  it('has modest relief nearby and drops away at its edge, below any real skyline', () => {
    const g = makeGround('change-3', 3)
    let lo = Infinity
    let hi = -Infinity
    for (let x = -60; x <= 60; x += 3)
      for (let z = -60; z <= 60; z += 3) {
        const v = g.height(x, z)
        lo = Math.min(lo, v)
        hi = Math.max(hi, v)
      }
    expect(hi).toBeLessThan(1.5)
    expect(lo).toBeGreaterThan(-3)
    expect(hi - lo).toBeGreaterThan(0.3)
    // At the edge the ground is more than 8 degrees below an eye 2 m above the craft.
    const edge = g.height(GROUND_EDGE_M, 0)
    expect(Math.atan2(2 - edge, GROUND_EDGE_M)).toBeGreaterThan((8 * Math.PI) / 180)
  })
})

describe('ground-level view', () => {
  it('starts looking across the sunlight by day, towards Earth at night, else north', () => {
    expect(startViewAz({ az: 90, up: true }, { az: 0, el: 5 })).toBe(200)
    expect(startViewAz({ az: 300, up: true }, { az: 0, el: 5 })).toBe(50)
    expect(startViewAz({ az: 90, up: false }, { az: 350, el: 5 })).toBe(4)
    expect(startViewAz({ az: 90, up: false }, { az: 350, el: -3 })).toBe(0)
    // The side of the light the camera stands on depends on the mission, and is always one of the two.
    const sides = new Set(['apollo-11', 'apollo-12', 'luna-9', 'slim', 'change-3', 'im-1-odysseus'].map((id) => startViewAz({ az: 90, up: true }, { az: 0, el: 5 }, id)))
    expect([...sides].sort()).toEqual([200, 340])
  })

  it('shades distant terrain: bright opposite the Sun, dark towards it, dim at night', () => {
    const sun = { az: 90, up: true }
    expect(skylineShade(270, sun)).toBeCloseTo(0.57, 9)
    expect(skylineShade(90, sun)).toBeCloseTo(0.07, 9)
    expect(skylineShade(0, sun)).toBeCloseTo(0.07, 9)
    expect(skylineShade(225, sun)).toBeGreaterThan(skylineShade(200, sun))
    expect(skylineShade(270, { az: 90, up: false })).toBeLessThan(0.07)
  })
})
