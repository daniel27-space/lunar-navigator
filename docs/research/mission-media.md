# Mission showcase: media and fact sources

Compiled 2026-11-14 for the showcase fields in `web/public/data/missions.json` (`about`, `facts`, `image`, `model`; schema in `docs/DATA_CONTRACT.md`, "Mission showcase fields").

Totals: 41 missions, 41 `about`, 41 `facts`, 35 images, 6 missions using a real GLB model (one shared file), 35 archetypes.

## Images

Every image was taken from Wikimedia Commons. The licence, author and credit below are what the file's own Commons page states (read through the Commons API `imageinfo/extmetadata` for that file on 2026-11-14). Files are re-encoded as JPEG, at most 1200 px wide and at most 150 kB; originals are in `data/raw/missions/img/` (git-ignored).

| Mission | File | Credit | Licence | Author as stated on Commons | Source page |
|---|---|---|---|---|---|
| Luna 9 | `missions/img/luna-9.jpg` | Stolbovsky, Wikimedia Commons | CC BY 4.0 | Stolbovsky | https://commons.wikimedia.org/wiki/File:Luna_9_Space_Probe_1.jpg |
| Surveyor 1 | `missions/img/surveyor-1.jpg` | NASA | Public domain | NASA | https://commons.wikimedia.org/wiki/File:Surveyor_NASA_lunar_lander.jpg |
| Surveyor 3 | `missions/img/surveyor-3.jpg` | NASA / Alan Bean | Public domain | NASA, Alan L. Bean | https://commons.wikimedia.org/wiki/File:Surveyor_3-Apollo_12.jpg |
| Surveyor 5 | `missions/img/surveyor-5.jpg` | NASA/GSFC/Arizona State University | Public domain | NASA/GSFC/Arizona State University | https://commons.wikimedia.org/wiki/File:Surveyor_5-_A_hole-in-one_(LROC14_-_M106726943LE_S5_scale).png |
| Surveyor 6 | `missions/img/surveyor-6.jpg` | NASA/GSFC/Arizona State University | Public domain | NASA/GSFC/Arizona State University | https://commons.wikimedia.org/wiki/File:Surveyor_6_on_the_plains_of_Sinus_Medii_(LROCM117501284LE_S6_rev).png |
| Surveyor 7 | `missions/img/surveyor-7.jpg` | NASA / NSSDC | Public domain | NASA/National Space Science Data Center (NSSDC) | https://commons.wikimedia.org/wiki/File:Surveyor_7_-_America%27s_Last_Lunar_Unmanned_Lander_(LROC534_-_surveyortycho).png |
| Apollo 11 (Eagle) | `missions/img/apollo-11.jpg` | NASA / Neil Armstrong | Public domain | Neil A. Armstrong | https://commons.wikimedia.org/wiki/File:Astronaut_Edwin_Aldrin_descends_the_Lunar_Module_ladder,_AS11-40-5868_(21037483754).jpg |
| Apollo 12 (Intrepid) | `missions/img/apollo-12.jpg` | NASA / Pete Conrad | Public domain | NASA Charles Pete Conrad | https://commons.wikimedia.org/wiki/File:Bean_Descends_Intrepid_-_GPN-2000-001317.jpg |
| Apollo 14 (Antares) | `missions/img/apollo-14.jpg` | NASA | Public domain | NASA | https://commons.wikimedia.org/wiki/File:Apollo_14_Lunar_Module_(LM)_on_the_moon.jpg |
| Apollo 15 (Falcon) | `missions/img/apollo-15.jpg` | NASA / David Scott | Public domain | Astronaut David R. Scott, Apollo 15 commander. | https://commons.wikimedia.org/wiki/File:Apollo_15_flag,_rover,_LM,_Irwin.jpg |
| Apollo 16 (Orion) | `missions/img/apollo-16.jpg` | NASA / Charles Duke | Public domain | NASA Johnson Space Center | https://commons.wikimedia.org/wiki/File:View_of_the_Lunar_Module_%22Orion%22_and_Lunar_Roving_Vehicle_during_first_EVA_(as16-107-17436).jpg |
| Apollo 17 (Challenger) | `missions/img/apollo-17.jpg` | NASA / Harrison Schmitt | Public domain | NASA | https://commons.wikimedia.org/wiki/File:Apollo_17_first_test_of_the_lunar_rover_AS17-147-22527HR.jpg |
| Luna 16 | `missions/img/luna-16.jpg` | NASA/GSFC/Arizona State University | Public domain | NASA/GSFC/Arizona State University | https://commons.wikimedia.org/wiki/File:Luna_16_descent_stage.png |
| Luna 17 | `missions/img/luna-17.jpg` | NASA/GSFC/Arizona State University | Public domain | NASA | https://commons.wikimedia.org/wiki/File:Luna_17_lander.png |
| Lunokhod 1 (final position) | `missions/img/lunokhod-1.jpg` | Petar Milošević, Wikimedia Commons | CC BY-SA 3.0 | Petar Milošević | https://commons.wikimedia.org/wiki/File:Soviet_moonrover.JPG |
| Luna 20 | `missions/img/luna-20.jpg` | NASA/GSFC/Arizona State University | Public domain | NASA | https://commons.wikimedia.org/wiki/File:Luna_20_descent_stage.png |
| Luna 21 | `missions/img/luna-21.jpg` | NASA/GSFC/Arizona State University | Public domain | NASA/GSFC/Arizona State University | https://commons.wikimedia.org/wiki/File:Luna_21_Lander_(LROC15_-_M122007650LE_L21_ano).png |
| Lunokhod 2 (final position) | `missions/img/lunokhod-2.jpg` | NASA/GSFC/Arizona State University | Public domain | NASA/GSFC/Arizona State University | https://commons.wikimedia.org/wiki/File:Lunokhod_2_Revisited_(LROC699_-_M175070494LR_thumb).png |
| Luna 23 | `missions/img/luna-23.jpg` | NASA/GSFC/Arizona State University (LROC) | Public domain | LROC | https://commons.wikimedia.org/wiki/File:Luna23_figure.png |
| Luna 24 | `missions/img/luna-24.jpg` | NASA/GSFC/Arizona State University | Public domain | NASA/GSFC/Arizona State University | https://commons.wikimedia.org/wiki/File:Soviet_Union_Lunar_Sample_Return_Missions_(LROCM119449091RE_L24_ano).png |
| Chang'e 3 (with Yutu) | `missions/img/change-3.jpg` | NASA/GSFC/Arizona State University | Public domain | NASA Goddard Space Flight Center | https://commons.wikimedia.org/wiki/File:Chang%27e_4_Lander-_A_Closer_Look_(02_m1147290066lr_m130C5A1B).jpg |
| Chang'e 4 (with Yutu-2) | `missions/img/change-4.jpg` | NASA/GSFC/Arizona State University | Public domain | NASA Goddard Space Flight Center | https://commons.wikimedia.org/wiki/File:Chang%27e_4_Lander-_A_Closer_Look_(02_m1147290066lr_m130C5A1B).jpg |
| Chang'e 5 | `missions/img/change-5.jpg` | NASA/GSFC/Arizona State University | Public domain | NASA/GSFC/Arizona State University | https://commons.wikimedia.org/wiki/File:Chang%27e_5_as_seen_by_LRO_01.png |
| Chandrayaan-3 (Vikram and Pragyan) | `missions/img/chandrayaan-3.jpg` | NASA/GSFC/Arizona State University | Public domain | NASA’s Goddard Space Flight Center/Arizona State University | https://commons.wikimedia.org/wiki/File:NASA%E2%80%99s_LRO_imagery_of_Chandrayaan-3_Landing_Site.png |
| SLIM | `missions/img/slim.jpg` | NASA/GSFC/Arizona State University | Public domain | NASA/GSFC/Arizona State University | https://commons.wikimedia.org/wiki/File:M1460739214L_JAXA_SLIM_landing_site_imaged_by_Lunar_Reconnaissance_Orbiter_Camera_(LROC).png |
| IM-1 Odysseus | `missions/img/im-1-odysseus.jpg` | NASA/GSFC/Arizona State University | Public domain | NASA/GSFC/Arizona State University | https://commons.wikimedia.org/wiki/File:Image_(M1463440322L)_of_Intuitive_Machines_IM-1_Nova-C,_known_as_Odysseus_landing_site_captured_by_Lunar_Reconnaissance_Orbiter_Camera_(LROC)_(with_arrow).png |
| Chang'e 6 | `missions/img/change-6.jpg` | NASA/GSFC/Arizona State University | Public domain | NASA/GSFC/Arizona State University | https://commons.wikimedia.org/wiki/File:First_Look-_Chang%27e_6_(LROC1374).jpg |
| Blue Ghost Mission 1 | `missions/img/blue-ghost-m1.jpg` | NASA/GSFC/Arizona State University | Public domain | NASA/GSFC/Arizona State University | https://commons.wikimedia.org/wiki/File:Blue_Ghost_Lunar_Lander_Seen_From_Above_(LROC1407_-_content_M1495619099LR_mos_str01_320cm_1300p).png |
| IM-2 Athena | `missions/img/im-2-athena.jpg` | NASA/GSFC/Arizona State University | Public domain | NASA/GSFC/Arizona State University | https://commons.wikimedia.org/wiki/File:IM-2_Athena-_A_Closer_View_(LROC1409_-_content_M1496181900_LRmos_warp_str01_CROP1300p).png |
| Beresheet | `missions/img/beresheet.jpg` | NASA/GSFC/Arizona State University | Public domain | NASA/GSFC/Arizona State University | https://commons.wikimedia.org/wiki/File:Beresheet_Crash_Site_Spotted_LRO_01.png |
| Vikram (Chandrayaan-2) | `missions/img/vikram-chandrayaan-2.jpg` | NASA/GSFC/Arizona State University | Public domain | NASA/GSFC/Arizona State University | https://commons.wikimedia.org/wiki/File:Chandrayaan-2_Vikram_lander_Impact_Ejecta_with_scalebar.png |
| Hakuto-R Mission 1 | `missions/img/hakuto-r-m1.jpg` | NASA/GSFC/Arizona State University | Public domain | NASA/GSFC/Arizona State University | https://commons.wikimedia.org/wiki/File:Impact_Site_of_the_HAKUTO-R_Mission_1_Lunar_Lander_(LROC1302_-_content_ispaceImpact_Cover_scale).png |
| Luna 25 | `missions/img/luna-25.jpg` | NASA/GSFC/Arizona State University | Public domain | NASA’s Goddard Space Flight Center/Arizona State University | https://commons.wikimedia.org/wiki/File:Luna_25_Impact_Site_zoomed.jpg |
| Hakuto-R Mission 2 (Resilience) | `missions/img/hakuto-r-m2.jpg` | NASA/GSFC/Arizona State University | Public domain | NASA/GSFC/Arizona State University | https://commons.wikimedia.org/wiki/File:Ispace_Mission_2_SMBC_x_HAKUTO-R_Venture_Moon_Impact_Site_(LROC1456).png |
| LCROSS Centaur impact | `missions/img/lcross-centaur.jpg` | NASA | Public domain | NASA | https://commons.wikimedia.org/wiki/File:LCROSS_Centaur_1.jpg |

Notes on the images:

- Images credited "NASA/GSFC/Arizona State University" are Lunar Reconnaissance Orbiter Camera (LROC) pictures of the craft or its impact site from orbit. For the non-NASA missions (Luna, Chang'e, Chandrayaan, SLIM, Hakuto-R, Beresheet, Luna 25, and the commercial CLPS landers) these were used instead of agency or company photographs, which are not free by default.
- CC BY and CC BY-SA images require the credit and licence to be shown next to the picture; the app must display `credit` and `license` for every image.
- No image was used whose licence could not be read.

## 3D models

| Missions | File | Credit | Licence | Source page |
|---|---|---|---|---|
| Apollo 11 (Eagle), Apollo 12 (Intrepid), Apollo 14 (Antares), Apollo 15 (Falcon), Apollo 16 (Orion), Apollo 17 (Challenger) | `missions/models/apollo-lm.glb` | NASA (NASA 3D Resources) | NASA media, not subject to copyright in the United States ("free and without copyright" per the NASA 3D Resources README); NASA media usage guidelines apply: no implied NASA endorsement, NASA insignia not covered | https://github.com/nasa/NASA-3D-Resources/tree/master/3D%20Models/Apollo%20Lunar%20Module |

Apollo Lunar Module GLB: `3D Models/Apollo Lunar Module/Apollo Lunar Module.glb` from https://github.com/nasa/NASA-3D-Resources (branch `master`), 716,840 bytes, unmodified. Original kept in `data/raw/missions/models/`.

Licence wording as published:

- NASA-3D-Resources README: "This is a growing collection of 3D models, textures, and images from inside NASA. [...] These assets are free and without copyright. Please read the usage guidelines." The link goes to https://www.nasa.gov/nasa-brand-center/images-and-media/.
- NASA Images and Media Usage Guidelines (that page): NASA content, including material "used in the rendition of 3-dimensional models, such as texture maps and polygon data in any format", "generally are not subject to copyright in the United States"; it may be used "for educational or informational purposes"; use "must not explicitly or implicitly convey NASA's endorsement of commercial goods or services"; "The NASA Insignia, Logotype, identifiers, and imagery are not in the public domain."

Technical notes for whoever loads it (read from the file's JSON header, nothing was executed):

- glTF 2.0 binary exported from Blender; one embedded buffer, textures embedded.
- **Requires `KHR_draco_mesh_compression`** (listed under `extensionsRequired`), and uses `EXT_texture_webp` and `KHR_materials_specular`. A three.js loader needs `DRACOLoader` attached to `GLTFLoader`.
- 134 meshes, 135 nodes, 135 animation entries, 12 materials.
- Mesh bounding box in model units, before node transforms: about 6.4 wide and 0.10 to 5.12 high. The file is not at 1 unit = 1 m of the real craft, so scale it to `height_m` (7.0 m, the Lunar Module's height on its legs).

Checked and not available as a model in NASA 3D Resources (repository file listing, 2026-11-14): Surveyor, LCROSS/Centaur, any CLPS lander. The only other lunar entries there are orbiters (LRO, LADEE), Gateway, and 3D-printing STL terrain of the Apollo landing sites (7 to 27 MB, not GLB), which were skipped. The science.nasa.gov/3d-resources web catalogue was not searched page by page; the GitHub repository listing was used.

All other missions use `kind: "archetype"` as assigned in the task brief.

## Sources for `about` and `facts`

The text was written for this project, not copied. Dates, masses, crews, durations and outcomes follow:

- NSSDCA Master Catalog spacecraft pages (NASA GSFC), https://nssdc.gsfc.nasa.gov/nmc/ : Luna 9, 13, 16, 17, 20, 21, 23, 24; Surveyor 1, 3, 5, 6, 7; Apollo 11 to 17 lunar modules; Chang'e 3, 4, 5; LCROSS.
- NSSDCA "Lunar Impact and Landing Sites" and "Apollo Landing Site Coordinates" (already the `source_url` of the entries).
- NASA, "Apollo by the Numbers" (SP-2000-4029): launch and landing dates, crews, surface stay times, sample masses.
- NASA Science mission pages, https://science.nasa.gov/mission/ : Surveyor, Lunokhod 1 and 2, LCROSS, Chandrayaan-3, SLIM, Chang'e 3 to 6.
- NASA CLPS delivery pages, https://science.nasa.gov/lunar-science/clps-deliveries/ and https://www.nasa.gov/commercial-lunar-payload-services/ : IM-1, IM-2, IM-3 (CP-11), Blue Ghost Mission 1 (TO 19D), Mission 2 and Mission 3 (CP-21), Griffin Mission 1, CP-12 (Draper).
- LROC featured-image posts (the Commons pages of the images used link to them): what LRO saw at the Luna, Lunokhod, Chang'e, Chandrayaan, SLIM, IM, Blue Ghost, Beresheet, Hakuto-R and Luna 25 sites.
- Operator announcements as reported by the agencies: ISRO (Chandrayaan-2, Chandrayaan-3), JAXA (SLIM), ispace (Hakuto-R Mission 1 and 2 failure reviews), Roscosmos (Luna 25), SpaceIL/IAI (Beresheet), CNSA (Chang'e sample masses).
- Status of the planned missions was checked by web search on 2026-11-14 (NASA CLPS event pages, Spaceflight Now, Space.com, the Wikipedia IM-3 article): Griffin Mission 1 reported as targeting late 2026 with no confirmed date; Blue Ghost Mission 2 listed by NASA under 2027; IM-3 no earlier than early 2027.

**How this was checked.** The values were written from the sources above as recalled and were not each re-opened and compared line by line in this pass (time-boxed to about 35 minutes). The planned-mission status, launch dates, Apollo landing dates and sample masses, some lander heights and all licences were looked up live; see the list at the end for what was not. Treat the facts as needing one read-through against NSSDCA before the submission is final.

## Missions without an image

| Mission | Why |
|---|---|
| Luna 13 | The lander has not been found in orbital images. The only picture on Commons is a small NSSDCA-hosted photo of a Soviet model; its page says public domain (NASA), but NASA is unlikely to be the author, so it was not used. |
| IM-3 (Reiner Gamma) | Not built for flight yet in any NASA photograph found; Intuitive Machines renders are not freely licensed. |
| Griffin Mission 1 (FLIP rover) | Commons has an Astrobotic render (hosted by NASA, author "unknown") and a NASA photo of a Griffin mock-up carrying VIPER, which the mission no longer flies. Neither is a clearly free picture of the actual craft. |
| Blue Ghost Mission 2 | Firefly pictures are not freely licensed; the only Commons candidate is a user-made diagram, not a picture of the craft. |
| Draper / ispace-U.S. APEX 1.0 (CP-12) | Only ispace/Draper renders exist; not freely licensed. |
| Blue Ghost Mission 3 | Firefly pictures are not freely licensed; Commons has only NASA instrument diagrams for this flight, not a picture of the craft. |

## Facts and values that could not be confirmed

- **`height_m` of several archetypes is an estimate, not a sourced figure:** Chang'e 3, 4, 5, 6 (2.0 m; a search found only the 0.83 m ground clearance and the 4.76 m leg span of Chang'e 3, no overall height, and the Chang'e 5/6 lander with its ascent stage is probably taller), Luna 25 (2.0 m), Griffin Mission 1 (3.0 m), Blue Ghost Mission 2 and 3 (2.0 m, the Mission 1 lander's height; Mission 2 flies stacked on a transfer vehicle).
- **Luna 17 and Luna 21** use `height_m` 1.35, which is the Lunokhod rover's height, because the archetype drawn is the rover; the height of the landing stage with the rover on top was not found.
- **Lunokhod height** 1.35 m is the published figure for Lunokhod 2 and is used for both rovers. **Luna 16, 20, 23, 24** use 4.0 m (recalled as 3.96 m for the complete craft; a search did not confirm it from a primary source). **Vikram** (Chandrayaan-2 and -3) uses 1.2 m (ISRO's lander body dimensions as recalled; not confirmed by search). **Beresheet** 1.5 m, **Hakuto-R** 2.3 m, **SLIM** 2.4 m, **Blue Ghost** 2.0 m and the **LCROSS Centaur** 12.7 m (stage length) are the operators' published figures as recalled, not re-opened today. **Surveyor** 3.0 m was confirmed on NASA's Surveyor 1 page.
- **Luna 9 and Luna 13** use 0.58 m, the diameter of the landing capsule's body without its antennas.
- **APEX 1.0** 3.1 m comes from an ispace spacecraft page found by search (a development copy of the site); not checked against the payload user's guide.
- **Nova-C heights**: 4.3 m is Intuitive Machines' published Nova-C height (its Nova-C page, found by search) and is used for IM-1, IM-2 and IM-3. A figure of 15.6 ft (about 4.7 m) for IM-2 Athena could not be confirmed.
- **Dates are UTC**, to match the existing `date_utc` fields. NSSDCA pages that use US local dates differ by a day for Apollo 16's landing (NSSDCA 20 Apr 1972; 02:23 UTC on 21 Apr), IM-2's launch (NSSDCA 26 Feb 2025; 00:16 UTC on 27 Feb) and LCROSS's launch (NSSDCA timeline 17 Jun 2009; 21:32 UTC on 18 Jun).
- **Luna 24 launch date:** 9 Aug 1976, confirmed by a second search (the NSSDCA lunar timeline, as read through an automated summary, showed 14 Aug 1976, the date it entered lunar orbit). LCROSS's launch on 18 Jun 2009 at 21:32 UT was confirmed on NASA's LCROSS mission page.
- **Apollo surface stay times:** Apollo 11 (21 h 36 min) and Apollo 12 (31 h 31 min) matched a NASA timeline found by search. For Apollo 14 to 17 the sources found differ by minutes to an hour or two (for example 71 h and 72 h 58 min for Apollo 16), so those are given as rounded "about" values.
- NASA Science pages for Surveyor 1 and Surveyor 6 were read live and agree with the text (dates, 11,240 images, 294.3 kg at landing, 3 m tall, the 17 Nov 1967 hop of about 3 m up and 2.5 m sideways). Pages for the Luna missions were not found at the guessed addresses.
- Checked live on 2026-11-14 against the NSSDCA lunar timeline (launch dates of all flown missions; agreement except the items above) and the NSSDCA Apollo landing table (launch and landing dates, sample masses: 21.55, 34.35, 42.28, 77.31, 95.71, 110.52 kg). The NSSDCA Master Catalog spacecraft pages returned an error page when fetched, so landed masses, surface times, last-contact dates and robotic sample masses were not re-read today.
- **Blue Ghost Mission 2 date:** the existing `date_utc` says "NET late 2026 (planned)", but NASA's event page now lists the mission under 2027. The existing field was left unchanged as instructed; the new `facts` say "not before 2027". The existing field should be reviewed.
- **Griffin Mission 1:** reported as targeting late 2026 with no confirmed launch date found; no report of a launch as of 2026-11-14. One report says NASA now calls the flight "Moon Base 2"; this was not confirmed and is not in the text.
- **IM-3:** sources disagree between 2026 and early 2027; the facts say "not before 2027", matching the existing `date_utc`.
- **Sample masses for Apollo** are given as "about" because NASA sources differ by up to a kilogram or so. Luna 20's sample is given as about 55 g (NSSDCA); some sources say 30 g.
- **Lunokhod 2 distance** is given as about 39 km (from LRO image analysis); older Soviet figures say 37 km and some sources 42 km.
- **Landed masses** are given only where a figure for the craft on the surface is published (Luna 9/13 capsules, Lunokhod rovers, Surveyor). Where only a launch or fuelled mass is known it is labelled "Launch mass".
