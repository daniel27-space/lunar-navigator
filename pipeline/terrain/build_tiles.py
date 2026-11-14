"""Build the web terrain tiles from the LOLA south-pole GeoTIFF.

Outputs (docs/DATA_CONTRACT.md), written to web/public/data/terrain/:
  sp_dem_L0.png    2048 x 2048 RGB, whole source extent, area-averaged
  sp_dem_L1.png    4096 x 4096 RGB, central square, exact native 80 m pixels (crop)
  sp_slope_L0.png  2048 x 2048 greyscale, area-average of the 80 m slope
  sp_slope_L1.png  4096 x 4096 greyscale, 80 m slope (crop)
  sp_meta.json

Height encoding: h_m = (R*256 + G) * 0.5 - 10000, B = 0. Source nodata (NaN) is
written as R = G = B = 0 (decodes to -10000 m, which decode_height_png turns back
into NaN). Slope encoding: slope_deg = value * 0.25, clamped at 63.75.

Slope is computed on the 80 m source grid with central differences (so the
effective baseline is 160 m, one pixel either side; one-sided at the grid edge)
and corrected for the stereographic map scale k = 1 + (r / 2R)^2 (ground
gradient = map gradient * k; k is 1 at the pole and 1.0077 at 80S).

Run:  .venv/bin/python pipeline/terrain/build_tiles.py
"""
from __future__ import annotations

import json
import struct
import sys
import time
import zlib
from pathlib import Path

import numpy as np
from PIL import Image

R_MOON_M = 1737400.0
H_SCALE = 0.5
H_OFFSET = -10000.0
SLOPE_SCALE = 0.25
L0_SIZE = 2048
L1_SIZE = 4096

REPO = Path(__file__).resolve().parents[2]
SRC = REPO / "data" / "raw" / "lola" / "LDEM_80S_80MPP_ADJ.TIF"
OUT = REPO / "web" / "public" / "data" / "terrain"
SRC_URL = "https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_80S_80MPP_ADJ.TIF"


# --------------------------------------------------------------------------
# encoding
# --------------------------------------------------------------------------
def encode_height(h_m: np.ndarray) -> np.ndarray:
    """float metres (NaN = nodata) -> uint8 (H, W, 3) per the contract."""
    code = np.rint((np.nan_to_num(h_m, nan=H_OFFSET) - H_OFFSET) / H_SCALE)
    if np.nanmin(h_m) < H_OFFSET + H_SCALE or np.nanmax(h_m) > H_OFFSET + 65535 * H_SCALE:
        raise ValueError("height outside the encodable range")
    code = code.astype(np.uint16)
    code[np.isnan(h_m)] = 0
    rgb = np.zeros(h_m.shape + (3,), dtype=np.uint8)
    rgb[..., 0] = code >> 8
    rgb[..., 1] = code & 0xFF
    return rgb


def decode_height(rgb: np.ndarray) -> np.ndarray:
    """uint8 (H, W, 3) -> float32 metres, code 0 -> NaN."""
    code = rgb[..., 0].astype(np.uint16) * 256 + rgb[..., 1]
    h = code.astype(np.float32) * np.float32(H_SCALE) + np.float32(H_OFFSET)
    h[code == 0] = np.nan
    return h


def encode_slope(slope_deg: np.ndarray) -> np.ndarray:
    return np.clip(np.rint(np.nan_to_num(slope_deg, nan=0.0) / SLOPE_SCALE), 0, 255).astype(np.uint8)


def decode_slope(v: np.ndarray) -> np.ndarray:
    return v.astype(np.float32) * np.float32(SLOPE_SCALE)


def write_png(path, arr: np.ndarray):
    """Plain 8-bit PNG: RGB for (H, W, 3), greyscale for (H, W). No alpha, no profile."""
    mode = "RGB" if arr.ndim == 3 else "L"
    Image.fromarray(arr, mode).save(path, format="PNG", optimize=True)


def png_chunks(path):
    """[(chunk_type, length)] and the IHDR fields, for checking the file is plain."""
    data = Path(path).read_bytes()
    assert data[:8] == b"\x89PNG\r\n\x1a\n"
    pos, chunks, ihdr = 8, [], None
    while pos < len(data):
        (n,) = struct.unpack(">I", data[pos:pos + 4])
        typ = data[pos + 4:pos + 8].decode("ascii")
        if typ == "IHDR":
            w, h, depth, ctype, _, _, interlace = struct.unpack(">IIBBBBB", data[pos + 8:pos + 21])
            ihdr = {"width": w, "height": h, "bit_depth": depth, "color_type": ctype,
                    "interlace": interlace}
        chunks.append((typ, n))
        pos += 12 + n
    return chunks, ihdr


def decode_height_png(path) -> np.ndarray:
    Image.MAX_IMAGE_PIXELS = None
    with Image.open(path) as im:
        assert im.mode == "RGB", im.mode
        return decode_height(np.asarray(im))


def decode_slope_png(path) -> np.ndarray:
    with Image.open(path) as im:
        assert im.mode == "L", im.mode
        return decode_slope(np.asarray(im))


# --------------------------------------------------------------------------
# resampling
# --------------------------------------------------------------------------
def area_weights(n_src: int, n_dst: int) -> np.ndarray:
    """(n_dst, n_src) matrix of overlap fractions between destination and source pixels
    covering the same extent; each row sums to 1. Exact box (area) averaging."""
    f = n_src / n_dst
    w = np.zeros((n_dst, n_src), dtype=np.float64)
    for i in range(n_dst):
        a, b = i * f, (i + 1) * f
        j0, j1 = int(np.floor(a)), min(int(np.ceil(b)), n_src)
        for j in range(j0, j1):
            w[i, j] = max(0.0, min(b, j + 1) - max(a, j))
        w[i] /= w[i].sum()
    return w


def area_average(a: np.ndarray, n_dst: int) -> np.ndarray:
    """NaN-aware exact area average of a square array down to n_dst x n_dst."""
    from scipy.sparse import csr_matrix

    wy = csr_matrix(area_weights(a.shape[0], n_dst))
    wx = csr_matrix(area_weights(a.shape[1], n_dst))
    valid = np.isfinite(a)
    num = (wx @ (wy @ np.where(valid, a, 0.0).astype(np.float64)).T).T
    den = (wx @ (wy @ valid.astype(np.float64)).T).T
    out = np.full((n_dst, n_dst), np.nan)
    ok = den > 0.5
    out[ok] = num[ok] / den[ok]
    return out


def slope_deg(h: np.ndarray, x_min: float, y_max: float, px: float) -> np.ndarray:
    """Slope in degrees on the source grid (see module docstring)."""
    gy, gx = np.gradient(h.astype(np.float64), px)
    n = h.shape[0]
    xs = x_min + (np.arange(h.shape[1]) + 0.5) * px
    ys = y_max - (np.arange(n) + 0.5) * px
    k = 1.0 + (xs[None, :] ** 2 + ys[:, None] ** 2) / (2.0 * R_MOON_M) ** 2
    return np.degrees(np.arctan(np.hypot(gx, gy) * k)).astype(np.float32)


def bilinear_at_source_centres(tile: np.ndarray, n_src: int) -> np.ndarray:
    """Bilinear-sample a tile (covering the same extent as an n_src grid) at every
    source pixel centre, the same way horizon.py samples it. Outside the tile's
    pixel-centre box the result is NaN."""
    from scipy.ndimage import map_coordinates

    n = tile.shape[0]
    f = (np.arange(n_src) + 0.5) * (n / n_src) - 0.5
    rr, cc = np.meshgrid(f, f, indexing="ij")
    out = map_coordinates(tile.astype(np.float64), [rr, cc], order=1, mode="constant", cval=np.nan)
    return out


def err_stats(a, b):
    d = (a - b)[np.isfinite(a) & np.isfinite(b)]
    return {"max_abs": float(np.max(np.abs(d))), "rms": float(np.sqrt(np.mean(d * d))),
            "p99_abs": float(np.percentile(np.abs(d), 99)), "n": int(d.size)}


# --------------------------------------------------------------------------
# main
# --------------------------------------------------------------------------
def main():
    import rasterio

    t_start = time.time()
    OUT.mkdir(parents=True, exist_ok=True)
    with rasterio.open(SRC) as ds:
        h = ds.read(1)
        tr = ds.transform
        crs_wkt = ds.crs.to_wkt()
        tags = ds.tags()
    n = h.shape[0]
    assert h.shape == (n, n) and tr.a == -tr.e and tr.b == 0 and tr.d == 0
    px, x_min, y_max = tr.a, tr.c, tr.f
    n_nan = int(np.isnan(h).sum())
    print(f"source {n}x{n} px={px} x_min={x_min} y_max={y_max} "
          f"min={np.nanmin(h):.3f} max={np.nanmax(h):.3f} nan={n_nan}  read {time.time()-t_start:.1f}s")

    report = {"source_nan_pixels": n_nan, "source_min_m": float(np.nanmin(h)),
              "source_max_m": float(np.nanmax(h))}

    t = time.time()
    slope = slope_deg(h, x_min, y_max, px)
    report["slope_source"] = {"max_deg": float(np.nanmax(slope)),
                              "pixels_over_63.75": int((slope > 63.75).sum()),
                              "seconds": time.time() - t}

    # ---- L0: whole extent, exact area average -----------------------------
    t = time.time()
    h0 = area_average(h, L0_SIZE)
    s0 = area_average(slope, L0_SIZE)
    px0 = (n * px) / L0_SIZE
    write_png(OUT / "sp_dem_L0.png", encode_height(h0))
    write_png(OUT / "sp_slope_L0.png", encode_slope(s0))
    report["L0_seconds"] = time.time() - t

    # ---- L1: central crop at native resolution ----------------------------
    t = time.time()
    o = (n - L1_SIZE) // 2
    assert (n - L1_SIZE) % 2 == 0
    h1 = h[o:o + L1_SIZE, o:o + L1_SIZE]
    s1 = slope[o:o + L1_SIZE, o:o + L1_SIZE]
    write_png(OUT / "sp_dem_L1.png", encode_height(h1))
    write_png(OUT / "sp_slope_L1.png", encode_slope(s1))
    report["L1_seconds"] = time.time() - t

    levels = [
        {"file": "sp_dem_L0.png", "size": L0_SIZE, "x_min_m": x_min, "x_max_m": x_min + n * px,
         "y_min_m": y_max - n * px, "y_max_m": y_max, "pixel_m": px0},
        {"file": "sp_dem_L1.png", "size": L1_SIZE, "x_min_m": x_min + o * px,
         "x_max_m": x_min + (o + L1_SIZE) * px, "y_min_m": y_max - (o + L1_SIZE) * px,
         "y_max_m": y_max - o * px, "pixel_m": px},
    ]
    meta = {
        "radius_m": 1737400,
        "projection": "south polar stereographic",
        "levels": levels,
        "height_encoding": {
            "formula": "h_m = (R*256 + G) * 0.5 - 10000",
            "scale_m": H_SCALE, "offset_m": H_OFFSET, "blue": 0,
            "nodata_rgb": [0, 0, 0],
            "pixel_registration": "area: pixel (row i, col j) centre is at "
                                  "x = x_min_m + (j+0.5)*pixel_m, y = y_max_m - (i+0.5)*pixel_m; "
                                  "row 0 is maximum y",
        },
        "slope_encoding": {
            "files": ["sp_slope_L0.png", "sp_slope_L1.png"],
            "formula": "slope_deg = value * 0.25", "clamp_deg": 63.75,
            "method": "central differences on the 80 m source grid (160 m effective baseline), "
                      "scaled by the stereographic map scale; L0 is the area average of that",
        },
        "source": {
            "file": SRC.name, "url": SRC_URL,
            "product": "NASA GSFC PGDA product 78, LOLA south pole 80S-90S, 80 m/pixel",
            "crs_wkt": crs_wkt, "pixel_m": px, "size": n,
            "height_units": "metres above the 1737.4 km sphere",
            "resampling": {"L0": "exact area (box) average", "L1": "none (native pixels, crop)"},
        },
    }
    (OUT / "sp_meta.json").write_text(json.dumps(meta, indent=2) + "\n")

    # ---- verification: decode what was written and compare with the source ----
    t = time.time()
    d0 = decode_height_png(OUT / "sp_dem_L0.png")
    d1 = decode_height_png(OUT / "sp_dem_L1.png")
    report["L0_quantisation_vs_area_average_m"] = err_stats(d0, h0)
    report["L0_bilinear_at_source_pixels_vs_source_m"] = err_stats(bilinear_at_source_centres(d0, n), h)
    report["L1_decoded_vs_source_m"] = err_stats(d1, h1)
    ds0 = decode_slope_png(OUT / "sp_slope_L0.png")
    ds1 = decode_slope_png(OUT / "sp_slope_L1.png")
    report["slope_L0_quantisation_vs_area_average_deg"] = err_stats(ds0, np.minimum(s0, 63.75))
    report["slope_L1_decoded_vs_source_deg"] = err_stats(ds1, np.minimum(s1, 63.75))
    report["slope_L0_bilinear_at_source_pixels_vs_source_deg"] = err_stats(
        bilinear_at_source_centres(ds0, n), slope)
    report["nan_in_decoded"] = {"L0": int(np.isnan(d0).sum()), "L1": int(np.isnan(d1).sum())}
    report["verify_seconds"] = time.time() - t

    files = {}
    for name in ["sp_dem_L0.png", "sp_dem_L1.png", "sp_slope_L0.png", "sp_slope_L1.png", "sp_meta.json"]:
        p = OUT / name
        files[name] = {"bytes": p.stat().st_size}
        if name.endswith(".png"):
            chunks, ihdr = png_chunks(p)
            files[name]["ihdr"] = ihdr
            files[name]["chunk_types"] = sorted({c for c, _ in chunks})
            with Image.open(p) as im:
                files[name]["mode"] = im.mode
                files[name]["icc_profile"] = "icc_profile" in im.info
    report["files"] = files
    report["total_seconds"] = time.time() - t_start
    (Path(__file__).parent / "build_report.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    sys.exit(main())
