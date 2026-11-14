"""Tests for the ephemeris products.

Run: .venv/bin/python -m pytest pipeline/ephem -q

Offline: Horizons responses are cached in fixtures/. Tests that need SPICE kernels
(data/raw/kernels, git-ignored) skip with a message if the kernels are absent; the
web-method-vs-Horizons and physics tests need only ephem.bin + fixtures.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

import numpy as np
import pytest

from common import (ABCORR, FRAME, KERNEL_DIR, KERNELS, OUT_DIR, R_MOON_KM, RECORD, STEP_S,
                    T0_UTC, T1_UTC)
from horizons import fixture_path, header_facts, load_cases
from topo import load_ephem, sun_earth_azel, sun_earth_azel_web
from validate import KEYS, sky_sep_deg, wrap

needs_kernels = pytest.mark.skipif(
    not all((KERNEL_DIR / k).exists() for k in KERNELS),
    reason=f"SPICE kernels not present in {KERNEL_DIR}")

# Tolerances are set from the measured errors with headroom, not the other way round.
# Measured (docs/research/ephemeris-validation.md): SPICE-Horizons <= 7.4e-7 deg,
# web-SPICE <= 1.6e-4 deg. The project target is "well under 0.05 deg".
TOL_SPICE_VS_HORIZONS_DEG = 1e-5
TOL_WEB_DEG = 5e-4


def _iso(s: str) -> datetime:
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


# ---------- bin / json consistency ----------

def test_json_matches_contract():
    meta, _, _ = load_ephem()
    assert list(meta.keys()) == ["t0_utc", "step_s", "count", "frame", "abcorr", "kernels", "record"]
    assert meta["t0_utc"] == T0_UTC and meta["step_s"] == STEP_S == 3600
    assert meta["frame"] == FRAME == "MOON_ME" and meta["abcorr"] == ABCORR == "LT+S"
    assert meta["record"] == RECORD
    assert meta["kernels"] == KERNELS
    # coverage 2024-01-01T00:00Z .. 2036-01-01T00:00Z inclusive
    hours = (_iso(T1_UTC) - _iso(T0_UTC)).total_seconds() / STEP_S
    assert meta["count"] == hours + 1 == 105193


def test_bin_matches_json():
    meta, data, _ = load_ephem()
    size = (OUT_DIR / "ephem.bin").stat().st_size
    assert size == meta["count"] * len(meta["record"]) * 4
    assert data.shape == (meta["count"], 8)
    assert np.all(np.isfinite(data))
    # unit vectors (Float32 precision)
    assert np.max(np.abs(np.linalg.norm(data[:, 0:3].astype(np.float64), axis=1) - 1)) < 1e-6
    assert np.max(np.abs(np.linalg.norm(data[:, 4:7].astype(np.float64), axis=1) - 1)) < 1e-6
    # distances: Sun ~1 au, Earth between perigee and apogee (centre to centre, km)
    assert 1.45e8 < data[:, 3].min() and data[:, 3].max() < 1.53e8
    assert 3.55e5 < data[:, 7].min() and data[:, 7].max() < 4.08e5


@needs_kernels
def test_bin_records_match_spice():
    """Spot-check first, last and a few interior records against a fresh SPICE evaluation."""
    import spiceypy as spice
    from common import load_kernels, utc_to_et
    load_kernels()
    meta, data, _ = load_ephem()
    for i in (0, 1, 12345, 60000, meta["count"] - 1):
        utc = (_iso(meta["t0_utc"]) + timedelta(seconds=i * meta["step_s"])).strftime("%Y-%m-%dT%H:%M:%S")
        et = utc_to_et(utc)
        for col, body in ((0, "SUN"), (4, "EARTH")):
            p, _ = spice.spkpos(body, et, FRAME, ABCORR, "MOON")
            d = np.linalg.norm(p)
            assert np.allclose(data[i, col:col + 3], np.asarray(p) / d, atol=2e-7)
            assert abs(data[i, col + 3] - d) / d < 2e-7


# ---------- Horizons comparison ----------

def test_horizons_conventions_match_contract():
    """The cached Horizons headers state the conventions we rely on."""
    cases = load_cases()
    assert len({c["site"] for c in cases}) >= 5 and len({c["utc"] for c in cases}) >= 6
    years = sorted({c["utc"][:4] for c in cases})
    assert years[0] <= "2025" and years[-1] >= "2034"
    for i in range(len({c["site"] for c in cases})):
        for target in ("sun", "earth"):
            facts = header_facts(fixture_path(i, target).read_text())
            assert facts["Center pole/equ"].startswith("MEAN_ME")
            assert facts["Center radii"].startswith(f"{R_MOON_KM}, {R_MOON_KM}, {R_MOON_KM} km")
            assert facts["Atmos refraction"].startswith("NO (AIRLESS)")


def _check(calc, ref, tol):
    """el, az*cos(el) and on-sky separation all within tol degrees."""
    for body in ("sun", "earth"):
        d_el = calc[f"{body}_el"] - ref[f"{body}_el"]
        d_az = wrap(calc[f"{body}_az"] - ref[f"{body}_az"])
        sep = sky_sep_deg(calc[f"{body}_az"], calc[f"{body}_el"], ref[f"{body}_az"], ref[f"{body}_el"])
        assert abs(d_el) < tol, (body, "el", d_el)
        assert abs(d_az) < tol, (body, "az", d_az)   # raw azimuth; no site here is near the zenith singularity
        assert sep < tol, (body, "sep", sep)


@needs_kernels
@pytest.mark.parametrize("case", load_cases(), ids=lambda c: f"{c['site']}@{c['utc']}")
def test_direct_spice_vs_horizons(case):
    calc = sun_earth_azel(case["lat"], case["lon"], case["h_m"], case["utc"])
    _check(calc, case, TOL_SPICE_VS_HORIZONS_DEG)
    # range cross-check (Horizons 'delta' is apparent range in au)
    au = 149597870.7
    assert abs(calc["sun_dist_km"] - case["sun_delta_au"] * au) < 20.0     # delta printed to ~1e-14 au; LT+S vs apparent
    assert abs(calc["earth_dist_km"] - case["earth_delta_au"] * au) < 0.05


@pytest.mark.parametrize("case", load_cases(), ids=lambda c: f"{c['site']}@{c['utc']}")
def test_web_method_vs_horizons(case):
    """Needs no kernels: ephem.bin + cached Horizons only. This is what the browser reproduces."""
    calc = sun_earth_azel_web(case["lat"], case["lon"], case["h_m"], case["utc"])
    _check(calc, case, TOL_WEB_DEG)


@needs_kernels
def test_web_method_vs_direct_spice_random_sample():
    rng = np.random.default_rng(20261114)
    t0 = _iso(T0_UTC)
    span = (_iso(T1_UTC) - t0).total_seconds()
    worst = 0.0
    for _ in range(400):
        # half the sample over the whole sphere, half in the south polar cap the app targets
        lat = float(np.degrees(np.arcsin(rng.uniform(-1, 1)))) if rng.random() < 0.5 else float(rng.uniform(-90, -80))
        lon, h_m = float(rng.uniform(0, 360)), float(rng.uniform(-6000, 6000))
        utc = (t0 + timedelta(seconds=float(rng.uniform(0, span)))).strftime("%Y-%m-%dT%H:%M:%SZ")
        a, b = sun_earth_azel(lat, lon, h_m, utc), sun_earth_azel_web(lat, lon, h_m, utc)
        for body in ("sun", "earth"):
            worst = max(worst, sky_sep_deg(a[f"{body}_az"], a[f"{body}_el"], b[f"{body}_az"], b[f"{body}_el"]))
            assert abs(a[f"{body}_ang_radius"] - b[f"{body}_ang_radius"]) < 1e-5
    assert worst < TOL_WEB_DEG, worst


def test_validation_vectors_are_the_horizons_values():
    vectors = json.loads((OUT_DIR / "validation_vectors.json").read_text())
    cases = load_cases()
    assert len(vectors) == len(cases) >= 30
    for v, c in zip(vectors, cases):
        assert list(v.keys()) == ["site", "lat", "lon", "h_m", "utc", "sun_az", "sun_el",
                                  "earth_az", "earth_el", "source"]
        assert v["source"] == "JPL Horizons"
        for k in ("site", "lat", "lon", "h_m", "utc") + KEYS:
            assert v[k] == c[k]


# ---------- physics sanity ----------

def test_polar_sun_and_earth_elevation_physics():
    """At the south pole (h = 0) over the full 12 years:
    - Sun elevation stays within the lunar axial tilt to the ecliptic (~1.54 deg) and actually
      reaches most of it (so the bound is not passed trivially);
    - Earth elevation stays within latitude libration + parallax (~6.9 deg) and oscillates
      with the ~27.2-day draconic month.
    Uses the web method's arithmetic, vectorised over every hourly record."""
    meta, data, _ = load_ephem()
    d = data.astype(np.float64)
    site = np.array([0.0, 0.0, -R_MOON_KM])
    up = np.array([0.0, 0.0, -1.0])

    def elev(unit, dist):
        v = unit * dist[:, None] - site
        return np.degrees(np.arcsin((v @ up) / np.linalg.norm(v, axis=1)))

    sun_el, earth_el = elev(d[:, 0:3], d[:, 3]), elev(d[:, 4:7], d[:, 7])

    assert np.max(np.abs(sun_el)) < 1.6
    assert sun_el.max() > 1.45 and sun_el.min() < -1.45
    # one sign change of solar elevation per half year (seasons): ~24 crossings in 12 years
    sun_cross = np.count_nonzero(np.diff(np.sign(sun_el)) != 0)
    assert 22 <= sun_cross <= 26

    # Earth. Seen from the Moon's centre the sub-Earth latitude (libration in latitude) stays
    # within about +/-6.87 deg. At the pole the observer sits 1737.4 km "below" the centre along
    # the up axis, so parallax lowers the Earth by R/dist = 0.24..0.28 deg at all times. The
    # topocentric range is therefore asymmetric: about -7.11 .. +6.62 deg, not +/-7.
    sub_earth_lat = np.degrees(np.arcsin(d[:, 6]))
    assert np.max(np.abs(sub_earth_lat)) < 6.9
    assert sub_earth_lat.max() > 6.5 and sub_earth_lat.min() < -6.5
    parallax = earth_el - (-sub_earth_lat)
    assert -0.29 < parallax.min() and parallax.max() < -0.23
    assert -7.2 < earth_el.min() < -6.9 and 6.4 < earth_el.max() < 6.7
    cross = np.flatnonzero(np.diff(np.sign(earth_el)) != 0)
    period_days = 2 * np.mean(np.diff(cross)) * meta["step_s"] / 86400.0
    assert 27.0 < period_days < 27.4, period_days
