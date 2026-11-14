# Validation: how do we know it is right?

Measured 2026-11-14. Every number is reproduced by `pipeline/validation/` (see its `README.md`,
about 6 minutes); headline agreements are asserted in `test_validation.py`. Nothing was tuned.

## Current status (read this first)

- **The one disagreement in the summary below is resolved.** On the 20 m terrain Gläser et al.
  used, our method gives a longest darkness of 4.67 days at their spot 2 (published 4.62). The
  earlier 9-day figure came from 80 m terrain, which averages each cell and lowers the crest
  by about a metre. See "Follow-up" at the end. Point 3 of the summary is kept as first
  written, for the record.
- **The browser code has been run on this case too.** With the published 20 m ridge patch the
  app's own code gives 4.67 days and 91.86 % in light over 2024 to 2036; without it, 9.25 days
  (`web/src/lib/crest.real.test.ts`, checked against the Python reference in
  `web/public/data/patches/crest_reference.json`). The "not run through the browser code"
  note in the follow-up predates this.
- **The rule used here is not the rule the app displays.** Every comparison with published
  work in this document counts a moment as lit when *any part* of the Sun's disc is above
  the terrain, because that is what the published work uses. The app's cards count a moment
  as sunlit when *at least half* the disc is above the terrain, a stricter rule chosen so
  that "sunlit" means usable power. The two give different numbers on a crest: at Gläser's
  spot 2 on 20 m terrain the longest darkness is 4.67 days with "any part" and 9.62 days
  with "half the disc". So the 4.67-day agreement validates the geometry (terrain, horizon,
  ephemeris), not the half-disc figure shown on a card. Earth is counted as in view when its
  centre is above the terrain.
- **What this evidence covers.** Long-term averages at 185 points, permanent shadow, one
  well-studied ridge, and consistency with two landings. It does not include time-tagged
  sunrise or sunset checks against an independent source for a specific site, an uncertainty
  estimate for an individual site, or sensitivity across a landing footprint. Treat the app
  as a screening tool.

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

## Follow-up: 20 m terrain and the 2 m longest-darkness disagreement

Measured 2026-11-14 with the 20 m LOLA south-pole model (`LDEM_80S_20MPP_ADJ.TIF`, now complete), read
as a window around the observer with the 80 m model beyond it. Scripts: `study_f_glaser20.py` (7 min)
and `study_g_20m_web.py` (4 min); results in `results/study_f.json` and `study_g.json`. This section
replaces three earlier statements: "20 m model was not tested", "longest darkness at 2 m disagrees",
and "one low obstacle in the 80 m surface joins two dark spells" (right idea, now measured).

### 1. Why our longest darkness at 2 m was twice Gläser's

**It was the 80 m terrain. On 20 m terrain the disagreement is gone.** At the published coordinates,
19 years hourly from 2024-01-01, "in light" = any part of the Sun's disc visible:

| Spot (observer) | Statistic | Published | Ours, 80 m terrain | Ours, 20 m terrain |
|---|---|---|---|---|
| 1 (2 m) | longest darkness | 4.58 d | 8.92 d | 4.71 d |
| 1 (2 m) | time in light / average illumination | 92 % / 88.1 % | 91.14 % / 86.75 % | 91.73 % / 87.75 % |
| 1 (2 m) | longest unbroken light | 233.87 d | 231.96 d | 233.79 d |
| 2 (2 m) | longest darkness | 4.62 d | 8.54 d | 4.67 d |
| 2 (2 m) | time in light / average illumination | 92.27 % / 87.9 % | 91.82 % / 87.10 % | 92.16 % / 87.87 % |
| 2 (2 m) | longest unbroken light | 233.87 d | 233.58 d | 233.88 d |
| 3 (10 m) | longest darkness | 3.08 d | 3.08 d | 3.04 d |
| 3 (10 m) | time in light / average illumination | 95.6 % / 92.5 % | 95.62 % / 92.52 % | 95.65 % / 92.55 % |
| 4 (10 m) | longest darkness | 3.17 d | 3.12 d | 3.17 d |
| 4 (10 m) | time in light / average illumination | 95.65 % / 91.9 % | 95.68 % / 91.68 % | 95.68 % / 91.80 % |
| 3, 4 (10 m) | longest unbroken light | 262.42 d | 262.29 d | 262.38 d |

What is left at 2 m: 0.05 d (about one hourly step) at spot 2 and 0.13 d at spot 1; time in light is
0.11 and 0.27 points below the published figures. That is the residual; it is not explained further.

**The mechanism.** The 80 m model is the mean height of each 80 m cell, which shaves the top off a
narrow crest. Under spot 2 the 20 m ground is 1.12 m higher than the 80 m ground. The record dark
spell on 80 m terrain runs 9 to 18 March 2030 (8.54 days). During it the top of the Sun passes 0.01
to 0.14 degrees *below* a horizon made by ground 140 to 420 m away. On 20 m terrain the same top
edge is 0.01 to 0.17 degrees *above* the horizon for 26 hours, which cuts the spell into 2.83 and
4.62 days. Raising the observer on 80 m terrain by those 1.12 m and changing nothing else gives
4.42 days; so the cause is the observer's own ground height, not distant terrain. This also explains
why 10 m always agreed: at 10 m one metre of ground no longer matters.

**What was tested, and what each factor does** (spot 2 at 2 m unless stated):

| Factor | Result | Closes the gap? |
|---|---|---|
| 20 m terrain near the observer | 8.54 d becomes 4.67 d. Same answer with 20 m data out to 2, 5, 10 or 40 km and with 0.25 degree azimuth steps; a 100 km window with ray steps half as long changes the four spots by at most 0.04 d | **Yes** |
| Exact position, 80 m terrain | 20 m lattice within 200 m of the spots (333 points): shortest value 6.0 d. Within 30 m: 8.4 to 12.2 d. No point reproduces 4.62 | No |
| Exact position, 20 m terrain | Within 10 m of spot 2 (5 m lattice, 13 points): 4.67 to 4.75 d, in light 91.8 to 92.2 %. Within 30 m: 4.5 to 11.8 d (median 4.9). Within 30 m of spot 1: 4.5 to 21.2 d (median 6.1) | Position matters a great deal, but the published coordinates already match |
| Meaning of "dark" | Any part of the disc hidden / upper limb against the nearest stored azimuth: 4.67 d both. At least a tenth of the disc: 4.83 d. Half the disc or the centre: 9.62 d (20 m terrain) | No. Stricter rules only lengthen darkness, on either terrain |
| Time step | 15 min: 4.66 d; 1, 2, 3, 6 h: 4.62 to 4.75 d (80 m terrain: 8.50 to 8.75 d) | No |
| Period | All 54 windows of 19 or 20 years starting 1 January 2005 to 2031: 4.67 d every time (80 m: 8.54 to 8.58 d). Single years: 4.50 to 4.67 d | No. Any window of 19 years contains the worst case |
| Height measured from a smoothed surface | Averaging the ground over 30 / 60 / 100 m lowers the observer by 0.4 / 1.1 / 2.1 m (20 m terrain) and gives 4.79 / 11.7 / 83 d | No. It makes it worse |

**Is there a point within their positional precision that reproduces all their numbers?** Yes, on
20 m terrain: the published coordinates themselves (table above). Their coordinates are given to
0.0001 degrees (3 m in latitude) on a 20 m grid. Within 10 m of spot 2, 3 of 13 lattice points match
both the 2 m time in light (within 0.2 points) and the longest darkness (within 0.25 d); within 10 m
of spots 3 and 4, all 26 match the 10 m figures. On 80 m terrain no point within 30 m of either 2 m
spot matches. The 2 m and 10 m numbers belong to different spots about 400 m apart, so no single point is
expected to give all four.

**What the paper states, and what was not verified.** The EPSC abstract (EPSC2014-136, read in full)
says: 20 m DTM, horizon every 0.5 degrees of azimuth, Sun treated as a disc, 1 hour steps, 19 years
(20 in the figure captions), no start date; it also lists longest light per spot, used above. The
Icarus paper itself is behind a paywall and was not read, so its exact period and darkness rule are
not known; the tests above show neither would change the answer. Their DTM was their own
co-registration of LOLA tracks (Gläser et al. 2013), not the file used here; the close match suggests
the two agree on this crest to well under a metre, but that was not checked directly.

### 2. Is 20 m terrain worth shipping for the south pole?

18 points, observer at 2 m, 18.6 years hourly for the averages, all of 2026 at 5-minute steps for
sunrise and sunset times. "20 m" = 20 m data within 40 km of the observer, 80 m beyond.

| Point | Type | In light, 80 m | In light, 20 m | Longest darkness, 80 m to 20 m (d) | Earth visible, 80 m to 20 m | Sunrise shift, median / largest (min) | Sunset shift, median / largest (min) |
|---|---|---|---|---|---|---|---|
| Shackleton rim | crest | 61.37 % | 0.00 % | 29.2 to never lit | 53.79 to 11.66 % | no events on 20 m | no events on 20 m |
| Connecting ridge (Gläser spot 2) | crest | 91.73 % | 92.08 % | 8.54 to 4.67 | 58.32 to 58.33 % | 3 / 4365 | 5 / 670 |
| Connecting ridge (repo point) | crest | 81.13 % | 74.50 % | 9.75 to 12.79 | 51.49 to 49.99 % | 1568 / 4885 | 185 / 8665 |
| de Gerlache rim | crest | 74.19 % | 71.02 % | 18.79 to 19.12 | 61.53 to 61.53 % | 0 / 8045 | 0 / 10580 |
| Malapert massif | crest | 69.92 % | 69.96 % | 16.62 to 16.50 | 100 to 100 % | 195 / 5085 | 250 / 2520 |
| Nobile rim | crest | 46.58 % | 46.48 % | 17.25 to 17.25 | 94.45 to 94.44 % | 20 / 85 | 0 / 5 |
| Haworth rim crest | crest | 48.73 % | 48.74 % | 13.62 to 13.62 | 17.58 to 17.59 % | 0 / 5 | 0 / 5 |
| Shackleton, Haworth, Faustini, Cabeus floors | floor | 0 % | 0 % | never lit | change at most 0.02 points | none | none |
| Plain 87.9S 251.6E | plain | 31.71 % | 31.54 % | 22.50 to 22.62 | 18.38 to 18.31 % | 5 / 95 | 5 / 160 |
| Plain 85.8S 141.3E | plain | 46.36 % | 45.67 % | 18.50 to 18.67 | 17.91 to 17.82 % | 50 / 155 | 245 / 390 |
| Plain 86.6S 281.3E | plain | 29.00 % | 29.00 % | 24.75 to 24.75 | 34.59 to 34.56 % | 3 / 20 | 0 / 40 |
| Mons Mouton (IAU centre), 7 degree slope | slope | 33.03 % | 33.09 % | 22.96 to 23.00 | 61.87 to 61.87 % | 20 / 105 | 0 / 35 |
| Slope 88.5S 160E, 16 degrees | slope | 8.35 % | 8.34 % | 88.46 to 88.46 | 35.35 to 35.34 % | 0 / 5 | 5 / 15 |
| IM-2 Athena | landing | 46.85 % | 46.85 % | 17.21 to 17.21 | 93.19 to 93.12 % | 0 / 5 | 13 / 30 |
| Griffin-1 target | landing | 35.66 % | 35.65 % | 21.25 to 21.25 | 29.90 to 29.90 % | 0 / 5 | 0 / 0 |

Largest shifts of days are grazing events that exist on one terrain only (as in section E).

**Where it matters.**

- **Crater floors: not at all.** **Slopes, plains, the two landing points:** time in light changes by
  at most 0.7 points, longest darkness by at most 0.17 d, median event time by 0 to 20 minutes (one
  plain: 50 and 245 minutes, largest 6.5 hours). At IM-2 and Griffin-1 the change is 0.01 points and
  at most 30 minutes. The 20 m model does not resolve the small crater Athena stopped in.
- **Crests: a lot, point by point.** At the listed coordinates time in light moves by 0.0 to 6.6
  points, and at the Shackleton rim coordinate from 61 % to never lit: on 20 m terrain that
  coordinate falls in a pit about 60 m wide and roughly 10 m deep that the 80 m model averages away.
  Over a 7 by 7 lattice (40 m spacing) around each crest point the typical change at a given point
  is 2 to 5.5 points on the five crests near the pole (largest 23 to 66), 0.04 to 0.7 on Nobile and Haworth.
- **But the best spot is as good on either terrain.** The sunniest lattice point within 120 m differs
  by at most 0.7 points between 80 m and 20 m on all 18 points. 20 m terrain changes *which* 20 m
  square is the good one and how long its worst night is (connecting ridge 8.5 to 4.7 d), not how
  good the crest is.
- **Small pits appear on 20 m terrain** even on plains: one lattice point near Plain 86.6S goes from
  25.6 % to never lit, one near IM-2 loses 12 points.

**Compared with other effects.** Raising the observer from 2 m to 10 m on 80 m terrain adds 0.1 to
29 points on crests (13 to 15 on three of them) and 0.05 to 1.9 points elsewhere, and shortens the
longest darkness by up to 26 days. So away from crests observer height matters several times more
than 20 m terrain; on crests the two are the same size, and both come from the same cause: a metre
of ground under or near the observer. The Question 1 disagreement (3.9 days of longest darkness, with
time in light changing by only 0.3 points) is a typical crest effect, not an outlier.

**How much 20 m data is needed.** Difference from the 40 km reference, worst of the 18 points:

| 20 m data within | Time in light | Longest darkness | Earth visible | Events within 60 min of reference | Largest event shift | Pixels |
|---|---|---|---|---|---|---|
| none (80 m only) | 61 points | never lit vs 29 d | 42 points | 78.9 % | 7.3 days | 0 |
| 2 km | 0.09 points | 0.04 d | 0.11 points | 99.2 % | 630 min | 200 x 200 |
| 5 km | 0.03 points | 0.04 d | 0.11 points | 100 % | 50 min | 500 x 500 |
| 10 km | 0.01 points | 0.00 d | 0.07 points | 100 % | 15 min | 1000 x 1000 |
| 20 km | 0.01 points | 0.00 d | 0.02 points | 100 % | 10 min | 2000 x 2000 |

Two kilometres already gives the averages; five kilometres also gives every event time within an
hour. The terrain that sets a crest's horizon is 40 to 500 m away.

**Height rounding matters at 20 m.** Rounding a 5 km 20 m patch to 0.5 m, as the current web tiles
do, moves time in light by up to 1.4 points and longest darkness by up to 0.9 d (connecting ridge
repo point). Rounding to 0.1 m: 0.3 points and 0.04 d.

**Recommendation.** Do not ship 20 m data for the whole polar cap (16 times the pixels of the 80 m
tile for no change on floors, slopes and plains). Ship small 20 m patches, 5 km in radius (about
500 by 500 pixels, heights to 0.1 m), for crest and rim sites where users look for near-permanent
light: connecting ridge, Shackleton rim, de Gerlache rim, Malapert. The ray march already steps
20 m out to 10 km, so the browser does no extra work. Not needed for IM-2 or Griffin-1. Wherever
the app shows a crest value from 80 m terrain it should say that the value is for an 80 m cell
average and that longest darkness can be off by days.

**Not verified.** The Icarus paper's full text. Whether the pits in the 20 m model are real craters
or interpolation artefacts between LOLA tracks (no image check was made). At the time of this study the 20 m windows had not been
run through the web tile encoder or the browser code, only the Python reference; that has since
been done for the connecting ridge (see "Current status" at the top). The radius
table uses a square window, so "5 km" means at least 5 km in every direction.
