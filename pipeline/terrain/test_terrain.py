"""Tests for the terrain pipeline.

Run from the repo root:
    .venv/bin/python -m pytest pipeline/terrain/test_terrain.py -q
"""
import json
import math
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).parent))
import build_tiles as bt  # noqa: E402
import horizon as hz  # noqa: E402

R = hz.R_MOON_M


# --------------------------------------------------------------------------
# helpers that are independent of horizon.py's vector maths
# --------------------------------------------------------------------------
def destination(lat1, lon1, az, dist_m):
    """Standard spherical direct geodesic (degrees in, degrees out)."""
    p1, l1, a, d = math.radians(lat1), math.radians(lon1), math.radians(az), dist_m / R
    p2 = math.asin(math.sin(p1) * math.cos(d) + math.cos(p1) * math.sin(d) * math.cos(a))
    l2 = l1 + math.atan2(math.sin(a) * math.sin(d) * math.cos(p1),
                         math.cos(d) - math.sin(p1) * math.sin(p2))
    return math.degrees(p2), math.degrees(l2)


def ang_dist_m(lat, lon, lat_c, lon_c):
    """Great-circle distance (m) from arrays lat/lon to a point, haversine."""
    p, l = np.radians(lat), np.radians(lon)
    pc, lc = math.radians(lat_c), math.radians(lon_c)
    a = np.sin((p - pc) / 2) ** 2 + np.cos(p) * math.cos(pc) * np.sin((l - lc) / 2) ** 2
    return 2 * R * np.arcsin(np.sqrt(a))


def local_grid(lat0, lon0, half_m, px, height_fn):
    """Square grid centred near the observer; heights from height_fn(lat, lon)."""
    x0, y0 = hz.latlon_to_xy(lat0, lon0)
    n = int(round(2 * half_m / px))
    x_min, y_max = float(x0) - half_m, float(y0) + half_m
    xs = x_min + (np.arange(n) + 0.5) * px
    ys = y_max - (np.arange(n) + 0.5) * px
    lat, lon = hz.xy_to_latlon(xs[None, :], ys[:, None])
    return hz.Grid(height_fn(lat, lon), x_min, y_max, px)


def curved_elevation_deg(h_target, s, h_obs_total):
    """Elevation of a point of height h_target at arc distance s, seen from a point
    h_obs_total above the sphere. Plane trigonometry in the great-circle plane."""
    th = s / R
    return np.degrees(np.arctan2((R + h_target) * np.cos(th) - (R + h_obs_total),
                                 (R + h_target) * np.sin(th)))


# --------------------------------------------------------------------------
# projection
# --------------------------------------------------------------------------
def test_projection_matches_contract_and_roundtrips():
    lat = np.array([-89.9, -87.3, -85.0, -80.0, -84.2])
    lon = np.array([0.0, 90.0, 222.7, 357.1, -120.0])
    x, y = hz.latlon_to_xy(lat, lon)
    # lon 0 is +y, lon 90E is +x; 80S is at r = 2R tan(5 deg)
    assert x[0] == pytest.approx(0, abs=1e-6) and y[0] > 0
    assert y[1] == pytest.approx(0, abs=1e-6) and x[1] > 0
    assert math.hypot(x[3], y[3]) == pytest.approx(2 * R * math.tan(math.radians(5)), rel=1e-12)
    # the unit-vector form used in the kernel is the same projection
    u = np.array([np.cos(np.radians(lat)) * np.cos(np.radians(lon)),
                  np.cos(np.radians(lat)) * np.sin(np.radians(lon)), np.sin(np.radians(lat))])
    assert np.allclose(2 * R * u[1] / (1 - u[2]), x, atol=1e-6)
    assert np.allclose(2 * R * u[0] / (1 - u[2]), y, atol=1e-6)
    lat2, lon2 = hz.xy_to_latlon(x, y)
    assert np.allclose(lat2, lat, atol=1e-10)
    assert np.allclose((lon2 - lon + 180) % 360 - 180, 0, atol=1e-10)


@pytest.mark.skipif(not hz.DEFAULT_TIF.exists(), reason="source GeoTIFF not downloaded")
def test_projection_matches_geotiff_crs():
    import rasterio
    from rasterio.crs import CRS
    from rasterio.warp import transform

    lat = [-89.5, -87.0, -84.0, -81.0, -80.5]
    lon = [10.0, 130.0, 222.7, -2.9, 300.0]
    with rasterio.open(hz.DEFAULT_TIF) as ds:
        xs, ys = transform(CRS.from_proj4("+proj=longlat +R=1737400 +no_defs"), ds.crs, lon, lat)
    x, y = hz.latlon_to_xy(np.array(lat), np.array(lon))
    assert np.allclose(xs, x, atol=1e-3)
    assert np.allclose(ys, y, atol=1e-3)


# --------------------------------------------------------------------------
# (a) analytic horizon checks on synthetic DEMs
# --------------------------------------------------------------------------
def test_step_schedule():
    s = hz.step_schedule()
    assert s[0] == 20.0 and s[1] == 40.0
    assert len(s) == 2202 and s[499] == 10000.0 and s[500] == 10020.0
    assert s[501] == pytest.approx(10040.04, abs=1e-9)
    assert s[-1] == pytest.approx(299820.99848604, abs=1e-6)
    assert np.all(np.diff(s) >= 20.0 - 1e-9)
    assert s[-1] <= 300000.0 and s[-1] * 1.002 > 300000.0
    far = s > 10100
    assert np.allclose(np.diff(s)[far[:-1]] / s[:-1][far[:-1]], 0.002, rtol=1e-9)


@pytest.mark.parametrize("h_obs,h_ground", [(2.0, 0.0), (2.0, 1500.0), (100.0, -3000.0)])
def test_flat_sphere_gives_geometric_dip(h_obs, h_ground):
    g = local_grid(-85.0, 30.0, 60000.0, 200.0, lambda lat, lon: np.full(lat.shape, h_ground))
    elev = hz.horizon(g, -85.0, 30.0, observer_height_m=h_obs, az_step_deg=5.0)
    expected = -math.degrees(math.acos((R + h_ground) / (R + h_ground + h_obs)))
    assert expected < 0
    assert np.all(elev < 0)
    assert np.allclose(elev, expected, atol=2e-5)
    if h_obs == 2.0 and h_ground == 0.0:
        assert expected == pytest.approx(-0.08694, abs=1e-4)  # -sqrt(2h/R) in degrees


def test_gaussian_mountain_matches_curved_geometry_not_flat():
    lat0, lon0, D, H, sig = -86.0, 40.0, 50000.0, 3000.0, 3000.0
    latc, lonc = destination(lat0, lon0, 90.0, D)
    g = local_grid(lat0, lon0, 70000.0, 80.0,
                   lambda lat, lon: H * np.exp(-ang_dist_m(lat, lon, latc, lonc) ** 2 / (2 * sig ** 2)))
    elev, dist, h0 = hz.horizon(g, lat0, lon0, return_details=True)
    assert abs(h0) < 1e-6
    # independent expectation: continuous profile along the ray, 1 m sampling
    s = np.arange(1.0, 65000.0, 1.0)
    expected = curved_elevation_deg(H * np.exp(-(s - D) ** 2 / (2 * sig ** 2)), s, h0 + 2.0).max()
    k = int(round(90 / 0.5))
    assert elev[k] == pytest.approx(expected, abs=0.005)
    assert abs(dist[k] - D) < 3000
    # curvature drop D^2/2R = 719 m matters: the flat-earth answer is 0.8 deg higher
    flat = math.degrees(math.atan((H - 2.0) / D))
    assert flat - elev[k] > 0.5
    approx_curved = math.degrees(math.atan((H - D * D / (2 * R) - 2.0) / D))
    assert elev[k] == pytest.approx(approx_curved, abs=0.08)


def test_mesa_edge_angle_with_curvature():
    lat0, lon0, D, H, rho = -84.0, 200.0, 25000.0, 2000.0, 5000.0
    latc, lonc = destination(lat0, lon0, 135.0, D)
    g = local_grid(lat0, lon0, 40000.0, 80.0,
                   lambda lat, lon: np.where(ang_dist_m(lat, lon, latc, lonc) < rho, H, 0.0))
    elev = hz.horizon(g, lat0, lon0)
    expected = float(curved_elevation_deg(H, D - rho, 2.0))  # near edge of the plateau
    assert expected == pytest.approx(5.38, abs=0.02)
    assert elev[int(round(135 / 0.5))] == pytest.approx(expected, abs=0.05)
    # away from the mesa the horizon is the flat-sphere dip
    assert elev[int(round(315 / 0.5))] == pytest.approx(-0.08694, abs=1e-3)


def test_observer_height_lowers_nearby_horizon():
    lat0, lon0 = -86.0, 40.0
    latc, lonc = destination(lat0, lon0, 0.0, 3000.0)
    g = local_grid(lat0, lon0, 10000.0, 40.0,
                   lambda lat, lon: 300.0 * np.exp(-ang_dist_m(lat, lon, latc, lonc) ** 2 / (2 * 500.0 ** 2)))
    e2 = hz.horizon(g, lat0, lon0, observer_height_m=2.0, az_step_deg=1.0)
    e50 = hz.horizon(g, lat0, lon0, observer_height_m=50.0, az_step_deg=1.0)
    assert e50[0] < e2[0] and e2[0] > 4.0


def test_two_level_sampling_equals_single_level_when_data_identical():
    lat0, lon0 = -86.0, 40.0
    latc, lonc = destination(lat0, lon0, 60.0, 20000.0)
    lo = local_grid(lat0, lon0, 40000.0, 80.0,
                    lambda lat, lon: 1500.0 * np.exp(-ang_dist_m(lat, lon, latc, lonc) ** 2 / (2 * 2000.0 ** 2)))
    o, n = 250, 500
    hi = hz.Grid(lo.data[o:o + n, o:o + n], lo.x_min + o * 80.0, lo.y_max - o * 80.0, 80.0)
    a = hz.horizon(lo, lat0, lon0, az_step_deg=2.0)
    b = hz.horizon(lo, lat0, lon0, az_step_deg=2.0, hi=hi)
    assert np.allclose(a, b, atol=1e-12)


def test_ray_stops_at_nodata_and_reports_nan_without_data():
    g = local_grid(-85.0, 30.0, 5000.0, 100.0, lambda lat, lon: np.zeros(lat.shape))
    g.data[:, :40] = np.nan  # everything more than ~1 km to the -x side is missing
    elev = hz.horizon(g, -85.0, 30.0, az_step_deg=90.0)
    assert np.all(np.isfinite(elev))  # each ray still has its near samples
    assert np.all(np.isnan(hz.horizon(g, -89.0, 30.0, az_step_deg=90.0)))  # observer off-grid


# --------------------------------------------------------------------------
# (c) azimuth convention: clockwise from north
# --------------------------------------------------------------------------
def test_destination_helper_directions():
    lat, lon = destination(-85.0, 30.0, 0.0, 30000.0)
    assert lat > -85.0 and lon == pytest.approx(30.0, abs=1e-9)  # north = toward the equator
    lat, lon = destination(-85.0, 30.0, 90.0, 30000.0)
    assert lon > 30.0  # east = increasing east longitude


@pytest.mark.parametrize("lat0,lon0", [(-85.0, 30.0), (-87.5, 200.0), (-83.0, -75.0)])
@pytest.mark.parametrize("az", [0.0, 90.0, 180.0, 270.0, 37.5])
def test_mountain_appears_at_its_azimuth(lat0, lon0, az):
    latc, lonc = destination(lat0, lon0, az, 30000.0)
    g = local_grid(lat0, lon0, 45000.0, 100.0,
                   lambda lat, lon: 2500.0 * np.exp(-ang_dist_m(lat, lon, latc, lonc) ** 2 / (2 * 2500.0 ** 2)))
    elev = hz.horizon(g, lat0, lon0, az_step_deg=0.5)
    assert np.argmax(elev) * 0.5 == pytest.approx(az, abs=0.5)
    assert elev.max() > 4.0


# --------------------------------------------------------------------------
# (b) tile encoding round trip
# --------------------------------------------------------------------------
def test_height_png_roundtrip(tmp_path):
    rng = np.random.default_rng(1)
    h = rng.uniform(-9000.0, 11000.0, size=(64, 96)).astype(np.float32)
    h[0, 0], h[1, 1], h[2, 2] = -7295.517, 7026.331, 0.0
    h[10:12, 5:9] = np.nan
    p = tmp_path / "h.png"
    bt.write_png(p, bt.encode_height(h))
    d = bt.decode_height_png(p)
    assert d.shape == h.shape
    assert np.array_equal(np.isnan(d), np.isnan(h))
    assert np.nanmax(np.abs(d - h)) <= 0.25 + 1e-3
    chunks, ihdr = bt.png_chunks(p)
    assert {c for c, _ in chunks} == {"IHDR", "IDAT", "IEND"}  # no iCCP/sRGB/gAMA/tRNS
    assert ihdr["bit_depth"] == 8 and ihdr["color_type"] == 2 and ihdr["interlace"] == 0
    from PIL import Image
    with Image.open(p) as im:
        assert im.mode == "RGB" and np.all(np.asarray(im)[..., 2] == 0)


def test_height_encoding_formula_and_range():
    rgb = bt.encode_height(np.array([[0.0, -9999.5, 22767.5, 1234.5]]))
    code = rgb[..., 0].astype(int) * 256 + rgb[..., 1]
    assert np.allclose(code * 0.5 - 10000, [0.0, -9999.5, 22767.5, 1234.5])
    with pytest.raises(ValueError):
        bt.encode_height(np.array([[-10000.0]]))
    with pytest.raises(ValueError):
        bt.encode_height(np.array([[22768.0]]))


def test_slope_png_roundtrip(tmp_path):
    s = np.array([[0.0, 0.1, 12.3, 63.75, 70.0, 89.0]], dtype=np.float32)
    p = tmp_path / "s.png"
    bt.write_png(p, bt.encode_slope(s))
    d = bt.decode_slope_png(p)
    assert np.allclose(d, [0.0, 0.0, 12.25, 63.75, 63.75, 63.75])
    chunks, ihdr = bt.png_chunks(p)
    assert {c for c, _ in chunks} == {"IHDR", "IDAT", "IEND"}
    assert ihdr["bit_depth"] == 8 and ihdr["color_type"] == 0


def test_area_average_is_exact_box_average():
    rng = np.random.default_rng(2)
    a = rng.normal(size=(120, 120))
    assert np.allclose(bt.area_average(a, 30), a.reshape(30, 4, 30, 4).mean(axis=(1, 3)))
    b = bt.area_average(a, 32)  # non-integer factor 3.75
    assert np.allclose(bt.area_weights(120, 32).sum(axis=1), 1.0)
    assert b.mean() == pytest.approx(a.mean(), abs=1e-12)
    assert np.allclose(bt.area_average(np.full((120, 120), 7.0), 32), 7.0)


def test_slope_of_tilted_plane():
    px = 80.0
    xs = (np.arange(200) + 0.5) * px - 8000.0
    h = np.tile(0.2 * xs, (200, 1))  # 20 % grade along x, centred on the pole
    s = bt.slope_deg(h, -8000.0, 8000.0, px)
    assert s[100, 100] == pytest.approx(math.degrees(math.atan(0.2)), abs=1e-3)


# --------------------------------------------------------------------------
# the real tiles, when they have been built
# --------------------------------------------------------------------------
TILES = hz.DEFAULT_TILE_DIR
needs_tiles = pytest.mark.skipif(not (TILES / "sp_meta.json").exists(), reason="tiles not built")


@needs_tiles
def test_real_tiles_match_meta_and_contract():
    meta = json.loads((TILES / "sp_meta.json").read_text())
    assert meta["radius_m"] == 1737400 and meta["projection"] == "south polar stereographic"
    assert [lv["size"] for lv in meta["levels"]] == [2048, 4096]
    for lv, slope in zip(meta["levels"], ["sp_slope_L0.png", "sp_slope_L1.png"]):
        assert set(lv) == {"file", "size", "x_min_m", "x_max_m", "y_min_m", "y_max_m", "pixel_m"}
        assert (lv["x_max_m"] - lv["x_min_m"]) / lv["size"] == pytest.approx(lv["pixel_m"])
        assert (lv["y_max_m"] - lv["y_min_m"]) / lv["size"] == pytest.approx(lv["pixel_m"])
        assert lv["x_min_m"] == -lv["x_max_m"] and lv["y_min_m"] == -lv["y_max_m"]
        for f, ctype in [(lv["file"], 2), (slope, 0)]:
            chunks, ihdr = bt.png_chunks(TILES / f)
            assert {c for c, _ in chunks} == {"IHDR", "IDAT", "IEND"}
            assert (ihdr["width"], ihdr["height"]) == (lv["size"], lv["size"])
            assert ihdr["bit_depth"] == 8 and ihdr["color_type"] == ctype
    assert meta["levels"][0]["x_max_m"] == pytest.approx(2 * R * math.tan(math.radians(5)), abs=10)


@needs_tiles
@pytest.mark.skipif(not hz.DEFAULT_TIF.exists(), reason="source GeoTIFF not downloaded")
def test_real_tiles_roundtrip_against_source():
    src = hz.load_geotiff_grid()
    l0, l1 = hz.load_tile_grids()
    o = int(round((l1.x_min - src.x_min) / src.pixel_m))
    crop = src.data[o:o + 4096, o:o + 4096]
    assert np.nanmax(np.abs(l1.data - crop)) <= 0.25 + 1e-3
    # L0 is an area average: a block of whole L0 pixels has the same mean as the source block
    # (19 L0 pixels = 5640.625 m, so use the full grid where edges coincide exactly)
    assert float(np.nanmean(l0.data)) == pytest.approx(float(np.nanmean(src.data)), abs=0.05)
    # sampled at a few known places the two sources agree to DEM-resampling accuracy
    for lat, lon in [(-89.45, 222.7), (-85.99, 357.1), (-81.0, 60.0)]:
        x, y = hz.latlon_to_xy(lat, lon)
        hs = src.sample(x, y)
        tile = l1.sample(x, y)
        tile = l0.sample(x, y) if math.isnan(tile) else tile
        assert abs(tile - hs) < 60.0


@needs_tiles
@pytest.mark.skipif(not (TILES / "horizon_testvectors.json").exists(), reason="vectors not built")
def test_testvectors_reproduce_from_tiles():
    vec = json.loads((TILES / "horizon_testvectors.json").read_text())
    assert len(vec) >= 6
    for v in vec:
        assert {"name", "lat", "lon", "observer_height_m", "az_step_deg", "elev_deg"} <= set(v)
        e = hz.horizon_from_tiles(v["lat"], v["lon"], v["observer_height_m"], v["az_step_deg"])
        assert len(v["elev_deg"]) == round(360 / v["az_step_deg"])
        assert np.allclose(e, v["elev_deg"], atol=1e-6)
