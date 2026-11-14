"""Study F: why did our longest darkness at 2 m on the connecting ridge disagree with Glaser et al. 2014?

Run:  .venv/bin/python pipeline/validation/study_f_glaser20.py     (about 7 min)
Out:  pipeline/validation/results/study_f.json

Published values used here are those of the EPSC abstract EPSC2014-136 (Glaser et al., "Connecting
Ridge - A landing site at the lunar south pole with extended illumination"), which was read in full:
20 m LOLA DTM, horizon every 0.5 deg of azimuth, Sun as a disc, 1 h steps, "19 years" in the abstract
and "20 years" in the figure captions, no start date. Per spot it gives average illumination, share of
time in light, longest darkness AND longest light. The Icarus paper itself (243, 78-90) is paywalled
and was NOT read: its exact period, DTM version and "dark" rule are not known beyond the above.

Parts (all "any part of the disc visible" and hourly, 19 years from 2024-01-01, unless stated):
  a  the four published spots on 80 m terrain and on 20 m terrain within 2 / 5 / 10 / 40 km of the
     observer (80 m beyond); convergence with a 100 km window and finer ray steps; and the mechanism
     (what the 80 m surface does to the one dark spell that sets the 2 m record).
  b  neighbourhood: 20 m lattice within +/-200 m of each pair of spots, both terrains, both heights;
     and a 5 m lattice within 30 m of each published spot.
  c  definition (any part / centre / half the disc / upper limb at the nearest stored azimuth),
     time step (15 min, 1 h at four phases, 2 h, 3 h, 6 h) and period (every 19- and 20-year window
     starting 1 January 2005 ... 2031).
  d  what "2 m above ground" is measured from: the DEM at the point, or a locally smoothed surface;
     and which half of the 20 m effect is the observer's own ground height.
"""
import time

import numpy as np

import v20
import vlib as v

SPOTS = [("spot 1", -89.4395, 222.8066, 2.0), ("spot 2", -89.4399, 222.8524, 2.0),
         ("spot 3", -89.4516, 222.7581, 10.0), ("spot 4", -89.4544, 222.8445, 10.0)]
# EPSC2014-136 text and table; "in_light" for spots 2 and 4 to two decimals from the Icarus abstract.
PUBLISHED = {
    "spot 1": {"in_light": 0.92, "avg_illum": 0.881, "longest_dark_d": 4.58, "longest_light_d": 233.87},
    "spot 2": {"in_light": 0.9227, "avg_illum": 0.879, "longest_dark_d": 4.62, "longest_light_d": 233.87},
    "spot 3": {"in_light": 0.956, "avg_illum": 0.925, "longest_dark_d": 3.08, "longest_light_d": 262.42},
    "spot 4": {"in_light": 0.9565, "avg_illum": 0.919, "longest_dark_d": 3.17, "longest_light_d": 262.42},
}
HOURS_19Y = int(round(19 * 365.25 * 24))
RADII = [0, 2000, 5000, 10000, 40000]
R_REF = 5000.0          # 20 m window used in parts b, c, d (part a shows 2 km already equals 40 km)


def stats(lat, lon, h, radius, sun, centre_xy=None, **kw):
    hor, h0, _d = v20.horizon_mixed(lat, lon, h, radius, centre_xy=centre_xy, **kw)
    st, _s = v20.sun_stats(lat, lon, h0, h, hor, sun)
    st["h0_m"] = h0
    return st


def part_a(sun, et):
    out = {"spots": [], "convergence": [], "mechanism": {}}
    for name, la, lo, h_pub in SPOTS:
        for h in (2.0, 10.0):
            row = {"name": name, "lat": la, "lon": lo, "height_m": h, "published_height": h == h_pub, "by_radius": {}}
            for r in RADII:
                row["by_radius"][str(r)] = stats(la, lo, h, r, sun)
            out["spots"].append(row)
            if h == h_pub:
                a, b = row["by_radius"]["0"], row["by_radius"]["5000"]
                p = PUBLISHED[name]
                print(f"a {name} {h:g} m  published light {p['in_light']:.4f} dark {p['longest_dark_d']} d light-run {p['longest_light_d']}"
                      f" | 80 m: {a['in_light']:.4f} {a['longest_dark_d']:.2f} {a['longest_light_d']:.2f}"
                      f" | 20 m: {b['in_light']:.4f} {b['longest_dark_d']:.2f} {b['longest_light_d']:.2f}")
    # convergence: bigger window, finer ray sampling (10 m steps to 10 km, then 0.1 % growth)
    for name, la, lo, h in SPOTS:
        c = {"name": name, "height_m": h,
             "r40km_default_steps": stats(la, lo, h, 40000, sun),
             "r100km_fine_steps": stats(la, lo, h, 100000, sun, ds_min_m=10.0, growth=0.001),
             "r5km_az025": None}
        hor, h0, _d = v20.horizon_mixed(la, lo, h, 5000, az_step=0.25)
        c["r5km_az025"], _s = v20.sun_stats(la, lo, h0, h, hor, sun, az_step=0.25)
        out["convergence"].append(c)
        print(f"a convergence {name}: 40 km {c['r40km_default_steps']['longest_dark_d']:.2f} d / {c['r40km_default_steps']['in_light']:.4f}"
              f"  100 km fine {c['r100km_fine_steps']['longest_dark_d']:.2f} d / {c['r100km_fine_steps']['in_light']:.4f}"
              f"  az 0.25 {c['r5km_az025']['longest_dark_d']:.2f} d / {c['r5km_az025']['in_light']:.4f}")
    # mechanism at spot 2, 2 m: the 80 m record dark spell, seen on both terrains
    _n, la, lo, h = SPOTS[1]
    h80, z80, d80 = v20.horizon_mixed(la, lo, h, 0)
    h20, z20, d20 = v20.horizon_mixed(la, lo, h, R_REF)
    _st, s80 = v20.sun_stats(la, lo, z80, h, h80, sun)
    _st, s20 = v20.sun_stats(la, lo, z20, h, h20, sun)
    st, ln = v20.runs(s80["sun"] <= 0)
    k = int(np.argmax(ln))
    i0, i1 = int(st[k]), int(st[k] + ln[k])
    lit20 = np.flatnonzero(s20["sun"][i0:i1] > 0) + i0
    s2, l2 = v20.runs(s20["sun"][i0:i1] <= 0)
    az = s80["sun_az"][lit20]
    kk = np.unique((np.round(az / v.AZ_STEP).astype(int)) % h80.size)
    # how far the Sun's upper limb is below the 80 m horizon during those hours (deg)
    rad = np.degrees(np.arcsin(v.ec.R_SUN_KM / np.linalg.norm(sun[lit20], axis=1)))
    hor80_at = np.array([v._hor_at(h80, v.AZ_STEP, a) for a in az])
    hor20_at = np.array([v._hor_at(h20, v.AZ_STEP, a) for a in s20["sun_az"][lit20]])
    out["mechanism"] = {
        "spot": "spot 2", "height_m": h, "h0_80m": z80, "h0_20m": z20, "h0_20m_minus_80m": z20 - z80,
        "dark_spell_80m": {"start_utc": v.et_to_utc(et[i0]), "end_utc": v.et_to_utc(et[i1 - 1]), "days": (i1 - i0) / 24.0},
        "same_interval_on_20m": {"lit_hours": int(lit20.size), "dark_pieces_d": [float(x) / 24.0 for x in l2],
                                 "first_lit_utc": v.et_to_utc(et[lit20[0]]) if lit20.size else None,
                                 "last_lit_utc": v.et_to_utc(et[lit20[-1]]) if lit20.size else None,
                                 "max_disc_fraction_20m": float(s20["sun"][lit20].max()) if lit20.size else 0.0},
        "sun_az_range_deg": [float(az.min()), float(az.max())] if lit20.size else None,
        "upper_limb_minus_horizon80_deg": [float((s80["sun_el"][lit20] + rad - hor80_at).min()),
                                           float((s80["sun_el"][lit20] + rad - hor80_at).max())] if lit20.size else None,
        "upper_limb_minus_horizon20_deg": [float((s20["sun_el"][lit20] + rad - hor20_at).min()),
                                           float((s20["sun_el"][lit20] + rad - hor20_at).max())] if lit20.size else None,
        "horizon80_minus_horizon20_deg_at_those_az": [float((h80[kk] - h20[kk]).min()), float((h80[kk] - h20[kk]).max())],
        "horizon_distance_m_80": [float(d80[kk].min()), float(d80[kk].max())],
        "horizon_distance_m_20": [float(d20[kk].min()), float(d20[kk].max())],
        "horizon_diff_all_az_deg": {"median_abs": float(np.median(np.abs(h80 - h20))), "max_abs": float(np.abs(h80 - h20).max())},
    }
    m = out["mechanism"]
    print(f"a mechanism: 80 m dark spell {m['dark_spell_80m']['start_utc']} + {m['dark_spell_80m']['days']:.2f} d; on 20 m terrain "
          f"{m['same_interval_on_20m']['lit_hours']} lit hours split it into {['%.2f' % x for x in m['same_interval_on_20m']['dark_pieces_d']]} d; "
          f"az {m['sun_az_range_deg']}, limb-horizon80 {m['upper_limb_minus_horizon80_deg']}, limb-horizon20 {m['upper_limb_minus_horizon20_deg']}, "
          f"hor80-hor20 {m['horizon80_minus_horizon20_deg_at_those_az']}, dist80 {m['horizon_distance_m_80']}, dist20 {m['horizon_distance_m_20']}, "
          f"h0 diff {m['h0_20m_minus_80m']:+.2f} m")
    return out


def part_b(sun):
    out = {}
    offs = np.arange(-200.0, 201.0, 20.0)
    for label, (ia, ib), h_pub in (("2m_spots", (0, 1), 2.0), ("10m_spots", (2, 3), 10.0)):
        xy = [v.hz.latlon_to_xy(SPOTS[i][1], SPOTS[i][2]) for i in (ia, ib)]
        xc, yc = float(np.mean([p[0] for p in xy])), float(np.mean([p[1] for p in xy]))
        pts = []
        for dy in offs:
            for dx in offs:
                la, lo = v.hz.xy_to_latlon(xc + dx, yc + dy)
                la, lo = float(la), float(lo) % 360.0
                p = {"dx_m": float(dx), "dy_m": float(dy), "lat": la, "lon": lo,
                     "dist_to_nearest_spot_m": float(min(np.hypot(xc + dx - q[0], yc + dy - q[1]) for q in xy))}
                for h in (2.0, 10.0):
                    for tag, r in (("80", 0), ("20", R_REF + 300.0)):
                        st = stats(la, lo, h, r, sun, centre_xy=(xc, yc))
                        p[f"t{tag}_h{h:g}"] = [st["in_light"], st["longest_dark_d"], st["avg_illum"], st["longest_light_d"]]
                pts.append(p)
        pubs = [PUBLISHED[SPOTS[i][0]] for i in (ia, ib)]
        summ = {}
        for tag in ("80", "20"):
            for h in (2.0, 10.0):
                key = f"t{tag}_h{h:g}"
                for rad in (30.0, 60.0, 100.0, 200.0):
                    sel = [p for p in pts if p["dist_to_nearest_spot_m"] <= rad]
                    il = np.array([p[key][0] for p in sel])
                    dk = np.array([p[key][1] for p in sel])
                    e = {"n": len(sel),
                         "in_light_min_med_max": [float(il.min()), float(np.median(il)), float(il.max())],
                         "longest_dark_d_min_p10_med_p90_max": [float(dk.min()), float(np.percentile(dk, 10)), float(np.median(dk)),
                                                               float(np.percentile(dk, 90)), float(dk.max())]}
                    if h == h_pub:
                        # a point "reproduces" a published spot if time in light is within 0.2 points,
                        # longest darkness within 0.25 d and average illumination within 0.5 points
                        ok = [any(abs(p[key][0] - q["in_light"]) <= 0.002 and abs(p[key][1] - q["longest_dark_d"]) <= 0.25
                                  and abs(p[key][2] - q["avg_illum"]) <= 0.005 for q in pubs[1:]) for p in sel]
                        e["n_reproducing_best_spot"] = int(np.sum(ok))
                        e["share_dark_within_0p5d_of_published"] = float(np.mean(np.abs(dk - pubs[1]["longest_dark_d"]) <= 0.5))
                    summ[f"{key}_within_{rad:g}m"] = e
        # fine lattice: 5 m steps within +/-30 m of each published spot (published height only)
        fine = {}
        for i, q in zip((ia, ib), xy):
            fp = []
            for dy in np.arange(-30.0, 31.0, 5.0):
                for dx in np.arange(-30.0, 31.0, 5.0):
                    la, lo = v.hz.xy_to_latlon(float(q[0]) + dx, float(q[1]) + dy)
                    e = {"dx_m": float(dx), "dy_m": float(dy)}
                    for tag, r in (("80", 0), ("20", R_REF + 300.0)):
                        st = stats(float(la), float(lo) % 360.0, h_pub, r, sun, centre_xy=(xc, yc))
                        e[f"t{tag}"] = [st["in_light"], st["longest_dark_d"], st["avg_illum"], st["longest_light_d"]]
                    fp.append(e)
            pub = PUBLISHED[SPOTS[i][0]]
            fs = {}
            for tag in ("80", "20"):
                for rad in (10.0, 20.0, 30.0):
                    sel = [e for e in fp if np.hypot(e["dx_m"], e["dy_m"]) <= rad]
                    il = np.array([e[f"t{tag}"][0] for e in sel])
                    dk = np.array([e[f"t{tag}"][1] for e in sel])
                    ok = (np.abs(il - pub["in_light"]) <= 0.002) & (np.abs(dk - pub["longest_dark_d"]) <= 0.25)
                    fs[f"t{tag}_within_{rad:g}m"] = {
                        "n": len(sel), "in_light_min_med_max": [float(il.min()), float(np.median(il)), float(il.max())],
                        "longest_dark_d_min_med_max": [float(dk.min()), float(np.median(dk)), float(dk.max())],
                        "n_light_within_0p2pt_and_dark_within_0p25d_of_published": int(ok.sum())}
            fine[SPOTS[i][0]] = {"points": fp, "summary": fs}
            for tag in ("80", "20"):
                e = fs[f"t{tag}_within_10m"]
                g = fs[f"t{tag}_within_30m"]
                print(f"b fine {SPOTS[i][0]} {h_pub:g} m terrain {tag}: within 10 m (n={e['n']}) light {e['in_light_min_med_max']} dark {e['longest_dark_d_min_med_max']} "
                      f"matching {e['n_light_within_0p2pt_and_dark_within_0p25d_of_published']}; within 30 m (n={g['n']}) dark {g['longest_dark_d_min_med_max']} "
                      f"matching {g['n_light_within_0p2pt_and_dark_within_0p25d_of_published']}")
        out[label] = {"centre_xy_m": [xc, yc], "published_height_m": h_pub, "points": pts, "summary": summ, "fine_5m": fine}
        for tag in ("80", "20"):
            for rad in (30.0, 200.0):
                e = summ[f"t{tag}_h{h_pub:g}_within_{rad:g}m"]
                print(f"b {label} terrain {tag} m, observer {h_pub:g} m, within {rad:g} m (n={e['n']}): in light {e['in_light_min_med_max']}"
                      f" dark {e['longest_dark_d_min_p10_med_p90_max']} reproducing {e['n_reproducing_best_spot']}")
    return out


def part_c(sun):
    out = {"definition": [], "time_step": [], "period": []}
    cases = [(SPOTS[1], 2.0), (SPOTS[3], 10.0), (SPOTS[0], 2.0), (SPOTS[2], 10.0)]
    hors = {}
    for (name, la, lo, _hp), h in cases:
        for tag, r in (("80", 0), ("20", R_REF)):
            hor, h0, _d = v20.horizon_mixed(la, lo, h, r)
            hors[name, tag] = (la, lo, h, hor, h0)
    # --- definition of "dark"
    for (name, tag), (la, lo, h, hor, h0) in hors.items():
        s = v.site_series(la, lo, h, sun, None, hor=hor, h0=h0)
        az, el, rad = v.azel_rad(sun, la, lo, h0 + h, v.ec.R_SUN_KM)
        lim = np.empty(az.size)
        v20.limb_nearest(az, el, rad, hor, v.AZ_STEP, lim)
        row = {"name": name, "terrain_m": int(tag), "height_m": h}
        for rule, lit in (("any_part", s["sun"] > 0), ("centre", s["sun_centre"] > 0), ("half_disc", s["sun"] >= 0.5),
                          ("tenth_of_disc", s["sun"] >= 0.1), ("upper_limb_nearest_az", lim > 0)):
            row[rule] = {"in_light": float(lit.mean()), "longest_dark_d": v.longest_run(~lit) / 24.0}
        out["definition"].append(row)
        print(f"c definition {name} {h:g} m terrain {tag}: " + "  ".join(
            f"{k} {row[k]['in_light']:.4f}/{row[k]['longest_dark_d']:.2f}d" for k in ("any_part", "tenth_of_disc", "half_disc", "centre", "upper_limb_nearest_az")))
    # --- time step: 19 years at 15 minutes, then subsample
    _et, sun15, _e = v.ephem_table(v.T0_CYCLE, HOURS_19Y * 4, 900)
    for (name, tag), (la, lo, h, hor, h0) in hors.items():
        if name not in ("spot 2", "spot 4"):
            continue
        s = v.site_series(la, lo, h, sun15, None, hor=hor, h0=h0)
        dark = s["sun"] <= 0
        row = {"name": name, "terrain_m": int(tag), "height_m": h, "steps": {}}
        for label, every, phases in (("15 min", 1, [0]), ("1 h", 4, [0, 1, 2, 3]), ("2 h", 8, [0, 4]), ("3 h", 12, [0, 4, 8]),
                                     ("6 h", 24, [0, 8, 16]), ("12 h", 48, [0, 24]), ("24 h", 96, [0, 32, 64])):
            vals = [v.longest_run(dark[p::every]) * every * 0.25 / 24.0 for p in phases]
            row["steps"][label] = {"longest_dark_d_min": float(min(vals)), "longest_dark_d_max": float(max(vals)),
                                   "in_light": float((~dark[::every]).mean())}
        out["time_step"].append(row)
        print(f"c time step {name} {h:g} m terrain {tag}: " + "  ".join(
            f"{k} {x['longest_dark_d_min']:.2f}-{x['longest_dark_d_max']:.2f}" for k, x in row["steps"].items()))
    # --- period: hourly 2005-01-01 .. 2051, every 19- and 20-year window starting 1 January
    n_long = int(46 * 365.25 * 24)
    et_l, sun_l, _e = v.ephem_table("2005-01-01T00:00:00Z", n_long, 3600)
    starts = [(y, int(round((v.ec.utc_to_et(f"{y}-01-01T00:00:00Z") - et_l[0]) / 3600.0))) for y in range(2005, 2032)]
    for (name, tag), (la, lo, h, hor, h0) in hors.items():
        if name not in ("spot 2", "spot 4"):
            continue
        s = v.site_series(la, lo, h, sun_l, None, hor=hor, h0=h0)
        lit = s["sun"] > 0
        row = {"name": name, "terrain_m": int(tag), "height_m": h, "windows": []}
        for years in (19, 20):
            n = int(round(years * 365.25 * 24))
            for y, i in starts:
                if i + n > lit.size:
                    continue
                w = lit[i:i + n]
                row["windows"].append({"start_year": y, "years": years, "in_light": float(w.mean()),
                                       "longest_dark_d": v.longest_run(~w) / 24.0, "longest_light_d": v.longest_run(w) / 24.0})
        # single calendar years: how much one year can differ
        row["single_years"] = []
        for y, i in starts[:-1]:
            j = starts[starts.index((y, i)) + 1][1]
            w = lit[i:j]
            row["single_years"].append({"year": y, "in_light": float(w.mean()), "longest_dark_d": v.longest_run(~w) / 24.0})
        d = [w["longest_dark_d"] for w in row["windows"]]
        il = [w["in_light"] for w in row["windows"]]
        ll = [w["longest_light_d"] for w in row["windows"]]
        dy = [w["longest_dark_d"] for w in row["single_years"]]
        row["summary"] = {"n_windows": len(d), "longest_dark_d_range": [min(d), max(d)], "in_light_range": [min(il), max(il)],
                          "longest_light_d_range": [min(ll), max(ll)], "single_year_longest_dark_d_range": [min(dy), max(dy)]}
        out["period"].append(row)
        print(f"c period {name} {h:g} m terrain {tag}: {len(d)} windows, dark {min(d):.2f}-{max(d):.2f} d, light {min(il):.4f}-{max(il):.4f}, "
              f"longest light {min(ll):.2f}-{max(ll):.2f} d; single years dark {min(dy):.2f}-{max(dy):.2f} d")
    return out


def part_d(sun):
    out = {"smoothed_surface": [], "height_sweep": [], "decomposition": []}
    g80 = v.grid_80m()
    for name, la, lo, h_pub in SPOTS:
        x, y = (float(t) for t in v.hz.latlon_to_xy(la, lo))
        g20 = v20.window20(x, y, R_REF)
        z80, z20 = g80.sample(x, y), g20.sample(x, y)
        # which part of the 20 m effect is the observer's own ground height?
        dec = {"name": name, "height_m": h_pub, "h0_80m": z80, "h0_20m": z20}
        for label, r, eff in (("80m_terrain_obs_on_80m", 0, h_pub), ("80m_terrain_obs_at_20m_ground_height", 0, h_pub + z20 - z80),
                              ("20m_terrain_obs_at_80m_ground_height", R_REF, h_pub + z80 - z20), ("20m_terrain_obs_on_20m", R_REF, h_pub)):
            hor, h0, _d = v20.horizon_mixed(la, lo, eff, r)
            st, _s = v20.sun_stats(la, lo, h0, eff, hor, sun)
            dec[label] = dict(st, effective_height_above_dem_m=eff)
        out["decomposition"].append(dec)
        print(f"d decomposition {name} {h_pub:g} m (20 m ground is {z20 - z80:+.2f} m vs 80 m): " + "  ".join(
            f"{k}: {dec[k]['in_light']:.4f}/{dec[k]['longest_dark_d']:.2f}d" for k in list(dec)[4:]))
        # observer height measured from a locally smoothed surface
        for tag, r, g in (("80", 0, g80), ("20", R_REF, g20)):
            z = g.sample(x, y)
            for rs in (0.0, 30.0, 60.0, 100.0, 200.0):
                zs = z if rs == 0 else v20.smoothed_height(g, x, y, rs)
                eff = h_pub + zs - z
                hor, h0, _d = v20.horizon_mixed(la, lo, eff, r)
                st, _s = v20.sun_stats(la, lo, h0, eff, hor, sun)
                out["smoothed_surface"].append(dict(st, name=name, terrain_m=int(tag), height_m=h_pub, smoothing_radius_m=rs,
                                                    smoothed_minus_point_m=zs - z, effective_height_above_dem_m=eff))
                print(f"d smoothed {name} terrain {tag} radius {rs:g} m: surface {zs - z:+.2f} m -> effective {eff:.2f} m: "
                      f"{st['in_light']:.4f} / {st['longest_dark_d']:.2f} d")
        if name in ("spot 2", "spot 4"):
            for tag, r in (("80", 0), ("20", R_REF)):
                for h in (0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 4.0, 5.0, 7.0, 10.0):
                    st = stats(la, lo, h, r, sun)
                    out["height_sweep"].append(dict(st, name=name, terrain_m=int(tag), height_m=h))
    return out


def main():
    t0 = time.time()
    et, sun, _e = v.ephem_table(v.T0_CYCLE, HOURS_19Y, 3600)
    out = {"period": f"{v.T0_CYCLE} + {HOURS_19Y} h (hourly)", "dem20": v20.tif20_info(),
           "published": PUBLISHED,
           "paper_access": {"epsc2014_136_read": True, "icarus_full_text_read": False,
                            "stated": "20 m DTM; horizon every 0.5 deg azimuth; Sun as a disc; 1 h steps; 19 years (abstract) / 20 years (captions); no dates"},
           "spots": [{"name": n, "lat": la, "lon": lo, "height_m": h} for n, la, lo, h in SPOTS],
           "window_radius_parts_bcd_m": R_REF}
    out["a"] = part_a(sun, et)
    out["d"] = part_d(sun)
    out["c"] = part_c(sun)
    out["b"] = part_b(sun)
    out["runtime_s"] = time.time() - t0
    v.write_json("study_f.json", out)
    print(f"done in {out['runtime_s']:.0f} s")


if __name__ == "__main__":
    main()
