"""Build map-layer tiles (average sunlight, average Earth visibility, permanent shadow)
on the terrain L0 grid from the NASA GSFC PGDA "Lunar Polar Illumination" GeoTIFFs.

Run:  .venv/bin/python pipeline/layers/build_layers.py
Outputs: web/public/data/layers/{sun_avg.png,earth_avg.png,psr.png,layers.json}
"""
from __future__ import annotations

import json
import math
import struct
import sys
from pathlib import Path

import numpy as np
import rasterio
from affine import Affine
from PIL import Image
from rasterio.warp import Resampling, reproject

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw" / "layers"
OUT = ROOT / "web" / "public" / "data" / "layers"
TERRAIN_META = ROOT / "web" / "public" / "data" / "terrain" / "sp_meta.json"
LOLA_TIF = ROOT / "data" / "raw" / "lola" / "LDEM_80S_80MPP_ADJ.TIF"

R_M = 1737400.0
SIZE = 2048
FRACTION_SCALE = 250          # png = round(fraction * 250)
NODATA_PNG = 255
BASE_URL = "https://pgda.gsfc.nasa.gov/data/MoonIllumination/"
SUN_FILE = "AVGVISIB_75S_120M_201608.TIF"
EARTH_FILE = "AVGVISIB_75S_120M_201608_EARTH.TIF"
PSR_FILE = "LPSR_75S_120M_201608.TIF"
CITATION = ("Mazarico, E., Neumann, G.A., Smith, D.E., Zuber, M.T., Torrence, M.H. (2011), "
            "Illumination conditions of the lunar polar regions using LOLA topography, "
            "Icarus 211, 1066-1081, doi:10.1016/j.icarus.2010.10.030. "
            "2016-08 release, PDS data set LRO-L-LOLA-4-GDR-V1.0; GeoTIFF from NASA GSFC PGDA "
            "product 69 (https://pgda.gsfc.nasa.gov/products/69).")


# ---------- georeferencing (docs/DATA_CONTRACT.md) ----------

def latlon_to_xy(lat_deg: float, lon_deg: float) -> tuple[float, float]:
    """South polar stereographic, true scale at the pole, R = 1737.4 km sphere."""
    r = 2.0 * R_M * math.tan(math.radians(90.0 + lat_deg) / 2.0)
    lon = math.radians(lon_deg)
    return r * math.sin(lon), r * math.cos(lon)


def xy_to_pixel(x: float, y: float, extent: dict, size: int = SIZE) -> tuple[int, int]:
    """(row, col) of the pixel containing x, y. Row 0 = max y, col 0 = min x."""
    px = (extent["x_max_m"] - extent["x_min_m"]) / size
    col = int(math.floor((x - extent["x_min_m"]) / px))
    row = int(math.floor((extent["y_max_m"] - y) / px))
    return row, col


def latlon_to_pixel(lat_deg, lon_deg, extent, size: int = SIZE):
    return xy_to_pixel(*latlon_to_xy(lat_deg, lon_deg), extent, size)


# ---------- encoding ----------

def encode_fraction(frac: np.ndarray) -> np.ndarray:
    """fraction 0..1 -> uint8 round(f*250); NaN -> 255."""
    out = np.full(frac.shape, NODATA_PNG, dtype=np.uint8)
    ok = np.isfinite(frac)
    out[ok] = np.clip(np.rint(frac[ok] * FRACTION_SCALE), 0, FRACTION_SCALE).astype(np.uint8)
    return out


def decode_fraction(v: np.ndarray) -> np.ndarray:
    v = np.asarray(v)
    out = v.astype(np.float64) / FRACTION_SCALE
    return np.where(v == NODATA_PNG, np.nan, out)


def encode_psr(frac_psr: np.ndarray) -> np.ndarray:
    """area fraction of PSR in the output pixel -> 255 where >= 0.5 else 0."""
    return np.where(frac_psr >= 0.5, 255, 0).astype(np.uint8)


def write_png(path: Path, arr: np.ndarray) -> None:
    assert arr.dtype == np.uint8 and arr.ndim == 2
    Image.fromarray(arr, mode="L").save(path, format="PNG", optimize=True)


def png_info(path: Path) -> dict:
    """Parse PNG chunks: IHDR fields and chunk type list."""
    data = Path(path).read_bytes()
    assert data[:8] == b"\x89PNG\r\n\x1a\n"
    pos, chunks, ihdr = 8, [], None
    while pos < len(data):
        (n,) = struct.unpack(">I", data[pos:pos + 4])
        typ = data[pos + 4:pos + 8].decode("ascii")
        if typ == "IHDR":
            w, h, depth, ctype, *_ = struct.unpack(">IIBBBBB", data[pos + 8:pos + 8 + 13])
            ihdr = {"width": w, "height": h, "bit_depth": depth, "color_type": ctype}
        chunks.append(typ)
        pos += 12 + n
    return {**ihdr, "chunks": chunks}


# ---------- grid + source checks ----------

def target_extent() -> tuple[dict, str]:
    if TERRAIN_META.exists():
        l0 = json.loads(TERRAIN_META.read_text())["levels"][0]
        assert l0["size"] == SIZE, l0
        ext = {k: float(l0[k]) for k in ("x_min_m", "x_max_m", "y_min_m", "y_max_m")}
        return ext, "web/public/data/terrain/sp_meta.json levels[0]"
    if LOLA_TIF.exists():
        with rasterio.open(LOLA_TIF) as s:
            b = s.bounds
        return ({"x_min_m": b.left, "x_max_m": b.right, "y_min_m": b.bottom, "y_max_m": b.top},
                "bounds of data/raw/lola/LDEM_80S_80MPP_ADJ.TIF")
    return ({"x_min_m": -304000.0, "x_max_m": 304000.0, "y_min_m": -304000.0,
             "y_max_m": 304000.0}, "FALLBACK +/-304000 m (terrain meta and LOLA file missing)")


def check_crs(src) -> dict:
    """Assert the source is south polar stereographic, true scale at the pole, R=1737.4 km."""
    d = src.crs.to_dict()
    facts = {"proj": d.get("proj"), "lat_0": d.get("lat_0"), "lat_ts": d.get("lat_ts"),
             "lon_0": d.get("lon_0"), "x_0": d.get("x_0"), "y_0": d.get("y_0"),
             "k": d.get("k", d.get("k_0")), "a": d.get("a", d.get("R")), "b": d.get("b"),
             "rf": d.get("rf"), "units": d.get("units")}
    assert facts["proj"] == "stere", facts
    assert float(facts["lat_0"]) == -90.0, facts
    assert facts["lat_ts"] in (None, -90, -90.0), facts
    assert float(facts["lon_0"] or 0) == 0.0, facts
    assert float(facts["x_0"] or 0) == 0.0 and float(facts["y_0"] or 0) == 0.0, facts
    assert facts["k"] in (None, 1, 1.0), facts
    assert float(facts["a"]) == R_M, facts
    assert facts["b"] in (None, R_M) and facts["rf"] in (None, 0, 0.0), facts
    assert facts["units"] == "m", facts
    return facts


def load_physical(path: Path) -> tuple[np.ndarray, dict]:
    """Read band 1, apply the GDAL scale/offset from the header, nodata -> NaN."""
    head = path.read_bytes()[:4]
    assert head in (b"II*\x00", b"MM\x00*", b"II+\x00", b"MM\x00+"), f"{path} is not a TIFF: {head!r}"
    with rasterio.open(path) as s:
        crs_facts = check_crs(s)
        raw = s.read(1)
        scale, offset, nodata = s.scales[0], s.offsets[0], s.nodata
        info = {"file": path.name, "bytes": path.stat().st_size, "driver": s.driver,
                "width": s.width, "height": s.height, "dtype": s.dtypes[0], "nodata": nodata,
                "scale": scale, "offset": offset, "transform": list(s.transform)[:6],
                "bounds": list(s.bounds), "crs_wkt": s.crs.to_wkt(), "crs_facts": crs_facts,
                "tags": s.tags(), "raw_min": int(raw[raw != nodata].min()),
                "raw_max": int(raw[raw != nodata].max()),
                "nodata_count": int((raw == nodata).sum()),
                "n_unique_raw": int(np.unique(raw).size)}
        phys = raw.astype(np.float32) * np.float32(scale) + np.float32(offset)
        phys[raw == nodata] = np.nan
        info["src_transform"] = s.transform
        info["src_crs"] = s.crs
    return phys, info


def resample(phys: np.ndarray, info: dict, extent: dict) -> np.ndarray:
    """Area-average onto the L0 grid. Source and target share the projection (asserted in
    check_crs), so dst_crs = src_crs and the warp is a pure regrid, no datum shift."""
    px = (extent["x_max_m"] - extent["x_min_m"]) / SIZE
    dst_tr = Affine(px, 0, extent["x_min_m"], 0, -px, extent["y_max_m"])
    dst = np.full((SIZE, SIZE), np.nan, dtype=np.float32)
    reproject(phys, dst, src_transform=info["src_transform"], src_crs=info["src_crs"],
              src_nodata=np.nan, dst_transform=dst_tr, dst_crs=info["src_crs"],
              dst_nodata=np.nan, resampling=Resampling.average)
    return dst


def jsonable(info: dict) -> dict:
    return {k: v for k, v in info.items() if k not in ("src_transform", "src_crs")}


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    extent, extent_src = target_extent()
    px = (extent["x_max_m"] - extent["x_min_m"]) / SIZE
    print(f"target grid {SIZE}x{SIZE} px={px} m extent={extent} (from {extent_src})")

    sun, sun_i = load_physical(RAW / SUN_FILE)
    earth, earth_i = load_physical(RAW / EARTH_FILE)
    psr, psr_i = load_physical(RAW / PSR_FILE)
    for i in (sun_i, earth_i, psr_i):
        print(json.dumps({k: v for k, v in jsonable(i).items() if k not in ("crs_wkt", "tags")}))

    # Value-range checks that pin the scale interpretation (fail loudly rather than guess).
    for name, a in (("sun", sun), ("earth", earth)):
        assert np.nanmin(a) >= 0.0 and np.nanmax(a) <= 1.0 + 1e-6, (name, np.nanmin(a), np.nanmax(a))
    u = np.unique(psr[np.isfinite(psr)])
    assert set(np.round(u, 6).tolist()) <= {0.0, 1.0}, u   # raw -20000/+20000 -> 0/1

    sun_g = resample(sun, sun_i, extent)
    earth_g = resample(earth, earth_i, extent)
    psr_g = resample(psr, psr_i, extent)          # area fraction of PSR per output pixel
    assert np.isfinite(psr_g).all(), "PSR grid has no-data; encoding has no no-data code"

    write_png(OUT / "sun_avg.png", encode_fraction(sun_g))
    write_png(OUT / "earth_avg.png", encode_fraction(earth_g))
    write_png(OUT / "psr.png", encode_psr(psr_g))

    period = ("Averaged over hourly time steps across 18.6 years (one lunar nodal precession "
              "cycle), modelled from LOLA polar topography (LOLA data 2009-07-13 to 2013-07-18), "
              "2016-08 release.")
    frac_enc = {"type": "uint8 greyscale", "formula": "fraction = value / 250",
                "valid_range": [0, 250], "nodata": 255}
    common = {"size": SIZE, "extent": extent, "pixel_m": px,
              "grid": "row 0 = max y, col 0 = min x; identical to terrain sp_dem_L0"}

    def src(fname, i):
        return {"file": fname, "url": BASE_URL + fname, "citation": CITATION,
                "native_pixel_m": 120, "raw_dtype": i["dtype"], "raw_scale": i["scale"],
                "raw_offset": i["offset"], "raw_nodata": i["nodata"]}

    layers = {
        "radius_m": R_M, "projection": "south polar stereographic (true scale at pole)",
        "extent_source": extent_src,
        "layers": [
            {"id": "sun_avg", "file": "sun_avg.png", **common, "encoding": frac_enc,
             "resampling": "area average (rasterio.warp Resampling.average) from 120 m",
             "source": src(SUN_FILE, sun_i),
             "meaning": "Average fraction of time the Sun is visible from the surface (0 = never "
                        "lit, 1 = always lit). " + period + " How partial "
                        "visibility of the solar disc is counted was not checked here; "
                        "the product page does not state a height above the surface, so treat "
                        "it as at ground level (0 m)."},
            {"id": "earth_avg", "file": "earth_avg.png", **common, "encoding": frac_enc,
             "resampling": "area average (rasterio.warp Resampling.average) from 120 m",
             "source": src(EARTH_FILE, earth_i),
             "meaning": "Average fraction of time the Earth is visible from the surface (0 = "
                        "never, 1 = always). " + period + " Per the product notes Earth counts "
                        "as visible when any part of its disc is unobscured, so this is "
                        "slightly optimistic for radio-link planning; no height above the "
                        "surface is stated, so treat it as at ground level (0 m)."},
            {"id": "psr", "file": "psr.png", **common,
             "encoding": {"type": "uint8 greyscale", "values": {"255": "permanently shadowed",
                                                                "0": "not permanently shadowed"},
                          "nodata": None, "note": "128 is not used"},
             "resampling": "area average of the 0/1 source mask, then threshold: 255 where at "
                           "least half of the output pixel's area is PSR in the 120 m source "
                           "(majority rule), else 0. PSRs smaller than about half a 297 m pixel "
                           "are dropped.",
             "source": src(PSR_FILE, psr_i),
             "meaning": "Permanently shadowed region: ground that never receives direct "
                        "sunlight in the model. " + period + " Mask is at ground level and "
                        "resampled from 120 m to 297 m by majority rule."},
        ],
    }
    (OUT / "layers.json").write_text(json.dumps(layers, indent=2) + "\n")
    (Path(__file__).parent / "source_headers.json").write_text(
        json.dumps({"sun": jsonable(sun_i), "earth": jsonable(earth_i), "psr": jsonable(psr_i)},
                   indent=2) + "\n")

    for f in ("sun_avg.png", "earth_avg.png", "psr.png", "layers.json"):
        print(f, (OUT / f).stat().st_size, "bytes")
    print("psr pixels:", int((encode_psr(psr_g) == 255).sum()), "of", SIZE * SIZE,
          "| source PSR area fraction in extent:", float(psr_g.mean()))
    return 0


if __name__ == "__main__":
    sys.exit(main())
