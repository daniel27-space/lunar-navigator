"""Spot-check the built layer PNGs against the source GeoTIFFs at known places.

Run:  .venv/bin/python pipeline/layers/verify_layers.py
For each point prints: decoded PNG value, source value at the nearest 120 m pixel, and the
mean of the source over the footprint of the output pixel (what the PNG should equal).
"""
from __future__ import annotations

import json

import numpy as np
import rasterio
from PIL import Image

from build_layers import (EARTH_FILE, OUT, PSR_FILE, RAW, SUN_FILE, decode_fraction,
                          latlon_to_pixel, latlon_to_xy)

# name, lat, lon(E), expectation (from general knowledge of the region, not from these files)
POINTS = [
    ("Shackleton floor", -89.67, 129.2, "PSR, ~0 sun"),
    ("Shackleton-de Gerlache connecting ridge", -89.45, 222.7, "high sun"),
    ("Shackleton rim (near 89.78S 204.3E)", -89.78, 204.3, "high sun"),
    ("Malapert massif summit area", -85.964, 357.681, "high Earth visibility"),
    ("86S 0E (4 km east of Malapert summit)", -86.0, 0.0, "high Earth visibility (NOT met)"),
    ("Haworth floor", -87.45, 355.0, "PSR"),
    ("Shoemaker floor", -88.1, 45.0, "PSR"),
    ("Faustini floor", -87.2, 84.0, "PSR"),
    ("Cabeus (LCROSS impact)", -84.68, 311.3, "PSR"),
    ("de Gerlache rim", -88.67, 291.8, "high sun"),
    ("Far side, 82S 180E", -82.0, 180.0, "~0 Earth visibility"),
    ("Near side, 82S 0E", -82.0, 0.0, "high Earth visibility (NOT met)"),
]


def source_values(path, x, y, extent, row, col):
    px = (extent["x_max_m"] - extent["x_min_m"]) / 2048
    x0, y1 = extent["x_min_m"] + col * px, extent["y_max_m"] - row * px
    with rasterio.open(path) as s:
        raw = s.read(1)
        phys = raw * s.scales[0] + s.offsets[0]
        r, c = s.index(x, y)
        tr = s.transform
        # source pixels whose centres fall inside the output pixel footprint
        cs = np.arange(s.width)
        rs = np.arange(s.height)
        cx = tr.c + (cs + 0.5) * tr.a
        cy = tr.f + (rs + 0.5) * tr.e
        cm = (cx >= x0) & (cx < x0 + px)
        rm = (cy <= y1) & (cy > y1 - px)
        return float(phys[r, c]), float(phys[np.ix_(rm, cm)].mean())


def main():
    meta = json.loads((OUT / "layers.json").read_text())
    extent = meta["layers"][0]["extent"]
    sun = np.asarray(Image.open(OUT / "sun_avg.png"))
    earth = np.asarray(Image.open(OUT / "earth_avg.png"))
    psr = np.asarray(Image.open(OUT / "psr.png"))
    rows = []
    print("| Place | lat, lonE | row, col | sun PNG / src nearest / src footprint mean | "
          "earth PNG / src nearest / src footprint mean | psr PNG / src nearest / src PSR area "
          "fraction | expected |")
    print("|---|---|---|---|---|---|---|")
    for name, lat, lon, exp in POINTS:
        x, y = latlon_to_xy(lat, lon)
        r, c = latlon_to_pixel(lat, lon, extent)
        s_n, s_m = source_values(RAW / SUN_FILE, x, y, extent, r, c)
        e_n, e_m = source_values(RAW / EARTH_FILE, x, y, extent, r, c)
        p_n, p_m = source_values(RAW / PSR_FILE, x, y, extent, r, c)
        sv, ev = float(decode_fraction(sun[r, c])), float(decode_fraction(earth[r, c]))
        print(f"| {name} | {lat}, {lon} | {r}, {c} | {sv:.3f} / {s_n:.3f} / {s_m:.3f} | "
              f"{ev:.3f} / {e_n:.3f} / {e_m:.3f} | {int(psr[r, c])} / {p_n:.0f} / {p_m:.2f} | "
              f"{exp} |")
        rows.append((name, sv, s_m, ev, e_m, int(psr[r, c]), p_m))
    worst_s = max(abs(a[1] - a[2]) for a in rows)
    worst_e = max(abs(a[3] - a[4]) for a in rows)
    print(f"\nmax |PNG - source footprint mean|: sun {worst_s:.4f}, earth {worst_e:.4f} "
          f"(quantisation step is 0.004; footprint here uses whole source pixels by centre, "
          f"the warp weights partial pixels, so small extra differences are expected)")

    # Whole-image consistency between the three source layers on the output grid
    sunf = decode_fraction(sun)
    is_psr = psr == 255
    print(f"PSR pixels: {is_psr.sum()} ({is_psr.mean()*100:.2f}% of tile); "
          f"sun_avg inside PSR: max {np.nanmax(sunf[is_psr]):.3f}, mean {np.nanmean(sunf[is_psr]):.4f}; "
          f"non-PSR pixels with sun_avg == 0: {(~is_psr & (sunf == 0)).sum()}")
    print(f"sun_avg: min {np.nanmin(sunf):.3f} max {np.nanmax(sunf):.3f} nodata {(sun == 255).sum()}; "
          f"earth_avg: min {earth.min()/250:.3f} max {earth[earth < 255].max()/250:.3f} "
          f"nodata {(earth == 255).sum()}")
    i = np.unravel_index(np.nanargmax(sunf), sunf.shape)
    print(f"brightest sun_avg pixel row,col={i} value {sunf[i]:.3f}")


if __name__ == "__main__":
    main()
