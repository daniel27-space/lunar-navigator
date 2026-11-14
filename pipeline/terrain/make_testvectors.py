"""Write web/public/data/terrain/horizon_testvectors.json (computed FROM THE WEB TILES)
and report how far the web-tile horizon is from the full-resolution GeoTIFF horizon.

Run:  .venv/bin/python pipeline/terrain/make_testvectors.py
Writes pipeline/terrain/testvector_report.json with the comparison and timings.
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
import horizon as hz  # noqa: E402

# name, lat, lon (east-positive, 0..360). Coordinates are approximate feature locations.
POINTS = [
    ("Shackleton rim connecting ridge", -89.45, 222.7),
    ("Shackleton crater floor", -89.67, 129.2),
    ("Malapert massif", -85.99, 357.1),
    ("Nobile rim", -85.2, 31.0),
    ("Haworth floor", -87.5, 355.0),
    ("Near DEM edge 81S", -81.0, 60.0),
]
OBS_H = 2.0
AZ_STEP = 0.5


def main():
    t = time.time()
    full = hz.load_geotiff_grid()
    t_load_full = time.time() - t
    t = time.time()
    l0, l1 = hz.load_tile_grids()
    t_load_tiles = time.time() - t
    hz.horizon(l0, -89.0, 0.0, az_step_deg=90.0, hi=l1)  # JIT warm-up

    vectors, rows = [], []
    for name, lat, lon in POINTS:
        t = time.perf_counter()
        e_t, d_t, h_t = hz.horizon(l0, lat, lon, OBS_H, AZ_STEP, hi=l1, return_details=True)
        dt_tiles = time.perf_counter() - t
        t = time.perf_counter()
        e_f, d_f, h_f = hz.horizon(full, lat, lon, OBS_H, AZ_STEP, return_details=True)
        dt_full = time.perf_counter() - t
        assert np.all(np.isfinite(e_t)) and np.all(np.isfinite(e_f)), name
        # marching discretisation: same full-res DEM, 4x finer step schedule
        e_fine = hz.horizon(full, lat, lon, OBS_H, AZ_STEP, ds_min_m=5.0, growth=0.0005)
        d_fine = e_fine - e_f
        x, y = hz.latlon_to_xy(lat, lon)
        in_l1 = not np.isnan(l1.sample(x, y))
        diff = e_t - e_f
        k = int(np.argmax(np.abs(diff)))
        rows.append({
            "name": name, "lat": lat, "lon": lon, "observer_in_L1": bool(in_l1),
            "surface_h_tiles_m": round(float(h_t), 3), "surface_h_fullres_m": round(float(h_f), 3),
            "tiles_minus_fullres_deg": {
                "max_abs": float(np.max(np.abs(diff))), "rms": float(np.sqrt(np.mean(diff ** 2))),
                "mean": float(np.mean(diff)), "p95_abs": float(np.percentile(np.abs(diff), 95)),
                "worst_az_deg": k * AZ_STEP,
                "worst_az_horizon_dist_m_fullres": float(d_f[k]),
            },
            "fullres_4x_finer_steps_minus_reference_steps_deg": {
                "max_abs": float(np.max(np.abs(d_fine))), "rms": float(np.sqrt(np.mean(d_fine ** 2)))},
            "horizon_min_deg": float(e_t.min()), "horizon_max_deg": float(e_t.max()),
            "horizon_dist_km_median_fullres": float(np.median(d_f)) / 1000,
            "horizon_dist_km_max_fullres": float(np.max(d_f)) / 1000,
            "seconds_tiles": dt_tiles, "seconds_fullres": dt_full,
        })
        vectors.append({
            "name": name, "lat": lat, "lon": lon, "observer_height_m": OBS_H,
            "az_step_deg": AZ_STEP, "surface_h_m": round(float(h_t), 3),
            "elev_deg": [round(float(v), 6) for v in e_t],
        })

    out = hz.DEFAULT_TILE_DIR / "horizon_testvectors.json"
    out.write_text(json.dumps(vectors, separators=(",", ":")) + "\n")
    report = {
        "source_of_vectors": "web tiles (L1 where covered, else L0)",
        "scheme": {"ds_min_m": hz.DS_MIN_M, "growth": hz.GROWTH, "max_range_m": hz.MAX_RANGE_M,
                   "samples_per_ray": int(len(hz.step_schedule())), "az_step_deg": AZ_STEP,
                   "observer_height_m": OBS_H},
        "load_seconds": {"geotiff": t_load_full, "tiles": t_load_tiles},
        "points": rows,
        "testvector_bytes": out.stat().st_size,
    }
    (Path(__file__).parent / "testvector_report.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
