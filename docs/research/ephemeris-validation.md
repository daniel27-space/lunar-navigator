# Ephemeris validation

Date: 2026-11-14. Code: `pipeline/ephem/`. Reproduce:

```
.venv/bin/python pipeline/ephem/build_ephem.py        # ephem.json + ephem.bin
.venv/bin/python pipeline/ephem/horizons.py --fetch   # refresh cached Horizons responses (network)
.venv/bin/python pipeline/ephem/validate.py --write   # table below + validation_vectors.json
.venv/bin/python -m pytest pipeline/ephem -q          # offline
```

## Kernels

NAIF generic kernels, downloaded over HTTPS (certificate verification on, no problems) from
`https://naif.jpl.nasa.gov/pub/naif/generic_kernels/` into `data/raw/kernels/` (git-ignored):

| file | role | sha256 (first 12) |
|---|---|---|
| `spk/planets/de440s.bsp` | Sun, Earth, Moon positions (DE440, 1849-2150) | `c1c7feeab882` |
| `pck/moon_pa_de440_200625.bpc` | lunar orientation, principal-axis frame | `60cd55aa401e` |
| `fk/satellites/moon_de440_250416.tf` | `MOON_PA_DE440` -> `MOON_ME` frame definitions | `a47c71e9c9f3` |
| `lsk/naif0012.tls` | leap seconds | `678e32bdb5a7` |
| `pck/pck00011.tpc` | generic body constants (loaded; radii used come from the contract) | `3dff7b1dbece` |

## Method

**Product (`build_ephem.py`).** For each UTC hour from 2024-01-01T00:00Z to 2036-01-01T00:00Z
inclusive (105193 records), `spkpos(target, et, "MOON_ME", "LT+S", "MOON")` for Sun and Earth;
stored as unit vector + distance, 8 little-endian Float32 per record (3,366,176 bytes).
The build is deterministic (same sha256 on rebuild).

**Reference (`topo.sun_earth_azel`).** Direct SPICE with a topocentric observer:
`spkcpo(target, et, "MOON_ME", "OBSERVER", "LT+S", site_km, "MOON", "MOON_ME")`. The site is a
fixed point in MOON_ME; SPICE derives its barycentric state, so light time is measured to the
site and stellar aberration uses the site's own velocity. The result is projected on
East/North/Up of the R = 1737.4 km sphere.

**Web method (`topo.sun_earth_azel_web`).** What the browser does: linear interpolation of the
8 Float32 fields between hourly records, `v = dist * unit - site`, normalise, project on E/N/U.

**Independent check (JPL Horizons API).** Observer table, `CENTER='coord@301'`,
`COORD_TYPE='GEODETIC'`, `SITE_COORD='lon,lat,alt_km'`, `QUANTITIES='4,20'`, targets 10 and 399,
`EXTRA_PREC='YES'`. Raw responses are cached in `pipeline/ephem/fixtures/`.

## Reconciling Horizons with the contract

Taken from the Horizons response headers and column notes (kept verbatim in the fixtures and
asserted in `test_horizons_conventions_match_contract`):

| item | Horizons | contract | difference |
|---|---|---|---|
| body-fixed frame | `MEAN_ME (high precision)` | SPICE `MOON_ME` | none visible at 0.003 arcsec |
| shape | sphere, radii 1737.4, 1737.4, 1737.4 km | sphere R = 1737.4 km | none; "geodetic" = planetocentric on a sphere |
| altitude | km above that sphere | metres above that sphere | units only |
| longitude | east-positive | east-positive | none |
| azimuth | clockwise from north, 0 = N, 90 = E | same | none |
| elevation | above plane perpendicular to reference-surface zenith | above local horizontal on the sphere | none |
| atmosphere | `NO (AIRLESS)` | no refraction | none |
| ephemeris | DE441 | DE440 (`de440s.bsp`) | none visible (DE440/441 agree in this era) |
| corrections | light time, stellar aberration, gravitational light deflection | `LT+S` (no deflection) | deflection not modelled by SPICE; below 0.003 arcsec in every case tested |
| time | UTC, last known leap second held for future dates | same behaviour with `naif0012.tls` | none; a future leap second would shift both by 1 s (about 0.00015 deg of Sun azimuth) |

No conversion other than km/m was needed.

## Results

6 sites x 8 epochs = 48 cases (Sun and Earth each). Sites: Shackleton rim approx
(89.45S 222.7E, +1300 m), Apollo 11 (0.674N 23.473E, -1930 m), Chandrayaan-3 (69.373S 32.319E,
0 m), IM-1 Odysseus approx (80.13S 1.44E, +2500 m), Chang'e 4 far side (45.457S 177.589E,
-5900 m), north polar (88N 300E, 0 m). Heights are nominal test inputs used identically on both
sides, not surveyed elevations. Epochs (off the hour on purpose): 2025-03-14T06:30,
2026-08-12T17:45:30, 2027-12-01T03:10, 2029-02-18T21:20, 2030-06-21T12:00, 2031-10-05T08:55,
2033-04-27T15:35, 2034-11-11T23:59 UTC.

| comparison | quantity | max abs (deg) | RMS (deg) | max abs (arcsec) |
|---|---|---|---|---|
| (a) direct SPICE - Horizons | Sun az | 7.24e-07 | 2.10e-07 | 0.0026 |
| (a) direct SPICE - Horizons | Sun el | 3.37e-07 | 9.63e-08 | 0.0012 |
| (a) direct SPICE - Horizons | Earth az | 7.36e-07 | 4.44e-07 | 0.0027 |
| (a) direct SPICE - Horizons | Earth el | 5.05e-07 | 1.79e-07 | 0.0018 |
| (b) web method - direct SPICE | Sun az | 8.96e-05 | 1.32e-05 | 0.32 |
| (b) web method - direct SPICE | Sun el | 1.01e-05 | 4.19e-06 | 0.036 |
| (b) web method - direct SPICE | Sun on-sky | 1.01e-05 | 4.83e-06 | 0.036 |
| (b) web method - direct SPICE | Earth az | 1.07e-04 | 2.86e-05 | 0.39 |
| (b) web method - direct SPICE | Earth el | 7.42e-05 | 2.62e-05 | 0.27 |
| (b) web method - direct SPICE | Earth on-sky | 7.46e-05 | 3.41e-05 | 0.27 |
| (c) web method - Horizons | Sun az / el | 8.96e-05 / 1.01e-05 | 1.32e-05 / 4.19e-06 | 0.32 / 0.036 |
| (c) web method - Horizons | Earth az / el | 1.07e-04 / 7.42e-05 | 2.88e-05 / 2.63e-05 | 0.39 / 0.27 |

"On-sky" is the great-circle angle between the two directions. The Sun-azimuth maximum in (b)
is larger than the on-sky maximum because azimuth is stretched by 1/cos(el) when the body is
high (Apollo 11 cases); it is not a larger pointing error.

A wider one-off sample of 20,000 random (site, time) pairs over the whole sphere, heights
-6..+6 km and the full 2024-2036 range gave web-method vs direct-SPICE on-sky maxima of
1.5e-05 deg (Sun) and 1.5e-04 deg (Earth). The test suite repeats this with 400 seeded samples.

Target was "well under 0.05 deg": the worst web-method error seen is about 1.5e-04 deg
(0.56 arcsec), roughly 300 times smaller.

## Residual error and its cause

- **(a) SPICE vs Horizons, up to 0.003 arcsec.** Consistent with Horizons' relativistic light
  deflection (absent in SPICE `LT+S`), DE441 vs DE440, and print precision. Not separated
  further; it is four orders of magnitude below the target.
- **(b) Web method, Earth, up to about 1.5e-04 deg.** Mostly linear interpolation across one
  hour: the Earth's direction in MOON_ME moves by libration, whose curvature
  (about 7 deg x (2 pi / 27 d)^2) leaves a mid-interval sag of order 1e-04 deg. A second,
  smaller part, measured separately at up to 2.7e-05 deg with exact-time Float64 vectors, is
  that aberration is applied to the Moon-centre vector instead of the topocentric one.
- **(b) Web method, Sun, up to about 1.5e-05 deg.** Float32 quantisation of the unit vector
  (about 3e-06 deg per component) plus interpolation; the centre-vs-topocentric aberration part
  is below 1e-06 deg.

None of this was tuned; tolerances in the tests (1e-05 deg for (a), 5e-04 deg for the web
method) were set from these measurements with headroom.

## Physics sanity (full 12 years, south pole, h = 0)

- Sub-solar latitude stays within +/-1.588 deg, so polar Sun elevation stays inside +/-1.6 deg.
- Sub-Earth latitude (libration in latitude) stays within -6.863 .. +6.860 deg, period 27.2 d.
- Topocentric Earth elevation at the south pole is **-7.106 .. +6.619 deg, not symmetric**:
  the polar observer is 1737.4 km from the centre along the local vertical, so parallax lowers
  the Earth by 0.24-0.28 deg at all times. A "+/-7 deg" rule of thumb is exceeded slightly on
  the negative side; the test asserts the asymmetric range instead.

## Not verified

- Only the Python reproduction of the web method was measured. The TypeScript implementation
  in `web/src/` is checked separately by its own unit tests against `validation_vectors.json`.
- Elevations here are relative to the sphere's horizontal plane; terrain horizon masking is the
  terrain pipeline's job.
- Dates after the last announced leap second (all of 2027+) assume no new leap seconds, as
  Horizons does.
