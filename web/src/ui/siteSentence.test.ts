import { describe, expect, it } from 'vitest'
import { siteSentence } from './siteSentence'

describe('siteSentence', () => {
  it('leads with the sunlight share and follows with Earth', () => {
    expect(siteSentence({ sunShare: 0.784, commShare: 0.52 }, 60)).toEqual({
      lead: '78%',
      rest: 'of these 60 days in sunlight.',
      earth: 'Earth in view 52% of the time.',
    })
  })
  it('says always and never in words', () => {
    expect(siteSentence({ sunShare: 1, commShare: 0.9996 }, 60)).toEqual({ lead: 'Always', rest: 'in sunlight over these 60 days.', earth: 'Earth always in view.' })
    expect(siteSentence({ sunShare: 0, commShare: 0 }, 60)).toEqual({ lead: 'Never', rest: 'in sunlight over these 60 days.', earth: 'Earth never in view.' })
  })
  it('does not round a nearly full share up to always', () => {
    expect(siteSentence({ sunShare: 0.995, commShare: 0.004 }, 60)).toMatchObject({ lead: '>99%', earth: 'Earth in view <1% of the time.' })
  })
})
