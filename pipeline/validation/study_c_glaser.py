"""Study C: Glaser et al. 2014 "Connecting Ridge" point values.

Run:  .venv/bin/python pipeline/validation/study_c_glaser.py     (about 4 min)
Out:  pipeline/validation/results/study_c.json

Published (Icarus 243, 78 abstract; EPSC2014-136): 20 m DTM, hourly, 19 years (dates not found),
"in light" = not in complete darkness = any part of the disc visible. 2 m above ground: 92.27 %,
longest darkness 4.62 d, average illumination 87.9 % (spots 89.4395S 222.8066E and
89.4399S 222.8524E). 10 m: 95.65 %, 3.17 d, 91.9 % (89.4516S 222.7581E, 89.4544S 222.8445E).

Ours: 80 m DEM, hourly, 19 years from 2024-01-01 (comparable period, not theirs). We search a
+/-1 km square (80 m lattice, 625 points) centred on the mean of the four published spots for the
best "in light" point at each height, refine with a 20 m lattice (+/-160 m) around the best of the
lattice and the published spots (bilinear interpolation of the 80 m DEM, so no new terrain detail),
and also evaluate the four published coordinates as given.
Location matching is approximate: their DTM is 20 m and independently registered.
"""
import numpy as np

import vlib as v

SPOTS = [("spot 1 (2 m)", -89.4395, 222.8066, 2.0), ("spot 2 (2 m)", -89.4399, 222.8524, 2.0),
         ("spot 3 (10 m)", -89.4516, 222.7581, 10.0), ("spot 4 (10 m)", -89.4544, 222.8445, 10.0)]
PUBLISHED = {2.0: {"in_light": 0.9227, "longest_dark_d": 4.62, "avg_illum": 0.879},
             10.0: {"in_light": 0.9565, "longest_dark_d": 3.17, "avg_illum": 0.919}}
HOURS_19Y = int(round(19 * 365.25 * 24))
HALF_M, STEP_M = 960.0, 80.0


def one(lat, lon, h, sun):
    s = v.site_series(lat, lon, h, sun, None)
    r = v.summarise(s["sun"], s["sun_centre"])
    return {"lat": float(lat), "lon": float(lon) % 360, "h0_m": s["h0"], "in_light": r["any"],
            "avg_illum": r["avg_disc"], "longest_dark_d": r["longest_dark_h"] / 24.0}


def main():
    _et, sun, _e = v.ephem_table(v.T0_CYCLE, HOURS_19Y, 3600)
    out = {"period": f"{v.T0_CYCLE} + {HOURS_19Y} h", "published": {str(k): p for k, p in PUBLISHED.items()},
           "spots": [], "best": {}}
    for name, la, lo, h in SPOTS:
        r = one(la, lo, h, sun)
        r.update(name=name, height_m=h)
        out["spots"].append(r)
        print(f"{name:14s} in_light={r['in_light']:.4f} avg={r['avg_illum']:.4f} dark={r['longest_dark_d']:.2f} d h0={r['h0_m']:.0f}")
    xs, ys = zip(*[v.hz.latlon_to_xy(la, lo) for _n, la, lo, _h in SPOTS])
    xc, yc = float(np.mean(xs)), float(np.mean(ys))
    offs = np.arange(-HALF_M, HALF_M + 1, STEP_M)
    for h in (2.0, 10.0):
        res = []
        for dy in offs:
            for dx in offs:
                la, lo = v.hz.xy_to_latlon(xc + dx, yc + dy)
                r = one(la, lo, h, sun)
                r.update(dx_m=float(dx), dy_m=float(dy))
                res.append(r)
        # refinement: 20 m lattice, +/-160 m, around the best of (80 m lattice, published spots at this height)
        cands = res + [dict(sp, dx_m=None, dy_m=None) for sp in out["spots"] if sp["height_m"] == h]
        c = max(cands, key=lambda r: r["in_light"])
        cx, cy = v.hz.latlon_to_xy(c["lat"], c["lon"])
        fine = []
        for dy in np.arange(-160.0, 161.0, 20.0):
            for dx in np.arange(-160.0, 161.0, 20.0):
                la, lo = v.hz.xy_to_latlon(float(cx) + dx, float(cy) + dy)
                r = one(la, lo, h, sun)
                r.update(dx_m=float(cx) + dx - xc, dy_m=float(cy) + dy - yc)
                fine.append(r)
        res = res + fine
        best = max(res, key=lambda r: r["in_light"])
        ranked = sorted(res, key=lambda r: -r["in_light"])
        out["best"][str(h)] = {"best": best, "top5": ranked[:5], "n": len(res),
                               "window_median_in_light": float(np.median([r["in_light"] for r in res]))}
        p = PUBLISHED[h]
        print(f"{h:g} m best: in_light={best['in_light']:.4f} (published {p['in_light']:.4f}) avg={best['avg_illum']:.4f} "
              f"({p['avg_illum']:.3f}) dark={best['longest_dark_d']:.2f} d ({p['longest_dark_d']}) at "
              f"{best['lat']:.4f} {best['lon']:.4f} offset {best['dx_m']:+.0f},{best['dy_m']:+.0f} m")
    v.write_json("study_c.json", out)


if __name__ == "__main__":
    main()
