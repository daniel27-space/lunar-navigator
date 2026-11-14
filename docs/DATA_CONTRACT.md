# Data contract between `pipeline/` and `web/`

The web app is static. Everything it needs is precomputed into `web/public/data/`.
Pipeline code may change freely; these file formats may not change without updating this file
and the web loader together.

## Conventions

- Body-fixed frame: Moon Mean Earth / Polar Axis (SPICE `MOON_ME`, via `moon_de440_250416.tf`
  and `moon_pa_de440_200625.bpc`). This is the frame LOLA products use.
- Reference sphere radius R = 1737.4 km. Elevation h is metres above that sphere.
- Latitude/longitude: planetocentric degrees, east-positive longitude.
- Site position: `(R+h) * [cos(lat)cos(lon), cos(lat)sin(lon), sin(lat)]`.
- Local frame at a site: East, North, Up on the sphere. Azimuth is degrees clockwise from
  north (0 = N, 90 = E). Elevation is degrees above the local horizontal plane.
- No atmosphere, so no refraction.
- Time: UTC. Files store seconds since the file's `t0_utc`.
- Angular radii: Sun = asin(695700 km / distance), Earth = asin(6378.137 km / distance).

## `ephem/ephem.json` + `ephem/ephem.bin`

Sun and Earth as seen from the Moon's centre, hourly.

- `ephem.json`: `{ "t0_utc": ISO string, "step_s": 3600, "count": N, "frame": "MOON_ME",
  "abcorr": "LT+S", "kernels": [...], "record": ["sun_x","sun_y","sun_z","sun_dist_km",
  "earth_x","earth_y","earth_z","earth_dist_km"] }`
- `ephem.bin`: N records of 8 little-endian Float32. `*_x,y,z` is a unit vector in MOON_ME from
  the Moon's centre to the body; `*_dist_km` is the centre-to-centre distance.
- Coverage: 2024-01-01T00:00Z to 2036-01-01T00:00Z.
- The web app interpolates linearly between records and applies the topocentric correction
  itself: `v = dist * unit - site_position_km`, then normalises. This matters for Earth
  (parallax up to about 0.26 degrees).

## `terrain/sp_meta.json` + height tiles

South polar stereographic grids, same projection as the LOLA source GeoTIFF
(true scale at the pole on the R = 1737.4 km sphere). For the south pole:
`r = 2R * tan((90 + lat) / 2)` with lat negative, `x = r * sin(lon)`, `y = r * cos(lon)`.

- `sp_dem_L0.png`: 2048 x 2048, covers 80S to 90S (whole source extent).
- `sp_dem_L1.png`: 4096 x 4096, covers the central square of half-extent about 152 km
  (roughly 85S to 90S) at close to the native 80 m.
- Encoding: 8-bit RGB PNG, no alpha, no colour profile. `h_m = (R*256 + G) * 0.5 - 10000`.
  B is 0.
- Row 0 is the top of the image = maximum y. Column 0 = minimum x.
- `sp_meta.json`: `{ "radius_m": 1737400, "projection": "south polar stereographic",
  "levels": [ { "file", "size", "x_min_m", "x_max_m", "y_min_m", "y_max_m", "pixel_m" } ],
  "height_encoding": {...}, "source": {...} }`
- `sp_slope_L0.png`, `sp_slope_L1.png`: 8-bit greyscale, same grids. `slope_deg = value * 0.25`
  (clamped at 63.75). Slope is computed at the source 80 m baseline before resampling.

## `terrain/horizon_testvectors.json`

Reference horizons from the Python implementation so the browser implementation can be tested:
`[{ "name", "lat", "lon", "observer_height_m", "az_step_deg", "elev_deg": [...] }]`.

## `missions.json`

`[{ "id", "name", "agency", "country", "date_utc", "lat", "lon", "status":
"landed|crashed|planned|candidate", "kind": "crewed|robotic", "summary", "source_url" }]`

## `ephem/validation_vectors.json`

`[{ "site", "lat", "lon", "h_m", "utc", "sun_az", "sun_el", "earth_az", "earth_el",
"source": "JPL Horizons" }]` — used by the web unit tests.

## Whole-Moon elevation (`web/public/data/globe/moon_dem_4k.png`)

Built by `pipeline/globe/build_global_dem.py` from NASA SVS CGI Moon Kit `ldem_16.tif` (LOLA).

- 4096 x 2048, simple cylindrical, planetocentric, east-positive. Pixel centres:
  `lon = -180 + 360 (x + 0.5) / W`, `lat = 90 - 180 (y + 0.5) / H` (row 0 is north).
- Height encoding is the same as the south-pole tiles: `h_m = (R*256 + G) * 0.5 - 10000`,
  relative to the 1737.4 km sphere. Heights are rounded to 8 m. There is no missing data.
- Listed in `globe.json` under `dem`. Used for globe lighting and for the height of pinned
  points outside the south-pole tiles, never for horizons.
- Checks: `pipeline/globe/test_globe.py` (against the source and against the polar LOLA tile)
  and `web/src/lib/globalDem.test.ts` (browser lookup against the Python values).
