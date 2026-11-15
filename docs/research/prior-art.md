# Prior art and method notes: Umbra (Lunar Landing Site Navigator)

Researched 2026-11-14, about 25 minutes, web only. Tags: **[V]** read on the source page today; **[S]** seen only in a search-result summary of the source (page itself blocked or not opened); **[U]** not verified today, treat as a lead.

Not verified at all: the official 2026 challenge statement (spaceappschallenge.org failed with a certificate error), so "tools the challenge names" is taken from the brief.

## 1. Existing tools

| Tool | What it offers | Where it is hard for a non-specialist |
|---|---|---|
| LROC QuickMap + TerrainShadows (QTS) | Browser shadow renderer tuned for grazing light at the poles; QTS-2D map modes "Carto, Traverse, Antenna"; QTS-3D time-stepped first-person view; a 2022 example shows Sun and Earth on the horizon over the pole [V, s1]. Precomputed WAC illumination maps, 88-90 S, 100 m/px, one lunar year 2010-11 [S, s2]. | The vendor page documents no single "site report": no stated Earth-visibility timeline, no site-vs-site or date-vs-date comparison, no numeric outputs [V, s1]. Hands-on speed and UI friction: [U], we did not operate it. |
| NASA Moon Trek | Line of Sight tool: finds visibility windows between two entities (surface point, LRO, Earth ground stations) with terrain, on SPICE kernels; users may supply their own DEM [V, s3]. Line of sight is also pitched for solar illumination studies [S, s4]. | Output is a list of time intervals, one pair at a time; first release limited to lunar surface and LRO [V, s3]. A dedicated "sun angle" tool: [U], could not find documentation. |
| JPL Horizons | Azimuth/elevation of Sun and Earth for a topocentric site on a rotating body; rise/set [V, s5]. | Elevation is relative to the plane perpendicular to local zenith, "not necessarily the visible horizon"; no terrain; text tables only [V, s5]. At the pole, where the Sun stays within a few degrees of the horizon, that makes raw Horizons output misleading without a terrain mask. |
| NASA SVS 5228 | 6 months of Sun and Earth seen from near the pole in 2.5 min, LOLA DEM + DE421; Sun "never more than a few degrees" from the horizon, Earth bobs near 0 longitude [V, s6]. | A video: one viewpoint, no interaction. Copy its visual language. |
| NASA PGDA polar illumination | Mazarico-method maps: average illumination, permanent shadow, average Earth visibility, sky visibility; 240/120/60 m/px; GeoTIFF/COG [V, s7]. | Static 18.6-year averages; no dates, no timeline. Best free validation layer. |
| Others | TUB-Light GPU illumination code (Zenodo) [S, s8]; LTVT on GitHub [S, s9]; NASA AMMOS MMGIS Shade and Sightline tools [S, s10]; a prior Space Apps "LunaBot" terrain-safety scorer [S]. LunaRay, ESA/commercial tools: [U]. | No open tool found combining LOLA terrain horizon + Sun + Earth + dates + comparison. |

**Gap we fill:** click-to-answer site report with Sun and Earth on one terrain-horizon panorama, a dated timeline, and side-by-side comparison. Professionals have this in scripts; the public tools give maps, videos or interval lists.

## 2. How professionals do it

- **Mazarico et al. 2011** (Icarus 211, 1066-1081): the horizon method. Precompute, per DEM pixel, the horizon elevation as a function of azimuth; illumination for any Sun geometry is then a lookup [S, s11]. 240 m/px LOLA maps, both poles out to 80 deg, full 18.6-year cycle [V, s7]. The Sun is "not a point but rather a finite disc" [V, s7]. Earth counts as visible if any part of its disc is unobscured, which the authors call slightly optimistic for radio links [V, s7]. Time step: PGDA says 1 hour [V, s7], the abstract snippet says 6 hours [S]; unresolved. Permanent shadow 12,866 and 16,055 km2 (north, south; order to confirm) [S]. Later users store 36 azimuths per pixel [S]; that is too coarse for a pretty panorama, use 360 or more.
- **Glaser et al. 2014** (Icarus 243, 78): 20 m/px LOLA DTM checked against NAC images; 20 x 20 km, one year (22 Oct 2018 to 22 Oct 2019); 19-year run on the Shackleton-de Gerlache "Connecting Ridge": sunlit 92.27% of the time at 2 m above ground, 95.65% at 10 m; longest darkness typically 3-5 days [V, s12].
- **Glaser et al. 2018** (PSS 162, 170-178): 50 x 50 km at both poles, hourly, 2017-2037, with distance, size and slope of nearby PSRs [S, s13].
- **JPL, Goldstone radar DEM** (IPN PR 42-176): best south pole site, multi-year averages of 92% solar power availability and 51% DTE availability; terrain horizon masks within 100 km [V, s14].
- **Artemis III, 13 candidate regions (Aug 2022):** criteria were "terrain slope, ease of communications with Earth, and lighting conditions", launch-window availability, and being close enough to a PSR for a moonwalk. Each region about 15 x 15 km, all within 6 deg of the pole, sites of about 100 m radius; every region has sites with continuous sunlight through the 6.5-day surface stay. The release gives **no numeric slope or comm threshold** [V, s15].
- **Slope numbers:** a 2024 NASA HLS update lists landing slope under 10 deg at 100 m scale and EVA slope under 20 deg at 2 km [S, s16]; an 8 deg figure (HLS-R-0071) also circulates [S]. Label ours "configurable, default 10 deg" and cite.
- **ESA Lunar Lander study** (arXiv 1208.5587): quasi-continuous illumination of several months exists only on patches a few hundred metres across; darkness of tens of hours; LOLA slopes at 50 m are a few degrees while 5 m-scale slopes are crater-dominated, about 11 deg [V, s17]. A 2 deg minimum Earth elevation cost at most 5% of comm availability [S].

## 3. Metrics a planner expects

Use these exact names: **Sun elevation / azimuth**; **solar disc fraction visible**; **average illumination (%)** with its averaging period; **longest continuous illumination**; **longest continuous darkness**; **DTE (direct-to-Earth) communication availability (%)** and **DTE window**; **Earth elevation** with a **minimum elevation (mask) angle**; **slope at a stated baseline** (e.g. "slope, 100 m"); **distance to nearest PSR**; **height above ground** of the panel or antenna (2 m and 10 m are the published conventions). Less standardised, name them plainly: "survival night", thermal. Always print DEM resolution and ephemeris next to any number.

## 4. Ground truth for validation

| Event | Published fact | Tag |
|---|---|---|
| Chandrayaan-3, 69.373 S 32.319 E | Landed 23 Aug 2023 about 12:33 UTC; Pragyan asleep 2 Sep; Vikram asleep about 08:00 IST 4 Sep; next sunrise expected 22 Sep 2023 | [S, s18] |
| IM-1 Odysseus, near Malapert A | Landed 22 Feb 2024; powered down at lunar night 29 Feb | [S, s19] |
| SLIM | Landed 20 Jan 2024 (JST); survived three nights, contact regained about 25 Feb, late Mar, 23 Apr 2024 | [S, s20] |
| Blue Ghost M1, Mare Crisium | Landed 2 Mar 2025 02:34 CST; imaged the eclipse 14 Mar; sunset 16 Mar, ran 5 h into night, last data about 18:15 CDT; 346 h of daylight | [S, s21] |
| IM-2 Athena, Mons Mouton | Landed 6 Mar 2025 on its side in a crater; power depleted by 7 Mar. Poor test: failure was attitude, not sunset | [S, s19] |
| Connecting Ridge | 92.27% (2 m), 95.65% (10 m); darkness 3-5 days | [V, s12] |
| Shackleton rim | Three rim points together lit more than 90% of the year; no point is permanently lit | [V, s22] |
| Best south pole site, JPL | 92% solar, 51% DTE | [V, s14] |

Not found: a published "N days of continuous illumination" figure for a Shackleton rim point, and a Malapert-specific Earth-visibility percentage. Do not quote either.

## 5. Credibility ideas and common errors

Raise credibility:
1. A "Validation" tab: our computed sunset for Chandrayaan-3 and Blue Ghost against the published dates, and our Connecting Ridge percentage against Glaser's 92.27%, with the error shown.
2. Overlay PGDA average-illumination and Earth-visibility maps as a layer and report agreement.
3. Adjustable assumptions shown on every report: mast height (0 / 2 / 10 m), Earth mask angle (default 2 deg), slope limit (default 10 deg), DEM resolution, ephemeris.

Commonly wrong:
1. Sun as a point. Professionals use the finite disc; at grazing incidence, partial-disc time is a large share of the total.
2. Horizon from a sphere, a small DEM tile, or without curvature. Polar shadows come from terrain more than 100 km away [V, s1]; the horizon must be computed on the curved Moon from a wide DEM.
3. Earth treated as fixed in the sky, or "any part of the disc visible" reported as a usable link. Earth moves with libration, and the any-part rule is optimistic [V, s7]. Also: averages over 18.6 years hide the specific month, which is the whole point of a date tool.

## Sources

- s1 https://www.actgate.com/post/quickmap-year-2022
- s2 https://data.lroc.im-ldi.com/lroc/view_rdr/WAC_POLE_ILL_PCT_SOUTH
- s3 https://meetingorganizer.copernicus.org/EPSC2021/EPSC2021-150.html
- s4 https://meetingorganizer.copernicus.org/EPSC2022/EPSC2022-93.html
- s5 https://ssd.jpl.nasa.gov/horizons/manual.html
- s6 https://svs.gsfc.nasa.gov/5228
- s7 https://pgda.gsfc.nasa.gov/products/69
- s8 https://openpolar.no/Record/ftzenodo:oai:zenodo.org:5777269
- s9 https://github.com/fermigas/ltvt/wiki
- s10 https://nasa-ammos.github.io/MMGIS/tools/sightline
- s11 https://ntrs.nasa.gov/citations/20120010094 (403 to direct fetch); method described in https://meetingorganizer.copernicus.org/EPSC2017/EPSC2017-693-3.pdf
- s12 https://elib.dlr.de/94240/ ; https://ui.adsabs.harvard.edu/abs/2014Icar..243...78G
- s13 https://elib.dlr.de/119091
- s14 https://ipnpr.jpl.nasa.gov/progress_report/42-176/176C.html
- s15 https://www.nasa.gov/news-release/nasa-identifies-candidate-regions-for-landing-next-americans-on-moon/
- s16 https://ntrs.nasa.gov/api/citations/20240009596/downloads/ArtemisHLSUpdate_2024.pdf (403 to direct fetch)
- s17 https://arxiv.org/abs/1208.5587
- s18 https://theprint.in/science/chandrayaan-3-lander-rover-put-on-sleep-mode-for-lunar-night-isro-hopes-they-wake-up-on-22-sept/1745709 ; https://en.wikipedia.org/wiki/Chandrayaan-3
- s19 https://en.wikipedia.org/wiki/IM-1 ; https://www.astronomy.com/space-exploration/im-2-lands-on-the-moon-but-status-is-uncertain/
- s20 https://www.upi.com/Science_News/2024/04/24/Japan-SLIM-JAXA-lunar-night/6401713965775/ ; https://spacepolicyonline.com/news/slim-defies-the-odds-again/
- s21 https://fireflyspace.com/news/firefly-aerospace-successfully-completes-14-days-of-surface-operations-on-the-moon ; https://www.nasa.gov/news-release/nasa-science-continues-after-fireflys-first-moon-mission-concludes/
- s22 https://lroc.im-ldi.com/posts/993
