# Moon globe colour texture

- **Source page:** NASA SVS "CGI Moon Kit", ID 4720 — https://svs.gsfc.nasa.gov/4720 (last updated 2026-01-09 per page; fetched 2026-11-14).
- **File used:** `lroc_color_poles_4k.tif` (2019 colour map, 4096x2048, 24-bit RGB TIFF; page lists 12.5 MB, downloaded 13,095,388 bytes, `Content-Type: image/tiff`, `file` reports TIFF; opened in Pillow as RGB 4096x2048).
  URL: https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_poles_4k.tif
  Raw copy: `data/raw/globe/dl/lroc_color_poles_4k.tif`.
- Derived from the LROC WAC Hapke-normalized mosaic. Page notes: "optimized for aesthetics, not science"; scientific use should go to the source data.
- The page also offers a **newer (Dec 2025) version** (`lroc_color_16bit_srgb_4k.tif`, 16-bit sRGB, better polar detail). Not used here (task named the 2019 file); a candidate upgrade.

## Outputs
| File | Size | Notes |
|---|---|---|
| `web/public/data/globe/moon_color_4k.jpg` | 1,445,667 B | 4096x2048, JPEG q85, progressive, 8-bit RGB |
| `web/public/data/globe/moon_color_2k.jpg` | 363,497 B | 2048x1024 Lanczos downsample, q85 |
| `web/public/data/globe/globe.json` | — | mapping + credit metadata |

Colour: source TIFF has no embedded ICC profile; values passed through unchanged and treated as sRGB (the SVS page describes its TIFFs as sRGB-encoded). In three.js set `texture.colorSpace = THREE.SRGBColorSpace`.

## Credit / usage terms (as stated on the page)
- "Please give credit for this item to: **NASA's Scientific Visualization Studio**" (Visualizer: Ernie Wright (STC); Scientist: Noah Petro (NASA/GSFC)).
- The page states no other licence or usage terms. (NASA media are generally usable with credit under NASA's media guidelines, but that is not stated on this page — unverified here.)

## Pixel → lon/lat mapping
Page: "The map is centered on 0° longitude"; each pixel is a longitude-latitude pair (equirectangular). Hence:
- left edge = 180°W (−180°), centre column = 0°, right edge = 180°E; longitude increases eastward (left→right); north at top (+90°), south at bottom.
- `lon = -180 + 360*(x+0.5)/W`, `lat = 90 - 180*(y+0.5)/H`.

### Sanity check (mean brightness, 0–255 grey, ±0.6° box, 4k image; global mean 149.4)
| Feature (lat, lon) | Assumed mapping | Lon mirrored | Lat flipped |
|---|---|---|---|
| Tycho (43.3S, 11.4W) — bright rays | **207.0** | 157.3 | 101.7 |
| Mare Crisium (17N, 59E) — dark | **83.1** | 63.8 | 133.0 |
| Aristarchus (23.7N, 47.4W) — very bright | **197.3** | 134.4 | 142.6 |
| Copernicus (9.6N, 20.1W) — bright | **171.1** | 59.6 | 85.9 |
| Mare Imbrium (33N, 16W) — dark | **90.3** | 91.0 | 142.5 |

All five match expectations only under the assumed mapping (bright craters bright, maria dark). The mirrored-longitude column fails on Tycho/Aristarchus/Copernicus; the flipped-latitude column fails everywhere. Crisium being darker in the mirrored column is because 59W lands in Oceanus Procellarum (also mare), not a contradiction.

### three.js note (derived from SphereGeometry's UV formula, not tested in the app)
With default `SphereGeometry` UVs (u = 0 at −X, u increases toward +Z), u = 0.5 is the +X axis, so lon 0° faces **+X**, lon 90°E faces **−Z**, lon 90°W faces **+Z**, north = +Y. A camera on +X looking at the origin with +Y up sees the near side with east on the right (Crisium on the right limb), as from Earth.
