# Terrain notes (LOLA south pole DEM, tiles, horizon)

Measured on 2026-11-14 on the Mac mini (10 cores, Python 3 venv: numpy 2.5.4, rasterio 1.5.2,
numba 0.68.1, Pillow 13.0.0). Every number below comes from a script in `pipeline/terrain/`;
the raw outputs are the `*_report.json` files next to the scripts.

## 1. Source file and georeferencing

- File: `data/raw/lola/LDEM_80S_80MPP_ADJ.TIF` from
  `https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_80S_80MPP_ADJ.TIF` (NASA GSFC PGDA product 78).
  189,158,392 bytes (equals the server's Content-Length), server Last-Modified 2023-07-07,
  sha256 `82030dcbdd7c4bb0c7d858e9b4b293b9f2cda5a543ba31ec0f42784bd6beee5a`.
- Inspect with `.venv/bin/python pipeline/terrain/inspect_source.py`.
- CRS: `Moon (2015) - Sphere / Ocentric / South Polar` (IAU 30135), `Polar_Stereographic`,
  latitude_of_origin -90, central_meridian 0, false easting/northing 0, sphere 1737400 m, metres.
  PROJ: `+proj=stere +lat_0=-90 +lat_ts=-90 +lon_0=0 +R=1737400`.
- Grid: 7600 x 7600 float32, pixel 80 m, transform `(80, 0, -304000, 0, -80, 304000)`, so
  x and y run from -304000 to +304000 m, row 0 = maximum y. `AREA_OR_POINT=Area`
  (pixel-registered: the first pixel centre is at x = -303960 m).
- Nodata is NaN; the file contains **0 NaN pixels**. The square is filled to its corners, which
  reach 75.89S. The edge midpoints are at 80.0002S (80S is r = 304005.6 m, the grid stops at
  304000 m).
- Heights: metres. Range -7295.517 to +7026.331 m, mean -1500.6 m. The GMT history tag reads
  `grdmath ldem_80s_final_adj_80mpp_surf.grd 1000.0 MUL`, i.e. a kilometre grid multiplied by 1000.
  No scale/offset/unit tags are set.
- **Match with the contract: yes, nothing differs.** The contract formula
  (`r = 2R tan((90+lat)/2)`, `x = r sin(lon)`, `y = r cos(lon)`) agrees with PROJ applied to the
  file's CRS to 3e-11 m on eight points from 78S to 89.9S (also a pytest).
- Not provable from the file alone: that heights are relative to the 1737.4 km sphere. The file
  only says the CRS sphere is 1737400 m; the reference radius is from the PGDA product
  description, which I did not re-read today. Sanity values agree with published figures:
  Shackleton floor -2787 m, Shackleton connecting ridge +1954 m, Malapert massif +4847 m,
  Haworth floor -3330 m, and the Shackleton floor horizon is 19.8 to 23.4 degrees (a 21 km wide,
  4 km deep crater gives about 21). These also confirm the longitude direction and row order.

## 2. Tiles (`pipeline/terrain/build_tiles.py`)

Build: `.venv/bin/python pipeline/terrain/build_tiles.py` (16.3 s in total; writes
`pipeline/terrain/build_report.json`).

| File | Size | Grid | Bytes |
|---|---|---|---|
| `sp_dem_L0.png` | 2048 x 2048 RGB | x, y in +-304000 m, 296.875 m/px | 5,739,829 (5.7 MB) |
| `sp_dem_L1.png` | 4096 x 4096 RGB | x, y in +-163840 m, 80 m/px | 15,590,564 (15.6 MB) |
| `sp_slope_L0.png` | 2048 x 2048 grey | same as L0 | 2,464,746 (2.5 MB) |
| `sp_slope_L1.png` | 4096 x 4096 grey | same as L1 | 8,183,887 (8.2 MB) |
| `sp_meta.json` | | | 2,276 |

All four PNGs: 8-bit, colour type 2 (RGB) or 0 (grey), not interlaced, chunks `IHDR/IDAT/IEND`
only (no alpha, no iCCP/sRGB/gAMA). Total 32.0 MB. L1 is under the 25 MB limit.

- L0 is an exact area (box) average of the source (factor 3.7109, weights are overlap fractions).
- L1 is a plain crop of source pixels 1752..5847, so it has **no resampling at all**.
- Slope: central differences on the 80 m grid (one pixel each side, so a 160 m effective
  baseline), times the stereographic map scale `1 + (r/2R)^2` (1.0077 at 80S). Source maximum
  60.06 degrees, so the 63.75 clamp is never hit. L0 slope is the area average of the 80 m slope
  (a mean, not a maximum: steep small features are diluted).

Decoded PNG compared with the source:

| Check | max | RMS | 99th pct |
|---|---|---|---|
| L1 height vs source pixels (quantisation only) | 0.251 m | 0.144 m | 0.248 m |
| L0 height vs its own area average (quantisation only) | 0.250 m | 0.144 m | 0.247 m |
| L0 height, bilinear at every source pixel centre, vs source | 134.5 m | 4.27 m | 14.8 m |
| L1 slope vs source slope | 0.125 deg | 0.072 deg | 0.124 deg |
| L0 slope, bilinear at source pixel centres, vs source slope | 31.8 deg | 1.20 deg | 4.36 deg |

### Deviations from the contract

1. **L1 half-extent is 163.84 km, not "about 152 km".** 4096 native 80 m pixels is 327.68 km
   wide. I kept native pixels (zero resampling error, covers to 84.6S on the axes and 82.4S on the
   diagonals) instead of stretching 3800 pixels to 4096 (74.2 m, interpolated). The loader must
   take extents from `sp_meta.json`, not hard-code 152 km.
2. `sp_meta.json` has one extra top-level key, `slope_encoding`, and `height_encoding` declares
   `nodata_rgb: [0,0,0]` (unused: the source has no nodata).
3. `horizon_testvectors.json` entries have one extra key, `surface_h_m` (DEM height under the
   observer as sampled from the tiles) to help debug the TypeScript port.

## 3. Horizon (`pipeline/terrain/horizon.py`)

The exact scheme is in the module docstring. Summary: rays follow great circles on the
R = 1737.4 km sphere; each sample is projected to the grid, read with bilinear interpolation,
turned into a body-fixed vector `(R+h)u`, and its elevation is taken in the observer's
East-North-Up frame (no flat-earth step anywhere). Arc lengths: `s += max(20 m, 0.002 s)` up to
300 km, 2202 samples per ray (20 m steps to 10.02 km, then 0.2 % steps; last sample 299,821.0 m).
A ray ends at the first sample outside the data. Web tiles: L1 where it has data, else L0.

Speed (numba, single thread, 720 azimuths x 2202 samples): **22 to 28 ms per site** from the
GeoTIFF, 18 to 24 ms from the tiles. One-off costs: GeoTIFF load 0.7 s, tile decode 0.3 s, numba
compile on first use (cached afterwards).

### Test vectors (computed from the web tiles)

`web/public/data/terrain/horizon_testvectors.json` (41,869 bytes), 6 sites, observer 2 m,
0.5 degree step (720 values, rounded to 1e-6 degree). Regenerate with
`.venv/bin/python pipeline/terrain/make_testvectors.py`.

| Site | lat, lon E | h (m) | horizon min / max (deg) | tiles - full res: max / RMS (deg) | 4x finer steps: max / RMS (deg) |
|---|---|---|---|---|---|
| Shackleton rim connecting ridge | -89.45, 222.7 | 1954.4 | -2.84 / 0.52 | 0.230 / 0.081 | 0.064 / 0.014 |
| Shackleton crater floor | -89.67, 129.2 | -2786.8 | 19.76 / 23.43 | 0.0014 / 0.0006 | 0.007 / 0.001 |
| Malapert massif | -85.99, 357.1 | 4847.3 | -4.83 / 12.77 | 0.134 / 0.054 | 0.074 / 0.012 |
| Nobile rim | -85.2, 31.0 | 5789.4 | -4.19 / 11.03 | 0.061 / 0.014 | 0.034 / 0.004 |
| Haworth floor | -87.5, 355.0 | -3330.0 | 3.09 / 10.00 | 0.0006 / 0.0002 | 0.003 / 0.0005 |
| Near DEM edge 81S (L0 only) | -81.0, 60.0 | 1979.3 | -2.83 / 4.97 | **2.07 / 0.53** | 0.077 / 0.014 |

"4x finer steps" is the same full-resolution DEM marched with 5 m / 0.05 % steps: it is the
discretisation error of the reference scheme itself.

What the browser loses, over 400 random sites (`tile_accuracy_study.py`, 2 degree step):

| Observer | sites | per-site max error: median / p90 / worst | per-site RMS: median / p90 / worst |
|---|---|---|---|
| inside L1 | 162 | 0.05 / 0.15 / 0.23 deg | 0.012 / 0.038 / 0.113 deg |
| L0 only (outside +-163.84 km) | 238 | **0.68 / 2.1 / 15.1 deg** | 0.22 / 0.78 / 8.7 deg |

- Inside L1 the only loss is the 0.5 m height quantisation. It shows on ridges and summits, where
  the horizon is set by ground 20 to 300 m away (0.25 m at 60 m is 0.24 degrees). In craters,
  where the horizon is kilometres away, it is about 0.001 degrees.
- Outside L1 the 297 m pixels smooth the ground near the observer (observer height off by a
  median 2 m, worst 13 m) and the near-field horizon is wrong by degrees on rough ground. L1
  covers only about 29 % of the DEM area. If sites north of about 84.6S matter, the best fix is
  native-resolution tiles loaded on demand (for example the four 3800 x 3800 quadrants, roughly
  13 MB each) rather than a finer single L0; this needs a contract change and is not done.
- For scale: the Sun's radius is about 0.27 degrees. Also note the 80 m DEM itself cannot show
  boulders or relief smaller than a pixel, so near-field horizons on ridges are uncertain at
  that level whatever the encoding.

## 4. Limitation: the DEM stops at 80S

Toward the equator (azimuth near 0 = north) a site at latitude `lat` has data for only
`(|lat| - 80) x 30.3 km` (more toward the grid corners, which reach 75.9S). Terrain beyond that
is simply absent, so the computed horizon in that sector is too low or equal, never too high.

Geometric bound: a hidden summit `H` above the observer's level at distance `d` appears at
`atan((H - d^2/2R) / d)`:

| Site latitude | distance to edge due north | H = 3 km | H = 6 km |
|---|---|---|---|
| 81S | 30 km | 5.2 deg | 10.8 deg |
| 82S | 61 km | 1.8 deg | 4.6 deg |
| 83S | 91 km | 0.4 deg | 2.3 deg |
| 84S | 121 km | below horizontal | 0.9 deg |
| 85S | 152 km | below horizontal | below horizontal |

Measured (`edge_study.py`): 300 random sites between 85S and 89.5S, full-resolution horizon
recomputed with all rays cut at distance d, loss = full horizon minus cut horizon. Read each row
as "what the equator-ward sector loses for a site that far from the edge".

| Cut d (equivalent latitude) | azimuths losing > 0.1 deg | > 0.5 deg | mean loss | 99th pct | worst |
|---|---|---|---|---|---|
| 15 km (80.5S) | 40 % | 35 % | 1.19 deg | 10.0 deg | 16.4 deg |
| 30 km (81S) | 26 % | 21 % | 0.51 deg | 5.9 deg | 8.9 deg |
| 61 km (82S) | 9.9 % | 6.8 % | 0.11 deg | 2.3 deg | 5.1 deg |
| 91 km (83S) | 3.6 % | 2.0 % | 0.025 deg | 0.95 deg | 3.1 deg |
| 121 km (84S) | 0.8 % | 0.3 % | 0.005 deg | 0.03 deg | 2.6 deg |
| 152 km (85S) | 0.14 % | 0.03 % | 0.0005 deg | 0 | 1.3 deg |
| 200 km (86.6S) | 0.02 % | 0.006 % | 0.0001 deg | 0 | 0.65 deg |

Across those sites the sample that sets the horizon is at a median 9.4 km, 90th percentile 65 km,
99th percentile 124 km, maximum 224 km.

Conclusion: south of about 85S the missing terrain is negligible (under 0.2 % of azimuths).
At 84S it is rare but can reach 1 to 2.5 degrees on single azimuths. From 83S northward it is
a real error in the northern sector: several degrees are possible at 81 to 82S. That sector is
where the Sun is at its highest and, for near-side sites, where the Earth sits, so sunrise/sunset
times and Earth visibility north of about 83S should be labelled as optimistic (too much
visibility). Caveats on the study: equator-ward rays of the 85S sites themselves end at 150 km,
so the 152 and 200 km rows are slight underestimates; terrain beyond 80S may differ in character
from the polar terrain used as a proxy. The 300 km range cap is not a practical limit (maximum
observed horizon distance 224 km).

## 5. Tests

`.venv/bin/python -m pytest pipeline/terrain/test_terrain.py -q` gives `35 passed in 2.1 s`
(with the GeoTIFF, tiles and vectors present; the four data-dependent tests skip otherwise).
Covered: contract projection vs PROJ on the file's CRS; step schedule; flat sphere dip
(-0.0869 degrees for 2 m, matches `-acos(R/(R+h))` to 2e-5 degrees, three height cases); Gaussian
mountain 3 km high at 50 km (matches a 1 m analytic profile to 0.005 degrees and is 0.8 degrees
below the flat-earth value); mesa edge at 20 km; azimuth convention at three sites and five
azimuths (mountain due east appears at 90); nodata handling; PNG round trips and chunk checks;
area average; slope of a tilted plane; real tiles vs source; test vectors reproduce from tiles.

## 6. Not verified

- The reference radius of the heights (see section 1) and the absolute accuracy of the LOLA
  product; no independent horizon (for example a published horizon mask or LRO image) was
  compared.
- No TypeScript port exists yet, so "the browser reproduces these numbers" is untested. JS and
  Python both use IEEE doubles, so a faithful port should agree to about 1e-9 degrees; PNG
  decoding must not apply colour management or premultiplied alpha.
- The feature coordinates are the approximate ones given in the task; the heights found there are
  plausible but the sites were not checked against a gazetteer.
- A second file, `data/raw/lola/LDEM_80S_20MPP_ADJ.TIF` (the 2.7 GB 20 m product), was being
  downloaded into the same directory by another process during this work. The terrain pipeline
  did not start it and does not use it.
