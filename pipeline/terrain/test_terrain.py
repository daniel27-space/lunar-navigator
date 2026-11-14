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
def test_testvectors_reproduce_from_lookup_chain():
    # Since the site-patch work the vectors come from the lookup chain without a patch
    # (L1 -> L0 -> whole-Moon map), so rays carry on past the edge of the tiles.
    vec = json.loads((TILES / "horizon_testvectors.json").read_text())
    assert len(vec) >= 6
    for v in vec:
        assert {"name", "lat", "lon", "observer_height_m", "az_step_deg", "elev_deg"} <= set(v)
        e, _, h0, _ = hz.horizon_chain(v["lat"], v["lon"], v["observer_height_m"], v["az_step_deg"],
                                       return_details=True)
        assert len(v["elev_deg"]) == round(360 / v["az_step_deg"])
        assert np.allclose(e, v["elev_deg"], atol=1e-6)
        assert h0 == pytest.approx(v["surface_h_m"], abs=1e-3)
        # the tiles-only horizon can only be lower or equal: the chain sees the same samples
        # plus the ones beyond the edge of the tiles
        e_old = hz.horizon_from_tiles(v["lat"], v["lon"], v["observer_height_m"], v["az_step_deg"])
        assert np.all(e >= e_old - 1e-12)


# --------------------------------------------------------------------------
# lookup chain: site patch -> L1 -> L0 -> whole-Moon map
# --------------------------------------------------------------------------
def _flat_grids(h_tiles=0.0, h_global=0.0):
    """Synthetic (L0, L1, whole-Moon) with the real extents and constant heights."""
    l0 = hz.Grid(np.full((64, 64), h_tiles, np.float32), -304000.0, 304000.0, 9500.0)
    l1 = hz.Grid(np.full((64, 64), h_tiles, np.float32), -163840.0, 163840.0, 5120.0)
    return l0, l1, np.full((90, 180), h_global, np.float32)


@pytest.mark.parametrize("lat,lon", [(90.0, 0.0), (89.9, 77.0), (40.0, 100.0), (0.0, 180.0),
                                     (0.0, -180.0), (-30.0, -100.0), (-88.0, 12.0), (-90.0, 0.0)])
def test_chain_flat_moon_gives_geometric_dip_anywhere(lat, lon):
    elev, dist, h0, lev = hz.horizon_chain(lat, lon, 2.0, 10.0, grids=_flat_grids(),
                                           return_details=True)
    assert h0 == 0.0
    assert np.all(np.isfinite(elev))
    assert np.allclose(elev, -math.degrees(math.acos(R / (R + 2.0))), atol=2e-5)


def test_chain_levels_and_priority():
    grids = _flat_grids(h_tiles=500.0, h_global=-200.0)
    # northern hemisphere: tiles never count, even though the sphere is the same height there
    assert hz.height_chain(60.0, 10.0, grids=grids, return_level=True) == (-200.0, 3)
    assert hz.height_chain(90.0, 0.0, grids=grids, return_level=True) == (-200.0, 3)
    assert hz.height_chain(-70.0, 10.0, grids=grids, return_level=True) == (-200.0, 3)
    assert hz.height_chain(-89.0, 10.0, grids=grids, return_level=True) == (500.0, 1)
    assert hz.height_chain(-81.0, 10.0, grids=grids, return_level=True) == (500.0, 2)
    # a patch wins over everything where it has data, and falls through where it has none
    data = np.full((768, 768), 1000.0, np.float32)
    data[:, 384:] = np.nan                                   # east half has no data
    for lat0, lon0 in [(-89.0, 10.0), (20.0, 30.0)]:
        patch = hz.Patch(data, lat0, lon0)
        below = 500.0 if lat0 < -85 else -200.0
        lev_below = 1 if lat0 < -85 else 3
        w = destination(lat0, lon0, 270.0, 10000.0)
        e = destination(lat0, lon0, 90.0, 10000.0)
        far = destination(lat0, lon0, 0.0, 40000.0)
        assert hz.height_chain(*w, patch=patch, grids=grids, return_level=True) == (1000.0, 0)
        assert hz.height_chain(*e, patch=patch, grids=grids, return_level=True) == (below, lev_below)
        assert hz.height_chain(*far, patch=patch, grids=grids, return_level=True)[1] != 0
        # the far side of the Moon is not "in" the patch
        assert hz.height_chain(-lat0, lon0 + 180.0, patch=patch, grids=grids, return_level=True)[1] != 0


def test_chain_patch_orientation_and_observer_height():
    # a 1 km mesa over the northern third of the patch only: the horizon is raised to the
    # north, not to the south; the observer stands on the patch's own height
    data = np.zeros((768, 768), np.float32)
    data[:256, :] = 1000.0                                   # rows 0..255 = north
    patch = hz.Patch(data, 26.0, 3.6)
    elev, dist, h0, lev = hz.horizon_chain(26.0, 3.6, 2.0, 90.0, patch=patch, grids=_flat_grids(),
                                           return_details=True)
    assert h0 == 0.0
    # mesa edge between pixel rows 255 and 256: full height at the centre of row 255, y = 10280 m
    assert elev[0] == pytest.approx(curved_elevation_deg(1000.0, 10280.0, 2.0), abs=0.02)
    assert lev[0] == 0
    assert np.allclose(elev[1:], -math.degrees(math.acos(R / (R + 2.0))), atol=2e-5)
    # east side raised instead -> azimuth 90
    patch_e = hz.Patch(np.ascontiguousarray(data.T[:, ::-1]), 26.0, 3.6)
    elev_e = hz.horizon_chain(26.0, 3.6, 2.0, 90.0, patch=patch_e, grids=_flat_grids())
    assert elev_e[1] == pytest.approx(elev[0], abs=1e-3) and elev_e[0] < 0 and elev_e[3] < 0


def test_chain_without_patch_or_with_empty_patch_is_the_same():
    grids = _flat_grids(300.0, 50.0)
    empty = hz.Patch(np.full((768, 768), np.nan, np.float32), -80.5, 20.0)
    a = hz.horizon_chain(-80.5, 20.0, 2.0, 15.0, grids=grids)
    b = hz.horizon_chain(-80.5, 20.0, 2.0, 15.0, patch=empty, grids=grids)
    assert np.array_equal(a, b)


def test_chain_equals_tiles_only_where_tiles_cover_the_whole_ray():
    # same samples -> identical numbers (short range so no ray leaves L0)
    l0, l1 = hz.load_tile_grids() if (TILES / "sp_meta.json").exists() else (None, None)
    if l0 is None:
        pytest.skip("tiles not built")
    g = np.zeros((90, 180), np.float32)
    a = hz.horizon(l0, -88.0, 40.0, 2.0, 5.0, hi=l1, max_range_m=100000.0)
    b = hz.horizon_chain(-88.0, 40.0, 2.0, 5.0, max_range_m=100000.0, grids=(l0, l1, g))
    assert np.array_equal(a, b)


def test_chain_whole_moon_sampler_matches_globe_pipeline():
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "globe"))
    import build_global_dem as gd

    path = hz.DEFAULT_GLOBAL_DEM
    if not path.exists():
        pytest.skip("whole-Moon map not built")
    from PIL import Image

    ref = gd.decode_height(np.asarray(Image.open(path)))
    g = hz.load_global_dem()
    assert np.array_equal(g.astype(np.float64), ref)
    l0, l1, _ = _flat_grids(np.nan)                          # tiles without data
    rng = np.random.default_rng(3)
    pts = [(90.0, 0.0), (-90.0, 0.0), (89.99, 179.99), (0.0, 180.0), (0.0, -180.0), (12.3, 179.97),
           (12.3, -179.97), (-89.97, 45.0), (30.0, -100.0)]
    pts += list(zip(rng.uniform(-90, 90, 300), rng.uniform(-180, 180, 300)))
    for lat, lon in pts:
        h, lev = hz.height_chain(lat, lon, grids=(l0, l1, g), return_level=True)
        assert lev == 3
        assert h == pytest.approx(gd.sample(ref, lat, lon), abs=0.02), (lat, lon)


# --------------------------------------------------------------------------
# 20 m crest patches: per-entry size, pixel and height encoding in patches.json
# --------------------------------------------------------------------------
def test_decode_patch_rgb_default_is_the_tile_encoding():
    rng = np.random.default_rng(11)
    rgb = np.zeros((40, 40, 3), np.uint8)
    rgb[..., :2] = rng.integers(0, 256, (40, 40, 2))
    rgb[0, 0] = 0
    a, b = hz.decode_patch_rgb(rgb), bt.decode_height(rgb)
    assert a.dtype == np.float32 and np.isnan(a[0, 0])
    assert np.array_equal(a, b, equal_nan=True)


def test_decode_patch_rgb_with_scale_and_offset():
    rgb = np.zeros((1, 4, 3), np.uint8)
    rgb[0, 1] = (0, 1, 0)
    rgb[0, 2] = (4, 210, 0)                                   # raw 1234
    rgb[0, 3] = (255, 255, 0)
    h = hz.decode_patch_rgb(rgb, 0.1, 739.0)
    assert np.isnan(h[0, 0])
    # float64 arithmetic, then rounded to float32
    assert h[0, 1] == np.float32(1 * 0.1 + 739.0) and h[0, 2] == np.float32(1234 * 0.1 + 739.0)
    assert h[0, 3] == np.float32(65535 * 0.1 + 739.0)
    assert abs(float(h[0, 2]) - 862.4) < 1e-4


def _write_patch_dir(tmp_path, entries, arrays):
    from PIL import Image

    for e, rgb in zip(entries, arrays):
        Image.fromarray(rgb, "RGB").save(tmp_path / e["file"])
    (tmp_path / "patches.json").write_text(json.dumps(
        {"radius_m": 1737400, "size": 768, "pixel_m": 80, "patches": entries}))


def test_load_patch_honours_per_entry_overrides(tmp_path):
    crest = np.zeros((512, 512, 3), np.uint8)
    crest[..., 0], crest[..., 1] = 39, 16                     # raw 10000 -> 1000 m at 0.1 m, offset 0
    crest[:128, :, 0], crest[:128, :, 1] = 78, 32             # north quarter: raw 20000 -> 2000 m
    crest[300, 300] = 0
    site = np.zeros((768, 768, 3), np.uint8)
    site[..., 0], site[..., 1] = 78, 32                       # raw 20000 -> 0 m with the defaults
    _write_patch_dir(tmp_path, [
        {"id": "c", "lat": -89.0, "lon": 30.0, "file": "c.png", "size": 512, "pixel_m": 20,
         "height_scale_m": 0.1, "height_offset_m": 0.0},
        {"id": "s", "lat": 10.0, "lon": 30.0, "file": "s.png"}], [crest, site])
    c = hz.load_patch("c", tmp_path)
    assert c.data.shape == (512, 512) and c.pixel_m == 20.0 and c.half_m == 5120.0
    assert c.data[200, 200] == 1000.0 and c.data[0, 0] == 2000.0 and np.isnan(c.data[300, 300])
    s = hz.load_patch("s", tmp_path)
    assert s.data.shape == (768, 768) and s.pixel_m == 80.0 and s.half_m == 30720.0
    assert np.all(s.data == 0.0)
    # the chain uses the 20 m grid: covered to +/-5120 m of the centre, tiles beyond
    grids = _flat_grids(h_tiles=500.0, h_global=-200.0)
    assert hz.height_chain(-89.0, 30.0, patch=c, grids=grids, return_level=True) == (1000.0, 0)
    assert hz.height_chain(*destination(-89.0, 30.0, 0.0, 5000.0), patch=c, grids=grids,
                           return_level=True) == (2000.0, 0)
    assert hz.height_chain(*destination(-89.0, 30.0, 0.0, 5200.0), patch=c, grids=grids,
                           return_level=True) == (500.0, 1)
    assert hz.height_chain(*destination(-89.0, 30.0, 90.0, 5200.0), patch=c, grids=grids,
                           return_level=True) == (500.0, 1)
    # mesa edge between rows 127 and 128: full height at the centre of row 127, y = 2570 m
    elev, dist, h0, lev = hz.horizon_chain(-89.0, 30.0, 2.0, 90.0, patch=c, grids=grids,
                                           return_details=True)
    assert h0 == 1000.0 and lev[0] == 0
    assert elev[0] == pytest.approx(curved_elevation_deg(2000.0, 2570.0, 1002.0), abs=0.2)
    assert elev[0] > 20.0 and np.all(elev[1:] < 0.0)


def test_chain_with_20m_patch_matches_two_level_kernel():
    # a 20 m patch centred on the pole is an axis-aligned grid in the south polar projection
    # (E = +Y, N = +X, U = -Z at lon 0), so the chain must reproduce horizon() with that grid
    # as the fine level: same samples, same numbers
    rng = np.random.default_rng(4)
    data = (1000.0 + rng.normal(0, 30.0, (512, 512))).astype(np.float32)
    patch = hz.Patch(data, -90.0, 0.0, pixel_m=20.0)
    assert patch.half_m == 5120.0
    l0, l1, g = _flat_grids(h_tiles=900.0)
    hi = hz.Grid(data, -5120.0, 5120.0, 20.0)
    for lat, lon in [(-89.95, 10.0), (-89.9, 200.0), (-89.99, -75.0)]:
        a = hz.horizon(l1, lat, lon, 2.0, 5.0, hi=hi, max_range_m=100000.0)
        b, _d, _h0, lev = hz.horizon_chain(lat, lon, 2.0, 5.0, patch=patch, max_range_m=100000.0,
                                           grids=(l0, l1, g), return_details=True)
        assert np.allclose(a, b, atol=1e-9)
        assert (lev == 0).any()
