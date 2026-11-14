"""Build the 20 m crest patches (docs/DATA_CONTRACT.md, "20 m crest patches") and the 20 m
patches at the polar landers (same format, see LANDERS).

Four 512 x 512 patches of 20 m pixels (x and y from -5120 m to +5120 m) in the site
stereographic projection, each centred on a crest near the south pole. They are appended to
web/public/data/patches/patches.json with kind "crest20"; the 80 m site patches and the
file-level fields of that file are left as they are.

Source: data/raw/lola/LDEM_80S_20MPP_ADJ.TIF (NASA GSFC PGDA product 78; 30400 x 30400 float32,
metres above the 1737.4 km sphere, nodata NaN, south polar stereographic, pixel-area registered).
Only the window a patch needs is read (rasterio), never the whole file. Each output pixel is
resampled bilinearly from the source at the pixel centre: pixel -> (x, y) -> body-fixed
direction (inverse formula) -> lat/lon -> source grid. Where any of the four source pixels has
no data the output pixel is nodata. Heights are never invented.

Encoding: h_m = (R*256 + G) * 0.1 + height_offset_m, B = 0, raw 0 = no data. The offset is a
whole number of metres, one metre below the floor of the lowest height in the patch, so the
lowest raw value is between 10 and 20 and never 0.

Run:  .venv/bin/python pipeline/patches/build_crest_patches.py              build the patches
      .venv/bin/python pipeline/patches/build_crest_patches.py --reference  write crest_reference.json
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
import build_patches as bp  # noqa: E402
import build_tiles as bt  # noqa: E402  (on sys.path through build_patches)

SIZE = 512
PIXEL_M = 20.0
HALF_M = SIZE * PIXEL_M / 2.0            # 5120
H_SCALE = 0.1
KIND = "crest20"

TIF_20M = bp.REPO / "data" / "raw" / "lola" / "LDEM_80S_20MPP_ADJ.TIF"
TIF_20M_URL = "https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_80S_20MPP_ADJ.TIF"
SOURCE = "LOLA south pole 20 m, NASA GSFC PGDA product 78 (local copy): " + TIF_20M_URL

# Glaser et al. 2014 spots on the connecting ridge (lat, east longitude), as in
# pipeline/validation/study_f_glaser20.py SPOTS (a test checks the two lists agree).
GLASER_SPOTS = [("spot 1", -89.4395, 222.8066), ("spot 2", -89.4399, 222.8524),
                ("spot 3", -89.4516, 222.7581), ("spot 4", -89.4544, 222.8445)]


def midpoint(lat1, lon1, lat2, lon2):
    """Great-circle midpoint (lat, lon in (-180, 180]), degrees."""
    d = bp.unit(lat1, lon1) + bp.unit(lat2, lon2)
    lat, lon = bp.unit_to_latlon(d / np.linalg.norm(d))
    return float(lat), float(lon)


def wrap180(lon):
    """East longitude in (-180, 180]."""
    lon = (lon + 180.0) % 360.0 - 180.0
    return 180.0 if lon == -180.0 else lon


def crest_list():
    """[{id, name, lat, lon}] with coordinates rounded as they are written to patches.json."""
    mid = midpoint(*GLASER_SPOTS[1][1:], *GLASER_SPOTS[3][1:])
    raw = [("connecting-ridge", "Shackleton-de Gerlache connecting ridge", mid[0], mid[1]),
           ("shackleton-rim", "Shackleton rim", -89.78, 204.3),
           ("de-gerlache-rim", "de Gerlache rim", -88.67, 291.8),
           ("malapert-massif", "Malapert massif", -85.964, 357.681)]
    return [{"id": i, "name": n, "lat": round(la, 6), "lon": round(wrap180(lo), 6)} for i, n, la, lo in raw]


# Polar landers: the same 20 m patch centred on a mission site (id "<mission id>-20m", name =
# the mission's display name in missions.json, sites = [mission id]). The 20 m product stops
# at 80S, so the IM-1 patch (80.13S) is only partly covered: pixels without source data stay
# nodata (raw 0).
LANDERS = [("im-2-athena", "IM-2 Athena", -84.7906, 29.1957),
           ("lcross-centaur", "LCROSS Centaur impact", -84.6796, -48.7093),
           ("griffin-1", "Griffin Mission 1 (FLIP rover)", -85.28, 53.27),
           ("im-1-odysseus", "IM-1 Odysseus", -80.13, 1.44)]


def lander_list():
    """[{id, name, lat, lon, sites}] for the polar-lander 20 m patches."""
    return [{"id": m + "-20m", "name": n, "lat": la, "lon": lo, "sites": [m]} for m, n, la, lo in LANDERS]


# --------------------------------------------------------------------------
# grid
# --------------------------------------------------------------------------
def pixel_centres(size=SIZE, pixel_m=PIXEL_M):
    """(x, y) metres of every pixel centre; row 0 = maximum y, column 0 = minimum x."""
    c = -size * pixel_m / 2.0 + (np.arange(size) + 0.5) * pixel_m
    return np.meshgrid(c, -c)


def pixel_of(x, y, size=SIZE, pixel_m=PIXEL_M):
    """Fractional (col, row) of patch coordinates, pixel-centre registered."""
    half = size * pixel_m / 2.0
    return (x + half) / pixel_m - 0.5, (half - y) / pixel_m - 0.5


# --------------------------------------------------------------------------
# encoding (contract: h_m = (R*256 + G) * scale + offset, B = 0, raw 0 = no data)
# --------------------------------------------------------------------------
def choose_offset(h_m):
    """Whole metres, one metre below the floor of the lowest height."""
    return float(math.floor(float(np.nanmin(h_m))) - 1)


def encode_height(h_m, offset_m, scale_m=H_SCALE):
    """float metres (NaN = nodata) -> uint8 (H, W, 3)."""
    code = np.rint((np.nan_to_num(h_m, nan=offset_m) - offset_m) / scale_m)
    ok = ~np.isnan(h_m)
    if ok.any() and (code[ok].min() < 1 or code[ok].max() > 65535):
        raise ValueError("height outside the encodable range")
    code = code.astype(np.uint16)
    code[~ok] = 0
    rgb = np.zeros(h_m.shape + (3,), dtype=np.uint8)
    rgb[..., 0] = code >> 8
    rgb[..., 1] = code & 0xFF
    return rgb


def decode_height(rgb, offset_m, scale_m=H_SCALE):
    """uint8 (H, W, 3) -> float32 metres, raw 0 -> NaN. The same rule as horizon.load_patch:
    raw * scale + offset in float64, then stored as float32."""
    import horizon as hz

    return hz.decode_patch_rgb(rgb, scale_m, offset_m)


def load_crest_png(path, offset_m, scale_m=H_SCALE):
    from PIL import Image

    with Image.open(path) as im:
        assert im.mode == "RGB", im.mode
        return decode_height(np.asarray(im), offset_m, scale_m)


# --------------------------------------------------------------------------
# source
# --------------------------------------------------------------------------
def sample_tif20(lat, lon, path=TIF_20M):
    """Bilinear heights (m, NaN = nodata) of the 20 m source at lat/lon arrays. Reads only the
    window the points need."""
    import rasterio
    from rasterio.windows import Window

    import horizon as hz

    x, y = bp.polar_xy(lat, lon, "S")
    with rasterio.open(path) as ds:
        t = ds.transform
        assert abs(t.a + t.e) < 1e-9 and t.b == 0 and t.d == 0, "expected square north-up pixels"
        assert ds.dtypes[0] == "float32" and ds.nodata is not None and np.isnan(ds.nodata)
        assert hz._tif_height_scale_to_m(ds) == 1.0, "expected metres"
        px = t.a
        fx = (x - t.c) / px - 0.5            # pixel-area registered: centre of column j at x_min + (j + 0.5) px
        fy = (t.f - y) / px - 0.5
        c0, c1 = max(int(np.floor(fx.min())), 0), min(int(np.floor(fx.max())) + 2, ds.width)
        r0, r1 = max(int(np.floor(fy.min())), 0), min(int(np.floor(fy.max())) + 2, ds.height)
        if c1 - c0 < 2 or r1 - r0 < 2:
            return np.full(np.shape(lat), np.nan)
        assert (c1 - c0) * (r1 - r0) <= 4000 * 4000, "window too large: read a smaller area"
        win = ds.read(1, window=Window(c0, r0, c1 - c0, r1 - r0))
    return bp.bilinear(win, fx - c0, fy - r0)


def build_crest(lat0, lon0):
    """Heights float64 (512, 512), NaN = nodata."""
    x, y = pixel_centres()
    lat, lon = bp.unit_to_latlon(bp.site_inverse(x, y, bp.frame(lat0, lon0)))
    return sample_tif20(lat, lon)


def entry_for(c, h):
    """(patches.json entry, rgb) for crest c = {id, name, lat, lon} and heights h."""
    offset = choose_offset(h)
    rgb = encode_height(h, offset)
    dec = decode_height(rgb, offset).astype(np.float64)
    return {
        "id": c["id"], "name": c["name"], "kind": KIND, "render": False,
        "lat": c["lat"], "lon": c["lon"], "file": c["id"] + ".png", "sites": list(c.get("sites", [])),
        "size": SIZE, "pixel_m": int(PIXEL_M), "height_scale_m": H_SCALE, "height_offset_m": offset,
        "source": SOURCE,
        "nodata_fraction": round(float(np.isnan(dec).mean()), 6),
        "min_m": round(float(np.nanmin(dec)), 1), "max_m": round(float(np.nanmax(dec)), 1),
    }, rgb


def main():
    meta_path = bp.OUT / "patches.json"
    meta = json.loads(meta_path.read_text())
    keep = [p for p in meta["patches"] if p.get("kind") != KIND]
    new = []
    for c in crest_list() + lander_list():
        h = build_crest(c["lat"], c["lon"])
        entry, rgb = entry_for(c, h)
        bt.write_png(bp.OUT / entry["file"], rgb)
        new.append(entry)
        print(f"{c['id']}  ({c['lat']}, {c['lon']})  {(bp.OUT / entry['file']).stat().st_size} bytes, "
              f"offset {entry['height_offset_m']}, nodata {entry['nodata_fraction']}, "
              f"{entry['min_m']} .. {entry['max_m']} m", flush=True)
    meta["patches"] = keep + new
    meta_path.write_text(json.dumps(meta, indent=1) + "\n")
    print(f"{len(keep)} site patches kept, {len(new)} crest patches written")
    return 0


# --------------------------------------------------------------------------
# reference numbers for the browser test (crest_reference.json)
# --------------------------------------------------------------------------
REF_T0 = "2024-01-01T00:00:00Z"
REF_T1 = "2036-01-01T00:00:00Z"
REF_HOURS = 4383 * 24                    # 2024-01-01 .. 2036-01-01: 12 years, 3 leap days
REF_SPOT = GLASER_SPOTS[1]
REF_OBS_H = 2.0
REF_AZ_STEP = 0.5


def _sun_table():
    """Moon-centre Sun vectors (km) hourly from REF_T0, REF_HOURS samples, from the validation
    helpers. The validation cache is only read: if the 19-year table of study F is there its
    first REF_HOURS rows are used, otherwise the table is computed with the cache directory
    pointed at a temporary folder."""
    import tempfile

    sys.path.insert(0, str(bp.REPO / "pipeline" / "validation"))
    import vlib as v

    hours_19y = int(round(19 * 365.25 * 24))
    if (v.CACHE_DIR / f"{REF_T0.replace(':', '')}_{hours_19y}_3600.npz").exists():
        _et, sun, _earth = v.ephem_table(REF_T0, hours_19y, 3600)
        return v, sun[:REF_HOURS]
    v.CACHE_DIR = Path(tempfile.mkdtemp(prefix="crest_ref_ephem_"))
    _et, sun, _earth = v.ephem_table(REF_T0, REF_HOURS, 3600)
    return v, sun


def reference():
    import horizon as hz

    v, sun = _sun_table()
    assert sun.shape == (REF_HOURS, 3)
    _name, lat, lon = REF_SPOT
    out = {
        "point": {"name": "Glaser spot 2 (connecting ridge)", "lat": lat, "lon": lon,
                  "observer_height_m": REF_OBS_H},
        "period": {"start_utc": REF_T0, "end_utc": REF_T1, "end_inclusive": False,
                   "step_s": 3600, "samples": REF_HOURS},
        "rule": "in light = any part of the solar disc above the terrain horizon (visible disc "
                "fraction > 0); dark otherwise. Each sample stands for one step (1 hour): longest "
                "darkness = longest run of consecutive dark samples x 1 h / 24; share in light = "
                "lit samples / all samples.",
        "disc_model": f"pipeline/validation/vlib.py site_series: Sun as a disc of radius {v.ec.R_SUN_KM:g} km "
                      "seen from the observer (ground height from the lookup chain + 2 m), cut into "
                      "24 vertical strips, each compared with the horizon linearly interpolated "
                      "between the 0.5 degree azimuths. Sun position: SPICE, Moon-centred MOON_ME, "
                      "LT+S, then observer-relative.",
        "earth_eclipses_considered": False,
        "horizon": {"az_step_deg": REF_AZ_STEP, "function": "pipeline/terrain/horizon.py horizon_chain"},
        "cases": {},
    }
    for key, patch_id, text in (
            ("with_patch", "connecting-ridge",
             "lookup chain with the web-encoded 20 m patch connecting-ridge, then web tiles L1, L0, whole-Moon map"),
            ("without_patch", None, "lookup chain without a patch: web tiles L1, L0, whole-Moon map")):
        patch = hz.load_patch(patch_id) if patch_id else None
        hor, _d, h0, lev = hz.horizon_chain(lat, lon, REF_OBS_H, REF_AZ_STEP, patch=patch, return_details=True)
        s = v.site_series(lat, lon, REF_OBS_H, sun, None, hor=hor, h0=float(h0), az_step=REF_AZ_STEP)
        lit = s["sun"] > 0
        out["cases"][key] = {
            "terrain": text, "patch": patch_id,
            "surface_h_m": round(float(h0), 3),
            "longest_darkness_days": round(v.longest_run(~lit) / 24.0, 6),
            "longest_darkness_hours": int(v.longest_run(~lit)),
            "share_in_light": round(float(lit.mean()), 6),
            "lit_samples": int(lit.sum()),
            "azimuths_set_by_patch": int((lev == 0).sum()),
        }
    path = bp.OUT / "crest_reference.json"
    path.write_text(json.dumps(out, indent=1) + "\n")
    print(json.dumps(out, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(reference() if "--reference" in sys.argv[1:] else main())
