import { beforeEach, describe, expect, it } from 'vitest'
import { addSlide, cameraDelta, clearProgress, NEED, readProgress, sampleCamera, skipSample, type Sample } from './tour'

const at = (pos: number[], target = [0, 0, 0]): Sample => ({ pos: pos as Sample['pos'], target: target as Sample['target'] })

describe('tour progress', () => {
  beforeEach(clearProgress)

  it('a quarter turn at the same distance is a 90 degree turn and no zoom', () => {
    const d = cameraDelta(at([5000, 0, 0]), at([0, 5000, 0]))
    expect(d.turnDeg).toBeCloseTo(90, 6)
    expect(d.zoom).toBeCloseTo(0, 9)
    expect(d.slide).toBe(0)
  })

  it('moving straight in is a zoom and no turn, the same amount in or out', () => {
    const inward = cameraDelta(at([5000, 0, 0]), at([4000, 0, 0]))
    expect(inward.turnDeg).toBeCloseTo(0, 6)
    expect(inward.zoom).toBeCloseTo(Math.log(1.25), 9)
    expect(cameraDelta(at([4000, 0, 0]), at([5000, 0, 0])).zoom).toBeCloseTo(inward.zoom, 9)
  })

  it('a moved look-at point is a slide, measured against the viewing distance', () => {
    const d = cameraDelta(at([0, 0, -1837], [0, 0, -1737]), at([10, 0, -1837], [10, 0, -1737]))
    expect(d.slide).toBeCloseTo(0.1, 6)
    expect(d.turnDeg).toBe(0)
    expect(d.zoom).toBe(0)
  })

  it('adds up small moves, and a flight in between is not counted', () => {
    sampleCamera(at([5000, 0, 0]))
    for (let i = 1; i <= 100; i++) sampleCamera(at([5000 * Math.cos((i * Math.PI) / 180), 5000 * Math.sin((i * Math.PI) / 180), 0]))
    expect(readProgress().turnDeg).toBeCloseTo(100, 4)
    expect(readProgress().turnDeg).toBeGreaterThan(NEED.turnDeg)
    skipSample()
    sampleCamera(at([0, 0, 9000]))
    expect(readProgress().turnDeg).toBeCloseTo(100, 4)
    expect(readProgress().zoom).toBeCloseTo(0, 6)
  })

  it('the slide gesture counts by itself and is not also read as a turn', () => {
    sampleCamera(at([5000, 0, 0]))
    addSlide(0.2)
    sampleCamera(at([0, 5000, 0]))
    expect(readProgress().slide).toBeCloseTo(0.2, 9)
    expect(readProgress().turnDeg).toBe(0)
  })
})
