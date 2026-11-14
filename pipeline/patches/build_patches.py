"""Build the site terrain patches (docs/DATA_CONTRACT.md, "Site terrain patches").

For every mission in web/public/data/missions.json that is not inside the south-pole fine
tile L1, write an 80 m, 768 x 768 elevation patch in the "site stereographic" projection
centred on the site: web/public/data/patches/<id>.png and patches.json. A mission within
SHARE_KM of an already-chosen patch centre (missions.json order) shares that patch.

Sources (all NASA / LOLA team; heights are metres above the 1737.4 km sphere):
  |lat| < 60      SLDEM2015 512 px/deg float tiles (LOLA + Kaguya TC), PDS LOLA node,
                  linked from NASA GSFC PGDA product 54.
  |lat| >= 60     LOLA GDR polar stereographic LDEM_60S_60M / LDEM_60N_60M (PDS LOLA node).
  centre <= 80S   local data/raw/lola/LDEM_80S_80MPP_ADJ.TIF wherever it has data, the
                  LOLA GDR above elsewhere.
Anything not covered is nodata (raw 0). Heights are never invented and the 2.7 km
whole-Moon map is never used as a fill.

The remote files are raw binary rasters. Only the rows/columns a patch needs are fetched
(HTTP range requests) and cached under data/raw/patches/windows/ as .npy.

Each output pixel is resampled bilinearly from the source at the pixel centre: pixel ->
(x, y) -> body-fixed direction (inverse formula) -> lat/lon -> source.

Run:  .venv/bin/python pipeline/patches/build_patches.py [id ...]
"""
from __future__ import annotations

import json
import math
import re
import sys
import time
from pathlib import Path

import numpy as np

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "pipeline" / "terrain"))
import build_tiles as bt  # noqa: E402

R_M = 1737400.0
SIZE = 768
PIXEL_M = 80.0
HALF_M = SIZE * PIXEL_M / 2.0          # 30720
SHARE_KM = 15.0
L1_HALF_M = 163840.0

MISSIONS = REPO / "web" / "public" / "data" / "missions.json"
OUT = REPO / "web" / "public" / "data" / "patches"
CACHE = REPO / "data" / "raw" / "patches" / "windows"
TIF_80S = REPO / "data" / "raw" / "lola" / "LDEM_80S_80MPP_ADJ.TIF"

PDS = "https://imbrium.mit.edu/DATA"
SLDEM_URL = PDS + "/SLDEM2015/TILES/FLOAT_IMG/SLDEM2015_512_{lat}_{lon}_FLOAT.IMG"
POLAR_URL = {"S": PDS + "/LOLA_GDR/POLAR/IMG/LDEM_60S_60M.IMG",
             "N": PDS + "/LOLA_GDR/POLAR/IMG/LDEM_60N_60M.IMG"}
TIF_80S_URL = "https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_80S_80MPP_ADJ.TIF"
SRC_TEXT = {
    "sldem": "SLDEM2015 512 px/deg (LOLA + Kaguya TC; NASA GSFC PGDA product 54, files on the "
             "PDS LOLA node): ",
    "polar": "LOLA GDR polar 60 m (PDS LOLA node): ",
    "tif80": "LOLA south pole 80 m, NASA GSFC PGDA product 78 (local copy): ",
}


# --------------------------------------------------------------------------
# geometry
# --------------------------------------------------------------------------
def unit(lat_deg, lon_deg):
    """Body-fixed unit vector(s) of planetocentric lat/lon (degrees, east-positive)."""
    lat = np.radians(lat_deg)
    lon = np.radians(lon_deg)
    return np.stack([np.cos(lat) * np.cos(lon), np.cos(lat) * np.sin(lon), np.sin(lat)], axis=-1)


def frame(lat0_deg, lon0_deg):
    """(E, N, U) unit vectors at the patch centre (same formulas as the contract's local frame)."""
    lat = math.radians(lat0_deg)
    lon = math.radians(lon0_deg)
    sl, cl, so, co = math.sin(lat), math.cos(lat), math.sin(lon), math.cos(lon)
    return (np.array([-so, co, 0.0]), np.array([-sl * co, -sl * so, cl]),
            np.array([cl * co, cl * so, sl]))


def site_forward(d, fr, radius=R_M):
    """Unit vector(s) d (..., 3) -> (x, y) metres. NaN where d.U <= -1 (the antipode)."""
    e, n, u = fr
    den = 1.0 + d @ u
    with np.errstate(divide="ignore", invalid="ignore"):
        return 2.0 * radius * (d @ e) / den, 2.0 * radius * (d @ n) / den


def site_inverse(x, y, fr, radius=R_M):
    """(x, y) metres -> unit vector(s) (..., 3)."""
    e, n, u = fr
    x = np.asarray(x, dtype=np.float64)
    y = np.asarray(y, dtype=np.float64)
    rho2 = (x * x + y * y) / (4.0 * radius * radius)
    k = 1.0 / (1.0 + rho2)
    return (e * ((x / radius) * k)[..., None] + n * ((y / radius) * k)[..., None]
            + u * ((1.0 - rho2) * k)[..., None])


def unit_to_latlon(d):
    """Unit vector(s) -> (lat_deg, lon_deg in (-180, 180])."""
    return (np.degrees(np.arcsin(np.clip(d[..., 2], -1.0, 1.0))),
            np.degrees(np.arctan2(d[..., 1], d[..., 0])))


def pixel_centres():
    """(x, y) metres of every pixel centre; row 0 = maximum y, column 0 = minimum x."""
    c = -HALF_M + (np.arange(SIZE) + 0.5) * PIXEL_M
    return np.meshgrid(c, -c)


def pixel_of(x, y):
    """Fractional (col, row) of patch coordinates, pixel-centre registered."""
    return (x + HALF_M) / PIXEL_M - 0.5, (HALF_M - y) / PIXEL_M - 0.5


def great_circle_km(lat1, lon1, lat2, lon2):
    c = float(np.clip(unit(lat1, lon1) @ unit(lat2, lon2), -1.0, 1.0))
    return math.acos(c) * R_M / 1000.0


def in_l1(lat, lon):
    """Inside the south-pole fine tile L1 (south polar stereographic |x|, |y| <= 163.84 km)."""
    if lat >= 0:
        return False
    r = 2.0 * R_M * math.tan(math.radians(90.0 + lat) / 2.0)
    x, y = r * math.sin(math.radians(lon)), r * math.cos(math.radians(lon))
    return abs(x) <= L1_HALF_M and abs(y) <= L1_HALF_M


def choose_patches(missions):
    """[{id, lat, lon, sites}] in missions.json order; see module docstring."""
    patches = []
    for m in missions:
        if in_l1(m["lat"], m["lon"]):
            continue
        for p in patches:
            if great_circle_km(m["lat"], m["lon"], p["lat"], p["lon"]) <= SHARE_KM:
                p["sites"].append(m["id"])
                break
        else:
            patches.append({"id": m["id"], "lat": m["lat"], "lon": m["lon"], "sites": [m["id"]]})
    return patches


# --------------------------------------------------------------------------
# remote raw rasters, read by window
# --------------------------------------------------------------------------
_session = None
stats = {"requests": 0, "bytes": 0}


def _http_ranges(url, ranges):
    """Bytes of each (start, end_inclusive) range of a remote file, in order."""
    global _session
    import requests

    if _session is None:
        _session = requests.Session()
        _session.headers["User-Agent"] = "python-requests (lunar terrain patch builder)"
    out = []
    for i in range(0, len(ranges), 150):
        chunk = ranges[i:i + 150]
        spec = "bytes=" + ",".join(f"{a}-{b}" for a, b in chunk)
        for attempt in range(4):
            try:
                r = _session.get(url, headers={"Range": spec}, timeout=120, stream=True)
                if r.status_code != 206:
                    r.close()
                    raise RuntimeError(f"{url}: HTTP {r.status_code}, range request not honoured")
                body = r.content
                break
            except RuntimeError:
                raise
            except Exception as exc:  # network trouble: retry
                if attempt == 3:
                    raise
                print(f"   retry after {type(exc).__name__}", flush=True)
                time.sleep(3 * (attempt + 1))
        stats["requests"] += 1
        stats["bytes"] += len(body)
        ctype = r.headers.get("Content-Type", "")
        if len(chunk) == 1 or not ctype.startswith("multipart/byteranges"):
            if len(chunk) != 1:
                raise RuntimeError("server merged a multi-range request")
            parts = [body]
        else:
            parts = _split_multipart(body, chunk)
        for (a, b), part in zip(chunk, parts):
            if len(part) != b - a + 1:
                raise RuntimeError("short range read")
        out.extend(parts)
    return out


def _split_multipart(body, chunk):
    parts, pos = [], 0
    for a, b in chunk:
        end = body.index(b"\r\n\r\n", pos)
        head = body[pos:end].decode("latin-1")
        m = re.search(r"Content-Range:\s*bytes\s+(\d+)-(\d+)/", head, re.I)
        if not m or (int(m.group(1)), int(m.group(2))) != (a, b):
            raise RuntimeError(f"unexpected multipart section: {head!r}")
        start = end + 4
        parts.append(body[start:start + (b - a + 1)])
        pos = start + (b - a + 1)
    return parts


class RemoteRaw:
    """A headerless raster on an HTTP server: width x height samples of `dtype`, row-major."""

    def __init__(self, url, width, height, dtype):
        self.url, self.width, self.height, self.dtype = url, width, height, np.dtype(dtype)

    def window(self, r0, r1, c0, c1):
        """Rows r0..r1-1, columns c0..c1-1 as an array (cached on disk)."""
        assert 0 <= r0 < r1 <= self.height and 0 <= c0 < c1 <= self.width
        name = f"{Path(self.url).stem}_r{r0}-{r1}_c{c0}-{c1}.npy"
        path = CACHE / name
        if path.exists():
            return np.load(path, allow_pickle=False)
        nb = self.dtype.itemsize
        ranges = [((r * self.width + c0) * nb, (r * self.width + c1) * nb - 1) for r in range(r0, r1)]
        t = time.time()
        rows = _http_ranges(self.url, ranges)
        a = np.frombuffer(b"".join(rows), dtype=self.dtype).reshape(r1 - r0, c1 - c0)
        CACHE.mkdir(parents=True, exist_ok=True)
        np.save(path, a, allow_pickle=False)
        print(f"   fetched {name}: {a.nbytes / 1e6:.1f} MB in {time.time() - t:.0f} s", flush=True)
        return a


def bilinear(a, fx, fy):
    """Bilinear sample of a (rows, cols) at fractional (col fx, row fy); NaN outside or
    where any of the four pixels is NaN."""
    hh, ww = a.shape
    ok = (fx >= 0) & (fy >= 0) & (fx <= ww - 1) & (fy <= hh - 1)
    fxc = np.where(ok, fx, 0.0)
    fyc = np.where(ok, fy, 0.0)
    j0 = np.minimum(np.floor(fxc).astype(np.int64), ww - 2)
    i0 = np.minimum(np.floor(fyc).astype(np.int64), hh - 2)
    tx, ty = fxc - j0, fyc - i0
    h00, h01 = a[i0, j0].astype(np.float64), a[i0, j0 + 1].astype(np.float64)
    h10, h11 = a[i0 + 1, j0].astype(np.float64), a[i0 + 1, j0 + 1].astype(np.float64)
    top = h00 + (h01 - h00) * tx
    bot = h10 + (h11 - h10) * tx
    return np.where(ok, top + (bot - top) * ty, np.nan)


# --------------------------------------------------------------------------
# SLDEM2015 (|lat| < 60), treated as one 184320 x 61440 global grid
# --------------------------------------------------------------------------
PPD = 512
SL_W, SL_H = 360 * PPD, 120 * PPD
SL_TW, SL_TH = 45 * PPD, 30 * PPD
SL_LAT_BANDS = ["30N_60N", "00N_30N", "30S_00S", "60S_30S"]


def sldem_url(tile_row, tile_col):
    return SLDEM_URL.format(lat=SL_LAT_BANDS[tile_row],
                            lon=f"{tile_col * 45:03d}_{tile_col * 45 + 45:03d}")


def sample_sldem(lat, lon, lon0, used):
    """Heights (m) at lat/lon arrays (|lat| < 60). Global pixel (I, J) has its centre at
    lat = 60 - (I + 0.5)/512, lon = (J + 0.5)/512 (east, 0..360)."""
    lon0 = lon0 % 360.0
    lon_u = lon0 + (lon - lon0 + 180.0) % 360.0 - 180.0      # continuous around the centre
    fx = lon_u * PPD - 0.5
    fy = np.clip((60.0 - lat) * PPD - 0.5, 0.0, SL_H - 1.0)  # half-pixel clamp at +/-60
    c0, c1 = int(np.floor(fx.min())), int(np.floor(fx.max())) + 2
    r0, r1 = int(np.floor(fy.min())), min(int(np.floor(fy.max())) + 2, SL_H)
    r0 = min(r0, r1 - 2)
    win = np.empty((r1 - r0, c1 - c0), dtype=np.float32)
    for tr in range(r0 // SL_TH, (r1 - 1) // SL_TH + 1):
        a0, a1 = max(r0, tr * SL_TH), min(r1, (tr + 1) * SL_TH)
        for tcu in range(c0 // SL_TW, (c1 - 1) // SL_TW + 1):   # unwrapped tile column
            b0, b1 = max(c0, tcu * SL_TW), min(c1, (tcu + 1) * SL_TW)
            url = sldem_url(tr, tcu % 8)
            raw = RemoteRaw(url, SL_TW, SL_TH, "<f4")
            win[a0 - r0:a1 - r0, b0 - c0:b1 - c0] = raw.window(
                a0 - tr * SL_TH, a1 - tr * SL_TH, b0 - tcu * SL_TW, b1 - tcu * SL_TW)
            used.add(SRC_TEXT["sldem"] + url)
    return bilinear(win, fx - c0, fy - r0) * 1000.0           # file is in kilometres


# --------------------------------------------------------------------------
# LOLA GDR polar stereographic 60 m (60..90 N or S)
# --------------------------------------------------------------------------
PO_N, PO_PX, PO_OFF = 31040, 60.0, 15519.5


def polar_xy(lat, lon, pole):
    """LOLA polar grid coordinates. South: x = r sin(lon), y = r cos(lon). North:
    x = r sin(lon), y = -r cos(lon). r = 2R tan((90 - |lat|) / 2)."""
    r = 2.0 * R_M * np.tan(np.radians(90.0 - np.abs(lat)) / 2.0)
    lo = np.radians(lon)
    return r * np.sin(lo), (r if pole == "S" else -r) * np.cos(lo)


def sample_polar(lat, lon, pole, used):
    x, y = polar_xy(lat, lon, pole)
    fx = x / PO_PX + PO_OFF          # sample index: x = (j - 15519.5) * 60
    fy = PO_OFF - y / PO_PX          # line 0 is maximum y
    c0, c1 = max(int(np.floor(fx.min())), 0), min(int(np.floor(fx.max())) + 2, PO_N)
    r0, r1 = max(int(np.floor(fy.min())), 0), min(int(np.floor(fy.max())) + 2, PO_N)
    raw = RemoteRaw(POLAR_URL[pole], PO_N, PO_N, "<i2")
    win = raw.window(r0, r1, c0, c1).astype(np.float32)
    win[win == -32768] = np.nan
    used.add(SRC_TEXT["polar"] + POLAR_URL[pole])
    return bilinear(win, fx - c0, fy - r0) * 0.5              # DN * 0.5 = metres


# --------------------------------------------------------------------------
# local 80 m south-pole GeoTIFF
# --------------------------------------------------------------------------
def sample_tif80(lat, lon, used):
    import horizon as hz

    g = hz.load_geotiff_grid(TIF_80S)
    x, y = polar_xy(lat, lon, "S")
    h = bilinear(g.data, (x - g.x_min) / g.pixel_m - 0.5, (g.y_max - y) / g.pixel_m - 0.5)
    if np.isfinite(h).any():
        used.add(SRC_TEXT["tif80"] + TIF_80S_URL)
    return h


# --------------------------------------------------------------------------
# one patch
# --------------------------------------------------------------------------
def build_patch(lat0, lon0):
    """(height float64 (768, 768) with NaN = nodata, sorted list of source strings)."""
    x, y = pixel_centres()
    lat, lon = unit_to_latlon(site_inverse(x, y, frame(lat0, lon0)))
    h = np.full(lat.shape, np.nan)
    used: set[str] = set()
    if lat0 <= -80.0:
        h = sample_tif80(lat, lon, used)
    for pole, sel in (("S", lat <= -60.0), ("N", lat >= 60.0)):
        todo = sel & np.isnan(h)
        if todo.any():
            h[todo] = sample_polar(lat[todo], lon[todo], pole, used)
    todo = (np.abs(lat) < 60.0) & np.isnan(h)
    if todo.any():
        h[todo] = sample_sldem(lat[todo], lon[todo], lon0, used)
    return h, sorted(used)


def load_patch_png(path):
    """Decoded patch heights (float32, NaN = nodata)."""
    return bt.decode_height_png(path)


def main(only=None):
    missions = json.loads(MISSIONS.read_text())
    patches = choose_patches(missions)
    OUT.mkdir(parents=True, exist_ok=True)
    meta_path = OUT / "patches.json"
    old, other_kinds = {}, []
    if meta_path.exists():
        old = {p["id"]: p for p in json.loads(meta_path.read_text())["patches"]}
        # entries of another kind (20 m crest patches, build_crest_patches.py) are kept as they are
        other_kinds = [p for p in old.values() if "kind" in p]
    entries, failed = [], []
    for p in patches:
        if only and p["id"] not in only:
            if p["id"] in old:
                entries.append(old[p["id"]])
            continue
        print(f"{p['id']}  ({p['lat']}, {p['lon']})  sites {p['sites']}", flush=True)
        try:
            h, src = build_patch(p["lat"], p["lon"])
        except Exception as exc:
            print(f"   FAILED: {type(exc).__name__}: {exc}", flush=True)
            failed.append((p["id"], f"{type(exc).__name__}: {exc}"))
            continue
        file = f"{p['id']}.png"
        bt.write_png(OUT / file, bt.encode_height(h))
        dec = load_patch_png(OUT / file)
        entries.append({
            "id": p["id"], "lat": p["lat"], "lon": p["lon"], "file": file, "sites": p["sites"],
            "source": "; ".join(src),
            "nodata_fraction": round(float(np.isnan(dec).mean()), 6),
            "min_m": float(np.nanmin(dec)) if np.isfinite(dec).any() else None,
            "max_m": float(np.nanmax(dec)) if np.isfinite(dec).any() else None,
        })
        print(f"   {(OUT / file).stat().st_size} bytes, nodata {entries[-1]['nodata_fraction']}, "
              f"{entries[-1]['min_m']} .. {entries[-1]['max_m']} m", flush=True)
    order = {p["id"]: i for i, p in enumerate(patches)}
    entries.sort(key=lambda e: order[e["id"]])
    meta = {"radius_m": 1737400, "size": SIZE, "pixel_m": int(PIXEL_M), "patches": entries + other_kinds}
    meta_path.write_text(json.dumps(meta, indent=1) + "\n")
    total = sum((OUT / e["file"]).stat().st_size for e in entries)
    print(f"{len(entries)} patches, {total} bytes of PNG; {stats['requests']} requests, "
          f"{stats['bytes'] / 1e6:.1f} MB downloaded this run")
    for pid, why in failed:
        print(f"NOT BUILT {pid}: {why}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(set(sys.argv[1:]) or None))
