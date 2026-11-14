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
