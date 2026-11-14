"""Write the reference horizons the browser implementation is tested against.

Default run (.venv/bin/python pipeline/terrain/make_testvectors.py):
  web/public/data/terrain/horizon_testvectors.json   six south-pole points, lookup chain
      without a patch (web tile L1 -> L0 -> whole-Moon map; horizon.horizon_chain)
  web/public/data/patches/patch_testvectors.json     observers with a site patch (same
      shape plus "patch": patch id or null); a patch with an outer level uses both levels
  pipeline/patches/testvector_chain_report.json      what the whole-Moon fallback changed
      relative to the tiles-only vectors kept in
      pipeline/patches/horizon_testvectors_tiles_only_before_chain.json

With --patches-only only patch_testvectors.json and the "patch_points" part of the report are
rewritten (the six polar vectors are left alone).

With --study it instead runs the older comparison of the tiles-only horizon against the
full-resolution GeoTIFF and writes pipeline/terrain/testvector_report.json (it does not
touch the vector files).
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


# name, lat, lon, patch id (None = no patch). 2 m observer, 0.5 degree azimuth step.
APOLLO_11 = (0.67416, 23.47314)
PATCH_POINTS = [
    ("Apollo 17 site", 20.1911, 30.7723, "apollo-17"),
    ("Apollo 15 site", 26.13239, 3.6333, "apollo-15"),
    ("IM-1 Odysseus site", -80.13, 1.44, "im-1-odysseus"),
    ("Chandrayaan-3 site", -69.3741, 32.32, "chandrayaan-3"),
    ("10 km east of Apollo 11 site", None, None, "apollo-11"),
    ("Whole-Moon map only 30N 100W", 30.0, -100.0, None),
]
# 20 m crest patches (kind "crest20" in patches.json), appended after PATCH_POINTS: an observer
# at the centre of each (coordinates read from patches.json), then Glaser spot 2.
CREST_CENTRES = [
    ("Connecting ridge 20 m patch centre", "connecting-ridge"),
    ("Shackleton rim 20 m patch centre", "shackleton-rim"),
    ("de Gerlache rim 20 m patch centre", "de-gerlache-rim"),
    ("Malapert massif 20 m patch centre", "malapert-massif"),
]
CREST_POINTS = [("Glaser spot 2 on the connecting ridge", -89.4399, 222.8524, "connecting-ridge")]
# 20 m patches at the polar landers, appended last: an observer at the mission site (the patch
# centre, read from patches.json).
LANDER_CENTRES = [
    ("IM-2 Athena site (20 m patch)", "im-2-athena-20m"),
    ("LCROSS Centaur impact site (20 m patch)", "lcross-centaur-20m"),
    ("Griffin Mission 1 site (20 m patch)", "griffin-1-20m"),
    ("IM-1 Odysseus site (20 m patch)", "im-1-odysseus-20m"),
]
PATCH_DIR = hz.DEFAULT_PATCH_DIR
OLD_VECTORS = hz.REPO / "pipeline" / "patches" / "horizon_testvectors_tiles_only_before_chain.json"
CHAIN_REPORT = hz.REPO / "pipeline" / "patches" / "testvector_chain_report.json"
DECIMALS = 6


def destination(lat1, lon1, az_deg, dist_m):
    """Point at great-circle distance dist_m and azimuth az_deg from (lat1, lon1), degrees."""
    p1, l1, az, d = np.radians(lat1), np.radians(lon1), np.radians(az_deg), dist_m / hz.R_MOON_M
    p2 = np.arcsin(np.sin(p1) * np.cos(d) + np.cos(p1) * np.sin(d) * np.cos(az))
    l2 = l1 + np.arctan2(np.sin(az) * np.sin(d) * np.cos(p1), np.cos(d) - np.sin(p1) * np.sin(p2))
    return float(np.degrees(p2)), float(np.degrees(l2))


def _vector(name, lat, lon, patch_id=None, with_patch_field=False):
    patch = hz.load_patch(patch_id) if patch_id else None
    e, d, h0, lev = hz.horizon_chain(lat, lon, OBS_H, AZ_STEP, patch=patch, return_details=True)
    assert np.all(np.isfinite(e)), name
    v = {"name": name, "lat": lat, "lon": lon, "observer_height_m": OBS_H, "az_step_deg": AZ_STEP,
         "surface_h_m": round(float(h0), 3)}
    if with_patch_field:
        v["patch"] = patch_id
    v["elev_deg"] = [round(float(x), DECIMALS) for x in e]
    return v, e, d, lev


def patch_points():
    """PATCH_POINTS, then the crest patch centres and CREST_POINTS: (name, lat, lon, patch id)."""
    pts = []
    for name, lat, lon, pid in PATCH_POINTS:
        if lat is None:
            lat, lon = destination(APOLLO_11[0], APOLLO_11[1], 90.0, 10000.0)
            lat, lon = round(lat, 6), round(lon, 6)
        pts.append((name, lat, lon, pid))
    entries = {p["id"]: p for p in json.loads((PATCH_DIR / "patches.json").read_text())["patches"]}
    for name, pid in CREST_CENTRES:
        pts.append((name, entries[pid]["lat"], entries[pid]["lon"], pid))
    pts = pts + CREST_POINTS
    for name, pid in LANDER_CENTRES:
        pts.append((name, entries[pid]["lat"], entries[pid]["lon"], pid))
    return pts


def main(patches_only=False):
    """Vectors from the lookup chain (see module docstring)."""
    # index = level code of horizon.horizon_chain (lookup order: patch, patch outer, L1, L0, map)
    level_names = ["patch", "L1", "L0", "whole-Moon map", "patch outer"]
    out = hz.DEFAULT_TILE_DIR / "horizon_testvectors.json"
    if patches_only:
        report = json.loads(CHAIN_REPORT.read_text())
        _patch_part(report, level_names, out)
        return
    old = {v["name"]: v for v in json.loads(OLD_VECTORS.read_text())} if OLD_VECTORS.exists() else {}
    vectors, rows = [], []
    for name, lat, lon in POINTS:
        v, e, d, lev = _vector(name, lat, lon)
        vectors.append(v)
        row = {"name": name, "lat": lat, "lon": lon,
               "azimuths_set_by": {level_names[i]: int((lev == i).sum()) for i in range(len(level_names))}}
        if name in old:
            diff = e - np.array(old[name]["elev_deg"])
            k = int(np.argmax(np.abs(diff)))
            row["chain_minus_tiles_only_deg"] = {
                "max_abs": float(np.max(np.abs(diff))), "at_az_deg": k * AZ_STEP,
                "old_deg": old[name]["elev_deg"][k], "new_deg": v["elev_deg"][k],
                "new_horizon_dist_km": float(d[k]) / 1000, "new_set_by": level_names[int(lev[k])],
                "azimuths_changed_over_1e-6": int((np.abs(diff) > 1e-6).sum()),
                "min_diff": float(diff.min()), "max_diff": float(diff.max()),
                "surface_h_change_m": v["surface_h_m"] - old[name]["surface_h_m"],
            }
        rows.append(row)
    out.write_text(json.dumps(vectors, separators=(",", ":")) + "\n")
    report = {"scheme": {"ds_min_m": hz.DS_MIN_M, "growth": hz.GROWTH, "max_range_m": hz.MAX_RANGE_M,
                         "samples_per_ray": int(len(hz.step_schedule())), "az_step_deg": AZ_STEP,
                         "observer_height_m": OBS_H, "elev_decimals": DECIMALS},
              "polar_points_chain_without_patch": rows}
    _patch_part(report, level_names, out)


def _patch_part(report, level_names, out):
    """Write patch_testvectors.json and the patch part of the chain report."""
    pvectors, prows = [], []
    for name, lat, lon, pid in patch_points():
        v, e, d, lev = _vector(name, lat, lon, pid, with_patch_field=True)
        pvectors.append(v)
        _, lev0 = hz.height_chain(lat, lon, hz.load_patch(pid) if pid else None, return_level=True)
        prows.append({"name": name, "lat": lat, "lon": lon, "patch": pid,
                      "surface_h_m": v["surface_h_m"], "observer_height_from": level_names[lev0],
                      "horizon_min_deg": float(e.min()), "horizon_max_deg": float(e.max()),
                      "azimuths_set_by": {level_names[i]: int((lev == i).sum()) for i in range(len(level_names))}})
    pout = PATCH_DIR / "patch_testvectors.json"
    pout.write_text(json.dumps(pvectors, separators=(",", ":")) + "\n")

    report["patch_points"] = prows
    report["bytes"] = {out.name: out.stat().st_size, pout.name: pout.stat().st_size}
    CHAIN_REPORT.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))


def study():
    """Tiles-only horizon against the full-resolution GeoTIFF (writes testvector_report.json)."""
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

    report = {
        "source_of_vectors": "web tiles (L1 where covered, else L0), no whole-Moon fallback",
        "scheme": {"ds_min_m": hz.DS_MIN_M, "growth": hz.GROWTH, "max_range_m": hz.MAX_RANGE_M,
                   "samples_per_ray": int(len(hz.step_schedule())), "az_step_deg": AZ_STEP,
                   "observer_height_m": OBS_H},
        "load_seconds": {"geotiff": t_load_full, "tiles": t_load_tiles},
        "points": rows,
    }
    (Path(__file__).parent / "testvector_report.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    study() if "--study" in sys.argv[1:] else main(patches_only="--patches-only" in sys.argv[1:])
