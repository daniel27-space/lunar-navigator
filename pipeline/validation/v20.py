"""20 m terrain helpers for the follow-up studies F and G (pipeline/validation/).

The 20 m LOLA DEM (data/raw/lola/LDEM_80S_20MPP_ADJ.TIF, 30400 x 30400 float32, metres, nodata NaN,
same south polar stereographic grid as the 80 m file: both span +/-304 km, pixel-area registered) is
never loaded whole. A square window around the observer is read with rasterio and handed to
horizon.horizon() as the `hi` grid; the 80 m GeoTIFF is the `lo` grid. The unchanged kernel samples
`hi` first and falls back to `lo` where `hi` has no data, so the terrain is "20 m within the window,
80 m beyond". The window is a square in map coordinates with half-width `radius_m` (so 20 m data reach
at least radius_m in every direction, up to 1.41 x radius_m toward the corners).

`radius_m = 0` means 80 m terrain only (identical to vlib.horizon_at(..., source="tif")).
"""
from __future__ import annotations

import math

import numpy as np
from numba import njit

import vlib as v

hz = v.hz
_win_cache: dict = {}


def tif20_info():
    import rasterio
    with rasterio.open(v.TIF_20M) as ds:
        t = ds.transform
        return {"width": ds.width, "height": ds.height, "dtype": ds.dtypes[0], "nodata": repr(ds.nodata),
                "pixel_m": t.a, "x_min": t.c, "y_max": t.f, "units": ds.units[0], "crs": ds.crs.to_wkt()[:60]}


def window20(xc: float, yc: float, radius_m: float) -> "hz.Grid":
    """20 m DEM window (Grid) covering at least +/-radius_m around map point (xc, yc)."""
    import rasterio
    from rasterio.windows import Window
    key = (round(xc), round(yc), round(radius_m))
    if key in _win_cache:
        return _win_cache[key]
    with rasterio.open(v.TIF_20M) as ds:
        t = ds.transform
        assert abs(t.a + t.e) < 1e-9 and t.b == 0 and t.d == 0 and t.a == 20.0
        assert ds.nodata is not None and np.isnan(ds.nodata) and ds.dtypes[0] == "float32"
        px = t.a
        c0 = max(0, int(math.floor((xc - radius_m - t.c) / px)) - 1)
        c1 = min(ds.width, int(math.ceil((xc + radius_m - t.c) / px)) + 1)
        r0 = max(0, int(math.floor((t.f - (yc + radius_m)) / px)) - 1)
        r1 = min(ds.height, int(math.ceil((t.f - (yc - radius_m)) / px)) + 1)
        a = ds.read(1, window=Window(c0, r0, c1 - c0, r1 - r0))
    g = hz.Grid(a, t.c + c0 * px, t.f - r0 * px, px)
    if len(_win_cache) > 6:
        _win_cache.pop(next(iter(_win_cache)))
    _win_cache[key] = g
    return g


def horizon_mixed(lat, lon, obs_h, radius_m, centre_xy=None, az_step=v.AZ_STEP, **kw):
    """(elev_deg, h0_m, dist_m). 20 m DEM within radius_m of centre_xy (default: the observer), 80 m beyond.

    obs_h is metres above the DEM surface sampled at the observer (20 m DEM if radius_m > 0)."""
    lo = v.grid_80m()
    if radius_m <= 0:
        e, d, h0 = hz.horizon(lo, lat, lon, obs_h, az_step, return_details=True, **kw)
    else:
        if centre_xy is None:
            x, y = hz.latlon_to_xy(lat, lon)
            centre_xy = (float(x), float(y))
        hi = window20(centre_xy[0], centre_xy[1], radius_m)
        e, d, h0 = hz.horizon(lo, lat, lon, obs_h, az_step, hi=hi, return_details=True, **kw)
    return e, float(h0), d


def smoothed_height(grid: "hz.Grid", x: float, y: float, radius_m: float, step_m: float = 5.0) -> float:
    """Mean DEM height over a disc of radius_m around (x, y) (bilinear samples every step_m)."""
    n = int(radius_m // step_m)
    tot, cnt = 0.0, 0
    for i in range(-n, n + 1):
        for j in range(-n, n + 1):
            if (i * i + j * j) * step_m * step_m <= radius_m * radius_m:
                tot += grid.sample(x + i * step_m, y + j * step_m)
                cnt += 1
    return tot / cnt


@njit(cache=True)
def limb_nearest(az, el, rad, hor, az_step, out):
    """out[i] = 1 if the Sun's upper limb is above the horizon value stored at the nearest azimuth
    (no interpolation, flat horizon across the disc): the simplest reading of a per-azimuth horizon file."""
    n = hor.shape[0]
    for i in range(az.shape[0]):
        k = int(math.floor(az[i] / az_step + 0.5)) % n
        out[i] = 1.0 if el[i] + rad[i] > hor[k] else 0.0


def runs(mask: np.ndarray):
    """(start index, length) of every run of True."""
    m = np.concatenate(([0], mask.astype(np.int8), [0]))
    d = np.diff(m)
    s = np.flatnonzero(d == 1)
    e = np.flatnonzero(d == -1)
    return s, e - s


def sun_stats(lat, lon, h0, obs_h, hor, sun_km, step_h=1.0, az_step=v.AZ_STEP):
    """Sun statistics for one horizon. Returns (dict, series dict)."""
    s = v.site_series(lat, lon, obs_h, sun_km, None, hor=hor, h0=h0, az_step=az_step)
    f = s["sun"]
    out = {
        "in_light": float((f > 0).mean()),
        "avg_illum": float(f.mean()),
        "longest_dark_d": v.longest_run(f <= 0) * step_h / 24.0,
        "longest_light_d": v.longest_run(f > 0) * step_h / 24.0,
    }
    return out, s
