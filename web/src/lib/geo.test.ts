import { describe, expect, it } from 'vitest'
import {
  azEl,
  dirFromAzEl,
  latLonOf,
  localFrame,
  sitePosKm,
  spDirection,
  spProject,
  spUnproject,
  upVector,
  R_KM,
} from './geo'

const close = (a: number, b: number, tol = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(tol)

describe('local frame', () => {
  it('is orthonormal and right-handed (E x N = U)', () => {
    const f = localFrame(-85.3, 31.2)
    const cross = [
      f.e[1] * f.n[2] - f.e[2] * f.n[1],
      f.e[2] * f.n[0] - f.e[0] * f.n[2],
      f.e[0] * f.n[1] - f.e[1] * f.n[0],
    ]
    cross.forEach((c, i) => close(c, f.u[i]))
  })

  it('puts the north pole direction at azimuth 0 and east at 90', () => {
    const f = localFrame(-45, 10)
    close(azEl([0, 0, 1], f).az, 0)
    // A point slightly to the east on the same latitude circle.
    const here = sitePosKm(-45, 10, 0)
    const east = sitePosKm(-45, 10.01, 0)
    const d = azEl([east[0] - here[0], east[1] - here[1], east[2] - here[2]], f)
    close(d.az, 90, 0.01)
  })

  it('round-trips azimuth/elevation', () => {
    const f = localFrame(-89.5, -137)
    const ae = azEl(dirFromAzEl(213.4, 1.2, f), f)
    close(ae.az, 213.4, 1e-9)
    close(ae.el, 1.2, 1e-9)
  })

  it('sees the zenith at 90 degrees elevation', () => {
    const f = localFrame(20, 300)
    close(azEl(upVector(20, 300), f).el, 90, 1e-6)
  })
})

describe('south polar stereographic', () => {
  it('maps the pole to the origin and lon 0 to +y', () => {
    const [x, y] = spProject(-90, 0, R_KM)
    close(x, 0)
    close(y, 0)
    const [x2, y2] = spProject(-85, 0, R_KM)
    close(x2, 0)
    expect(y2).toBeGreaterThan(0)
    const [x3] = spProject(-85, 90, R_KM)
    expect(x3).toBeGreaterThan(0)
  })

  it('has the 80S circle at about 304 km', () => {
    const [, y] = spProject(-80, 0, R_KM)
    close(y, 2 * R_KM * Math.tan((5 * Math.PI) / 180), 1e-9)
    expect(y).toBeGreaterThan(303)
    expect(y).toBeLessThan(305)
  })

  it('round-trips and agrees with the direction formula', () => {
    for (const [lat, lon] of [
      [-89.99, 12],
      [-87.2, -140],
      [-80.5, 179],
    ]) {
      const [x, y] = spProject(lat, lon, R_KM)
      const back = spUnproject(x, y, R_KM)
      close(back.lat, lat, 1e-9)
      close(back.lon, lon, 1e-9)
      const d = spDirection(x, y, R_KM)
      const u = upVector(lat, lon)
      d.forEach((c, i) => close(c, u[i], 1e-12))
      const ll = latLonOf(d)
      close(ll.lat, lat, 1e-7)
    }
  })
})
