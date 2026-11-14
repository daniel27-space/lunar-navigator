"""Earth texture for the globe drawn in the app's sky.

Source: NASA Blue Marble, "Land, Ocean Color, Sea Ice" (Reto Stoeckli, NASA Earth Observatory /
NASA Goddard Space Flight Center), 2048 x 1024 simple cylindrical, longitude -180..180 left to
right, north at the top. Public domain (NASA). Downloaded from Wikimedia Commons, file
"Land_ocean_ice_2048.jpg": https://commons.wikimedia.org/wiki/File:Land_ocean_ice_2048.jpg
(NASA's own image server, eoimages.gsfc.nasa.gov, did not answer on the build day.)

The surface is NASA's. The cloud layer is generated here (seamless noise), because no NASA
cloud image could be fetched; it is there so the globe reads as Earth, not as a weather record.

Output: web/public/data/globe/earth_2k.jpg, and an `earth` entry in globe.json.

Run: .venv/bin/python pipeline/globe/build_earth.py
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "data/raw/globe/earth/Land_ocean_ice_2048.jpg"
OUT_DIR = ROOT / "web/public/data/globe"
OUT = OUT_DIR / "earth_2k.jpg"
WIDTH, HEIGHT = 2048, 1024


def periodic_noise(width: int, height: int, cells_x: int, cells_y: int, seed: int) -> np.ndarray:
    """Smooth value noise, 0..1, that repeats exactly across the left and right edges."""
    rng = np.random.default_rng(seed)
    grid = rng.random((cells_y + 1, cells_x))
    x = np.arange(width) / width * cells_x
    y = np.arange(height) / height * cells_y
    ix, iy = np.floor(x).astype(int), np.floor(y).astype(int)
    fx, fy = x - ix, y - iy
    ux, uy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    a, b = ix % cells_x, (ix + 1) % cells_x
    top = grid[iy][:, a] * (1 - ux) + grid[iy][:, b] * ux
    bot = grid[iy + 1][:, a] * (1 - ux) + grid[iy + 1][:, b] * ux
    return top * (1 - uy)[:, None] + bot * uy[:, None]


def clouds(width: int, height: int) -> np.ndarray:
    """Cloud cover 0..1: broad systems with holes and finer texture, more at the storm latitudes."""
    n = (
        periodic_noise(width, height, 10, 7, 11) * 0.38
        + periodic_noise(width, height, 26, 16, 12) * 0.28
        + periodic_noise(width, height, 70, 40, 13) * 0.2
        + periodic_noise(width, height, 170, 96, 14) * 0.14
    )
    lat = 90 - (np.arange(height) + 0.5) / height * 180
    # Wetter belts: the equator and around 50 to 60 degrees; clearer over the desert latitudes.
    belt = 0.06 * np.exp(-((lat / 9) ** 2)) + 0.07 * np.exp(-(((np.abs(lat) - 55) / 14) ** 2)) - 0.05 * np.exp(-(((np.abs(lat) - 25) / 9) ** 2))
    return np.clip((n + belt[:, None] - 0.51) / 0.17, 0, 1) * 0.86


def build() -> np.ndarray:
    surface = np.asarray(Image.open(SRC).convert("RGB").resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS), dtype=np.float64)
    c = clouds(WIDTH, HEIGHT)[..., None]
    return surface * (1 - c) + np.array([248.0, 249.0, 252.0]) * c


def main() -> None:
    img = np.clip(np.rint(build()), 0, 255).astype(np.uint8)
    Image.fromarray(img, mode="RGB").save(OUT, quality=86, optimize=True, progressive=True)
    meta_path = OUT_DIR / "globe.json"
    meta = json.loads(meta_path.read_text())
    meta["earth"] = {
        "file": OUT.name,
        "width": WIDTH,
        "height": HEIGHT,
        "projection": "simple cylindrical, longitude -180..180 left to right, north at the top",
        "credit": "NASA Earth Observatory (Blue Marble, Reto Stoeckli / NASA GSFC)",
        "license": "Public domain",
        "source_url": "https://commons.wikimedia.org/wiki/File:Land_ocean_ice_2048.jpg",
        "note": "Surface from NASA Blue Marble; the cloud layer is generated, not observed.",
    }
    meta_path.write_text(json.dumps(meta, indent=2) + "\n")
    print(f"{OUT.name}: {OUT.stat().st_size} bytes")


if __name__ == "__main__":
    main()
