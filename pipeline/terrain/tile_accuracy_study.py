"""Web-tile horizon minus full-resolution horizon over random sites, split by whether the
observer is inside L1 (80 m pixels) or only in L0 (296.875 m pixels).

Run:  .venv/bin/python pipeline/terrain/tile_accuracy_study.py
Writes pipeline/terrain/tile_accuracy_report.json.
"""
import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
import horizon as hz  # noqa: E402

N, AZ_STEP = 400, 2.0
full = hz.load_geotiff_grid()
l0, l1 = hz.load_tile_grids()
rng = np.random.default_rng(7)
r_max = 2 * hz.R_MOON_M * np.tan(np.radians(9.5) / 2)  # sites from the pole to 80.5S, area-uniform
r = np.sqrt(rng.uniform(0, r_max ** 2, N))
lon = rng.uniform(0, 360, N)
lat, _ = hz.xy_to_latlon(r, np.zeros_like(r))
rows = {"observer_in_L1": [], "observer_in_L0_only": []}
for la, lo in zip(lat, lon):
    x, y = hz.latlon_to_xy(la, lo)
    key = "observer_in_L0_only" if np.isnan(l1.sample(x, y)) else "observer_in_L1"
    e_t, d_t, h_t = hz.horizon(l0, la, lo, az_step_deg=AZ_STEP, hi=l1, return_details=True)
    e_f, d_f, h_f = hz.horizon(full, la, lo, az_step_deg=AZ_STEP, return_details=True)
    d = e_t - e_f
    rows[key].append((np.max(np.abs(d)), np.sqrt(np.mean(d * d)), abs(h_t - h_f), np.median(d_f)))
report = {"n_sites": N, "az_step_deg": AZ_STEP, "lat_range": [-90, -80.5]}
for key, v in rows.items():
    v = np.array(v)
    report[key] = {
        "sites": int(len(v)),
        "per_site_max_abs_deg": {"median": float(np.median(v[:, 0])), "p90": float(np.percentile(v[:, 0], 90)),
                                 "worst": float(v[:, 0].max())},
        "per_site_rms_deg": {"median": float(np.median(v[:, 1])), "p90": float(np.percentile(v[:, 1], 90)),
                             "worst": float(v[:, 1].max())},
        "observer_surface_height_diff_m": {"median": float(np.median(v[:, 2])), "worst": float(v[:, 2].max())},
    }
(Path(__file__).parent / "tile_accuracy_report.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps(report, indent=2))
