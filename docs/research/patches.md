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

## 20 m patches at the polar landers (2026-11-14)

`build_crest_patches.py` (`LANDERS`) also writes four patches in exactly the crest format
(512 x 512, 20 m, 0.1 m heights, `kind: "crest20"`, `render: false`), each centred on a mission
site, with `name` = the mission's display name and `sites` = [mission id]. They follow the four
crest entries in `patches.json`.

| id | centre (lat, lon) | PNG bytes | heights (m) | offset (m) | no data | 4 x 4 block means against 80 m |
|---|---|---|---|---|---|---|
| im-2-athena-20m | -84.7906, 29.1957 | 228950 | 4873.8 to 5358.4 | 4872 | 0 | tile L1: mean -0.11 m, RMS 1.13 m, r 0.99992 |
| lcross-centaur-20m | -84.6796, -48.7093 | 221636 | -3951.2 to -2673.9 | -3953 | 0 | tile L1: mean +0.51 m, RMS 1.73 m, r 0.99997 |
| griffin-1-20m | -85.28, 53.27 | 260025 | -283.3 to 1225.7 | -285 | 0 | tile L1: mean +0.41 m, RMS 1.42 m, r 0.99999 |
| im-1-odysseus-20m | -80.13, 1.44 | 200031 | 2010.8 to 2819.9 | 2009 | 0.107235 | 80 m patch `im-1-odysseus`: mean +0.02 m, RMS 0.61 m, r 0.99999 |

- Total 910642 bytes. A 20 m LOLA product exists only for the polar cap (80S to the pole, PGDA
  product 78). The other 34 sites cannot get 20 m terrain from LOLA or SLDEM: SLDEM2015 is
  512 px/degree, about 59 m, and the LOLA polar GDR used above 60 degrees is 60 m.
- IM-1 Odysseus (80.13S) is at the edge of the product: the northern 10.7 % of the patch (inside
  rows 0 to 60 of 512, i.e. more than 3.9 km north of the site; rows 0 to 47 entirely) has no
  source data and is left as raw 0. The site itself and everything south of it has data. Where
  the 20 m patch has no data the lookup goes on to the next terrain in the chain.
- IM-1 has both an 80 m site patch and this 20 m patch on the same centre. `patchCovering`
  returns the 20 m one within 3.58 km of the site (finest patch wins) and the 80 m one beyond.
  A `HeightSource` holds a list of terrains, so a caller that wants 20 m near the lander and
  80 m / 160 m further out can pass both patches (20 m first); with only the 20 m patch in the
  list, terrain beyond 5 km comes from the 300 m tile L0 (IM-1 is outside tile L1).
- Tests (`test_patches.py`, "20 m patches at the polar landers"): entries and PNG format, data
  exactly where the source has data, agreement with the 20 m source (0.06 m at pixel centres),
  with tile L1 or the 80 m IM-1 patch (flips, rotations and one-cell shifts fit worse),
  identical rebuild, reference vectors.
- `patch_testvectors.json` gains four entries at the end (observer at each mission site, 2 m,
  0.5 degree step, `patch` = the 20 m id).

## Outer level of the 80 m site patches (2026-11-14)

`build_patches.py --outer` adds the contract's "Two-level site patches" outer level to each of
the 34 site patches already in `patches.json` (the list is not re-derived from `missions.json`):
`<id>.outer.png`, 768 x 768 pixels of 160 m (x and y from -61440 m to +61440 m), same centre,
projection, registration and height encoding (0.5 m, -10000), and
`"outer": { "file", "size": 768, "pixel_m": 160, "source", "nodata_fraction" }` in the entry
(`source` and `nodata_fraction` are extra to the contract's three fields).

- Resampling: an area average, not a point sample. The same sources as the fine level
  (SLDEM2015 below 60 degrees, LOLA polar 60 m above, the local 80 m GeoTIFF for IM-1) are
  sampled bilinearly on a 4 x 4 grid inside every 160 m pixel (40 m apart, finer than the 59 to
  80 m sources) and the 16 values averaged. A pixel is nodata if any of its 16 samples is.
- Size: 472933 to 744725 bytes per file, 20687792 bytes in all (mean 0.61 MB; rough terrain
  compresses worse than the 0.4 to 0.6 MB first guessed). No nodata in any outer level.
- Downloads: 675.5 MB in 549 range requests, cached under `data/raw/patches/windows/`
  (791 MB there now with the fine-level windows). A rebuild from the cache is byte-identical.
- Against the fine level (2 x 2 block means of the 80 m pixels, central 384 x 384 outer pixels,
  all 34 patches): mean difference within 0.003 m, RMS 0.22 to 0.48 m, correlation 0.99998 or
  better; flips, a 180 degree rotation and a one-pixel shift all fit worse. Against the
  whole-Moon map: the same checks as for the fine level pass (r > 0.9, mean within 60 m).
- Lookup (reference `horizon.py`, browser `terrain.ts`): patch fine level, patch outer level,
  south-pole L1, L0, whole-Moon map. `horizon_chain` reports the outer level as level 4 (codes
  0 to 3 are unchanged). In the browser a two-level patch is `levels: [outer, fine]`, and
  `patchCovering` treats it as reaching the outer edge less the 2 km margin (59.44 km); the
  finest patch still wins, so a 20 m patch is chosen over an 80 m one where both cover.
- Reference vectors: `patch_testvectors.json` regenerated; the previous file is kept as
  `pipeline/patches/patch_testvectors_before_outer.json`. Terrain 30 to 61 km away is now 160 m
  instead of the 2.7 km map, so far ridges stand higher. Largest change per vector:

  | vector | largest change | azimuths changed |
  |---|---|---|
  | Apollo 17 site | +0.546 degrees at azimuth 128 (1.404 to 1.950) | 35 of 720 |
  | Apollo 15 site | +0.398 degrees at azimuth 9.5 (0.642 to 1.040) | 12 |
  | IM-1 Odysseus site (80 m patch) | +0.249 degrees at azimuth 24.5 (0.265 to 0.514) | 46 |
  | Chandrayaan-3 site | +0.346 degrees at azimuth 157 (1.128 to 1.474) | 160 |
  | 10 km east of Apollo 11, no-patch point, five crest vectors | identical | 0 |

  `crest_reference.json` was not regenerated: its inputs (the connecting-ridge patch, the
  tiles, the whole-Moon map) did not change, and its vectors are identical.
