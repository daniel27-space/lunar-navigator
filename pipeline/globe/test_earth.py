"""The Earth texture must be the right way round and seamless."""
import numpy as np
import pytest
from PIL import Image

from pipeline.globe.build_earth import HEIGHT, OUT, SRC, WIDTH, clouds


def pixel(a: np.ndarray, lat: float, lon: float) -> np.ndarray:
    return a[int((90 - lat) / 180 * a.shape[0]), int((lon + 180) / 360 * a.shape[1]) % a.shape[1]].astype(float)


def test_size():
    with Image.open(OUT) as im:
        assert im.size == (WIDTH, HEIGHT)
    assert OUT.stat().st_size < 900_000


@pytest.mark.skipif(not SRC.exists(), reason="raw Blue Marble image not downloaded")
def test_source_is_the_right_way_round():
    a = np.asarray(Image.open(SRC).convert("RGB"))
    # Oceans are blue-dominant, the Sahara is bright and red-dominant, Antarctica and Greenland are white.
    for lat, lon in [(0, -150), (-30, 80), (30, -40)]:
        p = pixel(a, lat, lon)
        assert p[2] > p[0], (lat, lon, p)
    sahara = pixel(a, 23, 10)
    assert sahara[0] > sahara[2] and sahara.mean() > 120
    assert pixel(a, -85, 0).min() > 180
    assert pixel(a, 75, -40).min() > 180
    amazon = pixel(a, -5, -62)
    assert amazon[1] > amazon[2] and amazon.mean() < 110


def test_clouds_are_seamless_and_partial():
    c = clouds(WIDTH, HEIGHT)
    # The step across the date line (last column to first) is no bigger than the largest step
    # between neighbouring columns anywhere else: there is no seam.
    inside = np.abs(np.diff(c, axis=1)).max()
    assert np.abs(c[:, 0] - c[:, -1]).max() <= inside * 1.05
    assert 0.2 < (c > 0.3).mean() < 0.75
    assert c.max() <= 0.86 + 1e-9 and c.min() >= 0
