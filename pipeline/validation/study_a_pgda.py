"""Study A: 18.6-year average illumination and Earth visibility vs NASA PGDA (Mazarico et al. 2011).

Run:  .venv/bin/python pipeline/validation/study_a_pgda.py     (about 1.5 min)
Out:  pipeline/validation/results/study_a.json

Sample (deterministic): a 20 km square lattice in polar-stereographic x, y inside 85S, plus the
named features in vlib.NAMED. Every point is moved to the centre of the PGDA 120 m pixel that
contains it, and the PGDA SOURCE GeoTIFF value of that pixel is the comparison value.
Ours: 80 m GeoTIFF horizon (0.5 deg azimuth step), hourly for 163,048 h from 2024-01-01
(18.6 years), observer 0 m and 2 m above the surface, three rules: disc-fraction-weighted,
any-part-of-disc, disc-centre (point source).
"""
import math

import numpy as np

import vlib as v

SPACING_M = 20000.0
R85_M = 2 * v.R_M * math.tan(math.radians(2.5))
HEIGHTS = [0.0, 2.0]


def sample_points():
    pts = []
    n = int(R85_M // SPACING_M)
    for iy in range(n, -n - 1, -1):
        for ix in range(-n, n + 1):
            x, y = ix * SPACING_M, iy * SPACING_M
            if math.hypot(x, y) <= R85_M:
                la, lo = v.hz.xy_to_latlon(x, y)
                pts.append((f"grid {ix:+d},{iy:+d}", float(la), float(lo) % 360.0, "grid"))
    pts += v.NAMED
    out = []
    for name, la, lo, kind in pts:
        la2, lo2, r, c = v.snap_to_pgda(la, lo)
        out.append({"name": name, "kind": kind, "lat": la2, "lon": lo2, "row": r, "col": c})
    return out


def stats(ours, ref):
    ours, ref = np.asarray(ours), np.asarray(ref)
    d = ours - ref
    return {"n": int(d.size), "pearson_r": float(np.corrcoef(ours, ref)[0, 1]),
            "mean_bias": float(d.mean()), "rms": float(np.sqrt((d ** 2).mean())),
            "median_abs": float(np.median(np.abs(d))), "p90_abs": float(np.percentile(np.abs(d), 90)),
            "max_abs": float(np.abs(d).max())}


def local_slope_deg(lat, lon):
    g = v.grid_80m()
    x, y = v.hz.latlon_to_xy(lat, lon)
    d = 40.0
    dzdx = (g.sample(x + d, y) - g.sample(x - d, y)) / (2 * d)
    dzdy = (g.sample(x, y + d) - g.sample(x, y - d)) / (2 * d)
    return math.degrees(math.atan(math.hypot(dzdx, dzdy)))


def main():
    _et, sun, earth = v.ephem_table(v.T0_CYCLE, v.HOURS_CYCLE, 3600)
    pts = sample_points()
    psun, pearth = v.pgda("sun")[0], v.pgda("earth")[0]
    for p in pts:
        r, c = p["row"], p["col"]
        p["pgda_sun"] = v.pgda_value("sun", r, c)
        p["pgda_earth"] = v.pgda_value("earth", r, c)
        p["pgda_psr"] = int(round(v.pgda_value("psr", r, c)))
        w = psun[r - 1:r + 2, c - 1:c + 2]
        p["pgda_sun_3x3_min"], p["pgda_sun_3x3_max"] = float(w.min()), float(w.max())
        w = pearth[r - 1:r + 2, c - 1:c + 2]
        p["pgda_earth_3x3_min"], p["pgda_earth_3x3_max"] = float(w.min()), float(w.max())
        p["slope_deg_80m"] = local_slope_deg(p["lat"], p["lon"])
        for h in HEIGHTS:
            s = v.site_series(p["lat"], p["lon"], h, sun, earth)
            p["h0_m"] = s["h0"]
            p[f"sun_{h:g}m"] = v.summarise(s["sun"], s["sun_centre"])
            p[f"earth_{h:g}m"] = v.summarise(s["earth"], s["earth_centre"])
    summary = {}
    for body in ("sun", "earth"):
        ref = [p[f"pgda_{body}"] for p in pts]
        for h in HEIGHTS:
            for rule in ("avg_disc", "any", "centre"):
                summary[f"{body}_{h:g}m_{rule}"] = stats([p[f"{body}_{h:g}m"][rule] for p in pts], ref)
    out = {"t0_utc": v.T0_CYCLE, "hours": v.HOURS_CYCLE, "step_h": 1, "az_step_deg": v.AZ_STEP,
           "n_points": len(pts), "summary": summary, "points": pts}
    v.write_json("study_a.json", out)
    for k, s in summary.items():
        print(f"{k:22s} n={s['n']} r={s['pearson_r']:.4f} bias={s['mean_bias']:+.4f} rms={s['rms']:.4f} "
              f"med|d|={s['median_abs']:.4f} p90={s['p90_abs']:.4f} max={s['max_abs']:.4f}")
    for body, rule in (("sun", "avg_disc"), ("earth", "any")):
        print(f"\nworst 10, {body} 0 m {rule} minus PGDA")
        key = lambda p: -abs(p[f"{body}_0m"][rule] - p[f"pgda_{body}"])
        for p in sorted(pts, key=key)[:10]:
            print(f"  {p['name']:18s} {p['lat']:8.3f} {p['lon']:8.3f} ours={p[f'{body}_0m'][rule]:.3f} "
                  f"2m={p[f'{body}_2m'][rule]:.3f} pgda={p[f'pgda_{body}']:.3f} "
                  f"3x3=[{p[f'pgda_{body}_3x3_min']:.3f},{p[f'pgda_{body}_3x3_max']:.3f}] slope={p['slope_deg_80m']:.1f}")


if __name__ == "__main__":
    main()
