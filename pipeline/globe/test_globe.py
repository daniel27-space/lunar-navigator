"""The whole-Moon elevation tile must agree with the source and with the south-pole LOLA tile."""
from pathlib import Path

import numpy as np
import pytest
import rasterio
from PIL import Image

from pipeline.globe.build_global_dem import OUT, SRC, decode_height, encode_height, sample

ROOT = Path(__file__).resolve().parents[2]
POLAR = ROOT / "data/raw/lola/LDEM_80S_80MPP_ADJ.TIF"
R = 1737400.0


@pytest.fixture(scope="module")
def web() -> np.ndarray:
    return decode_height(np.asarray(Image.open(OUT)))


def test_encoding_round_trips_to_quarter_metre():
    h = np.array([[-8981.5, 0.0, 10685.5, 123.3]])
    assert np.abs(decode_height(encode_height(h)) - h).max() <= 0.25


def test_range_is_the_moon(web):
    # Deepest point (Antoniadi, about -9.1 km) and highest (about +10.8 km), softened by resampling.
    assert -9200 < web.min() < -8000
    assert 9500 < web.max() < 10900


@pytest.mark.skipif(not SRC.exists(), reason="raw source not downloaded")
def test_matches_source_at_landing_sites(web):
    with rasterio.open(SRC) as d:
        src = d.read(1).astype(np.float64) * 1000.0
    # Apollo 11, Apollo 17, Chang'e 4, Chandrayaan-3, Tycho centre, a far-side highland point
    for lat, lon in [(0.674, 23.473), (20.19, 30.77), (-45.457, 177.589), (-69.37, 32.32), (-43.3, -11.2), (5.0, -160.0)]:
        assert abs(sample(web, lat, lon) - sample(src, lat, lon)) < 250, (lat, lon)


@pytest.mark.skipif(not POLAR.exists(), reason="raw polar DEM not downloaded")
def test_orientation_agrees_with_the_polar_lola_tile(web):
    """Independent product, different projection: catches a flipped or shifted longitude."""
    with rasterio.open(POLAR) as d:
        diffs = []
        for lat in (-81.0, -83.0, -85.0, -87.0):
            for lon in range(-180, 180, 15):
                r = 2 * R * np.tan(np.radians(90 + lat) / 2)
                x, y = r * np.sin(np.radians(lon)), r * np.cos(np.radians(lon))
                row, col = d.index(x, y)
                # Average the 80 m data over about one web pixel (2.6 km) before comparing.
                win = d.read(1, window=((row - 16, row + 17), (col - 16, col + 17))).astype(np.float64)
                scale = 1000.0 if np.abs(win).max() < 50 else 1.0
                diffs.append(sample(web, lat, lon) - win.mean() * scale)
    diffs = np.array(diffs)
    assert np.sqrt(np.mean(diffs**2)) < 300
    assert np.isfinite(diffs).all()
