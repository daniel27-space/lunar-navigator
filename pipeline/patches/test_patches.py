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
import build_tiles as bt  # noqa: E402
import horizon as hz  # noqa: E402

R = 1737400.0
META = bp.OUT / "patches.json"
needs_patches = pytest.mark.skipif(not META.exists(), reason="patches not built")
needs_tif = pytest.mark.skipif(not bp.TIF_80S.exists(), reason="80 m south-pole GeoTIFF not downloaded")


def _meta():
    return json.loads(META.read_text())


def _patch_ids():
    return [p["id"] for p in _meta()["patches"]] if META.exists() else []


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
    served = [s for p in meta["patches"] for s in p["sites"]]
    assert len(served) == len(set(served))
    by_site = {s: p for p in meta["patches"] for s in p["sites"]}
    for m in missions:
        if bp.in_l1(m["lat"], m["lon"]):
            assert m["id"] not in by_site
            continue
        p = by_site[m["id"]]
        assert bp.great_circle_km(m["lat"], m["lon"], p["lat"], p["lon"]) <= bp.SHARE_KM
    centres = [(p["lat"], p["lon"]) for p in meta["patches"]]
    for i, a in enumerate(centres):                                       # no redundant patch
        for b in centres[:i]:
            assert bp.great_circle_km(*a, *b) > bp.SHARE_KM
    for p in meta["patches"]:
        assert p["id"] == p["sites"][0] and p["file"] == p["id"] + ".png"
        assert "http" in p["source"]
        assert not bp.in_l1(p["lat"], p["lon"])
    assert meta["patches"] == [
        {**p, **{k: q[k] for k in ("id", "lat", "lon", "sites")}}
        for p, q in zip(meta["patches"], bp.choose_patches(missions))]


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
    assert [v["patch"] for v in vec] == ["apollo-17", "apollo-15", "im-1-odysseus", "chandrayaan-3",
                                         "apollo-11", None]
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
