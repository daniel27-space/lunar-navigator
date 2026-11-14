"""JPL Horizons access for validation: fetch (network) and parse (offline) az/el tables.

Raw API responses are cached in pipeline/ephem/fixtures/ so tests never need the network.

What Horizons does for a Moon surface site (read from the response headers, which are kept
verbatim in the fixtures):
  - Center pole/equ : MEAN_ME (high precision)  -> same body-fixed frame as SPICE MOON_ME
  - Center radii    : 1737.4, 1737.4, 1737.4 km -> sphere, so "geodetic" == planetocentric
                      and altitude is km above the same R as the contract
  - SITE_COORD      : E-lon(deg), lat(deg), alt(km)
  - Atmos refraction: NO (AIRLESS)
  - Quantity 4      : apparent az/el, az clockwise from north, elevation w.r.t. the plane
                      perpendicular to the reference-surface zenith; corrected for light time,
                      stellar aberration and gravitational light deflection
  - Ephemeris       : DE441 (identical to DE440 over 1550-2650 for our purposes)
  - Time            : UTC; beyond the last announced leap second the offset is held
                      constant, which is also what SPICE does with naif0012.tls

Usage: .venv/bin/python pipeline/ephem/horizons.py --fetch
"""
from __future__ import annotations

import json
import re
import sys
import time
from datetime import datetime, timezone

from common import FIXTURE_DIR, SITES, TIMES_UTC

API = "https://ssd.jpl.nasa.gov/api/horizons.api"
TARGETS = {"sun": "10", "earth": "399"}
_MONTHS = {m: i + 1 for i, m in enumerate(
    ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"])}


def _jd_utc(utc: str) -> float:
    dt = datetime.fromisoformat(utc.replace("Z", "+00:00")).astimezone(timezone.utc)
    return dt.timestamp() / 86400.0 + 2440587.5


def fixture_path(site_index: int, target: str):
    return FIXTURE_DIR / f"horizons_site{site_index}_{target}.txt"


def request_params(site: dict, target: str) -> dict:
    return {
        "format": "text",
        "COMMAND": f"'{TARGETS[target]}'",
        "OBJ_DATA": "'NO'",
        "MAKE_EPHEM": "'YES'",
        "EPHEM_TYPE": "'OBSERVER'",
        "CENTER": "'coord@301'",
        "COORD_TYPE": "'GEODETIC'",
        "SITE_COORD": f"'{site['lon']},{site['lat']},{site['h_m'] / 1000.0}'",
        "TLIST": "'" + " ".join(f"{_jd_utc(t):.9f}" for t in TIMES_UTC) + "'",
        "TIME_TYPE": "'UT'",
        "QUANTITIES": "'4,20'",
        "ANG_FORMAT": "'DEG'",
        "EXTRA_PREC": "'YES'",
        "CSV_FORMAT": "'YES'",
        "TIME_DIGITS": "'FRACSEC'",
    }


def fetch_all() -> None:
    import requests  # only needed for fetching

    FIXTURE_DIR.mkdir(parents=True, exist_ok=True)
    for i, site in enumerate(SITES):
        for target in TARGETS:
            r = requests.get(API, params=request_params(site, target), timeout=60)
            r.raise_for_status()
            if "$$SOE" not in r.text:
                raise RuntimeError(f"Horizons returned no table for {site['site']} / {target}:\n{r.text[:2000]}")
            fixture_path(i, target).write_text(r.text)
            print(f"fetched {site['site']} / {target}")
            time.sleep(0.5)  # be polite; Horizons asks for serial, unhurried requests
    (FIXTURE_DIR / "request_manifest.json").write_text(json.dumps({
        "api": API,
        "fetched_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "sites": SITES, "times_utc": TIMES_UTC,
        "params_example": request_params(SITES[0], "sun"),
    }, indent=2) + "\n")


def parse(text: str) -> list[dict]:
    """Parse a cached response -> [{utc, az, el, delta_au}] in table order."""
    body = text.split("$$SOE")[1].split("$$EOE")[0]
    rows = []
    for line in body.strip().splitlines():
        cols = [c.strip() for c in line.split(",")]
        m = re.match(r"(\d{4})-(\w{3})-(\d{2}) (\d{2}):(\d{2}):(\d{2})\.(\d+)", cols[0])
        y, mon, d, hh, mm, ss, frac = m.groups()
        dt = datetime(int(y), _MONTHS[mon], int(d), int(hh), int(mm), int(ss), tzinfo=timezone.utc)
        if round(float("0." + frac)) == 1:  # e.g. 05:59:59.9999 from JD rounding
            dt = datetime.fromtimestamp(dt.timestamp() + 1, tz=timezone.utc)
        rows.append({
            "utc": dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "frac_s": float("0." + frac),
            "az": float(cols[3]), "el": float(cols[4]), "delta_au": float(cols[5]),
        })
    return rows


def header_facts(text: str) -> dict:
    """The header lines that pin down Horizons' conventions; asserted in the tests."""
    def grab(label):
        m = re.search(rf"^{re.escape(label)}\s*:\s*(.+)$", text, re.M)
        return m.group(1).strip() if m else None
    return {k: grab(k) for k in ("Center pole/equ", "Center radii", "Center geodetic", "Atmos refraction")}


def load_cases() -> list[dict]:
    """All cached cases merged per (site, time): Horizons sun/earth az/el."""
    cases = []
    for i, site in enumerate(SITES):
        sun = parse(fixture_path(i, "sun").read_text())
        earth = parse(fixture_path(i, "earth").read_text())
        assert [r["utc"] for r in sun] == TIMES_UTC == [r["utc"] for r in earth], \
            f"Horizons time tags do not match requested times for {site['site']}"
        for s, e in zip(sun, earth):
            cases.append({**site, "utc": s["utc"],
                          "sun_az": s["az"], "sun_el": s["el"],
                          "earth_az": e["az"], "earth_el": e["el"],
                          "sun_delta_au": s["delta_au"], "earth_delta_au": e["delta_au"]})
    return cases


if __name__ == "__main__":
    if "--fetch" in sys.argv:
        fetch_all()
    for c in load_cases()[:3]:
        print(c)
