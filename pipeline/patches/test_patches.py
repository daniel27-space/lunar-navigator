"""Tests for the site terrain patches (docs/DATA_CONTRACT.md, "Site terrain patches").

Run from the repo root:
    .venv/bin/python -m pytest -p no:cacheprovider pipeline/patches -q
"""
import json
import math
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "terrain"))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "globe"))
import build_patches as bp  # noqa: E402
import build_crest_patches as bc  # noqa: E402
import build_tiles as bt  # noqa: E402
import horizon as hz  # noqa: E402

R = 1737400.0
META = bp.OUT / "patches.json"
needs_patches = pytest.mark.skipif(not META.exists(), reason="patches not built")
needs_tif = pytest.mark.skipif(not bp.TIF_80S.exists(), reason="80 m south-pole GeoTIFF not downloaded")


def _meta():
    return json.loads(META.read_text())


def _site_patches():
    """The 80 m mission-site patches (everything that is not a 20 m crest patch)."""
    return [p for p in _meta()["patches"] if p.get("kind") != bc.KIND]


def _crest_patches():
    """The 20 m crest patches (kind crest20, not tied to a mission)."""
    return [p for p in _meta()["patches"] if p.get("kind") == bc.KIND and not p["sites"]]


def _lander_patches():
    """The 20 m patches centred on polar landers (kind crest20 with a mission in "sites")."""
    return [p for p in _meta()["patches"] if p.get("kind") == bc.KIND and p["sites"]]


def _patch_ids():
    return [p["id"] for p in _site_patches()] if META.exists() else []


def _crest_ids():
    return [p["id"] for p in _crest_patches()] if META.exists() else []


@pytest.fixture(scope="module")
def globe():
    import build_global_dem as gd
    from PIL import Image

    h = gd.decode_height(np.asarray(Image.open(gd.OUT)))
    return lambda lat, lon: gd.sample(h, float(lat), float(lon))


def _load(entry):
    return bp.load_patch_png(bp.OUT / entry["file"]).astype(np.float64)


# --------------------------------------------------------------------------
# (a) projection
# --------------------------------------------------------------------------
@pytest.mark.parametrize("lat0,lon0", [(26.13239, 3.6333), (-80.13, 1.44), (0.0, 0.0), (0.67, 179.9),
                                       (60.4445, -4.588), (-41.6, -153.99), (90.0, 0.0), (-90.0, 0.0)])
def test_projection_roundtrip(lat0, lon0):
    fr = bp.frame(lat0, lon0)
    e, n, u = fr
    assert abs(e @ n) < 1e-15 and abs(e @ u) < 1e-15 and abs(n @ u) < 1e-15
    assert np.allclose(np.cross(e, n), u, atol=1e-15)                    # right-handed E, N, U
    rng = np.random.default_rng(1)
    x = rng.uniform(-400e3, 400e3, 2000)
    y = rng.uniform(-400e3, 400e3, 2000)
    d = bp.site_inverse(x, y, fr)
    assert np.allclose(np.linalg.norm(d, axis=-1), 1.0, atol=1e-14)
    x2, y2 = bp.site_forward(d, fr)
    assert np.max(np.abs(x2 - x)) < 1e-6 and np.max(np.abs(y2 - y)) < 1e-6
    # the centre maps to (0, 0); +y is north and +x is east; true scale at the centre
    assert np.allclose(bp.site_forward(u, fr), (0.0, 0.0), atol=1e-9)
    assert np.allclose(bp.site_inverse(0.0, 0.0, fr), u, atol=1e-15)
    step = 1000.0 / R
    xn, yn = bp.site_forward(u * math.cos(step) + n * math.sin(step), fr)
    xe, ye = bp.site_forward(u * math.cos(step) + e * math.sin(step), fr)
    assert abs(xn) < 1e-6 and yn == pytest.approx(1000.0, abs=1e-3)
    assert abs(ye) < 1e-6 and xe == pytest.approx(1000.0, abs=1e-3)


def test_projection_forward_is_the_contract_formula_and_matches_latlon():
    lat0, lon0 = 20.1911, 30.7723
    fr = bp.frame(lat0, lon0)
    # a point 0.5 degree north of the centre on the same meridian is at x = 0, y = 2R tan(0.25 deg)
    x, y = bp.site_forward(bp.unit(lat0 + 0.5, lon0), fr)
    assert abs(x) < 1e-6 and y == pytest.approx(2 * R * math.tan(math.radians(0.25)), abs=1e-6)
    # a point east of the centre has x > 0; lat/lon of an inverse agree with the forward of unit()
    x, y = bp.site_forward(bp.unit(lat0, lon0 + 0.5), fr)
    assert x > 0 and x == pytest.approx(math.radians(0.5) * math.cos(math.radians(lat0)) * R, rel=1e-3)
    lat, lon = bp.unit_to_latlon(bp.site_inverse(12345.0, -6789.0, fr))
    assert np.allclose(bp.site_forward(bp.unit(lat, lon), fr), (12345.0, -6789.0), atol=1e-6)


def test_projection_matches_proj_stereographic():
    from rasterio.crs import CRS
    from rasterio.warp import transform

    lat0, lon0 = -69.3741, 32.32
    crs = CRS.from_proj4(f"+proj=stere +lat_0={lat0} +lon_0={lon0} +k=1 +x_0=0 +y_0=0 +R={R} +units=m +no_defs")
    geo = CRS.from_proj4(f"+proj=longlat +R={R} +no_defs")
    rng = np.random.default_rng(2)
    lat = lat0 + rng.uniform(-1.0, 1.0, 200)
    lon = lon0 + rng.uniform(-3.0, 3.0, 200)
    xs, ys = transform(geo, crs, lon.tolist(), lat.tolist())
    x, y = bp.site_forward(bp.unit(lat, lon), bp.frame(lat0, lon0))
    assert np.max(np.abs(x - xs)) < 1e-3 and np.max(np.abs(y - ys)) < 1e-3


def test_south_pole_tiles_are_the_special_case():
    e, n, u = bp.frame(-90.0, 0.0)
    assert np.allclose(e, [0, 1, 0], atol=1e-15) and np.allclose(n, [1, 0, 0], atol=1e-15)
    assert np.allclose(u, [0, 0, -1], atol=1e-15)
    lat = np.array([-89.5, -85.0, -80.13, -75.0])
    lon = np.array([10.0, 222.7, 1.44, -100.0])
    x, y = bp.site_forward(bp.unit(lat, lon), (e, n, u))
    xs, ys = hz.latlon_to_xy(lat, lon)
    assert np.allclose(x, xs, atol=1e-6) and np.allclose(y, ys, atol=1e-6)


def test_pixel_grid_registration():
    x, y = bp.pixel_centres()
    assert x.shape == (768, 768)
    assert x[0, 0] == -30680.0 and y[0, 0] == 30680.0                    # row 0 north, column 0 west
    assert x[0, -1] == 30680.0 and y[-1, 0] == -30680.0
    assert bp.pixel_of(-30680.0, 30680.0) == (0.0, 0.0)
    assert bp.pixel_of(0.0, 0.0) == (383.5, 383.5)


def test_bilinear_matches_reference_sampler():
    rng = np.random.default_rng(5)
    a = rng.normal(0, 100, (40, 50)).astype(np.float32)
    a[10, 10] = np.nan
    g = hz.Grid(a, -25.0, 20.0, 1.0)
    fx = rng.uniform(-2, 51, 500)
    fy = rng.uniform(-2, 41, 500)
    got = bp.bilinear(a, fx, fy)
    ref = np.array([g.sample(-25.0 + (u + 0.5), 20.0 - (v + 0.5)) for u, v in zip(fx, fy)])
    assert np.array_equal(np.isnan(got), np.isnan(ref))
    assert np.allclose(got[~np.isnan(got)], ref[~np.isnan(ref)], atol=1e-9)


# --------------------------------------------------------------------------
# which missions get a patch
# --------------------------------------------------------------------------
def test_l1_membership():
    assert bp.in_l1(-84.7906, 29.1957) and bp.in_l1(-85.28, 53.27) and bp.in_l1(-89.9, 123.0)
    assert not bp.in_l1(-80.13, 1.44) and not bp.in_l1(26.1, 3.6) and not bp.in_l1(89.0, 0.0)
    assert bp.in_l1(-84.61, 0.0) and not bp.in_l1(-84.59, 0.0)           # edge at y = 163.84 km


@needs_patches
def test_every_mission_is_covered_once():
    missions = json.loads(bp.MISSIONS.read_text())
    meta = _meta()
    assert meta["radius_m"] == 1737400 and meta["size"] == 768 and meta["pixel_m"] == 80
    site = _site_patches()                                                # 20 m crest patches serve no mission
    assert len(site) == 34 and meta["patches"][:34] == site
    assert all(p["sites"] == [] for p in _crest_patches())
    served = [s for p in site for s in p["sites"]]
    assert len(served) == len(set(served))
    by_site = {s: p for p in site for s in p["sites"]}
    for m in missions:
        if bp.in_l1(m["lat"], m["lon"]):
            assert m["id"] not in by_site
            continue
        p = by_site[m["id"]]
        assert bp.great_circle_km(m["lat"], m["lon"], p["lat"], p["lon"]) <= bp.SHARE_KM
    centres = [(p["lat"], p["lon"]) for p in site]
    for i, a in enumerate(centres):                                       # no redundant patch
        for b in centres[:i]:
            assert bp.great_circle_km(*a, *b) > bp.SHARE_KM
    for p in site:
        assert p["id"] == p["sites"][0] and p["file"] == p["id"] + ".png"
        assert "http" in p["source"]
        assert not bp.in_l1(p["lat"], p["lon"])
    assert site == [
        {**p, **{k: q[k] for k in ("id", "lat", "lon", "sites")}}
        for p, q in zip(site, bp.choose_patches(missions))]


# --------------------------------------------------------------------------
# (d) encoding, file format
# --------------------------------------------------------------------------
def test_encoding_roundtrip(tmp_path):
    rng = np.random.default_rng(7)
    h = rng.uniform(-9000.0, 10700.0, (64, 64))
    h[3, 5] = np.nan
    h[0, 0] = -9999.5                                                     # raw 1: lowest real value
    path = tmp_path / "p.png"
    bt.write_png(path, bt.encode_height(h))
    dec = bp.load_patch_png(path)
    assert np.isnan(dec[3, 5]) and np.isnan(dec).sum() == 1
    assert dec[0, 0] == -9999.5
    assert np.nanmax(np.abs(dec - h)) <= 0.25 + 1e-6
    rgb = bt.encode_height(h)
    assert tuple(rgb[3, 5]) == (0, 0, 0) and not rgb[..., 2].any()
    raw = rgb[..., 0].astype(int) * 256 + rgb[..., 1]
    assert np.allclose(raw[~np.isnan(h)] * 0.5 - 10000.0, dec[~np.isnan(h)])


@needs_patches
@pytest.mark.parametrize("pid", _patch_ids())
def test_patch_file_is_plain_png_matching_meta(pid):
    from PIL import Image

    entry = next(p for p in _meta()["patches"] if p["id"] == pid)
    path = bp.OUT / entry["file"]
    chunks, ihdr = bt.png_chunks(path)
    assert ihdr == {"width": 768, "height": 768, "bit_depth": 8, "color_type": 2, "interlace": 0}
    assert {c for c, _ in chunks} <= {"IHDR", "IDAT", "IEND"}             # no alpha, no profile
    rgb = np.asarray(Image.open(path))
    assert not rgb[..., 2].any()
    raw = rgb[..., 0].astype(int) * 256 + rgb[..., 1]
    h = _load(entry)
    assert np.array_equal(np.isnan(h), raw == 0)
    assert entry["nodata_fraction"] == pytest.approx(float((raw == 0).mean()), abs=1e-6)
    assert entry["min_m"] == float(np.nanmin(h)) and entry["max_m"] == float(np.nanmax(h))
    assert -9200 < entry["min_m"] and entry["max_m"] < 10800
    assert bt.encode_height(h).tobytes() == rgb.tobytes()                 # decode -> encode is exact


# --------------------------------------------------------------------------
# (b) against the whole-Moon map: position, orientation
# --------------------------------------------------------------------------
def _globe_on_patch(entry, globe, step=8):
    """Whole-Moon heights at every `step`-th pixel centre of the patch, and the patch there."""
    x, y = bp.pixel_centres()
    sl = slice(step // 2, None, step)
    lat, lon = bp.unit_to_latlon(bp.site_inverse(x[sl, sl], y[sl, sl], bp.frame(entry["lat"], entry["lon"])))
    g = np.array([globe(a, b) for a, b in zip(lat.ravel(), lon.ravel())]).reshape(lat.shape)
    return _load(entry)[sl, sl], g


def _corr(a, b):
    ok = np.isfinite(a) & np.isfinite(b)
    return float(np.corrcoef(a[ok], b[ok])[0, 1])


@needs_patches
@pytest.mark.parametrize("pid", _patch_ids())
def test_patch_agrees_with_whole_moon_map(pid, globe):
    entry = next(p for p in _meta()["patches"] if p["id"] == pid)
    h = _load(entry)
    centre = h[383:385, 383:385]
    assert np.all(np.isfinite(centre))
    assert abs(float(centre.mean()) - globe(entry["lat"], entry["lon"])) < 400.0
    hp, g = _globe_on_patch(entry, globe)
    r = _corr(hp, g)
    assert r > 0.9, r
    # a flipped, transposed or rotated patch would correlate worse
    for name, alt in [("north-south flip", hp[::-1]), ("east-west flip", hp[:, ::-1]),
                      ("transpose", hp.T), ("rotate 180", hp[::-1, ::-1]),
                      ("rotate 90", np.rot90(hp)), ("rotate 270", np.rot90(hp, 3))]:
        assert _corr(alt, g) < r - 0.05, name
    # a patch shifted by 4 km in any direction would also correlate worse than the real one
    ok = np.isfinite(hp)
    assert abs(float(np.mean(hp[ok] - g[ok]))) < 60.0


@needs_patches
def test_patch_is_not_shifted(globe):
    # for a patch with strong relief the correlation peaks at zero shift (within +/-1 sample
    # of 2.56 km, which is one pixel of the whole-Moon map)
    entry = next(p for p in _meta()["patches"] if p["id"] == "apollo-15")
    h = _load(entry)
    x, y = bp.pixel_centres()
    step = 32
    sl = slice(step // 2, None, step)
    best = None
    for dj in range(-3, 4):
        for di in range(-3, 4):
            lat, lon = bp.unit_to_latlon(bp.site_inverse(x[sl, sl] + dj * step * 80.0, y[sl, sl] - di * step * 80.0,
                                                         bp.frame(entry["lat"], entry["lon"])))
            g = np.array([globe(a, b) for a, b in zip(lat.ravel(), lon.ravel())]).reshape(lat.shape)
            hb = h.reshape(24, step, 24, step).mean(axis=(1, 3))
            r = _corr(hb, g)
            if best is None or r > best[0]:
                best = (r, di, dj)
    assert best[1:] == (0, 0), best


@needs_patches
def test_apollo_15_landmarks_are_on_the_correct_side():
    # Hadley Delta rises about 3.5 km directly south of the site, the Apennine front (Mons
    # Hadley) is to the east and north-east, Palus Putredinis (mare) is to the west, and
    # Hadley Rille (about 300 m deep) passes 2 to 4 km west of the site.
    entry = next(p for p in _meta()["patches"] if p["id"] == "apollo-15")
    assert entry["sites"] == ["apollo-15"] and (entry["lat"], entry["lon"]) == (26.13239, 3.6333)
    h = _load(entry)
    x, y = bp.pixel_centres()
    site = float(h[383:385, 383:385].mean())
    assert -2000 < site < -1850
    r = np.hypot(x, y)
    az = np.degrees(np.arctan2(x, y)) % 360.0

    def sector(a0, a1, r0, r1):
        return h[(az >= a0) & (az < a1) & (r >= r0) & (r < r1)] - site

    south = sector(150, 210, 5e3, 20e3)
    east = sector(60, 120, 15e3, 30e3)
    west = sector(240, 300, 5e3, 25e3)
    assert south.mean() > 1200 and 3000 < south.max() < 4000              # Hadley Delta
    assert east.mean() > 2000                                             # Apennines
    assert abs(west.mean()) < 250                                         # mare
    assert south.mean() > west.mean() + 1000 and east.mean() > west.mean() + 1500
    # highest point within 20 km is Mons Hadley, north-east of the site
    k = int(np.argmax(np.where(r < 20e3, h, -np.inf)))
    assert x.ravel()[k] > 8e3 and y.ravel()[k] > 8e3
    # the rille: a trench west of the site on the site's own latitude, nothing like it to the east
    band = np.abs(y) < 800
    rille_w = float(h[band & (x < -1500) & (x > -4500)].min()) - site
    rille_e = float(h[band & (x > 1500) & (x < 4500)].min()) - site
    assert rille_w < -200 and rille_e > -100


# --------------------------------------------------------------------------
# (c) against the 80 m south-pole GeoTIFF
# --------------------------------------------------------------------------
@needs_patches
@needs_tif
def test_im1_patch_agrees_with_80m_geotiff():
    # Independent direction: take source pixels (centres located with PROJ from the file's own
    # CRS), project them INTO the patch with the forward formula and sample the patch.
    import rasterio
    from rasterio.crs import CRS
    from rasterio.warp import transform

    entry = next(p for p in _meta()["patches"] if p["id"] == "im-1-odysseus")
    assert (entry["lat"], entry["lon"]) == (-80.13, 1.44)
    assert "LDEM_80S_80MPP_ADJ.TIF" in entry["source"] and "LDEM_60S_60M.IMG" in entry["source"]
    assert entry["nodata_fraction"] == 0.0
    h = _load(entry)
    fr = bp.frame(entry["lat"], entry["lon"])
    with rasterio.open(bp.TIF_80S) as ds:
        cx, cy = hz.latlon_to_xy(entry["lat"], entry["lon"])
        r, c = ds.index(float(cx), float(cy))
        rows = np.arange(max(r - 420, 0), min(r + 420, ds.height), 5)
        cols = np.arange(max(c - 420, 0), min(c + 420, ds.width), 5)
        rr, cc = np.meshgrid(rows, cols, indexing="ij")
        src = ds.read(1)[rr, cc].astype(np.float64)
        xs, ys = ds.xy(rr.ravel(), cc.ravel())
        lon, lat = transform(ds.crs, CRS.from_proj4(f"+proj=longlat +R={R} +no_defs"), xs, ys)
    px, py = bp.site_forward(bp.unit(np.array(lat), np.array(lon)), fr)
    got = bp.bilinear(h, *bp.pixel_of(px, py))
    d = got - src.ravel()
    ok = np.isfinite(d)
    assert ok.sum() > 10000
    # the patch is the source resampled onto a rotated 80 m grid and rounded to 0.5 m, and this
    # check interpolates a second time, so rough ground differs by a few metres at most
    assert np.median(np.abs(d[ok])) < 1.0
    assert np.percentile(np.abs(d[ok]), 99) < 5.0
    assert np.max(np.abs(d[ok])) < 15.0
    assert abs(float(d[ok].mean())) < 0.2
    # and the direct statement: every patch pixel that lies inside the GeoTIFF grid equals the
    # bilinear sample of the GeoTIFF there, to the 0.25 m rounding of the encoding
    x, y = bp.pixel_centres()
    plat, plon = bp.unit_to_latlon(bp.site_inverse(x, y, fr))
    ref = bp.sample_tif80(plat, plon, set())
    inside = np.isfinite(ref)
    assert 0.5 < inside.mean() < 0.6                                      # the rest is north of the grid
    assert np.max(np.abs(h[inside] - ref[inside])) <= 0.25 + 1e-6
    assert plat[inside].max() < -79.9 and plat[~inside].min() > -80.1


# --------------------------------------------------------------------------
# rebuild from the download cache (no network): the files are what the builder produces
# --------------------------------------------------------------------------
@needs_patches
@pytest.mark.parametrize("pid", ["apollo-11", "surveyor-6", "chandrayaan-3", "hakuto-r-m2", "im-1-odysseus"])
def test_rebuild_from_cache_is_identical(pid, monkeypatch):
    if not bp.CACHE.exists() or (pid == "im-1-odysseus" and not bp.TIF_80S.exists()):
        pytest.skip("download cache not present")

    def no_network(*a, **k):
        raise AssertionError("test tried to use the network")

    monkeypatch.setattr(bp, "_http_ranges", no_network)
    entry = next(p for p in _meta()["patches"] if p["id"] == pid)
    try:
        h, src = bp.build_patch(entry["lat"], entry["lon"])
    except AssertionError:
        pytest.skip("window not in the download cache")
    assert "; ".join(src) == entry["source"]
    assert np.array_equal(bt.decode_height(bt.encode_height(h)), bp.load_patch_png(bp.OUT / entry["file"]),
                          equal_nan=True)


def test_sldem_tile_naming_and_seams():
    assert bp.sldem_url(1, 0).endswith("SLDEM2015_512_00N_30N_000_045_FLOAT.IMG")
    assert bp.sldem_url(3, 7).endswith("SLDEM2015_512_60S_30S_315_360_FLOAT.IMG")
    assert bp.sldem_url(0, 4).endswith("SLDEM2015_512_30N_60N_180_225_FLOAT.IMG")


def test_multipart_range_parser():
    body = b""
    chunk = [(10, 13), (100, 105)]
    for (a, b), data in zip(chunk, [b"\r\n--", b"abcdef"]):
        body += (b"\r\n--BOUND\r\nContent-Type: application/octet-stream\r\n"
                 + f"Content-Range: bytes {a}-{b}/1000".encode() + b"\r\n\r\n" + data)
    body += b"\r\n--BOUND--\r\n"
    assert bp._split_multipart(body, chunk) == [b"\r\n--", b"abcdef"]
    with pytest.raises(RuntimeError):
        bp._split_multipart(body, [(11, 14), (100, 105)])


# --------------------------------------------------------------------------
# patch test vectors
# --------------------------------------------------------------------------
@needs_patches
@pytest.mark.skipif(not (bp.OUT / "patch_testvectors.json").exists(), reason="vectors not built")
def test_patch_testvectors_reproduce():
    vec = json.loads((bp.OUT / "patch_testvectors.json").read_text())
    assert [v["patch"] for v in vec][:6] == ["apollo-17", "apollo-15", "im-1-odysseus", "chandrayaan-3",
                                             "apollo-11", None]
    assert [v["patch"] for v in vec][6:11] == ["connecting-ridge", "shackleton-rim", "de-gerlache-rim",
                                               "malapert-massif", "connecting-ridge"]
    assert [v["patch"] for v in vec][11:] == LANDER_IDS
    for v in vec:
        assert {"name", "lat", "lon", "observer_height_m", "az_step_deg", "elev_deg", "patch"} <= set(v)
        assert v["observer_height_m"] == 2.0 and v["az_step_deg"] == 0.5 and len(v["elev_deg"]) == 720
        patch = hz.load_patch(v["patch"]) if v["patch"] else None
        e, _, h0, lev = hz.horizon_chain(v["lat"], v["lon"], 2.0, 0.5, patch=patch, return_details=True)
        assert np.allclose(e, v["elev_deg"], atol=1e-6)
        assert h0 == pytest.approx(v["surface_h_m"], abs=1e-3)
        h_obs, lev_obs = hz.height_chain(v["lat"], v["lon"], patch, return_level=True)
        assert h_obs == h0 and lev_obs == (0 if patch else 3)
        if patch:
            assert (lev == 0).sum() > 0                                   # the patch sets some of the skyline
            # without the patch the horizon is a different (coarser) one
            e_no = hz.horizon_chain(v["lat"], v["lon"], 2.0, 0.5)
            assert np.max(np.abs(e_no - e)) > 0.05
    east = vec[4]
    d = bp.great_circle_km(east["lat"], east["lon"], 0.67416, 23.47314)
    assert d == pytest.approx(10.0, abs=1e-3) and east["lon"] > 23.47314
    assert east["lat"] == pytest.approx(0.67416, abs=1e-3)
    assert (vec[5]["lat"], vec[5]["lon"]) == (30.0, -100.0)


@needs_patches
def test_apollo_15_horizon_shows_hadley_delta_to_the_south():
    patch = hz.load_patch("apollo-15")
    e, d, h0, lev = hz.horizon_chain(26.13239, 3.6333, 2.0, 1.0, patch=patch, return_details=True)
    k = int(np.argmax(e[135:226])) + 135
    assert 150 <= k <= 200 and 10.0 < e[k] < 20.0                         # about 3.5 km at about 15 km
    assert lev[k] == 0 and 8e3 < d[k] < 25e3
    assert e[250:300].max() < 3.0                                         # mare to the west


# --------------------------------------------------------------------------
# 20 m crest patches (docs/DATA_CONTRACT.md, "20 m crest patches")
# --------------------------------------------------------------------------
needs_tif20 = pytest.mark.skipif(not bc.TIF_20M.exists(), reason="20 m south-pole GeoTIFF not downloaded")
CREST_IDS = ["connecting-ridge", "shackleton-rim", "de-gerlache-rim", "malapert-massif"]
LANDER_IDS = ["im-2-athena-20m", "lcross-centaur-20m", "griffin-1-20m", "im-1-odysseus-20m"]


def _crest(pid):
    entry = next(p for p in _meta()["patches"] if p["id"] == pid)
    return entry, bc.load_crest_png(bp.OUT / entry["file"], entry["height_offset_m"],
                                    entry["height_scale_m"]).astype(np.float64)


def test_crest_grid_registration():
    x, y = bc.pixel_centres()
    assert x.shape == (512, 512)
    assert x[0, 0] == -5110.0 and y[0, 0] == 5110.0                       # row 0 north, column 0 west
    assert x[0, -1] == 5110.0 and y[-1, 0] == -5110.0
    assert bc.pixel_of(-5110.0, 5110.0) == (0.0, 0.0) and bc.pixel_of(0.0, 0.0) == (255.5, 255.5)


def test_crest_encoding_roundtrip(tmp_path):
    # (a) 0.1 m steps with a per-patch whole-metre offset; raw 0 = no data; B = 0
    rng = np.random.default_rng(8)
    for lo, hi in [(740.13, 1958.92), (-1795.27, 1737.8), (-4000.0, 2552.0), (10.04, 10.06)]:
        h = rng.uniform(lo, hi, (64, 64))
        h[0, 0], h[0, 1], h[3, 5] = lo, hi, np.nan
        off = bc.choose_offset(h)
        assert off == math.floor(lo) - 1 and off == int(off)
        rgb = bc.encode_height(h, off)
        assert tuple(rgb[3, 5]) == (0, 0, 0) and not rgb[..., 2].any()
        raw = rgb[..., 0].astype(int) * 256 + rgb[..., 1]
        assert (raw == 0).sum() == 1 and 10 <= raw[0, 0] <= 20            # lowest height is never raw 0
        path = tmp_path / "c.png"
        bt.write_png(path, rgb)
        dec = bc.load_crest_png(path, off)
        assert dec.dtype == np.float32
        assert np.isnan(dec[3, 5]) and np.isnan(dec).sum() == 1
        ok = ~np.isnan(h)
        # half a step, plus the float32 storage of the decoded value (6e-5 m at 1 km, 2.5e-4 at 4 km)
        assert np.max(np.abs(dec[ok] - h[ok])) <= 0.05 + 3e-4
        assert np.array_equal(dec[ok], (raw[ok] * 0.1 + off).astype(np.float32))
        assert bc.encode_height(dec.astype(np.float64), off).tobytes() == rgb.tobytes()   # decode -> encode exact
    # the range of 0.1 m steps is 6553 m: a patch with more relief cannot be encoded
    with pytest.raises(ValueError):
        bc.encode_height(np.array([[0.0, 6553.6]]), -1.0)
    assert bc.encode_height(np.array([[0.0, 6552.5]]), -1.0)[0, 1].tolist() == [255, 255, 0]


def test_crest_list_and_glaser_spots():
    cl = bc.crest_list()
    assert [c["id"] for c in cl] == CREST_IDS
    assert [(c["lat"], c["lon"]) for c in cl[1:]] == [(-89.78, -155.7), (-88.67, -68.2), (-85.964, -2.319)]
    assert all(-180.0 < c["lon"] <= 180.0 for c in cl)
    # the connecting-ridge centre is midway between Glaser spots 2 and 4
    s2, s4 = bc.GLASER_SPOTS[1], bc.GLASER_SPOTS[3]
    assert s2[1:] == (-89.4399, 222.8524) and s4[1:] == (-89.4544, 222.8445)
    d2 = bp.great_circle_km(cl[0]["lat"], cl[0]["lon"], *s2[1:])
    d4 = bp.great_circle_km(cl[0]["lat"], cl[0]["lon"], *s4[1:])
    assert d2 == pytest.approx(d4, abs=1e-3) and d2 + d4 == pytest.approx(
        bp.great_circle_km(*s2[1:], *s4[1:]), abs=1e-3)
    # (d) all four spots are inside the patch with at least 1.5 km to its edge
    fr = bp.frame(cl[0]["lat"], cl[0]["lon"])
    for _name, lat, lon in bc.GLASER_SPOTS:
        x, y = bp.site_forward(bp.unit(lat, lon), fr)
        assert max(abs(float(x)), abs(float(y))) <= bc.HALF_M - 1500.0
        assert max(abs(float(x)), abs(float(y))) < 1000.0                 # in fact within 1 km of the centre


def test_glaser_spots_are_the_ones_of_study_f():
    pytest.importorskip("spiceypy")
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "validation"))
    import study_f_glaser20 as sf

    assert [(n, la, lo) for n, la, lo, _h in sf.SPOTS] == bc.GLASER_SPOTS


@needs_patches
def test_crest_entries_match_contract():
    meta = _meta()
    assert (meta["radius_m"], meta["size"], meta["pixel_m"]) == (1737400, 768, 80)   # file level unchanged
    crest = _crest_patches()
    assert [p["id"] for p in crest] == CREST_IDS and meta["patches"][34:38] == crest
    names = ["Shackleton-de Gerlache connecting ridge", "Shackleton rim", "de Gerlache rim", "Malapert massif"]
    for p, c, name in zip(crest, bc.crest_list(), names):
        assert list(p) == ["id", "name", "kind", "render", "lat", "lon", "file", "sites", "size", "pixel_m",
                           "height_scale_m", "height_offset_m", "source", "nodata_fraction", "min_m", "max_m"]
        assert p["name"] == name and p["kind"] == "crest20" and p["render"] is False and p["sites"] == []
        assert (p["lat"], p["lon"]) == (c["lat"], c["lon"]) and p["file"] == p["id"] + ".png"
        assert (p["size"], p["pixel_m"], p["height_scale_m"]) == (512, 20, 0.1)
        assert p["height_offset_m"] == int(p["height_offset_m"])
        assert 1.0 <= p["min_m"] - p["height_offset_m"] < 2.0 + 1e-9      # offset: a whole metre below the lowest height
        assert "LDEM_80S_20MPP_ADJ.TIF" in p["source"] and "http" in p["source"]
    for p in _site_patches():                                            # the 80 m entries carry no overrides
        assert not {"kind", "name", "render", "size", "pixel_m", "height_scale_m", "height_offset_m"} & set(p)


@needs_patches
@pytest.mark.parametrize("pid", CREST_IDS)
def test_crest_file_is_plain_png_matching_meta(pid):
    from PIL import Image

    entry, h = _crest(pid)
    path = bp.OUT / entry["file"]
    chunks, ihdr = bt.png_chunks(path)
    assert ihdr == {"width": 512, "height": 512, "bit_depth": 8, "color_type": 2, "interlace": 0}
    assert {c for c, _ in chunks} <= {"IHDR", "IDAT", "IEND"}             # no alpha, no profile
    rgb = np.asarray(Image.open(path))
    assert not rgb[..., 2].any()
    raw = rgb[..., 0].astype(int) * 256 + rgb[..., 1]
    assert np.array_equal(np.isnan(h), raw == 0)
    assert entry["nodata_fraction"] == pytest.approx(float((raw == 0).mean()), abs=1e-6)
    assert entry["nodata_fraction"] == 0.0
    assert entry["min_m"] == pytest.approx(float(np.nanmin(h)), abs=1e-3)
    assert entry["max_m"] == pytest.approx(float(np.nanmax(h)), abs=1e-3)
    assert bc.encode_height(h, entry["height_offset_m"]).tobytes() == rgb.tobytes()
    # the Python reference loads exactly these heights, on the 20 m grid
    p = hz.load_patch(pid)
    assert p.data.shape == (512, 512) and p.pixel_m == 20.0 and p.half_m == 5120.0
    assert (p.lat0, p.lon0) == (entry["lat"], entry["lon"])
    assert np.array_equal(p.data, h.astype(np.float32), equal_nan=True)


@needs_patches
@needs_tif20
@pytest.mark.parametrize("pid", CREST_IDS)
def test_crest_patch_agrees_with_20m_source(pid):
    # (b) Independent direction: random points -> lat/lon -> the source file (located with PROJ
    # from the file's own CRS, read as a window) against the patch sampled through its own
    # forward projection.
    import rasterio
    from rasterio.crs import CRS
    from rasterio.warp import transform
    from rasterio.windows import Window

    entry, h = _crest(pid)
    fr = bp.frame(entry["lat"], entry["lon"])
    rng = np.random.default_rng(CREST_IDS.index(pid))

    def source_at(lat, lon):
        with rasterio.open(bc.TIF_20M) as ds:
            xs, ys = transform(CRS.from_proj4(f"+proj=longlat +R={R} +no_defs"), ds.crs, list(lon), list(lat))
            xs, ys = np.array(xs), np.array(ys)
            t = ds.transform
            c0, r0 = int((xs.min() - t.c) / 20.0) - 2, int((t.f - ys.max()) / 20.0) - 2
            c1, r1 = int((xs.max() - t.c) / 20.0) + 3, int((t.f - ys.min()) / 20.0) + 3
            win = ds.read(1, window=Window(c0, r0, c1 - c0, r1 - r0))
            x_min, y_max = t.c + c0 * 20.0, t.f - r0 * 20.0
        return bp.bilinear(win, (xs - x_min) / 20.0 - 0.5, (y_max - ys) / 20.0 - 0.5)

    # 1. at 400 random pixel centres the patch IS the bilinear source sample rounded to 0.1 m:
    #    0.05 m of rounding (+ float32 storage and the PROJ/formula difference, well under 0.01 m)
    rows, cols = rng.integers(0, 512, 400), rng.integers(0, 512, 400)
    x, y = bc.pixel_centres()
    lat, lon = bp.unit_to_latlon(bp.site_inverse(x[rows, cols], y[rows, cols], fr))
    d = h[rows, cols] - source_at(lat, lon)
    assert np.all(np.isfinite(d)) and np.max(np.abs(d)) <= 0.06

    # 2. at 400 random points anywhere inside (between pixel centres) the patch is interpolated a
    #    second time, on a grid rotated against the source grid. Bilinear interpolation is exact on
    #    a plane, so the extra difference is set by how much the ground curves within one 20 m
    #    cell: at most h^2/4 * |second derivative| per interpolation. Measured over the four
    #    patches with 20000 points each (docs/research/patches.md): median 0.05 to 0.06 m, 99th
    #    percentile 0.48 to 0.53 m, worst 2.0 m. Tolerances: 0.06 m rounding + about twice that.
    px = rng.uniform(-5100.0, 5100.0, 400)
    py = rng.uniform(-5100.0, 5100.0, 400)
    lat, lon = bp.unit_to_latlon(bp.site_inverse(px, py, fr))
    got = bp.bilinear(h, *bc.pixel_of(px, py))
    d = got - source_at(lat, lon)
    assert np.all(np.isfinite(d))
    assert np.median(np.abs(d)) <= 0.06 + 0.06
    assert np.percentile(np.abs(d), 99) <= 0.06 + 1.0
    assert np.max(np.abs(d)) <= 0.06 + 2.5
    assert abs(float(d.mean())) < 0.03                                    # no bias


@needs_patches
@pytest.mark.parametrize("pid", CREST_IDS)
def test_crest_patch_agrees_with_80m_tile(pid):
    # (c) the same ground in the 80 m web tile L1: catches a misplaced, flipped or rotated patch
    if not (hz.DEFAULT_TILE_DIR / "sp_meta.json").exists():
        pytest.skip("tiles not built")
    entry, h = _crest(pid)
    _l0, l1 = hz.load_tile_grids()
    x, y = bc.pixel_centres()
    sl = slice(2, None, 4)                                                # every 4th pixel = 80 m
    lat, lon = bp.unit_to_latlon(bp.site_inverse(x[sl, sl], y[sl, sl], bp.frame(entry["lat"], entry["lon"])))
    tx, ty = hz.latlon_to_xy(lat, lon)
    t = bp.bilinear(l1.data, (tx - l1.x_min) / l1.pixel_m - 0.5, (l1.y_max - ty) / l1.pixel_m - 0.5)
    assert np.all(np.isfinite(t))
    # compare like with like: the mean of each 4 x 4 block of 20 m pixels (an 80 m cell)
    hb = h.reshape(128, 4, 128, 4).mean(axis=(1, 3))
    d = hb - t
    assert abs(float(d.mean())) < 2.0
    assert float(np.sqrt(np.mean(d ** 2))) < 6.0
    r = _corr(hb, t)
    assert r > 0.99, r
    for name, alt in [("north-south flip", hb[::-1]), ("east-west flip", hb[:, ::-1]),
                      ("transpose", hb.T), ("rotate 180", hb[::-1, ::-1]),
                      ("rotate 90", np.rot90(hb)), ("rotate 270", np.rot90(hb, 3))]:
        assert _corr(alt, t) < r - 0.05, name
    # a patch shifted by one 80 m cell in any direction fits worse than the real one
    rms0 = float(np.sqrt(np.mean((hb[1:-1, 1:-1] - t[1:-1, 1:-1]) ** 2)))
    for di, dj in [(0, 1), (0, -1), (1, 0), (-1, 0)]:
        sh = np.roll(hb, (di, dj), axis=(0, 1))[1:-1, 1:-1]
        assert float(np.sqrt(np.mean((sh - t[1:-1, 1:-1]) ** 2))) > rms0, (di, dj)


@needs_patches
@needs_tif20
def test_crest_rebuild_is_identical():
    from PIL import Image

    for c in bc.crest_list():
        entry, rgb = bc.entry_for(c, bc.build_crest(c["lat"], c["lon"]))
        assert entry == next(p for p in _meta()["patches"] if p["id"] == c["id"])
        assert rgb.tobytes() == np.asarray(Image.open(bp.OUT / entry["file"])).tobytes()


@needs_patches
def test_existing_site_patches_still_load():
    # (e) the 34 80 m patches load through the reference exactly as before the crest patches
    site = _site_patches()
    assert len(site) == 34
    for entry in site:
        p = hz.load_patch(entry["id"])
        assert p.data.shape == (768, 768) and p.pixel_m == 80.0 and p.half_m == 30720.0
        assert np.array_equal(p.data, bp.load_patch_png(bp.OUT / entry["file"]), equal_nan=True)


@needs_patches
@pytest.mark.skipif(not (bp.OUT / "patch_testvectors.json").exists(), reason="vectors not built")
def test_crest_testvectors():
    vec = json.loads((bp.OUT / "patch_testvectors.json").read_text())[6:11]
    assert len(vec) == 5
    entries = {p["id"]: p for p in _crest_patches()}
    for v, pid in zip(vec[:4], CREST_IDS):                                # the patch centres
        assert v["patch"] == pid and (v["lat"], v["lon"]) == (entries[pid]["lat"], entries[pid]["lon"])
    spot = vec[4]
    assert (spot["lat"], spot["lon"], spot["patch"]) == (-89.4399, 222.8524, "connecting-ridge")
    for v in vec:
        patch = hz.load_patch(v["patch"])
        e, d, h0, lev = hz.horizon_chain(v["lat"], v["lon"], 2.0, 0.5, patch=patch, return_details=True)
        # near the observer the skyline is 20 m ground from the patch; beyond 5 km it is the tiles
        assert np.all(lev[d <= 5000.0] == 0) and np.all(lev[d > 7300.0] != 0)
        assert (lev == 0).sum() > 360
    # under spot 2 the 20 m ground is about 1.1 m above the 80 m ground (docs/VALIDATION.md)
    h80 = hz.height_chain(spot["lat"], spot["lon"])
    assert 0.8 < spot["surface_h_m"] - h80 < 1.5


@needs_patches
@pytest.mark.skipif(not (bp.OUT / "crest_reference.json").exists(), reason="reference not built")
def test_crest_reference_reproduces(capsys):
    ref = json.loads((bp.OUT / "crest_reference.json").read_text())
    assert ref["point"] == {"name": "Glaser spot 2 (connecting ridge)", "lat": -89.4399, "lon": 222.8524,
                            "observer_height_m": 2.0}
    assert ref["period"] == {"start_utc": "2024-01-01T00:00:00Z", "end_utc": "2036-01-01T00:00:00Z",
                             "end_inclusive": False, "step_s": 3600, "samples": 105192}
    assert ref["earth_eclipses_considered"] is False and "any part of the solar disc" in ref["rule"]
    w, wo = ref["cases"]["with_patch"], ref["cases"]["without_patch"]
    assert w["patch"] == "connecting-ridge" and wo["patch"] is None
    # the 20 m patch roughly halves the longest darkness (docs/VALIDATION.md: 8.54 d -> 4.67 d)
    assert w["longest_darkness_days"] < 0.6 * wo["longest_darkness_days"]
    assert w["share_in_light"] > wo["share_in_light"]
    pytest.importorskip("spiceypy")
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "validation"))
    import vlib

    if not (vlib.CACHE_DIR / "2024-01-01T000000Z_166554_3600.npz").exists():
        pytest.skip("ephemeris cache of study F not present")
    before = (bp.OUT / "crest_reference.json").read_bytes()               # reference() must rewrite the same bytes
    bc.reference()
    capsys.readouterr()
    assert (bp.OUT / "crest_reference.json").read_bytes() == before


# --------------------------------------------------------------------------
# 20 m patches at the polar landers (same format as the crest patches)
# --------------------------------------------------------------------------
def _source20_at(lat, lon):
    """Bilinear 20 m source heights at lat/lon, located with PROJ from the file's own CRS (an
    independent route from the builder's formulas). NaN outside the file or where it has no data."""
    import rasterio
    from rasterio.crs import CRS
    from rasterio.warp import transform
    from rasterio.windows import Window

    with rasterio.open(bc.TIF_20M) as ds:
        xs, ys = transform(CRS.from_proj4(f"+proj=longlat +R={R} +no_defs"), ds.crs, list(lon), list(lat))
        xs, ys = np.array(xs), np.array(ys)
        t = ds.transform
        c0, r0 = int((xs.min() - t.c) / 20.0) - 2, int((t.f - ys.max()) / 20.0) - 2
        c1, r1 = int((xs.max() - t.c) / 20.0) + 3, int((t.f - ys.min()) / 20.0) + 3
        win = ds.read(1, window=Window(c0, r0, c1 - c0, r1 - r0), boundless=True, fill_value=np.nan)
        x_min, y_max = t.c + c0 * 20.0, t.f - r0 * 20.0
    return bp.bilinear(win, (xs - x_min) / 20.0 - 0.5, (y_max - ys) / 20.0 - 0.5)


def test_lander_list_matches_missions():
    missions = {m["id"]: m for m in json.loads(bp.MISSIONS.read_text())}
    ll = bc.lander_list()
    assert [c["id"] for c in ll] == LANDER_IDS
    for c in ll:
        (mid,) = c["sites"]
        assert c["id"] == mid + "-20m"
        m = missions[mid]
        assert c["name"] == m["name"]                                     # the mission's display name
        # centred on the mission site (20 m of slack for a later refinement of the coordinates)
        assert bp.great_circle_km(c["lat"], c["lon"], m["lat"], m["lon"]) < 0.02
        assert c["lat"] <= -80.0                                          # inside the 20 m product's cap


@needs_patches
def test_lander_entries_match_contract():
    meta = _meta()
    landers = _lander_patches()
    assert [p["id"] for p in landers] == LANDER_IDS and meta["patches"][38:] == landers
    for p, c in zip(landers, bc.lander_list()):
        assert list(p) == ["id", "name", "kind", "render", "lat", "lon", "file", "sites", "size", "pixel_m",
                           "height_scale_m", "height_offset_m", "source", "nodata_fraction", "min_m", "max_m"]
        assert p["name"] == c["name"] and p["kind"] == "crest20" and p["render"] is False
        assert p["sites"] == c["sites"] and len(p["sites"]) == 1
        assert (p["lat"], p["lon"]) == (c["lat"], c["lon"]) and p["file"] == p["id"] + ".png"
        assert (p["size"], p["pixel_m"], p["height_scale_m"]) == (512, 20, 0.1)
        assert p["height_offset_m"] == int(p["height_offset_m"])
        assert 1.0 <= p["min_m"] - p["height_offset_m"] < 2.0 + 1e-9
        assert "LDEM_80S_20MPP_ADJ.TIF" in p["source"] and "http" in p["source"]


@needs_patches
@pytest.mark.parametrize("pid", LANDER_IDS)
def test_lander_file_is_plain_png_matching_meta(pid):
    from PIL import Image

    entry, h = _crest(pid)
    path = bp.OUT / entry["file"]
    chunks, ihdr = bt.png_chunks(path)
    assert ihdr == {"width": 512, "height": 512, "bit_depth": 8, "color_type": 2, "interlace": 0}
    assert {c for c, _ in chunks} <= {"IHDR", "IDAT", "IEND"}
    rgb = np.asarray(Image.open(path))
    assert not rgb[..., 2].any()
    raw = rgb[..., 0].astype(int) * 256 + rgb[..., 1]
    assert np.array_equal(np.isnan(h), raw == 0)
    assert entry["nodata_fraction"] == pytest.approx(float((raw == 0).mean()), abs=1e-6)
    if pid == "im-1-odysseus-20m":
        # at the edge of the 20 m product (80S): the strip north of it is nodata, never invented.
        # The site itself and everything south of it has data.
        assert 0.05 < entry["nodata_fraction"] < 0.5
        assert np.all(np.isfinite(h[256:, :])) and np.all(np.isfinite(h[254:258, 254:258]))
        rows = np.where(np.isnan(h).any(axis=1))[0]
        assert rows.max() < 200                                           # all nodata is in the north
    else:
        assert entry["nodata_fraction"] == 0.0
    assert entry["min_m"] == pytest.approx(float(np.nanmin(h)), abs=1e-3)
    assert entry["max_m"] == pytest.approx(float(np.nanmax(h)), abs=1e-3)
    assert bc.encode_height(h, entry["height_offset_m"]).tobytes() == rgb.tobytes()
    p = hz.load_patch(pid)
    assert p.data.shape == (512, 512) and p.pixel_m == 20.0 and p.half_m == 5120.0 and p.outer is None
    assert (p.lat0, p.lon0) == (entry["lat"], entry["lon"])
    assert np.array_equal(p.data, h.astype(np.float32), equal_nan=True)


@needs_patches
@needs_tif20
@pytest.mark.parametrize("pid", LANDER_IDS)
def test_lander_patch_agrees_with_20m_source(pid):
    # same check as for the crest patches, with nodata allowed (IM-1)
    entry, h = _crest(pid)
    fr = bp.frame(entry["lat"], entry["lon"])
    rng = np.random.default_rng(100 + LANDER_IDS.index(pid))
    rows, cols = rng.integers(0, 512, 400), rng.integers(0, 512, 400)
    x, y = bc.pixel_centres()
    lat, lon = bp.unit_to_latlon(bp.site_inverse(x[rows, cols], y[rows, cols], fr))
    src = _source20_at(lat, lon)
    got = h[rows, cols]
    # the patch has data exactly where the source has it
    assert np.array_equal(np.isfinite(got), np.isfinite(src))
    ok = np.isfinite(got)
    assert ok.sum() >= 300 and np.max(np.abs(got[ok] - src[ok])) <= 0.06
    if pid != "im-1-odysseus-20m":
        assert ok.all()

    px = rng.uniform(-5100.0, 5100.0, 400)
    py = rng.uniform(-5100.0, 5100.0, 400)
    lat, lon = bp.unit_to_latlon(bp.site_inverse(px, py, fr))
    d = bp.bilinear(h, *bc.pixel_of(px, py)) - _source20_at(lat, lon)
    ok = np.isfinite(d)
    assert ok.sum() >= 300
    d = d[ok]
    assert np.median(np.abs(d)) <= 0.06 + 0.06
    assert np.percentile(np.abs(d), 99) <= 0.06 + 1.0
    assert np.max(np.abs(d)) <= 0.06 + 2.5
    assert abs(float(d.mean())) < 0.03


def _check_against_80m(hb, t):
    """hb: 4 x 4 block means of a 20 m patch (128 x 128); t: 80 m heights at the same cells."""
    ok = np.isfinite(hb) & np.isfinite(t)
    assert ok.mean() > 0.8
    d = (hb - t)[ok]
    assert abs(float(d.mean())) < 2.0
    assert float(np.sqrt(np.mean(d ** 2))) < 6.0
    r = _corr(hb, t)
    assert r > 0.99, r
    for name, alt in [("north-south flip", hb[::-1]), ("east-west flip", hb[:, ::-1]),
                      ("transpose", hb.T), ("rotate 180", hb[::-1, ::-1]),
                      ("rotate 90", np.rot90(hb)), ("rotate 270", np.rot90(hb, 3))]:
        assert _corr(alt, t) < r - 0.05, name
    inner = (slice(1, -1), slice(1, -1))
    both = ok[inner]
    rms0 = float(np.sqrt(np.mean((hb[inner] - t[inner])[both] ** 2)))
    for di, dj in [(0, 1), (0, -1), (1, 0), (-1, 0)]:
        sh = np.roll(hb, (di, dj), axis=(0, 1))[inner]
        m = both & np.isfinite(sh)
        assert float(np.sqrt(np.mean((sh - t[inner])[m] ** 2))) > rms0, (di, dj)


@needs_patches
@pytest.mark.parametrize("pid", LANDER_IDS[:3])
def test_lander_patch_agrees_with_80m_tile(pid):
    if not (hz.DEFAULT_TILE_DIR / "sp_meta.json").exists():
        pytest.skip("tiles not built")
    entry, h = _crest(pid)
    _l0, l1 = hz.load_tile_grids()
    x, y = bc.pixel_centres()
    sl = slice(2, None, 4)
    lat, lon = bp.unit_to_latlon(bp.site_inverse(x[sl, sl], y[sl, sl], bp.frame(entry["lat"], entry["lon"])))
    tx, ty = hz.latlon_to_xy(lat, lon)
    t = bp.bilinear(l1.data, (tx - l1.x_min) / l1.pixel_m - 0.5, (l1.y_max - ty) / l1.pixel_m - 0.5)
    assert np.all(np.isfinite(t))
    _check_against_80m(h.reshape(128, 4, 128, 4).mean(axis=(1, 3)), t)


@needs_patches
def test_im1_lander_patch_agrees_with_existing_80m_patch():
    # IM-1 is outside tile L1; its 80 m site patch has the same centre, so each 4 x 4 block of
    # 20 m pixels is exactly one 80 m pixel of that patch (central 128 x 128 pixels).
    entry, h = _crest("im-1-odysseus-20m")
    site = next(p for p in _site_patches() if p["id"] == "im-1-odysseus")
    assert (site["lat"], site["lon"]) == (entry["lat"], entry["lon"])
    t = _load(site)[384 - 64:384 + 64, 384 - 64:384 + 64]
    assert np.all(np.isfinite(t))
    _check_against_80m(h.reshape(128, 4, 128, 4).mean(axis=(1, 3)), t)


@needs_patches
@needs_tif20
def test_lander_rebuild_is_identical():
    from PIL import Image

    for c in bc.lander_list():
        entry, rgb = bc.entry_for(c, bc.build_crest(c["lat"], c["lon"]))
        assert entry == next(p for p in _meta()["patches"] if p["id"] == c["id"])
        assert rgb.tobytes() == np.asarray(Image.open(bp.OUT / entry["file"])).tobytes()


@needs_patches
@pytest.mark.skipif(not (bp.OUT / "patch_testvectors.json").exists(), reason="vectors not built")
def test_lander_testvectors():
    vec = json.loads((bp.OUT / "patch_testvectors.json").read_text())[11:]
    assert len(vec) == 4
    missions = {m["id"]: m for m in json.loads(bp.MISSIONS.read_text())}
    for v, entry in zip(vec, _lander_patches()):
        assert v["patch"] == entry["id"] and (v["lat"], v["lon"]) == (entry["lat"], entry["lon"])
        m = missions[entry["sites"][0]]
        assert bp.great_circle_km(v["lat"], v["lon"], m["lat"], m["lon"]) < 0.02   # observer at the mission site
        assert v["observer_height_m"] == 2.0 and v["az_step_deg"] == 0.5
        patch = hz.load_patch(v["patch"])
        e, d, h0, lev = hz.horizon_chain(v["lat"], v["lon"], 2.0, 0.5, patch=patch, return_details=True)
        assert np.allclose(e, v["elev_deg"], atol=1e-6)
        # the observer stands on 20 m ground; nothing beyond the patch corner comes from the patch
        assert hz.height_chain(v["lat"], v["lon"], patch, return_level=True)[1] == 0
        assert np.all(lev[d > 7300.0] != 0) and (lev == 0).sum() > 0
        if entry["nodata_fraction"] == 0.0:
            assert np.all(lev[d <= 5000.0] == 0)


# --------------------------------------------------------------------------
# outer level of the 80 m site patches (docs/DATA_CONTRACT.md, "Two-level site patches")
# --------------------------------------------------------------------------
def _outer_ids():
    return [p["id"] for p in _site_patches() if "outer" in p] if META.exists() else []


def _load_outer(entry):
    return bp.load_patch_png(bp.OUT / entry["outer"]["file"]).astype(np.float64)


def test_outer_grid_registration():
    x, y = bp.outer_pixel_centres()
    assert x.shape == (768, 768)
    assert x[0, 0] == -61360.0 and y[0, 0] == 61360.0                     # row 0 north, column 0 west
    assert x[0, -1] == 61360.0 and y[-1, 0] == -61360.0
    assert (bp.OUTER_SIZE, bp.OUTER_PIXEL_M, bp.OUTER_HALF_M) == (768, 160.0, 61440.0)


def test_outer_is_an_area_average_of_the_source(monkeypatch):
    # a source that alternates +1 / -1 every 40 m in x averages to 0 in every 160 m pixel (a
    # point sample would give +1 or -1); a tilted plane is reproduced at the pixel centres
    def stripes(lat0, lon0, x, y):
        return np.where(np.floor(x / 40.0) % 2 == 0, 1.0, -1.0) + 0.001 * x - 0.002 * y, ["test"]

    monkeypatch.setattr(bp, "build_heights", stripes)
    h, src = bp.build_outer(10.0, 20.0)
    x, y = bp.outer_pixel_centres()
    assert h.shape == (768, 768) and src == ["test"]
    assert np.max(np.abs(h - (0.001 * x - 0.002 * y))) < 1e-9

    def hole(lat0, lon0, x, y):                                           # one 40 m sample without data
        h = np.zeros(x.shape)
        h[5, 9] = np.nan
        return h, []

    monkeypatch.setattr(bp, "build_heights", hole)
    h, _ = bp.build_outer(10.0, 20.0)
    assert np.isnan(h[1, 2]) and np.isnan(h).sum() == 1                   # that pixel is nodata, no other


@needs_patches
def test_every_site_patch_has_an_outer_level():
    site = _site_patches()
    assert len(site) == 34 and _outer_ids() == [p["id"] for p in site]
    for p in site:
        o = p["outer"]
        assert (o["file"], o["size"], o["pixel_m"]) == (p["id"] + ".outer.png", 768, 160)
        assert set(o) == {"file", "size", "pixel_m", "source", "nodata_fraction"}
    for p in _meta()["patches"]:
        if p.get("kind") == bc.KIND:
            assert "outer" not in p                                       # 20 m patches have one level


@needs_patches
@pytest.mark.parametrize("pid", _outer_ids())
def test_outer_file_is_plain_png_and_loads(pid):
    from PIL import Image

    entry = next(p for p in _meta()["patches"] if p["id"] == pid)
    path = bp.OUT / entry["outer"]["file"]
    chunks, ihdr = bt.png_chunks(path)
    assert ihdr == {"width": 768, "height": 768, "bit_depth": 8, "color_type": 2, "interlace": 0}
    assert {c for c, _ in chunks} <= {"IHDR", "IDAT", "IEND"}
    rgb = np.asarray(Image.open(path))
    assert not rgb[..., 2].any()
    raw = rgb[..., 0].astype(int) * 256 + rgb[..., 1]
    assert entry["outer"]["nodata_fraction"] == pytest.approx(float((raw == 0).mean()), abs=1e-6)
    h = _load_outer(entry)
    assert np.array_equal(np.isnan(h), raw == 0)
    # the Python reference loads both levels, the fine one exactly as before
    p = hz.load_patch(pid)
    assert p.data.shape == (768, 768) and p.pixel_m == 80.0 and p.half_m == 30720.0
    assert p.outer.shape == (768, 768) and p.outer_pixel_m == 160.0 and p.outer_half_m == 61440.0
    assert np.array_equal(p.outer, h.astype(np.float32), equal_nan=True)
    assert np.array_equal(p.data, bp.load_patch_png(bp.OUT / entry["file"]), equal_nan=True)


@needs_patches
@pytest.mark.parametrize("pid", _outer_ids())
def test_outer_agrees_with_fine_level(pid):
    # same centre and registration: each outer pixel of the central 384 x 384 is exactly a
    # 2 x 2 block of fine (80 m) pixels
    entry = next(p for p in _meta()["patches"] if p["id"] == pid)
    fine = _load(entry).reshape(384, 2, 384, 2).mean(axis=(1, 3))
    o = _load_outer(entry)
    mid = o[192:576, 192:576]
    ok = np.isfinite(fine) & np.isfinite(mid)
    assert ok.mean() > 0.95 * np.isfinite(fine).mean()
    d = (mid - fine)[ok]
    assert abs(float(d.mean())) < 0.5
    assert float(np.sqrt(np.mean(d ** 2))) < 5.0
    r = _corr(mid, fine)
    assert r > 0.99, r
    # a misplaced outer level fits worse: flips, rotations and a one-pixel (160 m) shift
    for name, alt in [("north-south flip", mid[::-1]), ("east-west flip", mid[:, ::-1]),
                      ("transpose", mid.T), ("rotate 180", mid[::-1, ::-1])]:
        assert _corr(alt, fine) < r, name
    rms0 = float(np.sqrt(np.mean(d ** 2)))
    for di, dj in [(0, 1), (0, -1), (1, 0), (-1, 0)]:
        sh = o[192 + di:576 + di, 192 + dj:576 + dj]
        m = ok & np.isfinite(sh)
        assert float(np.sqrt(np.mean((sh - fine)[m] ** 2))) > rms0, (di, dj)


@needs_patches
@pytest.mark.parametrize("pid", _outer_ids())
def test_outer_agrees_with_whole_moon_map(pid, globe):
    entry = next(p for p in _meta()["patches"] if p["id"] == pid)
    x, y = bp.outer_pixel_centres()
    sl = slice(4, None, 8)
    lat, lon = bp.unit_to_latlon(bp.site_inverse(x[sl, sl], y[sl, sl], bp.frame(entry["lat"], entry["lon"])))
    g = np.array([globe(a, b) for a, b in zip(lat.ravel(), lon.ravel())]).reshape(lat.shape)
    hp = _load_outer(entry)[sl, sl]
    ok = np.isfinite(hp)
    assert ok.mean() > 0.9
    r = _corr(hp, g)
    assert r > 0.9, r
    for name, alt in [("north-south flip", hp[::-1]), ("east-west flip", hp[:, ::-1]),
                      ("transpose", hp.T), ("rotate 180", hp[::-1, ::-1]),
                      ("rotate 90", np.rot90(hp)), ("rotate 270", np.rot90(hp, 3))]:
        assert _corr(alt, g) < r - 0.05, name
    assert abs(float(np.mean(hp[ok] - g[ok]))) < 60.0


@needs_patches
def test_outer_rebuild_from_cache_is_identical(monkeypatch):
    from PIL import Image

    def no_network(url, ranges):
        raise AssertionError("network access during a rebuild from the cache")

    monkeypatch.setattr(bp, "_http_ranges", no_network)
    for pid in ["apollo-11", "chandrayaan-3", "im-1-odysseus"]:
        entry = next(p for p in _meta()["patches"] if p["id"] == pid)
        h, src = bp.build_outer(entry["lat"], entry["lon"])
        assert "; ".join(src) == entry["outer"]["source"]
        assert bt.encode_height(h).tobytes() == np.asarray(Image.open(bp.OUT / entry["outer"]["file"])).tobytes()


@needs_patches
@pytest.mark.skipif(not (bp.OUT / "patch_testvectors.json").exists(), reason="vectors not built")
def test_outer_level_sets_skyline_between_30_and_61_km():
    # lookup order fine -> outer -> tiles -> whole-Moon map: no skyline sample between the fine
    # edge and the outer edge comes from the whole-Moon map, none beyond the outer corner from the patch
    patch = hz.load_patch("apollo-15")
    e, d, h0, lev = hz.horizon_chain(26.13239, 3.6333, 2.0, 0.5, patch=patch, return_details=True)
    assert np.all(lev[d < 30000.0] == 0)
    assert np.all(lev[(d > 30720.0 * 1.4143) & (d < 61000.0)] == 4)
    assert np.all((lev[d > 61440.0 * 1.4143] != 0) & (lev[d > 61440.0 * 1.4143] != 4))
    before = Path(__file__).parent / "patch_testvectors_before_outer.json"
    old = {v["name"]: v for v in json.loads(before.read_text())}
    new = {v["name"]: v for v in json.loads((bp.OUT / "patch_testvectors.json").read_text())}
    # vectors of patches without an outer level (the 20 m crest patches, no patch) are unchanged
    for name, v in old.items():
        if v["patch"] is None or v["patch"] in CREST_IDS:
            assert new[name] == v, name
