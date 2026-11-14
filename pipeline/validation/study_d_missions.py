"""Study D: computed sunrise/sunset at IM-1 Odysseus and IM-2 Athena vs the reported timelines.

Run:  .venv/bin/python pipeline/validation/study_d_missions.py     (about 10 s)
Out:  pipeline/validation/results/study_d.json

Coordinates from web/public/data/missions.json. 5-minute steps, observer 2 m above the DEM
surface, 80 m GeoTIFF horizon (and the web tiles for comparison). "sunset" = last moment any part
of the disc is above the terrain horizon; "sunrise" = first such moment. Also given: the same
events on a smooth sphere (horizon 0 deg), and how far each horizon ray runs before leaving the DEM.
"""
import json
import math

import numpy as np

import vlib as v

STEP_S = 300
WINDOWS = {"im-1-odysseus": ("2024-02-10T00:00:00Z", 30), "im-2-athena": ("2025-02-22T00:00:00Z", 35)}
REPORTED = {
    "im-1-odysseus": {"landing_utc": "2024-02-22T23:23:00Z", "end_utc": "2024-02-29T17:00:00Z",
                      "note": "last contact / power-down 29 Feb 2024 (time of day about 17:00 UTC is from a search snippet only); "
                              "attributed to approaching lunar night with the lander tipped so one panel was lit"},
    "im-2-athena": {"landing_utc": "2025-03-06T17:28:00Z", "end_utc": "2025-03-07T06:15:00Z",
                    "note": "ended by battery depletion, on its side in a shadowed crater; planned for about 10 days"},
}


def events(et, lit):
    out = []
    for i in np.flatnonzero(np.diff(lit.astype(np.int8)) != 0):
        out.append({"type": "sunrise" if lit[i + 1] else "sunset", "utc": v.et_to_utc(et[i + 1] if lit[i + 1] else et[i])})
    return out


def ray_length_km(lat, lon, az_deg):
    """Arc length (km) a ray travels before the 80 m DEM has no data, sampled every 500 m."""
    g = v.grid_80m()
    la, lo, az = map(math.radians, (lat, lon, az_deg))
    u = np.array([math.cos(la) * math.cos(lo), math.cos(la) * math.sin(lo), math.sin(la)])
    e = np.array([-math.sin(lo), math.cos(lo), 0.0])
    n = np.array([-math.sin(la) * math.cos(lo), -math.sin(la) * math.sin(lo), math.cos(la)])
    d = n * math.cos(az) + e * math.sin(az)
    s = 0.0
    while s < 300000:
        s += 500.0
        q = u * math.cos(s / v.R_M) + d * math.sin(s / v.R_M)
        x, y = 2 * v.R_M * q[1] / (1 - q[2]), 2 * v.R_M * q[0] / (1 - q[2])
        if math.isnan(g.sample(x, y)):
            return (s - 500.0) / 1000.0
    return 300.0


def eclipse(et, sun, earth, lat, lon):
    """Intervals in which the Earth's disc overlaps the Sun's disc as seen from the site (h = 0)."""
    site = v.ec.site_vector_km(lat, lon, 0.0)
    a, b = sun - site, earth - site
    da, db = np.linalg.norm(a, axis=1), np.linalg.norm(b, axis=1)
    sep = np.degrees(np.arccos(np.clip((a * b).sum(axis=1) / (da * db), -1, 1)))
    rs, re = np.degrees(np.arcsin(v.ec.R_SUN_KM / da)), np.degrees(np.arcsin(v.ec.R_EARTH_KM / db))
    out = {}
    for name, m in (("partial", sep < rs + re), ("total", sep < re - rs)):
        idx = np.flatnonzero(m)
        out[name] = [v.et_to_utc(et[idx[0]]), v.et_to_utc(et[idx[-1]])] if idx.size else None
    return out


def main():
    missions = {m["id"]: m for m in json.loads((v.REPO / "web/public/data/missions.json").read_text())}
    out = {}
    for mid, (t0, days) in WINDOWS.items():
        m = missions[mid]
        lat, lon = m["lat"], m["lon"]
        et, sun, _e = v.ephem_table(t0, days * 86400 // STEP_S, STEP_S)
        res = {"lat": lat, "lon": lon, "reported": REPORTED[mid], "sources": {}}
        res["earth_in_front_of_sun"] = eclipse(et, sun, _e, lat, lon)
        for src in ("tif", "tiles"):
            s = v.site_series(lat, lon, 2.0, sun, None, source=src)
            lit = s["sun"] > 0
            ev = events(et, lit)
            r = {"h0_m": s["h0"], "events": ev, "centre_events": events(et, s["sun_centre"] > 0)}
            for key in ("landing_utc", "end_utc"):
                i = int(round((v.ec.utc_to_et(REPORTED[mid][key]) - et[0]) / STEP_S))
                r[key] = {"utc": REPORTED[mid][key], "disc_fraction": float(s["sun"][i]), "sun_el_deg": float(s["sun_el"][i]),
                          "sun_az_deg": float(s["sun_az"][i]),
                          "horizon_at_sun_az_deg": float(s["hor"][int(round(s["sun_az"][i] / v.AZ_STEP)) % s["hor"].size])}
            res["sources"][src] = r
            if src == "tif":
                flat = np.zeros_like(s["hor"])
                sf = v.site_series(lat, lon, 2.0, sun, None, hor=flat, h0=s["h0"])
                res["smooth_sphere_events"] = events(et, sf["sun"] > 0)
                # azimuth of the Sun at each terrain event and DEM coverage there
                for e in ev:
                    i = int(round((v.ec.utc_to_et(e["utc"]) - et[0]) / STEP_S))
                    e["sun_az_deg"] = float(s["sun_az"][i])
                    e["sun_el_deg"] = float(s["sun_el"][i])
                    e["dem_ray_km_at_az"] = ray_length_km(lat, lon, s["sun_az"][i])
                res["dem_ray_km_by_az"] = {str(a): ray_length_km(lat, lon, a) for a in range(0, 360, 30)}
        out[mid] = res
        print(mid, lat, lon, "h0", res["sources"]["tif"]["h0_m"])
        for src in ("tif", "tiles"):
            r = res["sources"][src]
            print(" ", src, [(e["type"], e["utc"], round(e.get("sun_az_deg", -1), 1), e.get("dem_ray_km_at_az")) for e in r["events"]])
            print("    centre:", [(e["type"], e["utc"]) for e in r["centre_events"]])
            print("    landing:", r["landing_utc"], "\n    end:", r["end_utc"])
        print("  smooth sphere:", [(e["type"], e["utc"]) for e in res["smooth_sphere_events"]])
        print("  DEM ray km by az:", res["dem_ray_km_by_az"])
        print("  Earth in front of Sun (not modelled):", res["earth_in_front_of_sun"])
    v.write_json("study_d.json", out)


if __name__ == "__main__":
    main()
