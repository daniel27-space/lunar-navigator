"""Shared helpers for the validation studies (pipeline/validation/).

Imports the existing pipeline modules unchanged:
  pipeline/terrain/horizon.py  -> terrain horizon (80 m GeoTIFF or web tiles)
  pipeline/ephem/common.py     -> kernels, frame, radii, ENU convention

Sun/Earth directions: Moon-centre MOON_ME vectors with LT+S (exactly what
build_ephem.py stores, but in float64 and at any step), then the topocentric
correction v = body - site. topo.sun_earth_azel (spkcpo) is the reference this is
tested against in test_validation.py.

Disc model: the disc is cut into N_STRIP vertical strips; each strip compares its
top and bottom with the terrain horizon linearly interpolated at the strip's
azimuth. disc fraction = visible area / disc area. "any part visible" = fraction > 0.
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import numpy as np
from numba import njit

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
sys.path.insert(0, str(REPO / "pipeline" / "terrain"))
sys.path.insert(0, str(REPO / "pipeline" / "ephem"))

import horizon as hz  # noqa: E402
import common as ec  # noqa: E402  (pipeline/ephem/common.py)
import spiceypy as spice  # noqa: E402

R_M = hz.R_MOON_M
LAYER_DIR = REPO / "data" / "raw" / "layers"
OUT_DIR = HERE / "results"
CACHE_DIR = HERE / "_cache"
TIF_20M = REPO / "data" / "raw" / "lola" / "LDEM_80S_20MPP_ADJ.TIF"
TIF_20M_BYTES = 2696082051
N_STRIP = 24
AZ_STEP = 0.5
T0_CYCLE = "2024-01-01T00:00:00Z"
HOURS_CYCLE = int(round(18.6 * 365.25 * 24))  # one nodal precession cycle

# Named features: coordinates as used in docs/research/layers-build.md spot checks.
NAMED = [
    ("Shackleton rim", -89.78, 204.3, "ridge"),
    ("Connecting ridge", -89.45, 222.7, "ridge"),
    ("de Gerlache rim", -88.67, 291.8, "ridge"),
    ("Malapert massif", -85.964, 357.681, "ridge"),
    ("Shackleton floor", -89.67, 129.2, "floor"),
    ("Haworth floor", -87.45, 355.0, "floor"),
    ("Shoemaker floor", -88.1, 45.0, "floor"),
    ("Faustini floor", -87.2, 84.0, "floor"),
]


def tif20_complete() -> bool:
    return TIF_20M.exists() and TIF_20M.stat().st_size == TIF_20M_BYTES


# ------------------------------------------------------------------ ephemeris
def ephem_table(t0_utc: str, count: int, step_s: float):
    """Moon-centre Sun and Earth vectors (km, MOON_ME, LT+S). Cached on disk."""
    CACHE_DIR.mkdir(exist_ok=True)
    key = f"{t0_utc.replace(':', '')}_{count}_{int(step_s)}.npz"
    f = CACHE_DIR / key
    if f.exists():
        d = np.load(f)
        return d["et"], d["sun"], d["earth"]
    ec.load_kernels()
    et0 = ec.utc_to_et(t0_utc)
    et = et0 + np.arange(count) * float(step_s)
    sun = np.empty((count, 3))
    earth = np.empty((count, 3))
    for i, t in enumerate(et):
        sun[i] = spice.spkpos("SUN", t, ec.FRAME, ec.ABCORR, "MOON")[0]
        earth[i] = spice.spkpos("EARTH", t, ec.FRAME, ec.ABCORR, "MOON")[0]
    np.savez(f, et=et, sun=sun, earth=earth)
    return et, sun, earth


def et_to_utc(et: float) -> str:
    ec.load_kernels()
    return spice.et2utc(float(et), "ISOC", 0) + "Z"


def azel_rad(body_km: np.ndarray, lat: float, lon: float, h_m: float, r_body_km: float):
    """Vectorised az, el, angular radius (deg) of a body from a site. h_m above the sphere."""
    site = ec.site_vector_km(lat, lon, h_m)
    east, north, up = ec.enu_basis(lat, lon)
    v = body_km - site
    d = np.linalg.norm(v, axis=1)
    u = v / d[:, None]
    az = np.degrees(np.arctan2(u @ east, u @ north)) % 360.0
    el = np.degrees(np.arcsin(np.clip(u @ up, -1, 1)))
    rad = np.degrees(np.arcsin(r_body_km / d))
    return az, el, rad


# ------------------------------------------------------------------ disc model
@njit(cache=True)
def _hor_at(hor, az_step, a):
    n = hor.shape[0]
    x = (a % 360.0) / az_step
    i = int(math.floor(x))
    t = x - i
    i0 = i % n
    i1 = (i + 1) % n
    h0 = hor[i0]
    h1 = hor[i1]
    if np.isnan(h0):
        h0 = -90.0
    if np.isnan(h1):
        h1 = -90.0
    return h0 + (h1 - h0) * t


@njit(cache=True)
def disc_series(az, el, rad, hor, az_step, nstrip, frac, centre):
    """frac[i] = visible fraction of the disc area; centre[i] = 1 if disc centre is above the horizon."""
    for i in range(az.shape[0]):
        r = rad[i]
        ce = math.cos(math.radians(el[i]))
        tot = 0.0
        vis = 0.0
        for k in range(nstrip):
            xi = r * (-1.0 + (2.0 * k + 1.0) / nstrip)
            half = math.sqrt(r * r - xi * xi)
            h = _hor_at(hor, az_step, az[i] + xi / ce)
            f = (el[i] + half - h) / (2.0 * half)
            if f < 0.0:
                f = 0.0
            elif f > 1.0:
                f = 1.0
            tot += half
            vis += f * half
        frac[i] = vis / tot
        centre[i] = 1.0 if el[i] > _hor_at(hor, az_step, az[i]) else 0.0


def longest_run(mask: np.ndarray) -> int:
    """Length (samples) of the longest run of True."""
    if not mask.any():
        return 0
    m = np.concatenate(([0], mask.astype(np.int8), [0]))
    d = np.diff(m)
    return int((np.flatnonzero(d == -1) - np.flatnonzero(d == 1)).max())


# ------------------------------------------------------------------ terrain
def grid_80m():
    return hz.load_geotiff_grid()


def tile_grids():
    return hz.load_tile_grids()


def horizon_at(lat, lon, obs_h, source="tif", az_step=AZ_STEP):
    """(elev_deg, h0_m). source: 'tif' (80 m GeoTIFF), 'tiles' (web PNG tiles), 'tif20'."""
    if source == "tif":
        e, _d, h0 = hz.horizon(grid_80m(), lat, lon, obs_h, az_step, return_details=True)
    elif source == "tiles":
        l0, l1 = tile_grids()
        e, _d, h0 = hz.horizon(l0, lat, lon, obs_h, az_step, hi=l1, return_details=True)
    elif source == "tif20":
        if not tif20_complete():
            raise RuntimeError("20 m DEM incomplete; not used")
        e, _d, h0 = hz.horizon(hz.load_geotiff_grid(TIF_20M), lat, lon, obs_h, az_step, return_details=True)
    else:
        raise ValueError(source)
    return e, float(h0)


def site_series(lat, lon, obs_h, sun_km, earth_km, source="tif", az_step=AZ_STEP, hor=None, h0=None):
    """Disc-fraction series of Sun and Earth for one site. Returns dict of arrays."""
    if hor is None:
        hor, h0 = horizon_at(lat, lon, obs_h, source, az_step)
    out = {"h0": h0, "hor": hor}
    for name, body, rb in (("sun", sun_km, ec.R_SUN_KM), ("earth", earth_km, ec.R_EARTH_KM)):
        if body is None:
            continue
        az, el, rad = azel_rad(body, lat, lon, h0 + obs_h, rb)
        frac = np.empty(az.shape[0])
        cen = np.empty(az.shape[0])
        disc_series(az, el, rad, hor, az_step, N_STRIP, frac, cen)
        out[name] = frac
        out[name + "_centre"] = cen
        out[name + "_el"] = el
        out[name + "_az"] = az
    return out


def summarise(frac, centre, step_h=1.0):
    return {
        "avg_disc": float(frac.mean()),          # disc-fraction-weighted average
        "any": float((frac > 0).mean()),         # any part of the disc visible
        "centre": float(centre.mean()),          # point-source (disc centre) rule
        "full": float((frac >= 0.999999).mean()),
        "longest_dark_h": longest_run(frac <= 0) * step_h,
    }


# ------------------------------------------------------------------ PGDA rasters
_pg = {}


def pgda(name):
    """name in sun|earth|psr -> (physical float array, x_min, y_max, pixel)."""
    if name not in _pg:
        import rasterio
        fn = {"sun": "AVGVISIB_75S_120M_201608.TIF", "earth": "AVGVISIB_75S_120M_201608_EARTH.TIF",
              "psr": "LPSR_75S_120M_201608.TIF"}[name]
        with rasterio.open(LAYER_DIR / fn) as ds:
            raw = ds.read(1)
            t = ds.transform
            sc = ds.scales[0] if ds.scales else 1.0
            off = ds.offsets[0] if ds.offsets else 0.0
            _pg[name] = (raw.astype(np.float32) * np.float32(sc) + np.float32(off), t.c, t.f, t.a)
    return _pg[name]


def pgda_rc(x, y):
    _a, x_min, y_max, px = pgda("psr")
    return int(math.floor((y_max - y) / px)), int(math.floor((x - x_min) / px))


def pgda_centre_xy(row, col):
    _a, x_min, y_max, px = pgda("psr")
    return x_min + (col + 0.5) * px, y_max - (row + 0.5) * px


def pgda_value(name, row, col):
    return float(pgda(name)[0][row, col])


def snap_to_pgda(lat, lon):
    """Move a lat/lon to the centre of the PGDA 120 m pixel that contains it."""
    x, y = hz.latlon_to_xy(lat, lon)
    r, c = pgda_rc(float(x), float(y))
    xc, yc = pgda_centre_xy(r, c)
    la, lo = hz.xy_to_latlon(xc, yc)
    return float(la), float(lo) % 360.0, r, c


def write_json(name, obj):
    OUT_DIR.mkdir(exist_ok=True)
    (OUT_DIR / name).write_text(json.dumps(obj, indent=1))
