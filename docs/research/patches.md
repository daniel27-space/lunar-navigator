# Site terrain patches: build notes

Spec: `docs/DATA_CONTRACT.md`, "Site terrain patches". Code: `pipeline/patches/build_patches.py`,
tests `pipeline/patches/test_patches.py`. Built 2026-11-14.

## What exists

- 34 patches in `web/public/data/patches/` (768 x 768, 80 m, site stereographic), 17.1 MB of PNG
  in total (0.39 to 0.62 MB each), plus `patches.json`. No patch has missing data.
- 38 of the 41 missions are served. The other three (im-2-athena, lcross-centaur, griffin-1) are
  inside the south-pole tile L1 and need none.
- Shared patches (site within 15 km of an earlier centre, `missions.json` order): surveyor-3 also
  serves apollo-12; luna-17 serves lunokhod-1; luna-21 serves lunokhod-2 (14.92 km, only just
  inside the limit); luna-23 serves luna-24. The patch id is the first mission of the group, so
  look a mission up through `sites`, not by file name.

## Sources (recorded per patch in `source`)

| Zone | Product | URL |
|---|---|---|
| abs(lat) < 60 | SLDEM2015, 512 px/deg float tiles (LOLA + Kaguya TC). NASA GSFC PGDA product 54 links to these files on the PDS LOLA node | `https://imbrium.mit.edu/DATA/SLDEM2015/TILES/FLOAT_IMG/SLDEM2015_512_<lat>_<lon>_FLOAT.IMG` |
| abs(lat) >= 60 | LOLA GDR polar stereographic, 60 m, int16 x 0.5 m | `https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/IMG/LDEM_60S_60M.IMG`, `LDEM_60N_60M.IMG` |
| patch centre at or south of 80S (im-1-odysseus) | local `data/raw/lola/LDEM_80S_80MPP_ADJ.TIF` (PGDA product 78) wherever the grid has data, LDEM_60S_60M elsewhere | |

The files are headerless rasters and the server honours HTTP range requests (multi-range), so
only the rows and columns each patch needs are fetched: 164 MB in total, cached as `.npy` under
`data/raw/patches/windows/`. A rebuild with the cache present uses no network. The USGS mosaic
was not needed.

## Things worth knowing

- The 80 m GeoTIFF stops at its square grid edge (y = 304 km), which at the IM-1 longitude is
  about 80.0S, only 4 km north of the site (80.13S). So 43 % of the im-1 patch (everything
  north of that edge) comes from LDEM_60S_60M. The two agree at the join: the
  height step across it is the same as between ordinary neighbouring rows (0.0 m median excess).
- hakuto-r-m2 straddles 60N: SLDEM2015 south of it, LDEM_60N_60M north. There is a step of
  about 1.5 m between the two products along that line.
- LOLA north polar grids use x = r sin(lon), y = -r cos(lon); south uses y = +r cos(lon). Line 0
  is maximum y in both. Confirmed by correlation with the whole-Moon map.
- Within half a source pixel of exactly +/-60 latitude the SLDEM row index is clamped (30 m).
- Every patch correlates 0.937 to 0.998 with the whole-Moon map sampled at the same points, and
  every flipped or rotated version correlates clearly worse. Centre heights differ from the
  whole-Moon map by at most 172 m (luna-20, on a steep slope).

## Horizon with the lookup chain

`pipeline/terrain/horizon.py`: `horizon_chain`, `height_chain`, `load_patch`, `load_global_dem`
(the port specification is in the module docstring). The tiles count as "not covered" for any
direction with z >= 0, so nothing divides by zero at the north pole.

`pipeline/terrain/make_testvectors.py` now writes both vector files from the chain; `--study`
runs the older tiles-against-GeoTIFF comparison. Values are rounded to 6 decimals (as the
previous file was) and keep the `surface_h_m` field.

Effect of the whole-Moon fallback on the six polar vectors (old values kept in
`pipeline/patches/horizon_testvectors_tiles_only_before_chain.json`, details in
`pipeline/patches/testvector_chain_report.json`): five points are unchanged to the last digit.
"Near DEM edge 81S" changes on 130 of 720 azimuths, by up to +1.52 degrees (azimuth 31: -2.62
to -1.10, set by whole-Moon terrain 112 km away). The chain can only raise a horizon relative
to tiles-only, never lower it.

## 20 m crest patches (2026-11-14)

`pipeline/patches/build_crest_patches.py` adds four 512 x 512 patches of 20 m pixels (kind
`crest20` in `patches.json`, contract section "20 m crest patches"), resampled bilinearly from
the local `data/raw/lola/LDEM_80S_20MPP_ADJ.TIF` (PGDA product 78; only a window is read).
`build_patches.py` keeps these entries when it rewrites `patches.json`.

| id | centre (lat, lon) | PNG bytes | heights (m) | offset (m) | no data |
|---|---|---|---|---|---|
| connecting-ridge | -89.44715, -137.151498 (midway between Gläser spots 2 and 4) | 271684 | 740.1 to 1958.9 | 739 | 0 |
| shackleton-rim | -89.78, -155.7 | 280318 | -1795.3 to 1737.8 | -1797 | 0 |
| de-gerlache-rim | -88.67, -68.2 | 269992 | -108.6 to 1814.8 | -110 | 0 |
| malapert-massif | -85.964, -2.319 | 260403 | 2870.3 to 4993.0 | 2869 | 0 |

- Heights are `raw * 0.1 + offset`, the offset one whole metre below the floor of the lowest
  height (lowest raw value 10 to 20, never 0). The reference decodes in float64 and stores
  float32 (`horizon.decode_patch_rgb`); the browser must do the same (Float32Array), because
  1e-4 m at a sample 20 m away is 3e-4 degrees of horizon.
- Against the source: at pixel centres the patch equals the bilinear source sample to 0.05 m
  (the rounding). Sampled between pixel centres (a second interpolation, on a grid rotated
  against the source grid) the difference is 0.05 to 0.06 m median, 0.48 to 0.53 m at the 99th
  percentile, 2.0 m worst, mean under 0.004 m (20000 random points per patch).
- Against the 80 m tile L1 (4 x 4 block means): mean difference -0.6 to +0.3 m, RMS 2.5 to
  3.4 m, correlation above 0.9999; every flip, rotation or one-cell shift fits worse.
- All four Gläser spots are within 240 m of the connecting-ridge centre (4.9 km to the nearest edge).
- The named Shackleton rim point (-89.78, 204.3 E) sits in a pit about 100 m wide and 10 m deep
  in the 20 m data (ground 1729.0 m, 4.4 m below the 80 m tile; the rim around it is 1735 to
  1738 m). From 2 m the horizon there is +1.8 degrees or more on every azimuth with the patch,
  down to -1.3 degrees without it. This is the data, not a defect of the patch.
- `patch_testvectors.json` has five more entries (the four centres and Gläser spot 2); the
  first six are unchanged. `make_testvectors.py --patches-only` rewrites only that file.
- `crest_reference.json` (`build_crest_patches.py --reference`): Gläser spot 2 at 2 m, hourly
  2024-01-01 to 2036-01-01, any part of the disc, no Earth eclipses. With the web-encoded patch:
  longest darkness 4.667 d (112 h), 91.86 % of the time in light. Web tiles only: 9.25 d
  (222 h), 91.37 %. The study's figures (`docs/VALIDATION.md`, 19 years, GeoTIFF terrain) are
  4.67 d on 20 m and 8.54 d on 80 m: the patch reproduces the 20 m result; the tiles-only
  figure is 0.71 d longer than the 80 m GeoTIFF figure (tiles are rounded to 0.5 m; not
  investigated further).
