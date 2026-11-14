# Validation studies

Reproduce every number in `docs/VALIDATION.md` (run from the repo root; all deterministic, no network):

```
.venv/bin/python pipeline/validation/study_a_pgda.py         # ~35 s  A: 18.6-year averages vs NASA PGDA rasters
.venv/bin/python pipeline/validation/study_b_psr.py          # ~10 s  B: permanent shadow vs PGDA PSR mask
.venv/bin/python pipeline/validation/study_c_glaser.py       # ~4 min C: Glaser et al. 2014 connecting ridge
.venv/bin/python pipeline/validation/study_d_missions.py     # ~10 s  D: IM-1 / IM-2 sunrise and sunset
.venv/bin/python pipeline/validation/study_e_sensitivity.py  # ~20 s  E: 80 m GeoTIFF vs web tiles, step sizes
.venv/bin/python -m pytest -p no:cacheprovider pipeline/validation -q   # ~10 s, reads results/*.json
```

Needs `data/raw/lola/LDEM_80S_80MPP_ADJ.TIF`, `data/raw/layers/*.TIF`, `data/raw/kernels/` and the web tiles.
Results go to `results/*.json`; `_cache/` holds SPICE tables (safe to delete). `vlib.py` is the shared code
(vectorised Sun/Earth directions, solar/Earth disc model, PGDA sampling); it imports
`pipeline/terrain/horizon.py` and `pipeline/ephem/common.py` unchanged.
