"""Tests for the map-layer tiles.

Run:  .venv/bin/python -m pytest -p no:cacheprovider pipeline/layers/test_layers.py -q
"""
import json
import math
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).parent))
import build_layers as bl  # noqa: E402

EXTENT = {"x_min_m": -304000.0, "x_max_m": 304000.0, "y_min_m": -304000.0, "y_max_m": 304000.0}
BUILT = (bl.OUT / "layers.json").exists()
HAVE_RAW = all((bl.RAW / f).exists() for f in (bl.SUN_FILE, bl.EARTH_FILE, bl.PSR_FILE))
needs_built = pytest.mark.skipif(not BUILT, reason="layers not built")
needs_raw = pytest.mark.skipif(not (BUILT and HAVE_RAW), reason="raw GeoTIFFs not present")


# ---- encoding ----

def test_fraction_round_trip():
    f = np.linspace(0, 1, 1001)
    enc = bl.encode_fraction(f)
    assert enc.dtype == np.uint8 and enc.min() == 0 and enc.max() == 250
    assert np.abs(bl.decode_fraction(enc) - f).max() <= 0.5 / 250 + 1e-12
    v = np.arange(0, 251, dtype=np.uint8)
    assert np.array_equal(bl.encode_fraction(bl.decode_fraction(v)), v)


def test_fraction_nodata_and_known_values():
    enc = bl.encode_fraction(np.array([np.nan, 0.0, 0.5, 1.0, 0.8958]))
    assert enc.tolist() == [255, 0, 125, 250, 224]
    dec = bl.decode_fraction(enc)
    assert math.isnan(dec[0]) and dec[1:4].tolist() == [0.0, 0.5, 1.0]


def test_psr_encoding_is_majority_and_never_128():
    enc = bl.encode_psr(np.array([0.0, 0.49, 0.5, 1.0]))
    assert enc.tolist() == [0, 0, 255, 255]


# ---- georeferencing ----

def test_projection_formula():
    assert bl.latlon_to_xy(-90.0, 0.0) == (0.0, 0.0)
    x, y = bl.latlon_to_xy(-80.0, 0.0)       # lon 0 is +y
    assert abs(x) < 1e-6 and y == pytest.approx(2 * 1737400 * math.tan(math.radians(5)))
    assert y == pytest.approx(304006.5, abs=1.0)
    x, y = bl.latlon_to_xy(-80.0, 90.0)      # lon 90E is +x
    assert x == pytest.approx(304006.5, abs=1.0) and abs(y) < 1e-6


def test_known_latlon_lands_on_expected_pixel():
    # Shackleton floor 89.67S 129.2E: r = 10006.9 m, x = +7755 m, y = -6325 m (hand computed)
    x, y = bl.latlon_to_xy(-89.67, 129.2)
    assert x == pytest.approx(7755, abs=2) and y == pytest.approx(-6325, abs=2)
    assert bl.latlon_to_pixel(-89.67, 129.2, EXTENT) == (1045, 1050)
    # corners / orientation: row 0 = max y, col 0 = min x
    assert bl.xy_to_pixel(-303999, 303999, EXTENT) == (0, 0)
    assert bl.xy_to_pixel(303999, -303999, EXTENT) == (2047, 2047)
    assert bl.xy_to_pixel(1.0, -1.0, EXTENT) == (1024, 1024)
    # 86S 0E (Malapert): on the +y axis, above image centre
    r, c = bl.latlon_to_pixel(-86.0, 0.0, EXTENT)
    assert c == 1024 and r == 1024 - math.ceil(2 * 1737400 * math.tan(math.radians(2)) / 296.875)


# ---- built files ----

@needs_built
@pytest.mark.parametrize("name", ["sun_avg.png", "earth_avg.png", "psr.png"])
def test_png_is_plain_8bit_grey(name):
    info = bl.png_info(bl.OUT / name)
    assert (info["width"], info["height"]) == (2048, 2048)
    assert info["bit_depth"] == 8 and info["color_type"] == 0      # 0 = greyscale, no alpha
    assert set(info["chunks"]) <= {"IHDR", "IDAT", "IEND"}, info["chunks"]  # no iCCP/sRGB/tRNS


@needs_built
def test_layers_json_matches_terrain_grid():
    meta = json.loads((bl.OUT / "layers.json").read_text())
    assert [l["file"] for l in meta["layers"]] == ["sun_avg.png", "earth_avg.png", "psr.png"]
    for l in meta["layers"]:
        assert l["size"] == 2048 and l["extent"] == EXTENT
        assert l["source"]["url"].startswith("https://pgda.gsfc.nasa.gov/data/MoonIllumination/")
        assert not l["source"]["url"].endswith("_COG.TIF")
    if bl.TERRAIN_META.exists():
        l0 = json.loads(bl.TERRAIN_META.read_text())["levels"][0]
        assert {k: l0[k] for k in EXTENT} == EXTENT and l0["size"] == 2048


@needs_built
def test_psr_values_and_known_places():
    from PIL import Image
    psr = np.asarray(Image.open(bl.OUT / "psr.png"))
    sun = np.asarray(Image.open(bl.OUT / "sun_avg.png"))
    earth = np.asarray(Image.open(bl.OUT / "earth_avg.png"))
    assert set(np.unique(psr).tolist()) == {0, 255}
    assert sun.max() <= 250 or set(np.unique(sun[sun > 250]).tolist()) == {255}
    r, c = bl.latlon_to_pixel(-89.67, 129.2, EXTENT)        # Shackleton floor
    assert psr[r, c] == 255 and sun[r, c] == 0
    r, c = bl.latlon_to_pixel(-89.45, 222.7, EXTENT)        # connecting ridge
    assert psr[r, c] == 0 and sun[r - 2:r + 3, c - 2:c + 3].max() / 250 > 0.6
    r, c = bl.latlon_to_pixel(-82.0, 180.0, EXTENT)         # far side
    assert earth[r, c] == 0
    r, c = bl.latlon_to_pixel(-85.964, 357.681, EXTENT)     # Malapert massif summit area
    assert earth[r, c] / 250 > 0.95
    # orientation: the Earth-facing half (lon 0 = +y = top rows) sees Earth far more often.
    # (A single near-side pixel is not a safe check: 82S 0E itself is only 0.17, local relief.)
    assert earth[:1024].mean() / 250 > 0.4 and earth[1024:].mean() / 250 < 0.15
    assert abs(earth[:, :1024].mean() - earth[:, 1024:].mean()) / 250 < 0.05


@needs_raw
def test_png_matches_source_block_mean():
    """Independent of rasterio.warp: mean of source pixels whose centres fall in the output
    pixel must agree with the decoded PNG."""
    import rasterio
    from PIL import Image
    px = 296.875
    for png, tif in (("sun_avg.png", bl.SUN_FILE), ("earth_avg.png", bl.EARTH_FILE)):
        img = np.asarray(Image.open(bl.OUT / png))
        with rasterio.open(bl.RAW / tif) as s:
            assert s.scales[0] == 4e-5 and s.offsets[0] == 0.0
            raw, tr = s.read(1), s.transform
        cx = tr.c + (np.arange(raw.shape[1]) + 0.5) * tr.a
        cy = tr.f + (np.arange(raw.shape[0]) + 0.5) * tr.e
        rng = np.random.default_rng(1)
        diffs = []
        for r, c in rng.integers(0, 2048, size=(300, 2)):
            x0, y1 = -304000 + c * px, 304000 - r * px
            block = raw[np.ix_((cy <= y1) & (cy > y1 - px), (cx >= x0) & (cx < x0 + px))]
            diffs.append(abs(img[r, c] / 250 - block.mean() * 4e-5))
        diffs = np.array(diffs)
        # sharp shadow edges make single pixels differ (partial-pixel weighting); the bulk must agree
        assert np.median(diffs) < 0.004 and np.percentile(diffs, 90) < 0.03, (png, diffs.max())
