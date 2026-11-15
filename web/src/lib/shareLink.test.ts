import { describe, expect, it } from 'vitest'
import { DEFAULT_ASSUMPTIONS } from './assumptions'
import { cleanLabel, decodeShare, encodeShare, MAX_LABEL, shareStateOf, type ShareState } from './shareLink'

const PRESETS = ['solar', 'ice', 'base']

const full: ShareState = {
  sites: [
    { lat: -89.4391, lon: -137.1185, label: 'Shackleton-de Gerlache connecting ridge' },
    { lat: -89.67, lon: 129.2, label: 'Shackleton crater floor' },
    { lat: 26.1, lon: 3.6, label: 'Apollo 15, Hadley & "rille" #1' },
  ],
  tMs: Date.UTC(2027, 5, 12, 14, 44),
  layer: 'finder',
  preset: 'ice',
  sun: 'any',
  earthMaskDeg: 5,
  observerM: 10,
}

describe('share link', () => {
  it('round-trips the whole state', () => {
    expect(decodeShare(encodeShare(full), PRESETS)).toEqual(full)
    expect(decodeShare(`#${encodeShare(full)}`, PRESETS)).toEqual(full)
  })

  it('round-trips a minimal state and leaves defaults out of the link', () => {
    const one: ShareState = { sites: [{ lat: -85.3, lon: 31.2, label: 'Point A' }], tMs: Date.UTC(2026, 10, 14, 14, 1), layer: 'natural', preset: 'solar' }
    const hash = encodeShare(one)
    expect(hash).toBe('s=-85.3000%2C31.2000%2CPoint+A&t=2026-11-14T14%3A01Z&layer=natural&goal=solar')
    expect(decodeShare(hash, PRESETS)).toEqual(one)
    const state = shareStateOf({ sites: one.sites, tMs: one.tMs!, layer: 'natural', preset: 'custom', assumptions: DEFAULT_ASSUMPTIONS }, PRESETS)
    expect(state).toEqual({ sites: one.sites, tMs: one.tMs, layer: 'natural', preset: undefined, sun: undefined, earthMaskDeg: undefined, observerM: undefined })
    expect(encodeShare(state)).not.toMatch(/sun=|earth=|h=|goal=/)
    const changed = shareStateOf({ sites: [], tMs: one.tMs!, layer: 'psr', preset: 'base', assumptions: { criteria: { minSunFrac: 0.999, earthMaskDeg: 2 }, observerM: 5 } }, PRESETS)
    expect(decodeShare(encodeShare(changed), PRESETS)).toEqual({ sites: [], tMs: one.tMs, layer: 'psr', preset: 'base', sun: 'all', earthMaskDeg: 2, observerM: 5 })
  })

  it('rounds the clock to the minute and coordinates to four decimals', () => {
    const got = decodeShare(encodeShare({ sites: [{ lat: -89.43912345, lon: 222.8 - 360, label: 'x' }], tMs: Date.UTC(2027, 0, 1, 0, 0, 59, 900) }), PRESETS)
    expect(got).toEqual({ sites: [{ lat: -89.4391, lon: -137.2, label: 'x' }], tMs: Date.UTC(2027, 0, 1) })
  })

  it('keeps at most three sites', () => {
    const many = [1, 2, 3, 4, 5].map((i) => `s=${-80 - i},${i},Site ${i}`).join('&')
    expect(decodeShare(many, PRESETS)?.sites.map((s) => s.label)).toEqual(['Site 1', 'Site 2', 'Site 3'])
    expect(encodeShare({ sites: [1, 2, 3, 4].map((i) => ({ lat: -80, lon: i, label: `S${i}` })) }).match(/s=/g)).toHaveLength(3)
  })

  it('drops sites with numbers out of range or not numbers, and keeps the good ones', () => {
    const hash = ['s=-91,0,Too far south', 's=10,181,Too far east', 's=abc,5,Not a number', 's=1e2,5,Exponent', 's=NaN,0,NaN', 's=Infinity,0,Inf', 's=12,34', 's=12,34,', 's=-85.3,31.2,Good one', 's=,,'].join('&')
    expect(decodeShare(hash, PRESETS)).toEqual({ sites: [{ lat: -85.3, lon: 31.2, label: 'Good one' }] })
  })

  it('limits labels and treats them as plain text', () => {
    const long = 'x'.repeat(500)
    expect(decodeShare(`s=1,2,${long}`, PRESETS)?.sites[0].label).toHaveLength(MAX_LABEL)
    // Markup is not interpreted anywhere: it stays a (short) string that the interface renders as text.
    const got = decodeShare(`s=1,2,${encodeURIComponent('<img src=x onerror=alert(1)>\u0000\n\u2028 two')}`, PRESETS)
    expect(got?.sites[0].label).toBe('<img src=x onerror=alert(1)> two')
    expect(cleanLabel('  a\tb\r\nc  ')).toBe('a b c')
    expect(cleanLabel('\u0007\u009f')).toBe('')
  })

  it('ignores a malformed time, layer, goal or assumption but keeps the rest', () => {
    const base = 's=-85.3,31.2,Good'
    const good = { sites: [{ lat: -85.3, lon: 31.2, label: 'Good' }] }
    for (const bad of ['t=yesterday', 't=2027-13-45T99:99Z', 't=2027-01-01', 't=1e15', 'layer=__proto__', 'layer=FINDER', 'goal=custom', 'goal=constructor', 'sun=most', 'earth=3', 'earth=-5', 'earth=5.0', 'h=1000', 'h=2e0', 'unknown=1']) {
      expect(decodeShare(`${base}&${bad}`, PRESETS), bad).toEqual(good)
    }
    expect(decodeShare(`${base}&t=2027-06-12T14:44Z&layer=psr&earth=10&h=5&sun=all&goal=base`, PRESETS)).toEqual({ ...good, tMs: Date.UTC(2027, 5, 12, 14, 44), layer: 'psr', preset: 'base', sun: 'all', earthMaskDeg: 10, observerM: 5 })
  })

  it('returns null for an empty, foreign or oversized hash and never throws', () => {
    for (const hash of ['', '#', '#top', 'section-2', '%E0%A4%A', '&&&===', 's', 's=', '#s=%', 'layer=', `s=1,2,${'x'.repeat(3000)}`]) {
      expect(decodeShare(hash, PRESETS), hash).toBeNull()
    }
  })

  it('carries custom finder limits and kept baselines, and leaves both out of a default link', () => {
    const finder = { maxSlopeDeg: 10, sunMin: 0.35, sunMax: 1, sunPrefer: 'high' as const, earthMin: 0.9, earthMax: 1, earthPrefer: 'high' as const, psr: 'outside' as const, maxPsrKm: null }
    const base = Date.UTC(2026, 10, 15, 5, 49)
    const sites = full.sites
    const state = shareStateOf({ sites, tMs: full.tMs!, layer: 'finder', preset: 'custom', assumptions: DEFAULT_ASSUMPTIONS, finder, baselines: [undefined, base, undefined] }, PRESETS)
    const hash = encodeShare(state)
    expect(hash).toContain('f=10_35_100_h_90_100_h_o_x')
    expect(hash).toContain('b1=2026-11-15T05%3A49Z')
    expect(hash).not.toMatch(/b0=|b2=|goal=/)
    const back = decodeShare(hash, PRESETS)!
    expect(back.finder).toEqual(finder)
    expect(back.baselines).toEqual([undefined, base, undefined])
    expect(back.sites).toEqual(sites)
    // a named preset carries no limits, and no baseline means no b key
    const plain = encodeShare(shareStateOf({ sites, tMs: full.tMs!, layer: 'finder', preset: 'solar', assumptions: DEFAULT_ASSUMPTIONS, finder, baselines: [undefined, undefined, undefined] }, PRESETS))
    expect(plain).not.toMatch(/(^|&)f=|(^|&)b\d=/)
    // a shadow distance and the other letters
    const ice = { ...finder, sunPrefer: 'low' as const, earthPrefer: 'none' as const, psr: 'inside' as const, maxPsrKm: 5 }
    expect(decodeShare(encodeShare({ sites: [], finder: ice }), PRESETS)!.finder).toEqual(ice)
  })

  it('ignores malformed finder limits and baselines but keeps the rest', () => {
    const site = 's=-85.3000%2C31.2000%2CPoint+A'
    for (const f of ['10_35_100_h_90_100_h_o', '10_35_100_q_90_100_h_o_x', '10_135_100_h_90_100_h_o_x', '10_60_40_h_90_100_h_o_x', 'x', '10,35,100,h,90,100,h,o,x', '1e1_35_100_h_90_100_h_o_x']) {
      const d = decodeShare(`${site}&f=${f}`, PRESETS)!
      expect(d.finder).toBeUndefined()
      expect(d.sites.length).toBe(1)
    }
    for (const b of ['yesterday', '2026-11-15', '2026-13-45T99%3A99Z', '<script>']) {
      const d = decodeShare(`${site}&b0=${b}`, PRESETS)!
      expect(d.baselines).toBeUndefined()
      expect(d.sites.length).toBe(1)
    }
    // a baseline for a site that is not in the link is dropped
    expect(decodeShare(`${site}&b2=2026-11-15T05%3A49Z`, PRESETS)!.baselines).toBeUndefined()
    // limits alone are a usable link
    expect(decodeShare('f=10_35_100_h_90_100_h_o_x', PRESETS)!.finder!.earthMin).toBe(0.9)
  })
})
