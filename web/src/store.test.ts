import { describe, expect, it } from 'vitest'
import { useStore } from './store'

describe('clock', () => {
  it('pulls a date outside the supported range back to the nearest end', () => {
    const lo = Date.parse('2024-01-04T00:00:00Z')
    const hi = Date.parse('2035-11-01T00:00:00Z')
    useStore.getState().setTimeRange([lo, hi])
    useStore.getState().setTime(Date.parse('2036-11-14T09:43:00Z'))
    expect(useStore.getState().tMs).toBe(hi)
    useStore.getState().setTime(Date.parse('1999-01-01T00:00:00Z'))
    expect(useStore.getState().tMs).toBe(lo)
    const ok = Date.parse('2030-06-01T00:00:00Z')
    useStore.getState().setTime(ok)
    expect(useStore.getState().tMs).toBe(ok)
  })
})
