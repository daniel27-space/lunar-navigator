"""Study B: permanent shadow. Crater floors must get zero sunlight; agreement with the PGDA PSR mask.

Run:  .venv/bin/python pipeline/validation/study_b_psr.py     (about 20 s)
Out:  pipeline/validation/results/study_b.json

Sample: numpy default_rng(20261114) draws 20 PGDA pixels flagged PSR and 20 not flagged, uniformly
over the 120 m pixels south of 85S; points are the pixel centres. No filtering for "interior"
pixels; whether the 3x3 neighbourhood is all one class is recorded. Ours calls a point
permanently shadowed when no part of the solar disc clears the 80 m horizon in any of the
163,048 hourly steps (18.6 years), observer at 0 m (and 2 m for comparison).
"""
import math

import numpy as np

import vlib as v

SEED = 20261114
N_EACH = 20


def main():
    _et, sun, _earth = v.ephem_table(v.T0_CYCLE, v.HOURS_CYCLE, 3600)
    psr, x_min, y_max, px = v.pgda("psr")
    n = psr.shape[0]
    xs = x_min + (np.arange(n) + 0.5) * px
    ys = y_max - (np.arange(n) + 0.5) * px
    r85 = 2 * v.R_M * math.tan(math.radians(2.5))
    inside = np.hypot(xs[None, :], ys[:, None]) <= r85
    rng = np.random.default_rng(SEED)
    pts = []
    for flag in (1, 0):
        rows, cols = np.nonzero(inside & (np.round(psr) == flag))
        for i in rng.choice(rows.size, N_EACH, replace=False):
            r, c = int(rows[i]), int(cols[i])
            la, lo = v.hz.xy_to_latlon(xs[c], ys[r])
            w = np.round(psr[r - 1:r + 2, c - 1:c + 2])
            pts.append({"name": f"random {'PSR' if flag else 'lit'}", "lat": float(la), "lon": float(lo) % 360,
                        "row": r, "col": c, "pgda_psr": flag, "interior": bool((w == flag).all())})
    for name, la, lo, kind in v.NAMED:
        if kind == "floor":
            la2, lo2, r, c = v.snap_to_pgda(la, lo)
            pts.append({"name": name, "lat": la2, "lon": lo2, "row": r, "col": c,
                        "pgda_psr": int(round(v.pgda_value("psr", r, c))), "interior": True})
    for p in pts:
        p["pgda_sun"] = v.pgda_value("sun", p["row"], p["col"])
        for h in (0.0, 2.0):
            s = v.site_series(p["lat"], p["lon"], h, sun, None)
            p[f"any_{h:g}m"] = float((s["sun"] > 0).mean())
            p[f"avg_{h:g}m"] = float(s["sun"].mean())
            p[f"max_disc_{h:g}m"] = float(s["sun"].max())
            p[f"ours_psr_{h:g}m"] = int(s["sun"].max() <= 0)
    rnd = [p for p in pts if p["name"].startswith("random")]
    summ = {}
    for h in ("0m", "2m"):
        summ[h] = {
            "pgda_psr_and_ours_psr": sum(p["pgda_psr"] == 1 and p[f"ours_psr_{h}"] == 1 for p in rnd),
            "pgda_psr_ours_lit": sum(p["pgda_psr"] == 1 and p[f"ours_psr_{h}"] == 0 for p in rnd),
            "pgda_lit_ours_psr": sum(p["pgda_psr"] == 0 and p[f"ours_psr_{h}"] == 1 for p in rnd),
            "pgda_lit_and_ours_lit": sum(p["pgda_psr"] == 0 and p[f"ours_psr_{h}"] == 0 for p in rnd),
            "floors_zero": sum(p[f"ours_psr_{h}"] == 1 for p in pts if not p["name"].startswith("random")),
        }
    v.write_json("study_b.json", {"seed": SEED, "summary": summ, "points": pts})
    print(summ)
    for p in pts:
        if p["pgda_psr"] != p["ours_psr_0m"] or not p["name"].startswith("random"):
            print(f"  {p['name']:16s} {p['lat']:8.3f} {p['lon']:8.3f} pgda_psr={p['pgda_psr']} interior={p['interior']} "
                  f"pgda_sun={p['pgda_sun']:.4f} any0={p['any_0m']:.5f} avg0={p['avg_0m']:.5f} any2={p['any_2m']:.5f}")


if __name__ == "__main__":
    main()
