"""Quantify the 'DEM stops at 80S' limitation.

For random sites, compute the full-resolution horizon with the ray range cut at
d km and compare with the 300 km (or edge-of-data) horizon. The difference is the
horizon that would be lost if terrain beyond d km were missing, which is what
happens toward the equator for a site (|lat| - 80) * 30.3 km inside the edge.

Sites are drawn from 85S..89.5S so that most rays have 150 km or more of data;
equator-ward rays from 85S still end at 150 km, so losses for d >= 150 km are
slight underestimates.

Run:  .venv/bin/python pipeline/terrain/edge_study.py
Writes pipeline/terrain/edge_study_report.json.
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
import horizon as hz  # noqa: E402

N_SITES = 300
AZ_STEP = 2.0
CUTS_KM = [15, 30, 61, 91, 121, 152, 200]


def main():
    full = hz.load_geotiff_grid()
    rng = np.random.default_rng(20261114)
    # uniform over the area of the 85S..89.5S annulus
    r_lo, r_hi = (2 * hz.R_MOON_M * np.tan(np.radians(a) / 2) for a in (0.5, 5.0))
    r = np.sqrt(rng.uniform(r_lo ** 2, r_hi ** 2, N_SITES))
    lon = rng.uniform(0, 360, N_SITES)
    lat, _ = hz.xy_to_latlon(r, np.zeros_like(r))

    t = time.time()
    ref, dist = [], []
    for la, lo in zip(lat, lon):
        e, d, _ = hz.horizon(full, la, lo, az_step_deg=AZ_STEP, return_details=True)
        ref.append(e)
        dist.append(d)
    ref, dist = np.array(ref), np.array(dist)
    report = {"n_sites": N_SITES, "az_step_deg": AZ_STEP, "lat_range": [-89.5, -85.0],
              "horizon_setting_distance_km": {
                  "median": float(np.median(dist)) / 1000,
                  "p90": float(np.percentile(dist, 90)) / 1000,
                  "p99": float(np.percentile(dist, 99)) / 1000,
                  "max": float(dist.max()) / 1000},
              "cuts": []}
    for cut in CUTS_KM:
        loss = []
        for i, (la, lo) in enumerate(zip(lat, lon)):
            e = hz.horizon(full, la, lo, az_step_deg=AZ_STEP, max_range_m=cut * 1000.0)
            loss.append(ref[i] - e)
        loss = np.array(loss)
        site_max = loss.max(axis=1)
        report["cuts"].append({
            "cut_km": cut,
            "equivalent_site_latitude_deg": round(-(80 + cut / 30.323), 2),
            "fraction_of_azimuths_with_loss_over_0.1deg": float((loss > 0.1).mean()),
            "fraction_of_azimuths_with_loss_over_0.5deg": float((loss > 0.5).mean()),
            "loss_deg_mean": float(loss.mean()),
            "loss_deg_p95": float(np.percentile(loss, 95)),
            "loss_deg_p99": float(np.percentile(loss, 99)),
            "loss_deg_max": float(loss.max()),
            "sites_with_any_azimuth_loss_over_0.25deg": float((site_max > 0.25).mean()),
            "sites_with_any_azimuth_loss_over_1deg": float((site_max > 1.0).mean()),
        })
    report["seconds"] = time.time() - t
    (Path(__file__).parent / "edge_study_report.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
