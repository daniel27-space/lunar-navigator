"""Reference Sun/Earth azimuth and elevation at a lunar surface site.

Two implementations:

* sun_earth_azel()      -- direct SPICE with a topocentric observer (the reference).
* sun_earth_azel_web()  -- the web app's method: linear interpolation of ephem.bin
                           (Moon-centre vectors), subtract the site vector, normalise.

Both return the same dict so they can be differenced. Conventions per docs/DATA_CONTRACT.md:
MOON_ME, sphere R = 1737.4 km, planetocentric lat / east lon, az clockwise from north,
no refraction.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from functools import lru_cache

import numpy as np
import spiceypy as spice

from common import (ABCORR, FRAME, OUT_DIR, R_EARTH_KM, R_SUN_KM, azel_deg, load_kernels,
                    site_vector_km, utc_to_et)


def _pack(sun_v, earth_v, lat, lon) -> dict:
    sun_az, sun_el = azel_deg(sun_v, lat, lon)
    earth_az, earth_el = azel_deg(earth_v, lat, lon)
    ds, de = float(np.linalg.norm(sun_v)), float(np.linalg.norm(earth_v))
    return {
        "sun_az": sun_az, "sun_el": sun_el,
        "earth_az": earth_az, "earth_el": earth_el,
        "sun_ang_radius": float(np.degrees(np.arcsin(R_SUN_KM / ds))),
        "earth_ang_radius": float(np.degrees(np.arcsin(R_EARTH_KM / de))),
        "sun_dist_km": ds, "earth_dist_km": de,
    }


def sun_earth_azel(lat: float, lon: float, h_m: float, utc: str) -> dict:
    """Direct SPICE, topocentric observer. Angles in degrees.

    Aberration handling: the observer is not the Moon's centre, so we use spkcpo
    ("constant position observer"): the site is a fixed point in MOON_ME attached to the
    Moon, and SPICE derives its solar-system-barycentric state (Moon orbital motion plus
    rotation) at the observation epoch. With abcorr = "LT+S" this gives
      - light time measured to the site, not to the Moon's centre (target is taken at
        t - lt as seen from the site), and
      - stellar aberration computed from the site's own barycentric velocity.
    The output frame is MOON_ME evaluated at the observation epoch (refloc = "OBSERVER"),
    because the local East/North/Up triad is defined in the observer's frame at the time of
    observation, not at the light-time-retarded epoch.

    In practice the difference from "Moon-centre LT+S vector minus site vector" is tiny
    (site velocity relative to the Moon's centre <= 4.6 m/s -> 0.003 arcsec of aberration;
    light-time difference <= 6 ms), but the topocentric form is the correct one and is what
    Horizons does for a surface site, so the reference uses it and the approximation is
    measured rather than assumed. Not modelled here: relativistic light deflection
    (Horizons includes it; < 0.01 arcsec except within a few degrees of the Sun's limb).
    """
    load_kernels()
    et = utc_to_et(utc)
    site = site_vector_km(lat, lon, h_m)
    vecs = []
    for target in ("SUN", "EARTH"):
        state, _lt = spice.spkcpo(target, et, FRAME, "OBSERVER", ABCORR, site, "MOON", FRAME)
        vecs.append(np.asarray(state[:3]))
    return _pack(vecs[0], vecs[1], lat, lon)


@lru_cache(maxsize=1)
def load_ephem():
    """Load ephem.json + ephem.bin -> (meta, float32 array [count, 8], t0 as POSIX seconds)."""
    meta = json.loads((OUT_DIR / "ephem.json").read_text())
    data = np.frombuffer((OUT_DIR / "ephem.bin").read_bytes(), dtype="<f4").reshape(-1, len(meta["record"]))
    t0 = datetime.fromisoformat(meta["t0_utc"].replace("Z", "+00:00")).timestamp()
    return meta, data, t0


def _utc_posix(utc: str) -> float:
    dt = datetime.fromisoformat(utc.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.timestamp()


def sun_earth_azel_web(lat: float, lon: float, h_m: float, utc: str) -> dict:
    """The web app's method, reproduced exactly (no SPICE at run time).

    Linear interpolation of each of the 8 Float32 fields between the two bracketing hourly
    records (the interpolated unit vector is NOT renormalised before use, matching
    `v = dist * unit - site_position_km`), then normalise v. Seconds since t0 are plain UTC
    (POSIX) seconds, as JavaScript's Date gives.
    """
    meta, data, t0 = load_ephem()
    x = (_utc_posix(utc) - t0) / meta["step_s"]
    if not 0 <= x <= meta["count"] - 1:
        raise ValueError(f"{utc} outside ephemeris coverage")
    i = min(int(np.floor(x)), meta["count"] - 2)
    f = x - i
    rec = data[i].astype(np.float64) * (1.0 - f) + data[i + 1].astype(np.float64) * f
    site = site_vector_km(lat, lon, h_m)
    sun_v = rec[3] * rec[0:3] - site
    earth_v = rec[7] * rec[4:7] - site
    return _pack(sun_v, earth_v, lat, lon)


if __name__ == "__main__":
    import sys
    lat, lon, h_m, utc = float(sys.argv[1]), float(sys.argv[2]), float(sys.argv[3]), sys.argv[4]
    print("spice:", json.dumps(sun_earth_azel(lat, lon, h_m, utc), indent=1))
    print("web  :", json.dumps(sun_earth_azel_web(lat, lon, h_m, utc), indent=1))
