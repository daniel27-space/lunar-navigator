"""Print the georeferencing facts of the LOLA source GeoTIFF and check them against
docs/DATA_CONTRACT.md.  Run:  .venv/bin/python pipeline/terrain/inspect_source.py
"""
import hashlib
import math
import sys
from pathlib import Path

import numpy as np
import rasterio
from rasterio.crs import CRS
from rasterio.warp import transform

sys.path.insert(0, str(Path(__file__).parent))
import horizon as hz  # noqa: E402

p = hz.DEFAULT_TIF
print("file", p.name, p.stat().st_size, "bytes")
print("sha256", hashlib.sha256(p.read_bytes()).hexdigest())
with rasterio.open(p) as ds:
    print("profile", ds.profile)
    print("crs wkt", ds.crs.to_wkt())
    print("crs proj4", ds.crs.to_proj4())
    print("bounds", ds.bounds, "res", ds.res)
    print("units", ds.units, "scales", ds.scales, "offsets", ds.offsets)
    print("tags", ds.tags())
    print("band tags", ds.tags(1))
    a = ds.read(1)
    print("dtype", a.dtype, "shape", a.shape)
    print("NaN pixels", int(np.isnan(a).sum()), "min", float(np.nanmin(a)), "max", float(np.nanmax(a)),
          "mean", float(np.nanmean(a)))
    n = a.shape[0]
    # value nearest the pole and corner validity
    print("centre 2x2", a[n // 2 - 1:n // 2 + 1, n // 2 - 1:n // 2 + 1].tolist())
    print("corner values", float(a[0, 0]), float(a[0, -1]), float(a[-1, 0]), float(a[-1, -1]))
    # contract projection vs the file's CRS (PROJ), on points across the grid
    lat = [-89.9, -89.45, -87.5, -85.99, -85.2, -81.0, -80.0, -78.0]
    lon = [0.0, 222.7, 355.0, -2.9, 31.0, 60.0, 90.0, 135.0]
    xs, ys = transform(CRS.from_proj4("+proj=longlat +R=1737400 +no_defs"), ds.crs, lon, lat)
    x, y = hz.latlon_to_xy(np.array(lat), np.array(lon))
    print("max |contract formula - PROJ| (m): x", float(np.max(np.abs(x - xs))),
          "y", float(np.max(np.abs(y - ys))))
print("80S radius 2R tan(5deg) =", 2 * hz.R_MOON_M * math.tan(math.radians(5)), "m; grid half-extent 304000 m")
r_corner = 304000 * math.sqrt(2)
print("corner latitude", 2 * math.degrees(math.atan(r_corner / (2 * hz.R_MOON_M))) - 90)
