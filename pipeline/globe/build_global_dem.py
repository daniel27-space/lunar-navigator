"""Whole-Moon elevation for the globe view.

Source: NASA SVS CGI Moon Kit displacement map `ldem_16.tif` (LOLA, 16 pixels per degree,
float32 kilometres relative to the 1737.4 km sphere, simple cylindrical, longitude -180..180
left to right, north at the top). https://svs.gsfc.nasa.gov/4720

Output: web/public/data/globe/moon_dem_4k.png, 4096 x 2048, with the same height encoding
as the south-pole tiles: h_m = (R*256 + G) * 0.5 - 10000, B = 0. There is no missing data.

Run: .venv/bin/python pipeline/globe/build_global_dem.py
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import rasterio
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "data/raw/globe/ldem/ldem_16.tif"
OUT_DIR = ROOT / "web/public/data/globe"
OUT = OUT_DIR / "moon_dem_4k.png"
WIDTH, HEIGHT = 4096, 2048
H_SCALE = 0.5
H_OFFSET = -10000.0
QUANTUM_M = 8.0


def load_source_m() -> np.ndarray:
    with rasterio.open(SRC) as d:
        return d.read(1).astype(np.float64) * 1000.0


def resample(h_m: np.ndarray, width: int, height: int) -> np.ndarray:
    """Area-weighted downsample (antialiased), so small craters blur instead of aliasing."""
    im = Image.fromarray(h_m.astype(np.float32), mode="F")
    return np.asarray(im.resize((width, height), Image.Resampling.LANCZOS), dtype=np.float64)


def encode_height(h_m: np.ndarray) -> np.ndarray:
    raw = np.rint((h_m - H_OFFSET) / H_SCALE)
    if raw.min() < 1 or raw.max() > 65535:
        raise ValueError("height outside the encodable range")
    raw = raw.astype(np.uint16)
    rgb = np.zeros(raw.shape + (3,), dtype=np.uint8)
    rgb[..., 0] = raw >> 8
    rgb[..., 1] = raw & 255
    return rgb


def decode_height(rgb: np.ndarray) -> np.ndarray:
    return (rgb[..., 0].astype(np.float64) * 256 + rgb[..., 1]) * H_SCALE + H_OFFSET


def sample(h: np.ndarray, lat_deg: float, lon_deg: float) -> float:
    """Bilinear height at a point; pixel centres at lon = -180 + 360*(x+0.5)/W, lat = 90 - 180*(y+0.5)/H."""
    hgt, wid = h.shape
    fx = ((lon_deg + 180.0) % 360.0) / 360.0 * wid - 0.5
    fy = min(max((90.0 - lat_deg) / 180.0 * hgt - 0.5, 0.0), hgt - 1.0)
    x0 = int(np.floor(fx))
    y0 = min(int(np.floor(fy)), hgt - 2)
    wx, wy = fx - x0, fy - y0
    a, b = x0 % wid, (x0 + 1) % wid
    return float(
        (h[y0, a] * (1 - wx) + h[y0, b] * wx) * (1 - wy) + (h[y0 + 1, a] * (1 - wx) + h[y0 + 1, b] * wx) * wy
    )


def main() -> None:
    h = resample(load_source_m(), WIDTH, HEIGHT)
    # Round to 8 m: far below the 2.7 km pixel's own uncertainty, and the file compresses much better.
    h = np.rint(h / QUANTUM_M) * QUANTUM_M
    Image.fromarray(encode_height(h), mode="RGB").save(OUT, optimize=True)
    meta_path = OUT_DIR / "globe.json"
    meta = json.loads(meta_path.read_text())
    meta["dem"] = {
        "file": OUT.name,
        "width": WIDTH,
        "height": HEIGHT,
        "encoding": "h_m = (R*256 + G) * 0.5 - 10000",
        "quantum_m": QUANTUM_M,
        "radius_m": 1737400.0,
        "min_m": round(float(h.min()), 1),
        "max_m": round(float(h.max()), 1),
        "source_file": "https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/ldem_16.tif",
        "credit": "NASA's Scientific Visualization Studio / LOLA Science Team",
    }
    meta_path.write_text(json.dumps(meta, indent=2) + "\n")
    print(f"{OUT.name}: {OUT.stat().st_size} bytes, {h.min():.0f} .. {h.max():.0f} m")


if __name__ == "__main__":
    main()
