"""Compare (a) direct SPICE vs JPL Horizons and (b) web method vs direct SPICE.

Reads the cached Horizons responses in fixtures/ (run horizons.py --fetch first),
prints a markdown table, and with --write also writes
web/public/data/ephem/validation_vectors.json from the Horizons values.

Usage: .venv/bin/python pipeline/ephem/validate.py [--write]
"""
from __future__ import annotations

import json
import sys

import numpy as np

from common import OUT_DIR
from horizons import load_cases
from topo import sun_earth_azel, sun_earth_azel_web

KEYS = ("sun_az", "sun_el", "earth_az", "earth_el")


def wrap(d: float) -> float:
    return (d + 180.0) % 360.0 - 180.0


def sky_sep_deg(az1, el1, az2, el2) -> float:
    """Great-circle angle between two az/el directions (immune to az blow-up near zenith)."""
    a1, e1, a2, e2 = np.radians([az1, el1, az2, el2])
    u1 = np.array([np.cos(e1) * np.sin(a1), np.cos(e1) * np.cos(a1), np.sin(e1)])
    u2 = np.array([np.cos(e2) * np.sin(a2), np.cos(e2) * np.cos(a2), np.sin(e2)])
    return float(np.degrees(np.arctan2(np.linalg.norm(np.cross(u1, u2)), u1 @ u2)))


def differences() -> list[dict]:
    """Per case: signed differences (deg) spice-horizons and web-spice, plus sky separations."""
    rows = []
    for c in load_cases():
        sp = sun_earth_azel(c["lat"], c["lon"], c["h_m"], c["utc"])
        wb = sun_earth_azel_web(c["lat"], c["lon"], c["h_m"], c["utc"])
        row = {"site": c["site"], "utc": c["utc"]}
        for k in KEYS:
            row[f"sh_{k}"] = wrap(sp[k] - c[k])     # SPICE - Horizons
            row[f"ws_{k}"] = wrap(wb[k] - sp[k])    # web - SPICE
            row[f"wh_{k}"] = wrap(wb[k] - c[k])     # web - Horizons
        for body in ("sun", "earth"):
            row[f"sh_{body}_sep"] = sky_sep_deg(sp[f"{body}_az"], sp[f"{body}_el"], c[f"{body}_az"], c[f"{body}_el"])
            row[f"ws_{body}_sep"] = sky_sep_deg(wb[f"{body}_az"], wb[f"{body}_el"], sp[f"{body}_az"], sp[f"{body}_el"])
        rows.append(row)
    return rows


def summary(rows: list[dict]) -> dict:
    """max |.| and RMS per comparison and quantity, degrees."""
    out = {}
    for prefix in ("sh", "ws", "wh"):
        for k in KEYS + (("sun_sep", "earth_sep") if prefix != "wh" else ()):
            v = np.array([r[f"{prefix}_{k}"] for r in rows])
            out[f"{prefix}_{k}"] = {"max": float(np.max(np.abs(v))), "rms": float(np.sqrt(np.mean(v ** 2)))}
    return out


def markdown(rows: list[dict]) -> str:
    s = summary(rows)
    names = {"sh": "(a) direct SPICE - Horizons", "ws": "(b) web method - direct SPICE",
             "wh": "(c) web method - Horizons"}
    lines = [f"{len(rows)} cases. Degrees.", "",
             "| comparison | quantity | max abs (deg) | RMS (deg) | max abs (arcsec) |",
             "|---|---|---|---|---|"]
    for key, val in s.items():
        prefix, q = key.split("_", 1)
        lines.append(f"| {names[prefix]} | {q} | {val['max']:.2e} | {val['rms']:.2e} | {val['max'] * 3600:.4f} |")
    return "\n".join(lines)


def write_validation_vectors() -> int:
    vectors = [{
        "site": c["site"], "lat": c["lat"], "lon": c["lon"], "h_m": c["h_m"], "utc": c["utc"],
        "sun_az": c["sun_az"], "sun_el": c["sun_el"],
        "earth_az": c["earth_az"], "earth_el": c["earth_el"],
        "source": "JPL Horizons",
    } for c in load_cases()]
    (OUT_DIR / "validation_vectors.json").write_text(json.dumps(vectors, indent=1) + "\n")
    return len(vectors)


if __name__ == "__main__":
    rows = differences()
    print(markdown(rows))
    worst = max(rows, key=lambda r: max(r["sh_sun_sep"], r["sh_earth_sep"]))
    print(f"\nworst SPICE-Horizons case: {worst['site']} {worst['utc']} "
          f"sun {worst['sh_sun_sep'] * 3600:.4f}\" earth {worst['sh_earth_sep'] * 3600:.4f}\"")
    worst = max(rows, key=lambda r: max(r["ws_sun_sep"], r["ws_earth_sep"]))
    print(f"worst web-SPICE case: {worst['site']} {worst['utc']} "
          f"sun {worst['ws_sun_sep'] * 3600:.4f}\" earth {worst['ws_earth_sep'] * 3600:.4f}\"")
    if "--write" in sys.argv:
        print(f"wrote {write_validation_vectors()} validation vectors")
