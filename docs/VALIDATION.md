# Validation: how do we know it is right?

Measured 2026-11-14. Every number is reproduced by `pipeline/validation/` (see its `README.md`,
about 6 minutes); headline agreements are asserted in `test_validation.py`. Nothing was tuned.

## Plain-language summary

The tool compares the terrain horizon (NASA LOLA elevation, 80 m grid) with the Sun's and Earth's
discs (JPL DE440 ephemeris). Five checks:

1. **NASA's illumination maps (PGDA, Mazarico et al. 2011), 185 points, 18.6 years.** Fraction of
   time sunlit, observer at 2 m: correlation 0.99, mean difference +0.7 percentage points, RMS 2.7.
   Observer on the ground: 0.95, -1.1, 5.1. Earth visibility: correlation 0.99 (2 m) and 0.98
   (ground), RMS 2.8 and 4.1. Half the points differ by less than 0.3 points.
2. **Permanent shadow.** Four crater floors get exactly zero sunlight in 18.6 years. On 40 random
   pixels (20 flagged by NASA, 20 not) we agree on 40 at ground level and 39 at 2 m.
3. **Gläser et al. 2014, connecting ridge.** Time in light: ours 92.29 % at 2 m (published
   92.27 %), 95.69 % at 10 m (95.65 %). Longest darkness at 10 m: 3.17 days (3.17). **Longest
   darkness at 2 m disagrees:** ours about 9 days, published 4.62.
4. **Two landings (IM-1, IM-2).** Both sites are sunlit at touchdown and both missions ended before
   our computed sunset. Consistency only: neither ended because the Sun set.
5. **Browser data vs full resolution.** Averages differ by at most 1.0 point; sunset times usually
   by minutes, sometimes hours.

## What does not agree, and why

- **Ground-level observers on crests.** At 0 m the four named crest points read 9 to 41 points
  below NASA (Shackleton rim 0.45 vs 0.86); at 2 m, 2 to 10 above. The polar Sun stays within about
  2 degrees of the horizon, so a metre of relief 50 m away decides the answer. NASA's map itself
  changes by 0.3 to 0.8 between adjacent pixels there.
- **NASA's "sunlit" rule and observer height are not stated.** Our "any part of the disc" rule
  fits best; the disc-weighted average reads 1.0 (2 m) to 2.8 (0 m) points lower.
- **A point 85 m from the pole:** NASA says permanently shadowed, we say lit 28 %. The NASA raster
  is speckled there (about 30 of 81 pixels zero, next to 0.3 to 0.6, on a smooth slope). Probably a
  product artefact; unconfirmed.
- **Longest darkness at 2 m.** At the published spot: 8.5 days at 2 m, 4.5 at 3 m, 3.7 at 10 m.
  One low obstacle in the 80 m surface joins two dark spells.
- **IM-2** stopped in a shadowed crater too small for 80 m terrain; we show the site sunlit.

## Known limits

- **Terrain stops at 80S**, so the horizon toward the equator is too low near the edge. At IM-1
  (80.13S), rays between azimuth 300 and 60 degrees leave the data after 3.5 to 8 km. Missing
  terrain can only hide the Sun: true sunrise may be later and true sunset earlier, never the
  reverse. IM-1's sunset azimuth has 81 km of terrain, its sunrise azimuth 9.5 km.
- **80 m grid.** The 20 m model was not tested (file still downloading).
- **Point Sun vs disc:** same average (within 0.1 point), but a sunset moves by up to 4 hours.
- **Eclipses are not modelled.** On 14 March 2025 the Earth hid the Sun at the IM-2 site from 05:35
  to 08:15 UTC; the tool shows it lit.
- **Period:** 18.6 years from 2024-01-01; NASA's and Gläser's start dates were not found.
- Finer steps (5 minutes, 0.25 degrees azimuth) change averages by under 0.01 point.

## A. 18.6-year averages vs NASA PGDA (185 points: 177 on a 20 km lattice south of 85S, 8 named)

Ours minus PGDA (fraction of time); PGDA sampled at the source 120 m pixel.

| Quantity | Our rule | Observer | r | Mean bias | RMS | Median abs |
|---|---|---|---|---|---|---|
| Sun | any part of disc | 0 m | 0.952 | -0.011 | 0.051 | 0.003 |
| Sun | any part of disc | 2 m | 0.988 | +0.007 | 0.027 | 0.001 |
| Sun | disc-weighted | 0 m | 0.943 | -0.028 | 0.061 | 0.020 |
| Sun | disc-weighted | 2 m | 0.988 | -0.010 | 0.027 | 0.016 |
| Earth | any part of disc (PGDA's rule) | 0 m | 0.983 | -0.005 | 0.041 | 0.001 |
| Earth | any part of disc (PGDA's rule) | 2 m | 0.993 | +0.005 | 0.028 | 0.001 |

Worst 10, Sun (any part, by 0 m difference; "3x3" = PGDA range over neighbouring pixels).

| Point | Lat, lon E | Ours 0 m | Ours 2 m | PGDA | PGDA 3x3 | Likely reason |
|---|---|---|---|---|---|---|
| Shackleton rim | -89.781, 204.0 | 0.449 | 0.876 | 0.857 | 0.50-0.86 | crest; observer height |
| Lattice 0,0 (85 m from pole) | -89.997, 135.0 | 0.280 | 0.287 | 0.000 | 0.00-0.58 | PGDA speckle at the pole |
| Lattice -1,-5 | -86.637, 191.3 | 0.053 | 0.327 | 0.323 | 0.06-0.33 | observer height |
| de Gerlache rim | -88.669, 291.7 | 0.507 | 0.826 | 0.741 | 0.47-0.79 | crest; point vs pixel |
| Connecting ridge | -89.448, 222.7 | 0.478 | 0.760 | 0.677 | 0.51-0.85 | crest; point vs pixel |
| Lattice -3,-4 | -86.702, 216.9 | 0.079 | 0.164 | 0.211 | 0.12-0.21 | 4.5 degree slope; resolution |
| Malapert massif | -85.964, 357.7 | 0.522 | 0.714 | 0.614 | 0.00-0.85 | crest; point vs pixel |
| Lattice +6,-1 | -85.992, 99.5 | 0.207 | 0.314 | 0.276 | 0.05-0.38 | shadow edge inside the pixel |
| Lattice -5,-5 | -85.338, 225.0 | 0.274 | 0.349 | 0.334 | 0.30-0.37 | observer height |
| Lattice 0,-5 | -86.702, 180.0 | 0.166 | 0.215 | 0.215 | 0.00-0.24 | observer height |

Worst 10, Earth visibility.

| Point | Lat, lon E | Ours 0 m | Ours 2 m | PGDA | PGDA 3x3 | Likely reason |
|---|---|---|---|---|---|---|
| Malapert massif | -85.964, 357.7 | 0.637 | 1.000 | 1.000 | 0.25-1.00 | crest; observer height |
| Lattice 0,0 (85 m from pole) | -89.997, 135.0 | 0.308 | 0.333 | 0.000 | 0.00-0.56 | PGDA speckle at the pole |
| Lattice -3,+6 | -85.579, 333.4 | 0.085 | 0.219 | 0.297 | 0.21-0.47 | 15 degree slope; resolution |
| Lattice +3,+3 | -87.205, 45.0 | 0.239 | 0.382 | 0.319 | 0.08-0.45 | 9 degree slope; point vs pixel |
| Lattice -1,+2 | -88.525, 333.5 | 0.283 | 0.363 | 0.357 | 0.30-0.40 | observer height |
| Connecting ridge | -89.448, 222.7 | 0.453 | 0.509 | 0.523 | 0.44-0.58 | observer height |
| Lattice +6,0 | -86.042, 90.0 | 0.272 | 0.348 | 0.332 | 0.12-0.33 | 26 degree slope; observer height |
| Lattice -6,+1 | -85.992, 279.5 | 0.340 | 0.395 | 0.394 | 0.35-0.40 | observer height |
| Lattice -4,-5 | -85.779, 218.6 | 0.289 | 0.338 | 0.332 | 0.32-0.39 | observer height |
| Lattice -6,-3 | -85.579, 243.4 | 0.473 | 0.524 | 0.512 | 0.46-0.55 | 17 degree slope; observer height |


## B. Permanent shadow (18.6 years, hourly, any part of the disc)

| Sample | Observer 0 m | Observer 2 m |
|---|---|---|
| 4 named crater floors: zero sunlight | 4 of 4 | 4 of 4 |
| 20 random pixels flagged PSR by PGDA: we also get zero | 20 of 20 | 19 of 20 |
| 20 random pixels not flagged: we get some sunlight | 20 of 20 | 20 of 20 |

Random pixels south of 85S, fixed seed; mostly far from a shadow edge, so an easy test.

## C. Gläser et al. 2014, connecting ridge (19 years, hourly)

Location matching is approximate: ours is the best point of our own search (80 m lattice within
1 km of the published spots, then 20 m lattice within 160 m). Both are maxima, which favours
agreement.

| Observer | Statistic | Published | Ours, best point in window | Ours, at published coordinates (two spots) |
|---|---|---|---|---|
| 2 m | time in light | 92.27 % | 92.29 % | 91.14 %, 91.82 % |
| 2 m | average illumination | 87.9 % | 87.0 % | 86.8 %, 87.1 % |
| 2 m | longest darkness | 4.62 d | 9.42 d | 8.92 d, 8.54 d |
| 10 m | time in light | 95.65 % | 95.69 % | 95.62 %, 95.68 % |
| 10 m | average illumination | 91.9 % | 91.4 % | 92.5 %, 91.7 % |
| 10 m | longest darkness | 3.17 d | 3.17 d | 3.08 d, 3.12 d |

Our best points lie 170 m (2 m) and 260 m (10 m) from the published spots' centre.

## D. Mission timelines (observer 2 m, 5-minute steps, UTC)

| | IM-1 Odysseus (80.13S, 1.44E) | IM-2 Athena (84.79S, 29.20E) |
|---|---|---|
| Computed sunrise (first limb) | 2024-02-19 04:40 | 2025-03-05 22:50 |
| Reported landing | 2024-02-22 23:23 | 2025-03-06 17:28 |
| Sun at landing, computed | 10.5 degrees up, full disc | 2.5 degrees up, full disc (horizon 0.8) |
| Reported end | 2024-02-29, about 17:00 (time of day unconfirmed) | 2025-03-07 06:15 |
| Sun at reported end, computed | 5.3 degrees up, full disc | 3.0 degrees up, full disc |
| Computed sunset (last limb / disc centre) | 2024-03-02 18:00 / 14:05 | 2025-03-19 22:55 / 19:50 |
| Sunset on a smooth sphere | 2024-03-03 10:15 | 2025-03-19 17:00 |
| Same events from the web tiles | sunrise 01:05, sunset 18:40 | sunrise 22:50, sunset 22:50 |

IM-1 ended when the tipped lander's one lit panel lost the Sun; no published sunset time was
found. IM-2's 10-day plan fits inside our computed daylight. Sources: Wikipedia (IM-1, IM-2), SpaceNews 28 Feb 2024,
NASA release "NASA Receives Some Data Before Intuitive Machines Ends Lunar Mission".

## E. Sensitivity (observer 2 m; web tiles minus 80 m GeoTIFF)

Timing over all 2026 events. "Within 60 min" = share of full-resolution sunsets matched by a
web-tile sunset; the rest are grazing events in one horizon only.

| Point | Average illumination, GeoTIFF | Web tiles minus GeoTIFF | Sunset, median / 90th pct (min) | Sunsets within 60 min | Sunrise, median (min) |
|---|---|---|---|---|---|
| Shackleton rim | 0.547 | +0.0075 | 0 / 271 | 78 % | 0 |
| Connecting ridge | 0.760 | -0.0096 | 10 / 795 | 81 % | 98 |
| de Gerlache rim | 0.692 | -0.0066 | 0 / 329 | 79 % | 0 |
| Malapert massif | 0.661 | +0.0005 | 30 / 80 | 75 % | 10 |
| Four crater floors | 0.000 | 0.0000 | no sunsets | - | - |
| IM-1 site (297 m tile) | 0.392 | +0.0064 | 50 / 60 | 92 % | 225 |
| IM-2 site (297 m tile) | 0.451 | -0.0004 | 10 / 50 | 100 % | 0 |

Inside 85S the web tile is the same 80 m pixels rounded to 0.5 m; that alone moves crest averages
by up to 1 point. Points here are tens of metres from those in A (Shackleton rim 0.55 vs 0.81).
