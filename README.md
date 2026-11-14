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
- **a site finder**: say what the mission needs (slope limit, how much sunlight, how much Earth
  view, in or near permanent shadow) or pick a goal such as "Ice prospecting", and the map
  shades the ground that qualifies, brightest where it fits best, with a ranked shortlist;
- **a comparison** of two or three pinned sites: a verdict in plain words, the same 60 days on
  one shared timeline, and one row per measure with the winner marked;
- 41 past, failed and planned landing sites across the whole Moon, each with 80 m terrain
  around it, so the same analysis works at Apollo 15 or Chang'e 4 as at the pole.

Map layers: sunlight now, average sunlight, average Earth visibility, permanently shadowed
regions, elevation and slope.

The finder and comparison were designed from patterns in other fields (GIS suitability tools,
property search, product-comparison sites, sun-planning tools); see
`docs/research/design-references.md`.

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
- The browser horizon code reproduces the Python reference to within 0.001° at six south-pole
  points and six mission-site and whole-Moon points (`web/src/lib/horizon.real.test.ts`).
- Each mission-site terrain patch is checked against the whole-Moon map for position and
  orientation (correlation 0.94 to 0.998); at Apollo 15 the Apennine front, Mons Hadley and
  Hadley Rille fall where they should.
- Over a full 18.6-year cycle at 185 points, our share of time in sunlight correlates with
  **NASA GSFC's published illumination map** at r = 0.988 (RMS difference 2.7 percentage
  points); Earth visibility at r = 0.993. All tested permanently shadowed crater floors come
  out at exactly zero sunlight.
- For the Shackleton connecting ridge we get 92.29% illumination at 2 m and 95.69% at 10 m;
  **Gläser et al. (2014)** published 92.27% and 95.65%. Longest darkness matches at 10 m. At
  2 m the app's 80 m terrain gives about 9 days against their 4.6; on the 20 m LOLA terrain
  they used, our method gives 4.67 days. The 80 m grid averages each cell and lowers the
  crest by about a metre (`docs/VALIDATION.md`, follow-up section).
- The total lunar eclipse of 14 March 2025 shows up as Earth covering the Sun at the Blue
  Ghost landing site.
- Full method, tables and disagreements: [`docs/VALIDATION.md`](docs/VALIDATION.md).
- With the 20 m ridge patch, the browser code itself gives a longest night of 4.67 days at
  Gläser's spot 2 (published 4.62), and 9.25 days without it
  (`web/src/lib/crest.real.test.ts`).
- Run the checks: `cd web && npm test` and
  `.venv/bin/python -m pytest -p no:cacheprovider pipeline`.

## Known limits

- Detailed terrain (80 m) covers 80°S to 90°S and a 61 km square around each mission site.
  Everywhere else the globe uses a whole-Moon elevation map (about 2.7 km per pixel, slope
  lighting only, no cast shadows). A point pinned there gets a horizon from that map alone,
  which misses hills smaller than a few km; the card says so.
- At a mission site the horizon uses 80 m terrain out to about 30 km and the whole-Moon map
  beyond, so a distant peak can be underestimated.
- Inside about 84.6°S the browser uses 80 m terrain. Outside it uses about 300 m terrain, where
  the horizon can be wrong by a degree or more; rise and set times there are less certain.
- On ridge crests the result is very sensitive to observer height: a mast a metre taller can
  halve the longest night.
- The 80 m terrain is a per-cell average, so on crests and crater rims the longest night can be
  off by days and a single point's sunlight share by several points. Four such places (the
  Shackleton-de Gerlache connecting ridge, Shackleton rim, de Gerlache rim, Malapert massif)
  have 20 m terrain within 5 km, listed under "Crests and rims" in the site menu; other crests
  still use 80 m. Off crests (floors,
  slopes, plains, the two polar landing points tested) 20 m terrain changes almost nothing.
- When Earth eclipses the Sun, sunlight refracted through Earth's atmosphere is ignored.
- The site finder searches within 160 km of the pole (south of about 84.7°S), the area mapped at
  80 m. It works on cells about 300 m across and NASA's 18.6-year averages, so narrow ridge
  tops are blurred and its figures are a first cut; pin a spot for exact numbers. A cell's
  slope is the steepest 80 m slope inside it.
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
| 20 m terrain for four crests and rims, `LDEM_80S_20MPP_ADJ.TIF` (LOLA) | NASA GSFC PGDA product 78, https://pgda.gsfc.nasa.gov/products/78 |
| JPL Horizons, used as the independent check on Sun and Earth angles | https://ssd.jpl.nasa.gov/horizons/ |
| Whole-Moon colour map (LROC WAC) and whole-Moon elevation `ldem_16.tif` (LOLA, 16 pixels per degree), CGI Moon Kit | NASA's Scientific Visualization Studio, https://svs.gsfc.nasa.gov/4720 |
| 80 m terrain around mission sites: SLDEM2015 (LOLA + Kaguya, 512 pixels per degree) between 60°S and 60°N; LOLA polar grids `LDEM_60S_60M`, `LDEM_60N_60M` beyond | NASA PDS LOLA node, https://imbrium.mit.edu/DATA/SLDEM2015/ and https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/ (also linked from NASA GSFC PGDA product 54); exact file per site in `web/public/data/patches/patches.json` |
| Landing and impact site coordinates | NASA NSSDCA, https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_artifact_impacts.html (per-site sources in `web/public/data/missions.json`) |

## References

- Mazarico, E. et al. (2011), Illumination conditions of the lunar polar regions using LOLA
  topography, Icarus 211, 1066–1081.
- Barker, M. K. et al. (2023), LOLA south pole high-resolution topography (PGDA product 78).
- Barker, M. K. et al. (2016), A new lunar digital elevation model from the Lunar Orbiter Laser
  Altimeter and SELENE Terrain Camera (SLDEM2015), Icarus 273, 346–355.
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
