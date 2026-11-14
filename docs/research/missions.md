# Mission site catalogue: research notes

Compiled 2026-11-14 for `web/public/data/missions.json` (41 entries: 30 landed, 6 crashed, 5 planned, 0 candidate).

## Sources

1. **NSSDCA, "Lunar Impact and Landing Sites"** (D. R. Williams, NASA GSFC; last updated 13 Aug 2025),
   https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_artifact_impacts.html. This is the main source. It uses the DE421
   mean Earth/polar axis frame, the same frame LOLA uses, with signed N/S and E/W values. Every landed and crashed
   entry except Apollo comes from this page.
2. **NSSDCA, "Apollo Landing Site Coordinates"**, https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_sites.html.
   It gives LM positions from LRO images (Wagner et al. 2017, Icarus 283, 92-103). We use the LM (descent stage)
   position, not the ALSEP or LRRR.
3. **LROC, "Coordinates of Lunar Anthropogenic Targets"** (28 July 2016), PDF at lroc.asu.edu, which now redirects
   to lroc.im-ldi.com. We used it only to cross-check source 1. Its values for Surveyor, Luna, Lunokhod, Chang'e 3 and
   Apollo match source 1 exactly after converting 0-360 E to signed longitude.
4. **IAU/USGS Gazetteer of Planetary Nomenclature**, https://planetarynames.wr.usgs.gov. Used only for the centres of
   named features behind the planned entries. The gazetteer labels these "Planetographic, +East, -180 - 180". The Moon's
   reference body is a sphere, so planetographic and planetocentric latitude are the same.

None of the coordinates comes from Wikipedia.

## Where sources conflict, and what we chose

| Entry | Values | Chosen | Why |
|---|---|---|---|
| Chandrayaan-3 | NSSDCA 69.3741 S, 32.32 E. ISRO (in news reports) 69.373 S, 32.319 E. Wang et al. 2023 (NSR) quote 69.37 S, 32.35 E | NSSDCA | NASA source first. The first two agree to about 30 m. The 32.35 E value is about 1 km off and looks like a rounded pre-landing target (ISRO's target was 32.348 E). |
| Chang'e 4 | NSSDCA 45.4561 S, 177.5885 E. LROC post 1087: 45.457 S, 177.589 E (±20 m) | NSSDCA | Same point. NSSDCA gives more digits. |
| Chang'e 6 | NSSDCA 41.6385 S, 153.9852 W. LROC: 41.6385 S, 206.0148 E | NSSDCA | Identical after converting longitude. Some news outlets wrongly report 41.6 **N**. |
| Chang'e 5 | NSSDCA and LROC 43.0576 N, 51.9161 W (308.0839 E). SSERVI preliminary value 43.05772 N | NSSDCA | Agree to about 0.0002°. |
| SLIM | NSSDCA and NASA LRO release: 13.3160 S, 25.2510 E | NSSDCA | Identical. |
| IM-1 Odysseus | NSSDCA and NASA LRO release: 80.13 S, 1.44 E | NSSDCA | Identical but only 2 decimals (about ±300 m). |
| Luna 16 | A search-engine summary gave 356.3638 E. Both the LROC table and NSSDCA say 56.3638 E | 56.3638 E | Checked against the primary table. |

## Approximate positions and region centres

- **Luna 9** (7.13 N, 64.37 W): NSSDCA itself notes that Wagner et al. (2017) think the lander is probably at least
  10 km from this position. It has not been confirmed in LRO images. A 2025 press report (Smithsonian) describes a
  candidate identification that has not been verified; we did not use it. Use this point at region scale only.
- **Luna 13** (18.87 N, 62.05 W): the value comes from historical tracking (2 decimals) and has not been confirmed in
  LRO images. Treat it as approximate.
- **IM-1** and **Blue Ghost M1** are given to 2-3 decimals (about 30-300 m). They are fine for site comparison.
- **Lunokhod 1 and 2** are the rovers' final parked positions, not where they landed. Their `date_utc` is the landing
  date. The landing points are the Luna 17 and Luna 21 entries.
- **IM-1 and IM-2** both touched down and then tipped over. We mark them `landed` with a note in the summary. IM-2
  Athena could reasonably be counted a failure, but the contract has no "tipped" status.
- **All 5 planned entries are REGION CENTRES, not landing points.** Each summary starts with "Region centre only". The
  coordinate is the IAU centre of the named feature the mission targets:
  IM-3 (Reiner Gamma, Feature 4987), Griffin-1 (Nobile crater, 4321), Blue Ghost M2 (Nassau crater, 4159),
  APEX 1.0 / CP-12 (Schrödinger basin, 5381, which is 316 km wide), and Blue Ghost M3 (Mons Gruithuisen Gamma, 3982,
  one of two domes). Do not compute horizons or illumination at these points as if they were the landing sites.
  The Griffin-1 point is the centre of Nobile crater. The mission targets the rim region, and the centre of a polar
  crater floor has very different illumination.
- **Griffin-1 target conflict:** NASA's Griffin-1 event page says "Nobile Crater", but a NASA CLPS deliveries page
  (according to a news report) says Mons Mouton. We chose Nobile.
- Dates for planned missions are taken from news reports as of Nov 2026 and keep slipping. IM-3 is listed as late
  2026 in some sources and NET Q1 2027 in others. Griffin-1 is NET Nov 2026. APEX 1.0 has no confirmed date.

## Not included (no usable published coordinate found)

- **The nine Artemis III candidate regions (NASA, 28 Oct 2024):** Peak near Cabeus B, Haworth, Malapert Massif,
  Mons Mouton Plateau, Mons Mouton, Nobile Rim 1, Nobile Rim 2, de Gerlache Rim 2, Slater Plain. Neither NASA's
  release nor NASA SVS 5013 gives region-centre coordinates. The sources that probably do were all blocked (HTTP 403)
  from this environment:
  - LPSC 2026 abstract 1901 ("Artemis III Site Selection Update: Down-selection from 13 to 9")
  - NTRS 20250011660
  - USGS ScienceBase item 671a6fa8d34efed5620f89f8 (LGRS navigational grids for the nine regions)
  - Wueller et al. 2026, JGR Planets, doi:10.1029/2025JE009434 (has a site table)
  
  We did not use IAU feature centres as stand-ins. "Nobile Rim" or "Haworth" is a rim region, so the crater centre
  would be tens of km off and in different illumination. If someone can download the ScienceBase grids or the LPSC PDF
  in a browser, these nine are the highest-value addition.
  - Lead (not verified by us): a search summary attributes 84.528 S, 30.719 E to an LPSC 2025 abstract (2742) on the
    Mons Mouton region. IAU centres for reference: Mons Mouton 84.60 S, 31.00 E; Mons Malapert 85.98 S, 1.67 W;
    Haworth 87.45 S, 5.17 W; Nobile 85.28 S, 53.27 E; de Gerlache 88.48 S, 88.34 W; Slater 88.08 S, 111.29 E;
    Cabeus B 82.26 S, 54.58 W.
  - **Mission status:** in Feb 2026 NASA restructured Artemis. Artemis III is now a crewed docking test in low Earth
    orbit (NET mid-2027), and the first crewed landing moved to Artemis IV (NET 2028). The nine regions are still the
    published candidate set, but label them "Artemis candidate regions (announced for Artemis III, 2024)".
- **VIPER:** cancelled in 2024, then re-manifested on Blue Origin's Blue Moon MK1 (about 2027). We found no published
  coordinate for the new target.
- **Blue Moon MK1 pathfinder (Blue Origin):** reported target is "Shackleton connecting ridge", with no coordinates.
  The launch is reportedly slipping to 2027.
- **Chang'e 7:** the target is the illuminated rim of Shackleton crater (Wang et al. 2023, NSR, nwad329, which gives no
  coordinates). Wikipedia gives 88.8 S, 123.4 E, citing only a Weibo post, so we excluded it. Launch slipped from
  Aug 2026 to 2027.
- **Chang'e 8, Chandrayaan-4, LUPEX (Chandrayaan-5), Luna 26/27, ispace later missions:** no published landing
  coordinates found.
- **Yutu and Yutu-2 rovers:** left out as separate points because they are within metres of their landers (LROC gives
  Yutu at 44.1208 N, 19.5122 W).
- **Ranger, Surveyor 2/4, Luna 15, SMART-1, LRO-era impacts:** out of scope. Many have NSSDCA coordinates if needed.

## Landings after August 2025

The NSSDCA table ends at Hakuto-R M2 (June 2025). Web searches on 2026-11-14 found no successful or attempted lunar
landing between August 2025 and mid-November 2026. Griffin-1, Blue Ghost M2, Blue Moon MK1 and Chang'e 7 all slipped
to late 2026 or 2027. Check again before the submission is final.
