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

Height lookup chain (horizon_chain, added for the site terrain patches)
-----------------------------------------------------------------------
docs/DATA_CONTRACT.md "Height lookup order". For a body-fixed unit vector q the
height is the first of these that has data:
  1. the site patch in use (optional). With E0, N0, U0 the east/north/up unit
     vectors at the patch centre (lat0, lon0), same formulas as the local frame:
         c = q . U0;   if c <= 0: not covered
         x = 2R (q . E0) / (1 + c),   y = 2R (q . N0) / (1 + c)
     then the bilinear grid sample above with x_min = -30720, y_max = +30720,
     pixel = 80 (768 x 768). Outside the pixel-centre box, or any of the four
     pixels nodata: not covered.
  2. south-pole tile L1, then L0 (grid sample above). If q_z >= 0 (northern
     hemisphere or equator) the tiles are not covered and the stereographic x, y
     is not computed, so nothing divides by zero at the north pole.
  3. the whole-Moon map moon_dem_4k.png (W = 4096, H = 2048, never missing):
         lat = degrees(asin(clamp(q_z, -1, 1)));  lon = degrees(atan2(q_y, q_x))
         fx = (((lon + 180) mod 360) / 360) * W - 0.5        (mod result in [0, 360))
         fy = clamp((90 - lat) / 180 * H - 0.5, 0, H - 1)
         x0 = floor(fx);  y0 = min(floor(fy), H - 2);  wx = fx - x0;  wy = fy - y0
         a = x0 mod W;  b = (x0 + 1) mod W                   (wraps in longitude)
         h = (g[y0][a] (1-wx) + g[y0][b] wx) (1-wy) + (g[y0+1][a] (1-wx) + g[y0+1][b] wx) wy
     which is pipeline/globe/build_global_dem.py `sample`.
The march is the one above with this lookup for h0 and for every sample. Step 3
never fails, so no ray stops early: every ray uses all 2202 samples out to
299.8 km, for an observer anywhere on the Moon.
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
DEFAULT_GLOBAL_DEM = REPO / "web" / "public" / "data" / "globe" / "moon_dem_4k.png"
DEFAULT_PATCH_DIR = REPO / "web" / "public" / "data" / "patches"


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


# --------------------------------------------------------------------------
# lookup chain: site patch -> L1 -> L0 -> whole-Moon map (see module docstring)
# --------------------------------------------------------------------------
@njit(cache=True)
def _sample_global(g, qx, qy, qz):
    hgt = g.shape[0]
    wid = g.shape[1]
    if qz > 1.0:
        qz = 1.0
    elif qz < -1.0:
        qz = -1.0
    lat = math.degrees(math.asin(qz))
    lon = math.degrees(math.atan2(qy, qx))
    fx = ((lon + 180.0) % 360.0) / 360.0 * wid - 0.5
    fy = (90.0 - lat) / 180.0 * hgt - 0.5
    if fy < 0.0:
        fy = 0.0
    elif fy > hgt - 1.0:
        fy = hgt - 1.0
    x0 = int(math.floor(fx))
    y0 = int(math.floor(fy))
    if y0 > hgt - 2:
        y0 = hgt - 2
    wx = fx - x0
    wy = fy - y0
    a = x0 % wid
    b = (x0 + 1) % wid
    return ((np.float64(g[y0, a]) * (1.0 - wx) + np.float64(g[y0, b]) * wx) * (1.0 - wy)
            + (np.float64(g[y0 + 1, a]) * (1.0 - wx) + np.float64(g[y0 + 1, b]) * wx) * wy)


@njit(cache=True)
def _sample_chain(pa, pfr, p_half, p_px, use_p, l1, l1_xmin, l1_ymax, l1_px,
                  l0, l0_xmin, l0_ymax, l0_px, g, radius, qx, qy, qz):
    """Height and the level that supplied it (0 patch, 1 L1, 2 L0, 3 whole-Moon map)."""
    if use_p:
        c = qx * pfr[2, 0] + qy * pfr[2, 1] + qz * pfr[2, 2]
        if c > 0.0:
            x = 2.0 * radius * (qx * pfr[0, 0] + qy * pfr[0, 1] + qz * pfr[0, 2]) / (1.0 + c)
            y = 2.0 * radius * (qx * pfr[1, 0] + qy * pfr[1, 1] + qz * pfr[1, 2]) / (1.0 + c)
            h = _sample(pa, -p_half, p_half, p_px, x, y)
            if not np.isnan(h):
                return h, 0
    if qz < 0.0:
        x = 2.0 * radius * qy / (1.0 - qz)
        y = 2.0 * radius * qx / (1.0 - qz)
        h = _sample(l1, l1_xmin, l1_ymax, l1_px, x, y)
        if not np.isnan(h):
            return h, 1
        h = _sample(l0, l0_xmin, l0_ymax, l0_px, x, y)
        if not np.isnan(h):
            return h, 2
    return _sample_global(g, qx, qy, qz), 3


@njit(cache=True)
def _kernel_chain(pa, pfr, p_half, p_px, use_p, l1, l1_xmin, l1_ymax, l1_px,
                  l0, l0_xmin, l0_ymax, l0_px, g,
                  lat_deg, lon_deg, obs_h, az_step_deg, n_az, sched, radius,
                  out_elev, out_dist, out_level):
    lat = math.radians(lat_deg)
    lon = math.radians(lon_deg)
    sl = math.sin(lat)
    cl = math.cos(lat)
    so = math.sin(lon)
    co = math.cos(lon)
    ux, uy, uz = cl * co, cl * so, sl
    ex, ey, ez = -so, co, 0.0
    nx, ny, nz = -sl * co, -sl * so, cl

    h0, lev0 = _sample_chain(pa, pfr, p_half, p_px, use_p, l1, l1_xmin, l1_ymax, l1_px,
                             l0, l0_xmin, l0_ymax, l0_px, g, radius, ux, uy, uz)
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
        best_lev = -1
        for i in range(ns):
            qx = ux * ct[i] + dx * st[i]
            qy = uy * ct[i] + dy * st[i]
            qz = uz * ct[i] + dz * st[i]
            h, lev = _sample_chain(pa, pfr, p_half, p_px, use_p, l1, l1_xmin, l1_ymax, l1_px,
                                   l0, l0_xmin, l0_ymax, l0_px, g, radius, qx, qy, qz)
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
                best_lev = lev
        out_elev[k] = math.degrees(math.atan(best))
        out_dist[k] = best_s
        out_level[k] = best_lev
    return h0, lev0


class Patch:
    """A site terrain patch: heights (row 0 = north edge, NaN = nodata) in the site
    stereographic projection centred on (lat0, lon0). See docs/DATA_CONTRACT.md."""

    def __init__(self, data, lat0, lon0, pixel_m=80.0, patch_id=None):
        self.data = np.ascontiguousarray(data, dtype=np.float32)
        assert self.data.ndim == 2 and self.data.shape[0] == self.data.shape[1]
        self.lat0 = float(lat0)
        self.lon0 = float(lon0)
        self.pixel_m = float(pixel_m)
        self.half_m = self.data.shape[0] * self.pixel_m / 2.0
        self.id = patch_id
        lat = math.radians(self.lat0)
        lon = math.radians(self.lon0)
        sl, cl, so, co = math.sin(lat), math.cos(lat), math.sin(lon), math.cos(lon)
        self.frame = np.array([[-so, co, 0.0], [-sl * co, -sl * so, cl], [cl * co, cl * so, sl]])


def load_patch(patch_id, patch_dir=DEFAULT_PATCH_DIR) -> Patch:
    """The patch `patch_id` from patches.json (id of the patch, not of a mission it serves)."""
    key = ("patch", str(patch_dir), patch_id)
    if key not in _cache:
        from build_tiles import decode_height_png

        patch_dir = Path(patch_dir)
        meta = json.loads((patch_dir / "patches.json").read_text())
        entry = next(p for p in meta["patches"] if p["id"] == patch_id)
        h = decode_height_png(patch_dir / entry["file"])
        assert h.shape == (meta["size"], meta["size"])
        _cache[key] = Patch(h, entry["lat"], entry["lon"], meta["pixel_m"], patch_id)
    return _cache[key]


def load_global_dem(path=DEFAULT_GLOBAL_DEM) -> np.ndarray:
    """Whole-Moon map as float32 metres (H, W), row 0 north; exact (heights are multiples of 0.5)."""
    key = ("global", str(path))
    if key not in _cache:
        from PIL import Image

        with Image.open(path) as im:
            assert im.mode == "RGB", im.mode
            rgb = np.asarray(im)
        # same formula as pipeline/globe/build_global_dem.py decode_height
        h = (rgb[..., 0].astype(np.float64) * 256 + rgb[..., 1]) * 0.5 - 10000.0
        _cache[key] = np.ascontiguousarray(h, dtype=np.float32)
    return _cache[key]


_DUMMY_FRAME = np.eye(3)


def _chain_args(patch, l0, l1, g):
    if patch is None:
        p = (_DUMMY, _DUMMY_FRAME, 1.0, 1.0, False)
    else:
        p = (patch.data, patch.frame, patch.half_m, patch.pixel_m, True)
    return p + (l1.data, l1.x_min, l1.y_max, l1.pixel_m, l0.data, l0.x_min, l0.y_max, l0.pixel_m, g)


def height_chain(lat, lon, patch: Patch | None = None, tile_dir=DEFAULT_TILE_DIR,
                 global_dem=DEFAULT_GLOBAL_DEM, radius=R_MOON_M, return_level=False, grids=None):
    """Ground height (m) at lat/lon from the lookup chain; with return_level also which level
    supplied it (0 patch, 1 L1, 2 L0, 3 whole-Moon map). `grids` = (L0 Grid, L1 Grid,
    whole-Moon float32 array) replaces the files (used by the tests)."""
    l0, l1, g = grids if grids is not None else (*load_tile_grids(tile_dir), load_global_dem(global_dem))
    la, lo = math.radians(lat), math.radians(lon)
    h, lev = _sample_chain(*_chain_args(patch, l0, l1, g), float(radius),
                           math.cos(la) * math.cos(lo), math.cos(la) * math.sin(lo), math.sin(la))
    return (h, lev) if return_level else h


def horizon_chain(lat, lon, observer_height_m=2.0, az_step_deg=0.5, patch: Patch | None = None,
                  tile_dir=DEFAULT_TILE_DIR, global_dem=DEFAULT_GLOBAL_DEM,
                  max_range_m=MAX_RANGE_M, ds_min_m=DS_MIN_M, growth=GROWTH, radius=R_MOON_M,
                  return_details=False, grids=None):
    """Terrain horizon (deg) with the contract's lookup chain: optional site patch -> web tile
    L1 -> L0 -> whole-Moon map. Works for an observer anywhere on the Moon; no ray stops early.
    `grids` = (L0 Grid, L1 Grid, whole-Moon float32 array) replaces the files (used by the tests).

    Returns elev_deg, or with return_details (elev_deg, dist_m, h0, level) where dist_m is the
    arc length of the sample that sets the horizon, h0 the looked-up ground height under the
    observer and level the lookup level (0 patch, 1 L1, 2 L0, 3 whole-Moon map) of that sample.
    """
    l0, l1, g = grids if grids is not None else (*load_tile_grids(tile_dir), load_global_dem(global_dem))
    g = np.ascontiguousarray(g, dtype=np.float32)
    n_az = int(round(360.0 / az_step_deg))
    sched = step_schedule(ds_min_m, growth, max_range_m)
    elev = np.empty(n_az)
    dist = np.empty(n_az)
    level = np.empty(n_az, dtype=np.int64)
    h0, _ = _kernel_chain(*_chain_args(patch, l0, l1, g), float(lat), float(lon),
                          float(observer_height_m), float(az_step_deg), n_az, sched, float(radius),
                          elev, dist, level)
    if return_details:
        return elev, dist, h0, level
    return elev
