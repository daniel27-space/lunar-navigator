"""Reference terrain-horizon calculator for the lunar south pole DEM.

This is the Python reference that the browser (TypeScript) implementation must
reproduce. Everything needed for a port is in this docstring.

Conventions (docs/DATA_CONTRACT.md)
-----------------------------------
R = 1737400 m. lat/lon planetocentric degrees, east-positive. Heights are metres
above the R sphere. Azimuth is degrees clockwise from north (0 = N, 90 = E).

Unit vector of (lat, lon):  u = [cos(lat)cos(lon), cos(lat)sin(lon), sin(lat)]
Local frame at the observer:
    E = [-sin(lon),            cos(lon),           0       ]
    N = [-sin(lat)cos(lon),   -sin(lat)sin(lon),   cos(lat)]
    U = u(lat, lon)
South polar stereographic (true scale at the pole), from a unit vector u:
    x = 2R * u_y / (1 - u_z)        y = 2R * u_x / (1 - u_z)
which is identical to the contract's r = 2R tan((90+lat)/2), x = r sin(lon),
y = r cos(lon).

Grid sampling (bilinear, pixel-centre registered)
-------------------------------------------------
A level is an array a[row][col] with x_min, y_max, pixel (metres). Row 0 is the
top (maximum y), column 0 is minimum x. Pixel (row i, col j) has its centre at
    x = x_min + (j + 0.5) * pixel,   y = y_max - (i + 0.5) * pixel.
To sample at (x, y):
    fx = (x - x_min) / pixel - 0.5
    fy = (y_max - y) / pixel - 0.5
    if not (0 <= fx <= W-1 and 0 <= fy <= H-1): NO DATA
    j0 = min(floor(fx), W-2);  i0 = min(floor(fy), H-2)
    tx = fx - j0;  ty = fy - i0
    top = a[i0][j0]   + (a[i0][j0+1]   - a[i0][j0])   * tx
    bot = a[i0+1][j0] + (a[i0+1][j0+1] - a[i0+1][j0]) * tx
    h   = top + (bot - top) * ty
If any of the four pixels is nodata the result is NO DATA (NaN in Python).
With two levels (web tiles): sample L1 first; if that is NO DATA (outside L1's
pixel-centre box), sample L0; if that is NO DATA too, the ray has left the data.
Heights are float32 in the arrays and all arithmetic is float64 (JS numbers).

Step schedule (identical for every azimuth and every observer)
---------------------------------------------------------------
    s = 0
    repeat:  s = s + max(DS_MIN, GROWTH * s);  stop when s > MAX_RANGE;  emit s
with DS_MIN = 20 m, GROWTH = 0.002, MAX_RANGE = 300000 m. That is 20 m steps
out to 10020 m (s[0] = 20, s[499] = 10000, s[500] = 10020), then each step is
0.2 % of the current distance (s[501] = 10040.04, s[502] = 10060.12008):
2202 samples per ray, the last one s[2201] = 299820.99848604 m. s is the
great-circle arc length on the R sphere from the observer's foot point (not a
map distance).

Marching
--------
    h0 = sample(observer x, y)                 (L1 else L0 for web tiles)
    P0 = (R + h0 + observer_height_m) * U
    for k in 0 .. n_az-1  (n_az = round(360 / az_step_deg)):
        az = k * az_step_deg
        d  = N * cos(az) + E * sin(az)         (unit, tangent to the sphere)
        best = -infinity
        for each s in schedule:
            th = s / R
            u  = U * cos(th) + d * sin(th)     (point on the great circle)
            x, y = stereographic(u);  h = sample(x, y)
            if h is NO DATA: stop this ray
            Q  = (R + h) * u                   (body-fixed position of terrain)
            v  = Q - P0
            t  = (v . U) / sqrt((v . E)^2 + (v . N)^2)
            best = max(best, t)
        elev_deg[k] = degrees(atan(best))      (NaN if the ray had no sample)

So the sphere's curvature is handled exactly (3D vectors, elevation measured in
the observer's East-North-Up frame), and rays follow great circles, not straight
lines in the map. There is no refraction and no flat-earth approximation. A ray
ends at the first sample without data (edge of the DEM, i.e. about 80S on the
sides and up to ~75.9S toward the corners of the square grid) or at 300 km.

The result for a ray is the maximum over the discrete samples; nothing is
interpolated between samples and the observer's own cell is only seen through
samples at s >= 20 m.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
from numba import njit

R_MOON_M = 1737400.0
DS_MIN_M = 20.0
GROWTH = 0.002
MAX_RANGE_M = 300000.0

REPO = Path(__file__).resolve().parents[2]
DEFAULT_TIF = REPO / "data" / "raw" / "lola" / "LDEM_80S_80MPP_ADJ.TIF"
DEFAULT_TILE_DIR = REPO / "web" / "public" / "data" / "terrain"


# --------------------------------------------------------------------------
# projection helpers
# --------------------------------------------------------------------------
def latlon_to_xy(lat_deg, lon_deg, radius=R_MOON_M):
    """Contract formula: r = 2R tan((90+lat)/2), x = r sin(lon), y = r cos(lon)."""
    lat = np.radians(lat_deg)
    lon = np.radians(lon_deg)
    r = 2.0 * radius * np.tan((np.pi / 2 + lat) / 2.0)
    return r * np.sin(lon), r * np.cos(lon)


def xy_to_latlon(x, y, radius=R_MOON_M):
    """Inverse south polar stereographic. Returns (lat_deg, lon_deg in (-180, 180])."""
    r = np.hypot(x, y)
    lat = 2.0 * np.arctan(r / (2.0 * radius)) - np.pi / 2
    lon = np.arctan2(x, y)
    return np.degrees(lat), np.degrees(lon)


def step_schedule(ds_min=DS_MIN_M, growth=GROWTH, max_range=MAX_RANGE_M):
    """Arc lengths (m) at which every ray is sampled. See module docstring."""
    out = []
    s = 0.0
    while True:
        s = s + max(ds_min, growth * s)
        if s > max_range:
            break
        out.append(s)
    return np.array(out, dtype=np.float64)


# --------------------------------------------------------------------------
# numba kernel
# --------------------------------------------------------------------------
@njit(cache=True)
def _sample(a, x_min, y_max, px, x, y):
    fx = (x - x_min) / px - 0.5
    fy = (y_max - y) / px - 0.5
    hh = a.shape[0]
    ww = a.shape[1]
    if not (fx >= 0.0 and fy >= 0.0 and fx <= ww - 1 and fy <= hh - 1):
        return np.nan
    j0 = int(math.floor(fx))
    i0 = int(math.floor(fy))
    if j0 > ww - 2:
        j0 = ww - 2
    if i0 > hh - 2:
        i0 = hh - 2
    tx = fx - j0
    ty = fy - i0
    h00 = np.float64(a[i0, j0])
    h01 = np.float64(a[i0, j0 + 1])
    h10 = np.float64(a[i0 + 1, j0])
    h11 = np.float64(a[i0 + 1, j0 + 1])
    top = h00 + (h01 - h00) * tx
    bot = h10 + (h11 - h10) * tx
    return top + (bot - top) * ty


@njit(cache=True)
def _sample2(hi, hi_xmin, hi_ymax, hi_px, use_hi, lo, lo_xmin, lo_ymax, lo_px, x, y):
    if use_hi:
        h = _sample(hi, hi_xmin, hi_ymax, hi_px, x, y)
        if not np.isnan(h):
            return h
    return _sample(lo, lo_xmin, lo_ymax, lo_px, x, y)


@njit(cache=True)
def _kernel(hi, hi_xmin, hi_ymax, hi_px, use_hi, lo, lo_xmin, lo_ymax, lo_px,
            lat_deg, lon_deg, obs_h, az_step_deg, n_az, sched, radius,
            out_elev, out_dist):
    lat = math.radians(lat_deg)
    lon = math.radians(lon_deg)
    sl = math.sin(lat)
    cl = math.cos(lat)
    so = math.sin(lon)
    co = math.cos(lon)
    ux, uy, uz = cl * co, cl * so, sl
    ex, ey, ez = -so, co, 0.0
    nx, ny, nz = -sl * co, -sl * so, cl

    x0 = 2.0 * radius * uy / (1.0 - uz)
    y0 = 2.0 * radius * ux / (1.0 - uz)
    h0 = _sample2(hi, hi_xmin, hi_ymax, hi_px, use_hi, lo, lo_xmin, lo_ymax, lo_px, x0, y0)
    if np.isnan(h0):
        for k in range(n_az):
            out_elev[k] = np.nan
            out_dist[k] = np.nan
        return np.nan
    r0 = radius + h0 + obs_h
    px0, py0, pz0 = r0 * ux, r0 * uy, r0 * uz

    ns = sched.shape[0]
    ct = np.empty(ns)
    st = np.empty(ns)
    for i in range(ns):
        th = sched[i] / radius
        ct[i] = math.cos(th)
        st[i] = math.sin(th)

    for k in range(n_az):
        az = math.radians(k * az_step_deg)
        ca = math.cos(az)
        sa = math.sin(az)
        dx = nx * ca + ex * sa
        dy = ny * ca + ey * sa
        dz = nz * ca + ez * sa
        best = -np.inf
        best_s = np.nan
        for i in range(ns):
            qx = ux * ct[i] + dx * st[i]
            qy = uy * ct[i] + dy * st[i]
            qz = uz * ct[i] + dz * st[i]
            x = 2.0 * radius * qy / (1.0 - qz)
            y = 2.0 * radius * qx / (1.0 - qz)
            h = _sample2(hi, hi_xmin, hi_ymax, hi_px, use_hi, lo, lo_xmin, lo_ymax, lo_px, x, y)
            if np.isnan(h):
                break
            rq = radius + h
            vx = rq * qx - px0
            vy = rq * qy - py0
            vz = rq * qz - pz0
            up = vx * ux + vy * uy + vz * uz
            ve = vx * ex + vy * ey + vz * ez
            vn = vx * nx + vy * ny + vz * nz
            t = up / math.sqrt(ve * ve + vn * vn)
            if t > best:
                best = t
                best_s = sched[i]
        if best == -np.inf:
            out_elev[k] = np.nan
        else:
            out_elev[k] = math.degrees(math.atan(best))
        out_dist[k] = best_s
    return h0


# --------------------------------------------------------------------------
# public API
# --------------------------------------------------------------------------
class Grid:
    """A height grid in south polar stereographic metres (row 0 = max y)."""

    def __init__(self, data, x_min, y_max, pixel_m):
        self.data = np.ascontiguousarray(data, dtype=np.float32)
        self.x_min = float(x_min)
        self.y_max = float(y_max)
        self.pixel_m = float(pixel_m)

    def sample(self, x, y):
        return _sample(self.data, self.x_min, self.y_max, self.pixel_m, float(x), float(y))


_DUMMY = np.zeros((2, 2), dtype=np.float32)


def horizon(lo: Grid, lat, lon, observer_height_m=2.0, az_step_deg=0.5, hi: Grid | None = None,
            max_range_m=MAX_RANGE_M, ds_min_m=DS_MIN_M, growth=GROWTH, radius=R_MOON_M,
            return_details=False):
    """Terrain horizon elevation (deg) for azimuths k * az_step_deg, k = 0 .. n-1.

    `lo` is the grid covering everything; `hi` (optional) is a finer grid that
    is used wherever it has data. Returns elev_deg, or (elev_deg, dist_m, h0)
    with return_details, where dist_m is the arc length of the sample that sets
    the horizon on each azimuth and h0 the DEM height under the observer.
    """
    n_az = int(round(360.0 / az_step_deg))
    sched = step_schedule(ds_min_m, growth, max_range_m)
    elev = np.empty(n_az)
    dist = np.empty(n_az)
    if hi is None:
        h0 = _kernel(_DUMMY, 0.0, 0.0, 1.0, False, lo.data, lo.x_min, lo.y_max, lo.pixel_m,
                     float(lat), float(lon), float(observer_height_m), float(az_step_deg), n_az,
                     sched, float(radius), elev, dist)
    else:
        h0 = _kernel(hi.data, hi.x_min, hi.y_max, hi.pixel_m, True,
                     lo.data, lo.x_min, lo.y_max, lo.pixel_m,
                     float(lat), float(lon), float(observer_height_m), float(az_step_deg), n_az,
                     sched, float(radius), elev, dist)
    if return_details:
        return elev, dist, h0
    return elev


_cache: dict = {}


def load_geotiff_grid(path=DEFAULT_TIF) -> Grid:
    """Full-resolution source DEM as a Grid (heights converted to metres, nodata -> NaN)."""
    key = ("tif", str(path))
    if key not in _cache:
        import rasterio

        with rasterio.open(path) as ds:
            a = ds.read(1).astype(np.float32)
            t = ds.transform
            if ds.nodata is not None:
                a[a == np.float32(ds.nodata)] = np.nan
            scale = _tif_height_scale_to_m(ds)
            if scale != 1.0:
                a *= np.float32(scale)
            assert abs(t.a + t.e) < 1e-6 and t.b == 0 and t.d == 0, "expected square north-up pixels"
            _cache[key] = Grid(a, t.c, t.f, t.a)
    return _cache[key]


def _tif_height_scale_to_m(ds) -> float:
    """1.0 if the band is in metres, 1000.0 if kilometres (decided from tags/value range)."""
    units = (ds.units[0] or "").lower() if ds.units else ""
    if units in ("km", "kilometer", "kilometers", "kilometre", "kilometres"):
        return 1000.0
    return 1.0


def load_tile_grids(tile_dir=DEFAULT_TILE_DIR):
    """(L0 grid, L1 grid) decoded from the web PNG tiles via sp_meta.json."""
    key = ("tiles", str(tile_dir))
    if key not in _cache:
        from build_tiles import decode_height_png

        tile_dir = Path(tile_dir)
        meta = json.loads((tile_dir / "sp_meta.json").read_text())
        grids = []
        for lv in meta["levels"]:
            h = decode_height_png(tile_dir / lv["file"])
            grids.append(Grid(h, lv["x_min_m"], lv["y_max_m"], lv["pixel_m"]))
        _cache[key] = (grids[0], grids[1])
    return _cache[key]


def horizon_from_geotiff(lat, lon, observer_height_m=2.0, az_step_deg=0.5, path=DEFAULT_TIF, **kw):
    """Horizon from the full-resolution 80 m GeoTIFF."""
    return horizon(load_geotiff_grid(path), lat, lon, observer_height_m, az_step_deg, **kw)


def horizon_from_tiles(lat, lon, observer_height_m=2.0, az_step_deg=0.5,
                       tile_dir=DEFAULT_TILE_DIR, **kw):
    """Horizon from the web tiles (L1 where covered, else L0): what the browser can compute."""
    l0, l1 = load_tile_grids(tile_dir)
    return horizon(l0, lat, lon, observer_height_m, az_step_deg, hi=l1, **kw)
