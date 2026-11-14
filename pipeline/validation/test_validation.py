"""Headline validation agreements, with tolerances set wider than what was measured on 2026-11-14.

Run from the repo root (after the study scripts; see README.md):
    .venv/bin/python -m pytest -p no:cacheprovider pipeline/validation -q
Tests that read results/*.json are skipped with a message if the study has not been run.
"""
import json
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).parent))
import vlib as v  # noqa: E402
import topo  # noqa: E402  (pipeline/ephem/topo.py, the SPICE reference)


def result(name):
    f = v.OUT_DIR / name
    if not f.exists():
        pytest.skip(f"{name} missing: run the study script first (pipeline/validation/README.md)")
    return json.loads(f.read_text())


# ---------------------------------------------------------------- method checks (live)
def test_vectorised_ephemeris_matches_spice_topocentric_reference():
    et, sun, earth = v.ephem_table("2027-03-01T00:00:00Z", 48, 3600)
    for i, (lat, lon, h) in zip((0, 17, 47), ((-89.45, 222.7, 1950.0), (-80.13, 1.44, 2590.0), (-85.96, 357.68, 5000.0))):
        ref = topo.sun_earth_azel(lat, lon, h, v.et_to_utc(et[i]))
        for body, rb, key in ((sun, v.ec.R_SUN_KM, "sun"), (earth, v.ec.R_EARTH_KM, "earth")):
            az, el, rad = v.azel_rad(body[i:i + 1], lat, lon, h, rb)
            assert abs(az[0] - ref[f"{key}_az"]) < 1e-4
            assert abs(el[0] - ref[f"{key}_el"]) < 1e-4      # 0.36 arcsec; measured <= 0.1 arcsec
            assert abs(rad[0] - ref[f"{key}_ang_radius"]) < 1e-6


def test_disc_model_flat_horizon():
    hor = np.zeros(720)
    az = np.array([10.0, 10.0, 10.0, 10.0])
    rad = np.full(4, 0.266)
    el = np.array([0.0, 0.266, -0.266, 0.133])
    frac, cen = np.empty(4), np.empty(4)
    v.disc_series(az, el, rad, hor, 0.5, v.N_STRIP, frac, cen)
    assert frac[0] == pytest.approx(0.5, abs=1e-9)
    assert frac[1] == pytest.approx(1.0) and frac[2] == pytest.approx(0.0)
    # half-radius above the horizon: exact circular-segment area is 0.8045
    assert frac[3] == pytest.approx(0.8045, abs=0.003)
    assert v.longest_run(np.array([0, 1, 1, 0, 1, 1, 1, 0], bool)) == 3


def test_crater_floor_gets_no_sun_live():
    _et, sun, _e = v.ephem_table(v.T0_CYCLE, v.HOURS_CYCLE, 3600)
    s = v.site_series(-89.67, 129.2, 2.0, sun, None)      # Shackleton floor
    assert s["sun"].max() == 0.0


# ---------------------------------------------------------------- A: PGDA averages
def test_a_sun_average_vs_pgda():
    s = result("study_a.json")["summary"]
    # measured: 2 m any-part r 0.988, bias +0.007, rms 0.027; 0 m r 0.952, bias -0.011, rms 0.051
    assert s["sun_2m_any"]["pearson_r"] > 0.975 and abs(s["sun_2m_any"]["mean_bias"]) < 0.02 and s["sun_2m_any"]["rms"] < 0.04
    assert s["sun_0m_any"]["pearson_r"] > 0.93 and abs(s["sun_0m_any"]["mean_bias"]) < 0.03 and s["sun_0m_any"]["rms"] < 0.07
    assert s["sun_2m_any"]["median_abs"] < 0.01 and s["sun_0m_any"]["median_abs"] < 0.01
    # disc-weighted average reads lower than PGDA at both heights (measured -0.010 and -0.028)
    assert -0.05 < s["sun_2m_avg_disc"]["mean_bias"] < 0.0 and s["sun_2m_avg_disc"]["rms"] < 0.04


def test_a_earth_visibility_vs_pgda():
    s = result("study_a.json")["summary"]
    # PGDA rule: any part of the Earth's disc. measured: 0 m r 0.983, rms 0.041; 2 m r 0.993, rms 0.028
    assert s["earth_0m_any"]["pearson_r"] > 0.97 and abs(s["earth_0m_any"]["mean_bias"]) < 0.02 and s["earth_0m_any"]["rms"] < 0.06
    assert s["earth_2m_any"]["pearson_r"] > 0.98 and abs(s["earth_2m_any"]["mean_bias"]) < 0.02 and s["earth_2m_any"]["rms"] < 0.04


def test_a_known_disagreement_at_ground_level_on_ridge_crests():
    """Recorded, not hidden: at 0 m the ridge-crest points read far below PGDA; at 2 m they do not."""
    pts = {p["name"]: p for p in result("study_a.json")["points"]}
    p = pts["Shackleton rim"]
    assert p["pgda_sun"] - p["sun_0m"]["any"] > 0.2
    assert abs(p["pgda_sun"] - p["sun_2m"]["any"]) < 0.1


# ---------------------------------------------------------------- B: permanent shadow
def test_b_permanent_shadow():
    b = result("study_b.json")["summary"]
    assert b["0m"]["floors_zero"] == 4 and b["2m"]["floors_zero"] == 4
    assert b["0m"]["pgda_psr_and_ours_psr"] + b["0m"]["pgda_lit_and_ours_lit"] >= 38     # measured 40 / 40
    assert b["2m"]["pgda_psr_and_ours_psr"] + b["2m"]["pgda_lit_and_ours_lit"] >= 37     # measured 39 / 40


# ---------------------------------------------------------------- C: Glaser et al. 2014
def test_c_connecting_ridge_time_in_light():
    c = result("study_c.json")
    for h, tol in (("2.0", 0.02), ("10.0", 0.015)):
        pub = c["published"][h]["in_light"]
        assert abs(c["best"][h]["best"]["in_light"] - pub) < tol
    for sp in c["spots"]:                                   # published coordinates as given
        pub = c["published"][str(sp["height_m"])]
        assert abs(sp["in_light"] - pub["in_light"]) < 0.02
        assert abs(sp["avg_illum"] - pub["avg_illum"]) < 0.02
    assert abs(c["best"]["10.0"]["best"]["longest_dark_d"] - 3.17) < 1.0


def test_c_known_disagreement_longest_darkness_at_2m():
    """Recorded, not hidden: at the published 2 m spots our longest darkness is about twice theirs (4.62 d)."""
    c = result("study_c.json")
    d = [sp["longest_dark_d"] for sp in c["spots"] if sp["height_m"] == 2.0]
    assert min(d) > 6.0 and max(d) < 12.0


# ---------------------------------------------------------------- D: missions
def test_d_im1_and_im2_timelines_are_consistent():
    d = result("study_d.json")
    im1 = d["im-1-odysseus"]
    ev = {e["type"]: e["utc"] for e in im1["sources"]["tif"]["events"]}
    assert ev["sunrise"] < im1["reported"]["landing_utc"] < im1["reported"]["end_utc"] < ev["sunset"]
    assert "2024-03-01" < ev["sunset"] < "2024-03-04"       # measured 2024-03-02T18:00Z
    assert ev["sunset"] < [e for e in im1["smooth_sphere_events"] if e["type"] == "sunset"][0]["utc"]
    im2 = d["im-2-athena"]
    ev = {e["type"]: e["utc"] for e in im2["sources"]["tif"]["events"]}
    assert ev["sunrise"] < im2["reported"]["landing_utc"] and "2025-03-16" < ev["sunset"]   # 10-day plan fits in daylight
    assert im2["earth_in_front_of_sun"]["total"] is not None  # 14 Mar 2025 eclipse: seen, not modelled


# ---------------------------------------------------------------- E: sensitivity
def test_e_web_tiles_close_to_full_resolution():
    e = result("study_e.json")
    for r in e["rows"]:
        assert abs(r["avg_tiles"] - r["avg_tif"]) < 0.02      # measured max 0.0096
        assert abs(r["avg_tif_az025"] - r["avg_tif"]) < 0.001  # azimuth step converged
        assert abs(r["avg2026_hourly"] - r["avg2026_5min"]) < 0.001  # hourly step converged
        if "floor" in r["name"]:
            assert r["avg_tif"] == 0.0 and r["avg_tiles"] == 0.0
