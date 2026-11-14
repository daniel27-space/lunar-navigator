# Lunar south pole (80S-90S): ice and illumination map layers

Research date: 2026-11-14. Method: page fetches, HTTP HEAD requests, directory listings, and byte-range reads of GeoTIFF headers (first ~2 MB) parsed locally. No large files were downloaded. The exception is the 4 MB USGS Ice Favorability Index TIFF, which was read in full to check its georeferencing.

Legend:
- **verified reachable (HTTP 200, size N)**: a HEAD request on 2026-11-14 returned 200 with Content-Length N bytes, and the content type matched.
- **header verified**: the GeoTIFF tags (size, pixel scale, tiepoint, projection keys, nodata, scale and offset) were read from the real file.
- **not verified**: from search results or memory. Treat these as leads only.

All PGDA and PDS GeoTIFFs below use south polar stereographic projection on a 1737.4 km sphere, with X/Y in metres and the pole at (0,0). Re-grid using the file's CRS, not by assuming pixel alignment (see the USGS IFI note in section 2).

---

## 1. Illumination, Earth visibility and PSR products (NASA GSFC PGDA / LOLA team)

### 1a. Average solar illumination, Earth visibility, PSR and sky visibility (Mazarico et al. 2011, 2016-08 release)
Product page: https://pgda.gsfc.nasa.gov/products/69 ("Lunar Polar Illumination", E. Mazarico). The values are averages over hourly timesteps across 18.6 years (one lunar nutation cycle), computed from the LOLA polar DEMs. The archival copies are on the LOLA PDS data node (`http://imbrium.mit.edu/EXTRAS/ILLUMINATION/`, verified reachable, HTTP 200 directory) and PDS Geosciences (`http://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/extras/illumination/`, verified reachable, HTTP 200). PGDA added GeoTIFF conversions on 2025-03-20.

Base URL: `https://pgda.gsfc.nasa.gov/data/MoonIllumination/`

| File | Content | Coverage / res | Status |
|---|---|---|---|
| `AVGVISIB_85S_060M_201608.TIF` | avg. solar illumination | 85S-90S, 60 m, 5058x5058 | verified reachable (HTTP 200, size 33,994,464); header verified |
| `AVGVISIB_75S_120M_201608.TIF` | avg. solar illumination | 75S-90S, 120 m, 7624x7624 | verified reachable (HTTP 200, size 83,052,039); header verified |
| `AVGVISIB_65S_240M_201608.TIF` | avg. solar illumination | 65S-90S, 240 m | verified reachable (HTTP 200, size 60,394,652) |
| `AVGVISIB_85S_060M_201608_EARTH.TIF` | avg. Earth visibility | 85S-90S, 60 m | verified reachable (HTTP 200, size 24,862,958); header verified |
| `AVGVISIB_75S_120M_201608_EARTH.TIF` | avg. Earth visibility | 75S-90S, 120 m | verified reachable (HTTP 200, size 43,148,153); header verified |
| `AVGVISIB_65S_240M_201608_EARTH.TIF` | avg. Earth visibility | 65S-90S, 240 m | verified reachable (HTTP 200, size 22,963,503) |
| `LPSR_85S_060M_201608.TIF` | permanent shadow map | 85S-90S, 60 m | verified reachable (HTTP 200, size 656,183); header verified |
| `LPSR_75S_120M_201608.TIF` | permanent shadow map | 75S-90S, 120 m | verified reachable (HTTP 200, size 1,046,706); header verified |
| `LPSR_65S_240M_201608.TIF` | permanent shadow map | 65S-90S, 240 m | verified reachable (HTTP 200, size 582,074) |
| `SKYV_65S_240M.TIF` | sky visibility (unobstructed solid angle) | 65S-90S, 240 m | verified reachable (HTTP 200, size 62,718,743) |
| `*_COG.TIF` variants (e.g. `AVGVISIB_85S_060M_201608_COG.TIF`) | cloud-optimized copies linked from the product page | | **broken**: HTTP 200 but returns a 3,789-byte HTML "404 Not Found" page (checked for 4 of the COG links). Use the plain `.TIF`. |

Header facts (read from the files):
- int16, deflate-compressed, 256x256 tiles, nodata -32768.
- Tiepoint upper-left: (-151,740, +151,740) m for the 85S files and (-457,440, +457,440) m for the 75S files. The geokeys give the latitude of origin as -90 (true scale at the pole), with radius 1,737,400 m (`Moon2000_spole`).
- `AVGVISIB*` has a GDAL scale of 4e-5 and offset 0. The physical value is presumably a fraction from 0 to 1 (raw 25000 = 1.0). This is inferred from the tags; check the value range after download.
- `LPSR_*_201608` has a GDAL scale of 2.5e-5 and offset 0.5. Check the actual values after download; it is expected to behave as a 0/1 mask.
- PDS metadata: `DATA_SET_ID LRO-L-LOLA-4-GDR-V1.0`, producer GSFC, created 2016-09-15, LOLA data from 2009-07-13 to 2013-07-18.
- Coverage note: the 85S files stop at 85S. For an 80S-90S tile set, use the **75S 120 m** files, which reach 457 km from the pole; 80S is about 304 km.

Citation (as stated on the product page): Mazarico, E., Neumann, G.A., Smith, D.E., Zuber, M.T., Torrence, M.H. (2011), Illumination conditions of the lunar polar regions using LOLA topography, *Icarus* 211, 1066-1081, doi:10.1016/j.icarus.2010.10.030.

### 1b. High-resolution PSR map and shapefiles (Barker et al. 2023, "A New View of the Lunar South Pole from LOLA")
Product page: https://pgda.gsfc.nasa.gov/products/90. Base URL: `https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/`. The page states that all TIFs are COGs, in south polar stereographic projection, MOON_ME frame (DE421).

| File | Content | Status |
|---|---|---|
| `LPSR_80S_20MPP_ADJ.TIF` | PSR raster, 80S-90S, 20 m, 30400x30400, float32, values 0-1, nodata NaN | verified reachable (HTTP 200, size 154,221,202); header verified (upper-left at (-304,000, +304,000) m, true scale at -90) |
| `LPSR_80S_20MPP_ADJ_1km2.SHP` | polygons of the 1,531 PSRs larger than 1 km² | verified reachable (HTTP 200, size 20,743,300) |
| `LPSR_80S_20MPP_ADJ_1km2.DBF` | attributes | verified reachable (HTTP 200, size 369,101) |
| `LPSR_80S_20MPP_ADJ_1km2.SHX` | index | verified reachable (HTTP 200, size 12,348) |
| `LPSR_80S_20MPP_ADJ_1km2.PRJ` | projection | verified reachable (HTTP 200, size 368) |
| `LPSR_80S_20MPP_ADJ_1km2.CSV` | table | verified reachable (HTTP 200, size 29,642,968) |
| `LPSR_80S_20MPP_ADJ.SHP` (+ .DBF/.SHX/.PRJ/.CSV) | all 506,349 PSRs | `.SHP` verified reachable (HTTP 200, size 161,396,036); the others are listed on the page (DBF 117M, CSV 209M) but were not HEAD-checked |
| `LDEM_80S_80MPP_ADJ.TIF` | 80 m DEM, 80S-90S (useful if our DEM needs a matching base) | verified reachable (HTTP 200, size 189,158,392) |
| `LDRM_80S_1000MPP_ADJ_AVGROUGH.TIF` | average roughness, 1 km grid (bonus hazard layer) | verified reachable (HTTP 200, size 1,686,425) |

Citation (the page's "Data Usage Policy"): Barker, M.K., et al. (2023), *Planet. Sci. J.* 4, 183, doi:10.3847/PSJ/acf3e1. Data DOI: 10.60903/gsfcpgda-lola-spole.

### 1c. Product 78: site DEMs
https://pgda.gsfc.nasa.gov/products/78 was fetched. It provides **site-specific** 5 m/px GeoTIFFs (LDEM, slope, uncertainty, clones, ROI shapefiles) for about 27 landing-site regions (Site01, Site04, ..., LM1-LM8). It does **not** provide illumination or Earth-visibility rasters; illumination for those sites is discussed in the paper only. Not useful as a whole-region layer. Individual file URLs were not HEAD-checked.

### 1d. LROC PSR atlas
`https://lroc.sese.asu.edu/atlases/PSR` and `https://lroc.im-ldi.com/atlases/PSR` both returned **HTTP 404** on 2026-11-14. Not verified; skip it.

### 1e. Other (not verified as authoritative)
- Zenodo record 5777265, "Moon South Pole Permanent Shadowed Regions", CC-BY-4.0, file `illumination_file.tif` (25,041,216 bytes per the Zenodo API). The `/content` HEAD returned **403**, so it is not verified reachable. It is a third-party upload, and the PGDA products supersede it.

---

## 2. Ice-evidence datasets

### 2a. Diviner Polar Resource Product (Paige et al. 2010; UCLA/Diviner team): **gridded max temperature and ice stability depth, available**
Bundle: `urn:nasa:pds:lro_diviner_derived1`, collection `data_derived_prp`, PDS3 dataset `LRO-L-DLRE-5-PRP-V2.0`, producer D. A. Paige (UCLA), created 2018-02-21.

| File | Status |
|---|---|
| `https://pds-geosciences.wustl.edu/lro/urn-nasa-pds-lro_diviner_derived1/extras/prp/dlre_prp_south.zip` (zipped copy, **recommended**) | verified reachable (HTTP 200, size 116,583,332) |
| `https://pds-geosciences.wustl.edu/lro/urn-nasa-pds-lro_diviner_derived1/data_derived_prp/dlre_prp_south.tab` (uncompressed ASCII) | verified reachable (HTTP 200, size 604,800,210) |
| `.../data_derived_prp/dlre_prp_south.xml` (PDS4 label) and `dlre_prp_south.lbl` (PDS3) | verified reachable (fetched and read) |

The old path `.../lro-l-dlre-4-rdr-v1/lrodlr_1001/data/prp/` resolves to the same directory.

Format (from the label and the first 600 bytes of the table):
- ASCII CSV-like fixed-width table with 210-byte rows, 2,880,000 rows and one header line.
- It is **not a raster**. It is a triangular mesh (about 0.5 km facets) with these columns: `tri1_x..tri3_z` (km, Moon-centred), `tri_clon`, `tri_clat` (deg, planetocentric, east-positive), `tri_calt` (km above 1737.4), `temp_avg` (K), `temp_max` (K, annual maximum surface temperature), and `ice_depth` (m).
- `ice_depth`: the depth at which water ice would sublimate at 1 kg m⁻² per billion years. **0 means ice is stable at the surface.** **-999 means the depth is greater than 2.8738 m**, which in practice means unstable.
- Coverage: the first row is at -75.9° latitude, and vertices reach x,y = ±300 km. That covers 80S-90S; full extent not checked beyond the first rows.
- Integration: project `tri_clon`/`tri_clat` to polar stereographic X/Y, then grid them (nearest neighbour or `scipy.interpolate.griddata`) at about 250-500 m. This takes about an hour of Python work. The polar-stereo L3 snapshot directories (`data_derived_gdr_l3/<year>/polar/`) hold per-date temperature maps, not climatology, so skip them.

Citation: Paige, D.A., et al. (2010), Diviner Lunar Radiometer observations of cold traps in the Moon's south polar region, *Science* 330, 479-482. Not checked on the page; the PDS label names Paige as producer. Also cite the PDS dataset ID above.

### 2b. USGS Ice Favorability Index, south pole (Cannon & Britt 2020): **ready-made GeoTIFF**
- Page: https://astrogeology.usgs.gov/search/map/moon_ice_favorability_index_south_pole_591mp (fetched).
- File: `https://planetarymaps.usgs.gov/mosaic/Lunar_Research/IceFavorabilityIndex/Moon_IceFavorabilityIndex_90S000E_591mp.tif` redirects to `https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/Lunar_Research/IceFavorabilityIndex/Moon_IceFavorabilityIndex_90S000E_591mp.tif`. **verified reachable (HTTP 200, size 4,003,661)**; header verified, and the full file was read.
- Grid: 1000x1000, float32, uncompressed, 590.96 m/px, upper-left at (-295,481, +295,481) m, which covers to about 80.3S. Nodata -3.4e38. Observed values range from 0.0008 to 1.0, a unitless index.
- **Gotcha:** the polar-stereo natural-origin latitude key is **-70**, so true scale is at 70S, unlike PGDA's -90. Do not overlay it pixel-for-pixel; reproject it with rasterio using its CRS.
- Nature: a **model-derived predictive index**, not a detection. Its inputs are the Siegler et al. (2016) ice stability depth, micro cold-trap fraction (Rubanenko & Aharonson 2017), age and impact flux. The page says it "should not be used in isolation to select landing sites."
- Terms: "Access Constraints none", "Use Constraints please cite Cannon and Britt 2020" (Cannon, K.M., Britt, D.T. (2020), *Icarus* 347, 113778, doi:10.1016/j.icarus.2020.113778).

### 2c. LEND neutron hydrogen maps (Mitrofanov et al. 2010; Sanin et al. 2017)
- PDS Geosciences holds only EDR/RDR count data: `https://pds-geosciences.wustl.edu/lro/lro-l-lend-2-edr-v1/` (verified reachable, HTTP 200; contains `lrolen_0xxx`). The `lro-l-lend-4_5-rdr-v1/` path is a meta-refresh redirect to the EDR volume.
- **No public gridded south-pole hydrogen (WEH) map file was found.** Search results (NTRS 20170005195, 20180004020) describe 5x5 km WEH maps derived from PDS data but give no download link. Not verified; not usable in a day.

### 2d. Lunar Prospector neutron spectrometer hydrogen
- `https://pds-geosciences.wustl.edu/lunar/lp-l-ns-3-rdr-v1/` is RDR (time series), from the directory listing.
- `lp-l-grs-5-elem-abundance-v1/lp_9001/data/` holds 2°/5°/20° equal-area **elemental abundance** tables. The column list has `NEUTRON_DEN` but **no hydrogen column**.
- **No gridded polar hydrogen file found.** Not verified; skip it. Its resolution of tens of km is also coarse for an 80S-90S tile set.

### 2e. M3 surface ice detections (Li et al. 2018, PNAS, doi:10.1073/pnas.1802345115)
- The PNAS DOI page returned **HTTP 403** to automated requests. Supplementary data was not verified.
- No public gridded or point file of the about 280 m ice-detection pixels was found. M3 calibrated cubes exist at PDS Imaging (not checked). Re-deriving the detections is not feasible in a day.

### 2f. LAMP (far-UV albedo ratios; Gladstone 2012, Hayne 2015)
Not researched in the time box. Gridded polar maps are believed to be at PDS Atmospheres (LRO LAMP GDR). **Not verified.**

---

## 3. Usage terms

| Source | Terms |
|---|---|
| PGDA (pgda.gsfc.nasa.gov) products 69 and 90 | NASA GSFC data, public. Citation requested: Mazarico et al. 2011 (illumination/PSR/Earth visibility, which are PDS products); Barker et al. 2023 plus data DOI 10.60903/gsfcpgda-lola-spole (product 90). The page footer links NASA "Reproduction Guidelines". |
| PDS Geosciences (Diviner PRP) | NASA PDS archive, public. Produced at UCLA under NASA contract, and no extra conditions are stated in the label. Cite Paige et al. and the dataset ID. |
| USGS Astrogeology IFI | US government publication. "Access Constraints none; Use Constraints please cite Cannon and Britt 2020." The page lists "Originators: Elsevier" because the method paper is in *Icarus*; the raster is distributed by USGS. |
| Zenodo 5777265 | CC-BY-4.0 (from the Zenodo API); third-party upload. |

No university-hosted product with restrictive conditions turned up on the recommended path.

---

## 4. Space Apps partner-agency data

- **ISRO Chandrayaan-2 (PRADAN/ISSDC):** `https://pradan.issdc.gov.in/ch2/` is reachable (HTTP 200). Data browsing lives under `/ch2/protected/...`, which returns a small 4,270-byte page, consistent with a login wall. **Registration is required.** Products (DFSAR polar radar, IIRS, OHRC) are level-1/2 scene data, not ready polar mosaics. Not directly usable in a day. No file-level verification.
- **JAXA Kaguya/SELENE:** `https://darts.isas.jaxa.jp/planet/pdap/selene/` is reachable (HTTP 200). A guessed DEM path (`data.darts.isas.jaxa.jp/pub/pds3/sln-l-lalt-5-lgm-dem-v1.0/`) returned 404. No polar illumination or DEM file was verified. Not verified, and not needed because LOLA already covers it.
- **CSA:** no relevant open lunar polar raster identified. Not researched further.

Partner data is not on the critical path; NASA products cover every layer we need.

---

## 5. Recommendation: most value for least integration work, in priority order

All three are public, polar stereographic (or simple to grid), and readable with rasterio or numpy.

1. **Average solar illumination and permanent shadow (PGDA product 69, 75S 120 m)**: same projection family as our LOLA base, with true scale at -90.
   - `https://pgda.gsfc.nasa.gov/data/MoonIllumination/AVGVISIB_75S_120M_201608.TIF` (83 MB). Apply scale 4e-5, giving a fraction of time illuminated. Use it as a layer and to check our own illumination calculation.
   - `https://pgda.gsfc.nasa.gov/data/MoonIllumination/LPSR_75S_120M_201608.TIF` (1 MB). PSR mask; inspect values after download.
   - Optional detail near the pole: `AVGVISIB_85S_060M_201608.TIF` (34 MB) and `LPSR_85S_060M_201608.TIF` (0.7 MB).
   - For crisp PSR outlines as a vector overlay: `https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LPSR_80S_20MPP_ADJ_1km2.{SHP,SHX,DBF,PRJ}` (about 21 MB total, 1,531 polygons, Barker 2023).
2. **Diviner ice stability depth and max temperature (the actual "where ice can survive" layer)**:
   - `https://pds-geosciences.wustl.edu/lro/urn-nasa-pds-lro_diviner_derived1/extras/prp/dlre_prp_south.zip` (117 MB).
   - Read `tri_clon`, `tri_clat`, `temp_max` and `ice_depth`, project to polar stereographic, and grid at about 250 m.
   - Suggested classes: `ice_depth == 0` means surface ice stable; between 0 and 2.87 m means stable at depth; `-999` means unstable.
   - Show `temp_max` with a 110 K contour, the commonly used surface-ice stability threshold. That threshold comes from the literature, not this file.
   - **Fallback, if gridding the mesh slips:** USGS IFI `https://planetarymaps.usgs.gov/mosaic/Lunar_Research/IceFavorabilityIndex/Moon_IceFavorabilityIndex_90S000E_591mp.tif` (4 MB, drop-in GeoTIFF). Reproject it, because its true scale is at 70S, and label it "predictive model" in the UI.
3. **Earth visibility (communications layer, and a second independent check)**:
   - `https://pgda.gsfc.nasa.gov/data/MoonIllumination/AVGVISIB_75S_120M_201608_EARTH.TIF` (43 MB), scale 4e-5.
   - Per the product page, Earth counts as visible if any part of its disc is unobscured, so the values are slightly optimistic for DSN link planning.

Avoid the `*_COG.TIF` links on PGDA product 69; they currently serve an HTML 404 page with HTTP 200.
