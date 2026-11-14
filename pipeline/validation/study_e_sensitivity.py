"""Study E: sensitivity of the results to the DEM source and to the numerical settings.

Run:  .venv/bin/python pipeline/validation/study_e_sensitivity.py     (about 20 s)
Out:  pipeline/validation/results/study_e.json

For the named points and the two IM sites, observer 2 m:
  * 18.6-year average illumination (disc-weighted and any-part): 80 m GeoTIFF vs web tiles
    (L1 = native 80 m inside about 85S, L0 = 297 m outside), and 0.5 vs 0.25 deg azimuth step.
  * sunset/sunrise times during 2026 at 5-minute steps: for every GeoTIFF event, the nearest
    web-tile event of the same type; median, 90th percentile and maximum |difference|, and the
    share matched within 60 minutes (a grazing Sun makes short events that exist in one horizon only).
  * time step: 2026 average from hourly samples vs 5-minute samples.
The 20 m DEM is used only if the file is complete (2,696,082,051 bytes); otherwise it is skipped.
"""
import json

import numpy as np

import vlib as v

STEP_S = 300
N_2026 = 365 * 86400 // STEP_S


def transitions(lit):
    d = np.diff(lit.astype(np.int8))
    return np.flatnonzero(d == 1), np.flatnonzero(d == -1)  # sunrises, sunsets


def match(a, b):
    """For each index in a, |distance| to the nearest index in b (samples)."""
    if a.size == 0 or b.size == 0:
        return np.array([])
    return np.abs(a[:, None] - b[None, :]).min(axis=1)


def main():
    missions = {m["id"]: m for m in json.loads((v.REPO / "web/public/data/missions.json").read_text())}
    sites = [(n, la, lo) for n, la, lo, _k in v.NAMED]
    sites += [(mid, missions[mid]["lat"], missions[mid]["lon"]) for mid in ("im-1-odysseus", "im-2-athena")]
    _et, sun, _e = v.ephem_table(v.T0_CYCLE, v.HOURS_CYCLE, 3600)
    _et2, sun26, _e2 = v.ephem_table("2026-01-01T00:00:00Z", N_2026, STEP_S)
    sources = ["tif", "tiles"] + (["tif20"] if v.tif20_complete() else [])
    rows = []
    for name, lat, lon in sites:
        row = {"name": name, "lat": lat, "lon": lon}
        ev = {}
        for src in sources:
            s = v.site_series(lat, lon, 2.0, sun, None, source=src)
            row[f"avg_{src}"] = float(s["sun"].mean())
            row[f"any_{src}"] = float((s["sun"] > 0).mean())
            row[f"h0_{src}"] = s["h0"]
            s26 = v.site_series(lat, lon, 2.0, sun26, None, hor=s["hor"], h0=s["h0"])
            ev[src] = transitions(s26["sun"] > 0)
            if src == "tif":
                row["avg2026_5min"] = float(s26["sun"].mean())
                row["avg2026_hourly"] = float(s26["sun"][::12].mean())
                row["n_sunsets_2026"] = int(ev[src][1].size)
        s = v.site_series(lat, lon, 2.0, sun, None, source="tif", az_step=0.25)
        row["avg_tif_az025"] = float(s["sun"].mean())
        for src in sources[1:]:
            for kind, k in (("sunrise", 0), ("sunset", 1)):
                d = match(ev["tif"][k], ev[src][k]) * STEP_S / 60.0
                row[f"{kind}_{src}_median_min"] = float(np.median(d)) if d.size else None
                row[f"{kind}_{src}_p90_min"] = float(np.percentile(d, 90)) if d.size else None
                row[f"{kind}_{src}_max_min"] = float(d.max()) if d.size else None
                row[f"{kind}_{src}_within_60min"] = float((d <= 60).mean()) if d.size else None
        rows.append(row)
        print(f"{name:18s} avg tif={row['avg_tif']:.4f} tiles={row['avg_tiles']:.4f} d={row['avg_tiles'] - row['avg_tif']:+.4f} "
              f"az0.25 d={row['avg_tif_az025'] - row['avg_tif']:+.4f} hourly-5min(2026)={row['avg2026_hourly'] - row['avg2026_5min']:+.5f} "
              f"sunsets={row['n_sunsets_2026']} sunset dt med/p90/max={row['sunset_tiles_median_min']}/{row['sunset_tiles_p90_min']}/"
              f"{row['sunset_tiles_max_min']} min within60={row['sunset_tiles_within_60min']} "
              f"sunrise {row['sunrise_tiles_median_min']}/{row['sunrise_tiles_p90_min']}/{row['sunrise_tiles_max_min']} "
              f"h0 diff={row['h0_tiles'] - row['h0_tif']:+.2f} m")
    v.write_json("study_e.json", {"sources": sources, "tif20_used": v.tif20_complete(), "rows": rows})
    print("20 m DEM used:", v.tif20_complete())


if __name__ == "__main__":
    main()
