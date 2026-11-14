# Lunar Landing Site Navigator

Entry for the 2026 NASA Space Apps Challenge, challenge
[Lunar Landing Site Navigator](https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/).
Singapore Local Event. Built from scratch during the hackathon (14–15 November 2026).

**Live app:** https://daniel27-space.github.io/lunar-navigator/

## What it does

Pick any point near the Moon's south pole and any date from 2024 to 2036, and see:

- the surface in 3D, lit by the Sun where it really is, with terrain shadows;
- where the Sun and Earth sit relative to that point's real terrain horizon;
- whether the point is in sunlight and whether Earth is in view, and how long until that changes;
- sunlight and Earth-visibility windows over the next 60 days, the longest night and the
  longest communication outage;
- up to three points side by side, to compare sites or dates;
- 41 past, failed and planned landing sites across the whole Moon.

Map layers: sunlight now, average sunlight, average Earth visibility, permanently shadowed
regions, elevation and slope.

## How it works

1. **Sun and Earth positions.** JPL's DE440 ephemeris and lunar orientation, read with SPICE,
   are precomputed hourly into a small table (`pipeline/ephem/`). The browser interpolates it and
   applies the observer's position on the surface (this matters for Earth: up to 0.26°).
2. **Terrain horizon.** For a chosen point the browser marches 720 rays outward over the LOLA
   elevation model, along great circles and in 3D so the Moon's curvature is included, and keeps
   the highest terrain angle in each direction (`web/src/lib/horizon.ts`, reference
   implementation in `pipeline/terrain/horizon.py`).
3. **Visibility.** The Sun and Earth are treated as discs, not points. "In sunlight" means at
   least half of the solar disc is above the terrain horizon.
4. **3D lighting.** The same elevation data is ray-marched on the GPU towards the Sun for every
   pixel, so the shadows on screen follow the same physics as the numbers.

## How we know it is right

- Sun and Earth angles agree with **JPL Horizons** to better than 0.001° at 6 sites and 8 dates
  between 2025 and 2034 (`docs/research/ephemeris-validation.md`).
- The browser horizon code reproduces the Python reference on real LOLA tiles to within 0.001°
  at six test points (`web/src/lib/horizon.real.test.ts`).
- Over a full 18.6-year cycle at 185 points, our share of time in sunlight correlates with
  **NASA GSFC's published illumination map** at r = 0.988 (RMS difference 2.7 percentage
  points); Earth visibility at r = 0.993. All tested permanently shadowed crater floors come
  out at exactly zero sunlight.
- For the Shackleton connecting ridge we get 92.29% illumination at 2 m and 95.69% at 10 m;
  **Gläser et al. (2014)** published 92.27% and 95.65%. Longest darkness matches at 10 m but
  not at 2 m (9.4 days against their 4.6), which is discussed in `docs/VALIDATION.md`.
- The total lunar eclipse of 14 March 2025 shows up as Earth covering the Sun at the Blue
  Ghost landing site.
- Full method, tables and disagreements: [`docs/VALIDATION.md`](docs/VALIDATION.md).
- Run the checks: `cd web && npm test` and
  `.venv/bin/python -m pytest -p no:cacheprovider pipeline`.

## Known limits

- Detailed terrain covers 80°S to 90°S. North of that the globe shows relief from a whole-Moon
  elevation map (about 2.7 km per pixel, slope lighting only, no cast shadows) and a pinned
  point gets its height from that map, but its horizon is still a smooth sphere and the card
  says so.
- Inside about 84.6°S the browser uses 80 m terrain. Outside it uses about 300 m terrain, where
  the horizon can be wrong by a degree or more; rise and set times there are less certain.
- Points close to 80°S are missing part of their northern horizon.
- On ridge crests the result is very sensitive to observer height: a mast a metre taller can
  halve the longest night.
- When Earth eclipses the Sun, sunlight refracted through Earth's atmosphere is ignored.
- Planned missions are placed at the centre of their announced target feature, not at a landing
  point.
- In the 3D view the outer 50 km of the detailed terrain (roughly 80°S to 81.7°S) fades into
  the coarser whole-Moon relief, so shadows look weaker there. The numbers on a site card always use
  the full terrain data.

## NASA data and resources

| What | Source |
|---|---|
| Planetary and lunar ephemeris DE440 (`de440s.bsp`), lunar orientation (`moon_pa_de440_200625.bpc`, `moon_de440_250416.tf`), `naif0012.tls`, `pck00011.tpc` | NASA JPL NAIF generic kernels, https://naif.jpl.nasa.gov/pub/naif/generic_kernels/ |
| South pole elevation `LDEM_80S_80MPP_ADJ.TIF` (LOLA, 80 m) | NASA GSFC PGDA product 78, https://pgda.gsfc.nasa.gov/products/78 |
| Average sunlight, average Earth visibility, permanently shadowed regions (`AVGVISIB_75S_120M_201608.TIF`, `AVGVISIB_75S_120M_201608_EARTH.TIF`, `LPSR_75S_120M_201608.TIF`) | NASA GSFC PGDA product 69, https://pgda.gsfc.nasa.gov/products/69 (Mazarico et al. 2011) |
| JPL Horizons, used as the independent check on Sun and Earth angles | https://ssd.jpl.nasa.gov/horizons/ |
| Whole-Moon colour map (LROC WAC) and whole-Moon elevation `ldem_16.tif` (LOLA, 16 pixels per degree), CGI Moon Kit | NASA's Scientific Visualization Studio, https://svs.gsfc.nasa.gov/4720 |
| Landing and impact site coordinates | NASA NSSDCA, https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_artifact_impacts.html (per-site sources in `web/public/data/missions.json`) |

## References

- Mazarico, E. et al. (2011), Illumination conditions of the lunar polar regions using LOLA
  topography, Icarus 211, 1066–1081.
- Barker, M. K. et al. (2023), LOLA south pole high-resolution topography (PGDA product 78).
- Gläser, P. et al. (2014), Illumination conditions at the lunar south pole using high
  resolution Digital Terrain Models from LOLA, Icarus 243, 78–90.
- Acton, C. H. (1996), Ancillary data services of NASA's Navigation and Ancillary Information
  Facility (SPICE).
- Software: SpiceyPy, NumPy, SciPy, Numba, Rasterio, Pillow, pytest (Python); React, three.js,
  @react-three/fiber, @react-three/drei, zustand, Vite, Vitest, pngjs (web).
- Research notes with sources: `docs/research/`.

## Use of AI tools

Code and documentation in this repository were written with AI assistance (Claude Code,
Anthropic), directed and reviewed by the team. AI-assisted commits carry a
`Co-Authored-By: Claude` trailer. No AI-generated images, video or audio are used.

## Pre-event disclosure

A learning prototype existed before the event in a separate repository. No code or generated
data from it is used here.

## Run it locally

```
cd web
npm install
npm run dev
```

The data files the app needs are committed under `web/public/data/`. To rebuild them from the
NASA sources, see `pipeline/` and `docs/DATA_CONTRACT.md`.
