"""Study G: is 20 m terrain worth shipping for the south pole, and how big a 20 m patch is enough?

Run:  .venv/bin/python pipeline/validation/study_g_20m_web.py     (about 4 min)
Out:  pipeline/validation/results/study_g.json

18 polar points (7 crests, 4 crater floors / PSRs, 3 flat plains, 2 slopes, the IM-2 and Griffin-1
points), observer 2 m above the DEM, "any part of the disc" rule.
Terrain variants: 80 m only (what the app has inside about 85S, apart from 0.5 m rounding), and the
20 m DEM inside a square window of half-width 2, 5, 10, 20 or 40 km around the observer with 80 m
beyond. The 40 km window is the "20 m" reference: beyond 40 km the ray step (0.2 % of the distance)
is 80 m or more, so finer pixels could not be used anyway; study F checks a 100 km window with finer
steps and finds the same numbers.
Per variant: share of time in light, disc-weighted average, longest darkness and share of time any
part of the Earth is visible, over 18.6 years hourly from 2024-01-01; sunrise and sunset times over
2026 at 5-minute steps (each 80 m event is paired with the nearest reference event of the same kind,
as in study E; unpaired grazing events show up as large maxima).
For scale, the same statistics for a 10 m observer on 80 m terrain (the observer-height effect).
Also: a 7 x 7 lattice (40 m spacing) around every point on both terrains, because a named coordinate
is not known to 20 m; and the effect of rounding a 5 km 20 m patch to 0.5 m or 0.1 m heights.
"""
import time

import numpy as np

import v20
import vlib as v
from study_e_sensitivity import N_2026, STEP_S, match, transitions

SITES = [
    ("Shackleton rim", -89.78, 204.3, "crest"),
    ("Connecting ridge (Glaser spot 2)", -89.4399, 222.8524, "crest"),
    ("Connecting ridge (repo point)", -89.45, 222.7, "crest"),
    ("de Gerlache rim", -88.67, 291.8, "crest"),
    ("Malapert massif", -85.964, 357.681, "crest"),
    ("Nobile rim", -85.2, 31.0, "crest"),
    # highest 80 m pixel between 20 and 32 km from Haworth's centre (87.45S, 354.83E)
    ("Haworth rim crest", -86.4739, 2.3958, "crest"),
    ("Shackleton floor", -89.67, 129.2, "floor"),
    ("Haworth floor", -87.45, 355.0, "floor"),
    ("Faustini floor", -87.2, 84.0, "floor"),
    ("Cabeus floor (LCROSS)", -84.6796, 311.2907, "floor"),
    # lattice points of study A with slope under 1.1 deg over 800 m and some sunlight
    ("Plain 87.9S 251.6E", -87.915, 251.57, "plain"),
    ("Plain 85.8S 141.3E", -85.779, 141.34, "plain"),
    ("Plain 86.6S 281.3E", -86.638, 281.31, "plain"),
    ("Mons Mouton (IAU centre), 7 deg slope", -84.60, 31.0, "slope"),
    ("Slope 88.5S 160E, 16 deg", -88.5, 160.0, "slope"),
    ("IM-2 Athena", -84.7906, 29.1957, "landing"),
    ("Griffin-1 target", -85.28, 53.27, "landing"),
]
RADII = [0, 2000, 5000, 10000, 20000, 40000]
REF = "40000"


def variant(lat, lon, h, radius, sun, earth, sun26):
    hor, h0, dist = v20.horizon_mixed(lat, lon, h, radius)
    s = v.site_series(lat, lon, h, sun, earth, hor=hor, h0=h0)
    lit = s["sun"] > 0
    s26 = v.site_series(lat, lon, h, sun26, None, hor=hor, h0=h0)
    out = {"h0_m": h0, "in_light": float(lit.mean()), "avg_illum": float(s["sun"].mean()),
           "longest_dark_d": v.longest_run(~lit) / 24.0, "earth_visible": float((s["earth"] > 0).mean()),
           "horizon_median_dist_m": float(np.nanmedian(dist))}
    return out, transitions(s26["sun"] > 0), hor


def timing(ev_a, ev_b):
    """Events of a paired with the nearest event of b (minutes)."""
    out = {}
    for kind, k in (("sunrise", 0), ("sunset", 1)):
        d = match(ev_a[k], ev_b[k]) * STEP_S / 60.0
        out[kind] = {"n_a": int(ev_a[k].size), "n_b": int(ev_b[k].size),
                     "median_min": float(np.median(d)) if d.size else None,
                     "p90_min": float(np.percentile(d, 90)) if d.size else None,
                     "max_min": float(d.max()) if d.size else None,
                     "within_60min": float((d <= 60).mean()) if d.size else None}
    both = np.concatenate([match(ev_a[k], ev_b[k]) for k in (0, 1)]) * STEP_S / 60.0
    out["all"] = {"n": int(both.size), "median_min": float(np.median(both)) if both.size else None,
                  "p90_min": float(np.percentile(both, 90)) if both.size else None,
                  "max_min": float(both.max()) if both.size else None,
                  "within_60min": float((both <= 60).mean()) if both.size else None}
    return out


def slope_deg(lat, lon, b=400.0):
    g = v.grid_80m()
    x, y = (float(t) for t in v.hz.latlon_to_xy(lat, lon))
    return float(np.degrees(np.arctan(np.hypot((g.sample(x + b, y) - g.sample(x - b, y)) / (2 * b),
                                               (g.sample(x, y + b) - g.sample(x, y - b)) / (2 * b)))))


def main():
    t0 = time.time()
    _et, sun, earth = v.ephem_table(v.T0_CYCLE, v.HOURS_CYCLE, 3600)
    _et2, sun26, _e2 = v.ephem_table("2026-01-01T00:00:00Z", N_2026, STEP_S)
    rows = []
    for name, lat, lon, kind in SITES:
        row = {"name": name, "lat": lat, "lon": lon, "kind": kind, "slope_deg_800m": slope_deg(lat, lon),
               "km_from_pole": float(np.hypot(*v.hz.latlon_to_xy(lat, lon)) / 1000.0), "by_radius": {}, "timing_vs_ref": {}}
        ev, hors = {}, {}
        for r in RADII:
            row["by_radius"][str(r)], ev[str(r)], hors[str(r)] = variant(lat, lon, 2.0, r, sun, earth, sun26)
        for r in RADII[:-1]:
            row["timing_vs_ref"][str(r)] = timing(ev[str(r)], ev[REF])
        row["horizon_80_minus_20_deg"] = {"median_abs": float(np.nanmedian(np.abs(hors["0"] - hors[REF]))),
                                          "max_abs": float(np.nanmax(np.abs(hors["0"] - hors[REF])))}
        row["obs10m_on_80m"], ev10, _h = variant(lat, lon, 10.0, 0, sun, earth, sun26)
        row["timing_10m_vs_2m_on_80m"] = timing(ev["0"], ev10)
        a, b, c = row["by_radius"]["0"], row["by_radius"][REF], row["obs10m_on_80m"]
        row["d20"] = {k: b[k] - a[k] for k in ("in_light", "avg_illum", "longest_dark_d", "earth_visible", "h0_m")}
        row["d10m"] = {k: c[k] - a[k] for k in ("in_light", "avg_illum", "longest_dark_d", "earth_visible")}
        rows.append(row)
        t = row["timing_vs_ref"]["0"]["all"]
        print(f"{name[:34]:34s} {kind:7s} light 80={a['in_light']:.4f} 20={b['in_light']:.4f} d={row['d20']['in_light']:+.4f} (10 m obs {row['d10m']['in_light']:+.4f}) "
              f"dark {a['longest_dark_d']:7.2f}->{b['longest_dark_d']:7.2f} d (10 m {c['longest_dark_d']:7.2f}) earth {a['earth_visible']:.4f}->{b['earth_visible']:.4f} "
              f"events n={t['n']} med/p90/max={t['median_min']}/{t['p90_min']}/{t['max_min']} min h0 {row['d20']['h0_m']:+.2f} m")
    # ---- neighbourhood: a named coordinate is only good to a few hundred metres, so also compare the
    # two terrains over a 7 x 7 lattice (40 m spacing, +/-120 m) around every point
    offs = np.arange(-120.0, 121.0, 40.0)
    for row in rows:
        xc, yc = (float(t) for t in v.hz.latlon_to_xy(row["lat"], row["lon"]))
        l80, l20, d80, d20 = [], [], [], []
        for dy in offs:
            for dx in offs:
                la, lo = v.hz.xy_to_latlon(xc + dx, yc + dy)
                la, lo = float(la), float(lo) % 360.0
                for r, ll, dd in ((0, l80, d80), (5200.0, l20, d20)):
                    hor, h0, _d = v20.horizon_mixed(la, lo, 2.0, r, centre_xy=(xc, yc))
                    lit = v.site_series(la, lo, 2.0, sun, None, hor=hor, h0=h0)["sun"] > 0
                    ll.append(float(lit.mean()))
                    dd.append(v.longest_run(~lit) / 24.0)
        l80, l20, d80, d20 = (np.array(t) for t in (l80, l20, d80, d20))
        row["lattice_49"] = {"in_light_80_min_med_max": [float(l80.min()), float(np.median(l80)), float(l80.max())],
                             "in_light_20_min_med_max": [float(l20.min()), float(np.median(l20)), float(l20.max())],
                             "pointwise_abs_d_in_light_median": float(np.median(np.abs(l20 - l80))),
                             "pointwise_abs_d_in_light_p90": float(np.percentile(np.abs(l20 - l80), 90)),
                             "pointwise_abs_d_in_light_max": float(np.abs(l20 - l80).max()),
                             "mean_in_light_20_minus_80": float(l20.mean() - l80.mean()),
                             "best_in_light_20_minus_80": float(l20.max() - l80.max()),
                             "pointwise_abs_d_longest_dark_d_median": float(np.median(np.abs(d20 - d80))),
                             "shortest_longest_dark_d_80": float(d80.min()), "shortest_longest_dark_d_20": float(d20.min())}
        q = row["lattice_49"]
        print(f"lattice {row['name'][:34]:34s} {row['kind']:7s} light 80 {q['in_light_80_min_med_max'][0]:.3f}/{q['in_light_80_min_med_max'][1]:.3f}/{q['in_light_80_min_med_max'][2]:.3f} "
              f"20 {q['in_light_20_min_med_max'][0]:.3f}/{q['in_light_20_min_med_max'][1]:.3f}/{q['in_light_20_min_med_max'][2]:.3f} pointwise |d| med {q['pointwise_abs_d_in_light_median']:.4f} "
              f"p90 {q['pointwise_abs_d_in_light_p90']:.4f} max {q['pointwise_abs_d_in_light_max']:.4f}; best {q['best_in_light_20_minus_80']:+.4f}; "
              f"shortest longest-dark {q['shortest_longest_dark_d_80']:.2f} -> {q['shortest_longest_dark_d_20']:.2f} d")
    # ---- would rounding a 20 m patch to 0.5 m (the web tile encoding) or 0.1 m undo the benefit?
    for row in rows:
        xc, yc = (float(t) for t in v.hz.latlon_to_xy(row["lat"], row["lon"]))
        g = v20.window20(xc, yc, 5000.0)
        row["rounding_5km_patch"] = {}
        for q in (0.5, 0.1):
            gq = v.hz.Grid(np.round(g.data / q) * q, g.x_min, g.y_max, g.pixel_m)
            hor, _d, h0 = v.hz.horizon(v.grid_80m(), row["lat"], row["lon"], 2.0, v.AZ_STEP, hi=gq, return_details=True)
            lit = v.site_series(row["lat"], row["lon"], 2.0, sun, None, hor=hor, h0=float(h0))["sun"] > 0
            ref = row["by_radius"]["5000"]
            row["rounding_5km_patch"][str(q)] = {"d_in_light": float(lit.mean()) - ref["in_light"],
                                                 "d_longest_dark_d": v.longest_run(~lit) / 24.0 - ref["longest_dark_d"]}
    rq = {q: {"max_abs_d_in_light": max(abs(r["rounding_5km_patch"][q]["d_in_light"]) for r in rows),
              "max_abs_d_longest_dark_d": max(abs(r["rounding_5km_patch"][q]["d_longest_dark_d"]) for r in rows),
              "worst_site": max(rows, key=lambda r: abs(r["rounding_5km_patch"][q]["d_in_light"]))["name"]} for q in ("0.5", "0.1")}
    print("rounding of a 5 km 20 m patch:", rq)
    # ---- summaries
    kinds = sorted({r["kind"] for r in rows})
    by_kind = {}
    for k in kinds:
        rs = [r for r in rows if r["kind"] == k]
        med = [r["timing_vs_ref"]["0"]["all"]["median_min"] for r in rs if r["timing_vs_ref"]["0"]["all"]["n"]]
        mx = [r["timing_vs_ref"]["0"]["all"]["max_min"] for r in rs if r["timing_vs_ref"]["0"]["all"]["n"]]
        by_kind[k] = {"n": len(rs),
                      "max_abs_d_in_light": max(abs(r["d20"]["in_light"]) for r in rs),
                      "mean_abs_d_in_light": float(np.mean([abs(r["d20"]["in_light"]) for r in rs])),
                      "max_abs_d_longest_dark_d": max(abs(r["d20"]["longest_dark_d"]) for r in rs),
                      "max_abs_d_earth": max(abs(r["d20"]["earth_visible"]) for r in rs),
                      "median_event_shift_min_max_over_sites": max(med) if med else None,
                      "max_event_shift_min": max(mx) if mx else None,
                      "max_abs_d_in_light_10m_observer": max(abs(r["d10m"]["in_light"]) for r in rs),
                      "max_abs_d_longest_dark_d_10m_observer": max(abs(r["d10m"]["longest_dark_d"]) for r in rs),
                      "lattice_pointwise_abs_d_in_light_median_range": [min(r["lattice_49"]["pointwise_abs_d_in_light_median"] for r in rs),
                                                                        max(r["lattice_49"]["pointwise_abs_d_in_light_median"] for r in rs)],
                      "lattice_pointwise_abs_d_in_light_max": max(r["lattice_49"]["pointwise_abs_d_in_light_max"] for r in rs)}
    radius = {}
    for r in RADII[:-1]:
        res_l = np.array([row["by_radius"][str(r)]["in_light"] - row["by_radius"][REF]["in_light"] for row in rows])
        res_d = np.array([row["by_radius"][str(r)]["longest_dark_d"] - row["by_radius"][REF]["longest_dark_d"] for row in rows])
        res_e = np.array([row["by_radius"][str(r)]["earth_visible"] - row["by_radius"][REF]["earth_visible"] for row in rows])
        tm = [row["timing_vs_ref"][str(r)]["all"] for row in rows if row["timing_vs_ref"][str(r)]["all"]["n"]]
        radius[str(r)] = {"max_abs_in_light_residual": float(np.abs(res_l).max()), "rms_in_light_residual": float(np.sqrt((res_l ** 2).mean())),
                          "max_abs_longest_dark_residual_d": float(np.abs(res_d).max()),
                          "n_sites_dark_residual_over_0p25d": int((np.abs(res_d) > 0.25).sum()),
                          "max_abs_earth_residual": float(np.abs(res_e).max()),
                          "worst_site_median_event_shift_min": max(t["median_min"] for t in tm),
                          "worst_site_p90_event_shift_min": max(t["p90_min"] for t in tm),
                          "worst_site_max_event_shift_min": max(t["max_min"] for t in tm),
                          "events_within_60min_all_sites": float(np.average([t["within_60min"] for t in tm], weights=[t["n"] for t in tm])),
                          "patch_pixels_20m": int((2 * r / 20) ** 2)}
        print(f"radius {r / 1000:5.0f} km: residual vs 40 km: light max {radius[str(r)]['max_abs_in_light_residual']:.4f} rms {radius[str(r)]['rms_in_light_residual']:.4f}; "
              f"dark max {radius[str(r)]['max_abs_longest_dark_residual_d']:.2f} d ({radius[str(r)]['n_sites_dark_residual_over_0p25d']} sites > 0.25 d); earth max {radius[str(r)]['max_abs_earth_residual']:.4f}; "
              f"events worst median/p90/max {radius[str(r)]['worst_site_median_event_shift_min']}/{radius[str(r)]['worst_site_p90_event_shift_min']}/{radius[str(r)]['worst_site_max_event_shift_min']} min, "
              f"within 60 min {radius[str(r)]['events_within_60min_all_sites']:.3f}")
    for k, s in by_kind.items():
        print(k, {a: (round(b, 4) if isinstance(b, float) else b) for a, b in s.items()})
    v.write_json("study_g.json", {"period": f"{v.T0_CYCLE} + {v.HOURS_CYCLE} h hourly; events 2026 at {STEP_S} s",
                                  "observer_m": 2.0, "radii_m": RADII, "reference_radius_m": int(REF), "rows": rows,
                                  "by_kind": by_kind, "radius_residuals": radius, "rounding_summary": rq, "runtime_s": time.time() - t0})
    print(f"done in {time.time() - t0:.0f} s")


if __name__ == "__main__":
    main()
