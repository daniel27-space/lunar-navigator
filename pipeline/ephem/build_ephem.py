"""Build web/public/data/ephem/ephem.json + ephem.bin (see docs/DATA_CONTRACT.md).

Sun and Earth as seen from the Moon's centre, hourly, 2024-01-01T00:00Z .. 2036-01-01T00:00Z
inclusive, in MOON_ME, aberration correction LT+S. Each record is 8 little-endian Float32:
unit vector + centre-to-centre distance (km) for the Sun, then the same for the Earth.

Usage: .venv/bin/python pipeline/ephem/build_ephem.py
"""
from __future__ import annotations

import json

import numpy as np
import spiceypy as spice

from common import (ABCORR, FRAME, KERNELS, OUT_DIR, RECORD, STEP_S, T0_UTC, T1_UTC,
                    load_kernels, utc_to_et)


def build() -> tuple[dict, np.ndarray]:
    load_kernels()
    et0, et1 = utc_to_et(T0_UTC), utc_to_et(T1_UTC)
    span = et1 - et0
    # UTC and TDB seconds advance together as long as no leap second falls inside the span.
    # naif0012.tls has none after 2017-01-01; if a newer LSK adds one this assertion trips
    # instead of silently shifting the grid. (TDB-UTC also has a ~1.7 ms periodic term, hence
    # the tolerance.)
    if abs(span - round(span / STEP_S) * STEP_S) > 0.01:
        raise RuntimeError(f"UTC span {span} s is not a whole number of steps; leap second in range?")
    count = int(round(span / STEP_S)) + 1

    data = np.empty((count, 8), dtype=np.float64)
    tai0 = spice.unitim(et0, "TDB", "TAI")
    for i in range(count):
        # Step in TAI (constant offset from UTC inside the span, asserted above) and convert
        # each tick to TDB, so the ~1.7 ms periodic TDB-TAI term is honoured.
        et = spice.unitim(tai0 + i * STEP_S, "TAI", "TDB")
        sun, _ = spice.spkpos("SUN", et, FRAME, ABCORR, "MOON")
        earth, _ = spice.spkpos("EARTH", et, FRAME, ABCORR, "MOON")
        ds, de = np.linalg.norm(sun), np.linalg.norm(earth)
        data[i, 0:3] = np.asarray(sun) / ds
        data[i, 3] = ds
        data[i, 4:7] = np.asarray(earth) / de
        data[i, 7] = de

    meta = {
        "t0_utc": T0_UTC,
        "step_s": STEP_S,
        "count": count,
        "frame": FRAME,
        "abcorr": ABCORR,
        "kernels": KERNELS,
        "record": RECORD,
    }
    return meta, data.astype("<f4")


def main() -> None:
    meta, data = build()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "ephem.bin").write_bytes(data.tobytes())
    (OUT_DIR / "ephem.json").write_text(json.dumps(meta, indent=2) + "\n")
    print(f"wrote {meta['count']} records ({data.nbytes} bytes) to {OUT_DIR}")


if __name__ == "__main__":
    main()
