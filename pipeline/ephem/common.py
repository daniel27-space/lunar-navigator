"""Shared constants, paths and SPICE kernel loading for the ephemeris pipeline.

Conventions are fixed by docs/DATA_CONTRACT.md.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import spiceypy as spice

REPO = Path(__file__).resolve().parents[2]
KERNEL_DIR = REPO / "data" / "raw" / "kernels"
OUT_DIR = REPO / "web" / "public" / "data" / "ephem"
FIXTURE_DIR = Path(__file__).resolve().parent / "fixtures"

# Order matters only for readability; none of these override each other.
KERNELS = [
    "naif0012.tls",               # leap seconds
    "pck00011.tpc",               # generic PCK (body constants)
    "de440s.bsp",                 # planetary/lunar ephemeris
    "moon_pa_de440_200625.bpc",   # lunar orientation (principal axes), binary PCK
    "moon_de440_250416.tf",       # MOON_PA / MOON_ME frame definitions
]

FRAME = "MOON_ME"
ABCORR = "LT+S"
R_MOON_KM = 1737.4
R_SUN_KM = 695700.0
R_EARTH_KM = 6378.137

T0_UTC = "2024-01-01T00:00:00Z"
T1_UTC = "2036-01-01T00:00:00Z"
STEP_S = 3600
RECORD = ["sun_x", "sun_y", "sun_z", "sun_dist_km",
          "earth_x", "earth_y", "earth_z", "earth_dist_km"]

_loaded = False


def load_kernels() -> None:
    """Furnish the kernel set once per process."""
    global _loaded
    if _loaded:
        return
    for name in KERNELS:
        path = KERNEL_DIR / name
        if not path.exists():
            raise FileNotFoundError(f"missing kernel {path}; see docs/research/ephemeris-validation.md")
        spice.furnsh(str(path))
    _loaded = True


def utc_to_et(utc: str) -> float:
    """ISO-8601 UTC string (optionally ending in Z) -> ephemeris time (TDB seconds past J2000)."""
    load_kernels()
    return spice.str2et(utc.rstrip("Z"))


def site_vector_km(lat_deg: float, lon_deg: float, h_m: float) -> np.ndarray:
    """Site position in MOON_ME, km. Planetocentric lat, east-positive lon, h above the 1737.4 km sphere."""
    lat, lon = np.radians(lat_deg), np.radians(lon_deg)
    r = R_MOON_KM + h_m / 1000.0
    return r * np.array([np.cos(lat) * np.cos(lon), np.cos(lat) * np.sin(lon), np.sin(lat)])


def enu_basis(lat_deg: float, lon_deg: float):
    """East, North, Up unit vectors on the sphere, expressed in MOON_ME."""
    lat, lon = np.radians(lat_deg), np.radians(lon_deg)
    east = np.array([-np.sin(lon), np.cos(lon), 0.0])
    north = np.array([-np.sin(lat) * np.cos(lon), -np.sin(lat) * np.sin(lon), np.cos(lat)])
    up = np.array([np.cos(lat) * np.cos(lon), np.cos(lat) * np.sin(lon), np.sin(lat)])
    return east, north, up


def azel_deg(v: np.ndarray, lat_deg: float, lon_deg: float):
    """Azimuth (deg clockwise from north) and elevation (deg) of a MOON_ME vector from the site to a body."""
    east, north, up = enu_basis(lat_deg, lon_deg)
    u = v / np.linalg.norm(v)
    e, n, z = u @ east, u @ north, u @ up
    az = np.degrees(np.arctan2(e, n)) % 360.0
    el = np.degrees(np.arcsin(np.clip(z, -1.0, 1.0)))
    return float(az), float(el)


# Validation sites. Coordinates are approximate published landing/target coordinates;
# heights are nominal test inputs (the comparison only needs both sides to use the same h),
# not surveyed elevations.
SITES = [
    {"site": "Shackleton rim (approx)", "lat": -89.45, "lon": 222.7, "h_m": 1300.0},
    {"site": "Apollo 11", "lat": 0.674, "lon": 23.473, "h_m": -1930.0},
    {"site": "Chandrayaan-3", "lat": -69.373, "lon": 32.319, "h_m": 0.0},
    {"site": "IM-1 Odysseus (approx)", "lat": -80.13, "lon": 1.44, "h_m": 2500.0},
    {"site": "Chang'e 4 (far side)", "lat": -45.457, "lon": 177.589, "h_m": -5900.0},
    {"site": "North pole region", "lat": 88.0, "lon": 300.0, "h_m": 0.0},
]

# Deliberately off the hour so the web-method interpolation is exercised.
TIMES_UTC = [
    "2025-03-14T06:30:00Z",
    "2026-08-12T17:45:30Z",
    "2027-12-01T03:10:00Z",
    "2029-02-18T21:20:00Z",
    "2030-06-21T12:00:00Z",
    "2031-10-05T08:55:00Z",
    "2033-04-27T15:35:00Z",
    "2034-11-11T23:59:00Z",
]
