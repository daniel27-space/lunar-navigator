# Map-layer tiles: build notes

Built 2026-11-14 by `pipeline/layers/build_layers.py`. Outputs are in `web/public/data/layers/`.

## Sources (downloaded to `data/raw/layers/`, plain `.TIF`, not `_COG`)

| File | Bytes | Content |
|---|---|---|
| `AVGVISIB_75S_120M_201608.TIF` | 83,052,039 | average fraction of time sunlit |
| `AVGVISIB_75S_120M_201608_EARTH.TIF` | 43,148,153 | average Earth visibility |
| `LPSR_75S_120M_201608.TIF` | 1,046,706 | permanently shadowed region mask |

Base URL `https://pgda.gsfc.nasa.gov/data/MoonIllumination/`. Citation: Mazarico et al. (2011),
*Icarus* 211, 1066-1081, doi:10.1016/j.icarus.2010.10.030 (2016-08 release, PDS data set
`LRO-L-LOLA-4-GDR-V1.0`). All three are real BigTIFF GeoTIFFs (magic `II+\0`, opened by rasterio);
byte sizes match the HEAD sizes in `layers.md`.

## Header facts (read with rasterio; full dump in `pipeline/layers/source_headers.json`)

Same for all three files:
- 7624 x 7624, int16, nodata -32768 (no pixel actually holds nodata), `AREA_OR_POINT=Area`.
- Transform: 120 m pixels, upper-left corner (-457440, +457440) m; bounds +/-457440 m.
- CRS `Moon2000_spole`: Polar_Stereographic, latitude_of_origin -90, central_meridian 0, false
  easting/northing 0, sphere 1,737,400 m. PROJ form: `stere, lat_0=-90, lat_ts=-90, lon_0=0,
  a=1737400`, no scale factor.
- Tags: `PRODUCT_CREATION_TIME 2016-09-15`, `START_TIME 2009-07-13`, `STOP_TIME 2013-07-18`.

Same projection as the terrain: `LDEM_80S_80MPP_ADJ.TIF` is "Moon (2015) - Sphere / Ocentric /
South Polar" (IAU 30135), also Polar_Stereographic, lat origin -90, meridian 0, sphere 1,737,400 m.
Only the datum *names* differ. `check_crs()` asserts every parameter instead of assuming, and the
warp uses the source CRS as the destination CRS, so it is a pure regrid with no datum step.

## Scale factors (from the headers, confirmed by the value range)

| File | GDAL scale | offset | raw range found | physical |
|---|---|---|---|---|
| sun | 4e-5 | 0 | 0 .. 22396 | 0 .. 0.896 fraction of time |
| earth | 4e-5 | 0 | 0 .. 25000 (all 25001 values occur) | 0 .. 1.000 fraction of time |
| PSR | 2.5e-5 | 0.5 | only -20000 and +20000 | exactly 0 or 1 |

So raw 25000 = 1.0 for the AVGVISIB files; the Earth file reaching exactly 25000 and never more
confirms it. In the PSR file 1 = permanently shadowed: Shackleton, Haworth, Shoemaker, Faustini
and Cabeus floors are all 1, and average sunlight inside the mask is ~0 (below).

## Output grid

Taken from `web/public/data/terrain/sp_meta.json` `levels[0]`: 2048 x 2048, x and y from
-304000 to +304000 m, pixel 296.875 m, row 0 = max y, col 0 = min x. This equals the bounds of
`data/raw/lola/LDEM_80S_80MPP_ADJ.TIF` (checked). The fallback was not needed. The 75S sources
cover the whole tile, so there is no no-data in any output (255 never occurs in the two fraction
tiles).

## Resampling

- `sun_avg.png`, `earth_avg.png`: `rasterio.warp.reproject` with `Resampling.average`
  (area-weighted mean of the 120 m pixels under each 296.875 m pixel), applied to the physical
  fraction, then `round(fraction * 250)`.
- `psr.png`: the 0/1 mask is area-averaged the same way to give the PSR area fraction of each
  output pixel, then thresholded: 255 where the fraction is >= 0.5 (majority rule), else 0.
  Why: nearest-neighbour would pick one of about six source pixels arbitrarily and make ragged
  edges; majority keeps total PSR area close to the source (5.46% of tile pixels flagged, source
  area fraction over the same extent 5.69%). Cost: shadowed patches smaller than about half a
  297 m pixel disappear. 128 is never written.

Consequence of averaging worth knowing in the UI: the best-lit spots are small. The source
maximum is 0.896, the tile maximum is 0.704.

## Spot checks (`pipeline/layers/verify_layers.py`)

Each cell is: decoded PNG value / source value at the nearest 120 m pixel / mean of the source
pixels inside the output pixel (for PSR: area fraction).

| Place | lat, lonE | row, col | sun | earth | psr | expected |
|---|---|---|---|---|---|---|
| Shackleton floor | -89.67, 129.2 | 1045, 1050 | 0.000 / 0.000 / 0.000 | 0.000 / 0.000 / 0.000 | 255 / 1 / 1.00 | PSR, ~0 sun: yes |
| Shackleton-de Gerlache connecting ridge | -89.45, 222.7 | 1065, 985 | 0.648 / 0.677 / 0.659 | 0.556 / 0.523 / 0.554 | 0 / 0 / 0.00 | high sun: yes |
| Shackleton rim | -89.78, 204.3 | 1044, 1014 | 0.656 / 0.857 / 0.652 | 0.544 / 0.561 / 0.546 | 0 / 0 / 0.00 | high sun: yes |
| Malapert massif summit area | -85.964, 357.681 | 611, 1007 | 0.488 / 0.614 / 0.498 | 1.000 / 1.000 / 1.000 | 0 / 0 / 0.00 | high Earth visibility: yes |
| 86S 0E (about 4 km from the summit) | -86.0, 0.0 | 615, 1024 | 0.392 / 0.429 / 0.395 | 0.284 / 0.412 / 0.276 | 0 / 0 / 0.00 | high Earth visibility: **no** |
| Haworth floor | -87.45, 355.0 | 764, 1001 | 0.000 / 0.000 / 0.000 | 0.040 / 0.041 / 0.040 | 255 / 1 / 1.00 | PSR: yes |
| Shoemaker floor | -88.1, 45.0 | 886, 1161 | 0.000 / 0.000 / 0.000 | 0.228 / 0.231 / 0.230 | 255 / 1 / 1.00 | PSR: yes |
| Faustini floor | -87.2, 84.0 | 994, 1308 | 0.000 / 0.000 / 0.000 | 0.024 / 0.022 / 0.022 | 255 / 1 / 1.00 | PSR: yes |
| Cabeus (LCROSS impact) | -84.68, 311.3 | 665, 615 | 0.000 / 0.000 / 0.000 | 0.188 / 0.185 / 0.186 | 255 / 1 / 1.00 | PSR: yes |
| de Gerlache rim | -88.67, 291.8 | 973, 897 | 0.636 / 0.741 / 0.652 | 0.596 / 0.613 / 0.614 | 0 / 0 / 0.00 | high sun: yes |
| Far side, 82S 180E | -82.0, 180.0 | 1842, 1024 | 0.468 / 0.473 / 0.472 | 0.000 / 0.000 / 0.000 | 0 / 0 / 0.00 | ~0 Earth: yes |
| Near side, 82S 0E | -82.0, 0.0 | 205, 1024 | 0.072 / 0.100 / 0.075 | 0.172 / 0.250 / 0.180 | 0 / 0 / 0.00 | high Earth visibility: **no** |

- Largest |PNG - source footprint mean| over these points: sun 0.0165, earth 0.0178. The
  quantisation step is 0.004; the rest is partial-pixel weighting (the check counts whole source
  pixels by centre, the warp weights by overlap).
- Two points did not meet the expectation I started with. Exactly 86S 0E and 82S 0E are not
  high-Earth-visibility pixels (0.28 and 0.17); both sit in rough terrain where values within
  3 km range up to 1.000. The Malapert summit area (85.964S 357.681E) is 1.000. Orientation is
  right as a whole: mean Earth visibility is 0.49 in the lon-0 (top) half and 0.10 in the far
  half, falling steadily top to bottom (0.69, 0.55, 0.42, 0.30, 0.23, 0.10, 0.05, 0.005 per
  256-row band), and left/right halves are equal (0.292 / 0.294).
- Cross-layer: inside the PSR mask, tile sun_avg has mean 0.0010 (max 0.256, at mask edges after
  resampling). 16,785 non-PSR pixels encode sun 0 (values below 0.002, or minority-PSR pixels).

## Tests

`.venv/bin/python -m pytest -p no:cacheprovider pipeline/layers/test_layers.py -q` -> 11 passed.
Covers encoding round trip, no-data, projection formula, a hand-computed lat/lon to pixel
(Shackleton floor -> row 1045, col 1050), PNG chunk check (8-bit greyscale, only IHDR/IDAT/IEND),
grid equality with terrain L0, known places, and an independent block-mean comparison against the
source at 300 random pixels.

## Not verified

- Observer height above the surface for these products: not stated in the GeoTIFF tags or in
  `layers.md`. `layers.json` says to treat it as ground level; that is an assumption, not read
  from the paper or product page.
- "Earth visible if any part of the disc is unobscured" comes from `layers.md`'s reading of the
  product page; not re-checked here. How a partly hidden Sun is counted (disc fraction or
  yes/no) was not checked; `layers.json` says so.
- The PNGs were not loaded in the web app.
