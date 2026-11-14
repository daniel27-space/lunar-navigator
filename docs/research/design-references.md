# Design references: Site Finder and Comparison View

Research date 2026-11-14, about 15 minutes. "checked" = page opened this session; "search result only" = facts from search-result
snippets about that page, page not opened. Anything marked "from memory, not checked" is general knowledge and was not
confirmed against a live page.

Our data, for reference. Static: slope, elevation, average sunlight %, average Earth visibility %,
PSR yes/no. Time-dependent (next 60 days): lit/dark intervals, Earth-link intervals, longest night,
longest outage, "now" status and time until it changes.

---

## 1. Patterns worth borrowing

### Site Finder (filter, then map, then shortlist)

1. **Weighted suitability overlay with 0-9 scores per range.** ArcGIS Experience Builder Suitability
   Modeler: pick layers, give each a percentage weight (they must total 100), score each value range 0-9
   with sliders, Run, and the map layer updates in place
   ([checked](https://doc.arcgis.com/en/experience-builder/latest/configure-widgets/suitability-modeler-widget.htm)).
   *Why it works:* it separates "what is ruled out" from "what is preferred" and produces one map.
   *Ours:* each layer (slope, sunlight %, Earth %, elevation, PSR) becomes a criterion row. Keep
   professional-grade weights hidden under "Advanced"; the default UI is "Must / Prefer / Don't care".
   Update live on slider release instead of a Run button (our layers are precomputed rasters, so a
   shader or worker pass is cheap).
2. **Hard filters vs. soft preference, visibly different.** Same ArcGIS widget (scores 0 = excluded)
   and Finviz Screener (every filter is a hard "Any / over X / under Y" dropdown, grouped into tabs
   Descriptive/Fundamental/Technical, with a live "#1 / N Total" count)
   ([checked](https://finviz.com/screener.ashx)).
   *Ours:* "Slope at most 5 degrees" is a hard cut (area goes dark); "more sunlight is better" is a
   preference (brightness). Show a live count: "12% of the south-polar region passes your hard limits".
3. **Presets that encode intent.** Finviz "My Stock Presets"; ArcGIS "start from a preconfigured model"
   (both checked above). *Ours:* three presets as big buttons on first open: "Ice prospecting"
   (Sun avg low or PSR, Earth link high, slope low), "Solar-powered lander" (Sun avg high, short longest
   night, slope low), "Communications relay" (Earth visibility high). Each is just a pre-filled criteria
   panel the user can then edit, which teaches the model.
4. **Map and list are one selection.** Property search (Zillow/Redfin/Airbnb): hovering a list card
   highlights the pin and vice versa; the list re-ranks as the map is panned or filtered
   (from memory, not checked; Redfin's "Draw your own search" outline exists,
   [search result only](https://www.redfin.com/news/?p=31460), but map-list sync was not confirmed there).
   *Ours:* the ranked shortlist (top 10 local maxima of the suitability raster, with a minimum spacing
   so we do not list ten pixels on the same ridge) is linked to numbered markers on the 3D Moon.
5. **"Best" as a default sort that explains itself, plus single-criterion sorts.** Kayak's Best /
   Cheapest / Quickest tabs; Kayak says Best weighs price against duration and the weight shifts with
   the result set ([search result only](https://www.kayak.co.uk/company)).
   *Ours:* shortlist tabs "Best match / Most sunlight / Best Earth link / Flattest". Unlike Kayak, show
   *why* a site ranks where it does (pattern 6), since Kayak's opacity is its main criticism.
6. **Per-result reason chips.** Versus.com "why is A better than B" bullet lists
   (from memory, not checked; page returned 403). *Ours:* each shortlist row shows 2-3 chips generated
   from the criteria that contribute most: "Slope 2.1 deg", "Earth in view 97%", "Longest night 4 d".
   A chip turns amber when the site only barely passes a hard limit.
7. **Relaxation hint when nothing qualifies.** Common in flight/hotel filters ("no results; remove filter
   X to see 34") (from memory, not checked). *Ours:* if zero area passes, list which single hard limit,
   if loosened, would open the most area: "Allow slope up to 8 deg: +3 candidate zones".
8. **Draw a region of interest to summarise.** ArcGIS widget "Generate chart" by drawing a polygon
   (checked above); Redfin draw search (checked above). *Ours:* optional lasso around a crater rim to
   restrict the shortlist; low priority for the hackathon.

### Comparison View (2-3 sites)

1. **Lead with the main differences, not the full table.** RTINGS compare tool: a "Main Differences"
   list auto-generated from the usage you choose, shown only where weighted score gap times weight is
   above a threshold (0.10 default); the full side-by-side spec table sits below
   ([search result only](https://www.rtings.com/company/side-by-side), compare pages e.g.
   [this one](https://www.rtings.com/tv/tools/compare/tcl-qm7k-vs-samsung-qn70f/88608/92239)).
   *Ours:* the mission profile from the Finder is the "usage". Top of the view: 2-4 sentences such as
   "B gets 31 points more sunlight than A, but its longest night is 6 days longer." Only metrics whose
   difference matters under the current weights are listed.
2. **Hide similarities toggle.** Product comparison sites (GSMArena "differences only", Apple compare
   groups) (from memory, not checked; Apple's compare page was opened and is grouped by category with a
   sticky price row, but no "hide similarities" toggle was visible,
   [checked](https://www.apple.com/iphone/compare/)). *Ours:* in the secondary table, a toggle
   "Show only differences" hides rows where all sites are within tolerance (e.g. slope within 1 deg).
3. **Aligned stacked timelines on one shared time axis.** Time-zone meeting planners (timeanddate,
   Every Time Zone, Morgen): one row per location, aligned to the same hours, with the shared good
   slot highlighted across all rows ([Morgen, from search result](https://www.morgen.so/timezone-meeting-planner);
   timeanddate page opened but its result layout was not visible: [checked inputs only](https://www.timeanddate.com/worldclock/meeting.html)).
   *Ours:* the single most valuable view. 60-day axis across the top; per site two thin lanes (Sun,
   Earth); a vertical "now" line; a shared draggable cursor across all sites. A summary lane at the
   bottom marks moments when *all* sites are lit (or all have Earth), like the planner's common slot.
4. **Scrub one time cursor and everything follows.** The Photographer's Ephemeris web: dragging the
   altitude chart moves time, the map's Sun/Moon azimuth lines rotate, legend shows azimuth and altitude
   ([checked](https://photoephemeris.com/en-GB/help/tpe-web/using-the-tpe-web-timeline-and-altitude-chart/)).
   *Ours:* dragging the timeline cursor updates the 3D scene's Sun, every site's horizon panorama and
   status chip together. Arrow keys step by 1 hour, Shift+arrow by 1 day.
5. **Per-day confidence/quality dots.** Windy point forecast shows a coloured dot per day for
   reliability (green to burgundy) ([checked via search results](https://community.windy.com/topic/26304/understanding-the-compare-forecast-feature-in-windy-com)).
   *Ours:* a compact "calendar strip" variant of the timeline for narrow screens: one cell per day per
   site, coloured by fraction lit and Earth-linked that day.
6. **Date grid / price graph for "when is it best".** Google Flights date grid (green cheaper, red
   pricier) and price graph over about two months ([checked via search](https://blog.google/products-and-platforms/products/travel/how-to-find-the-best-deal-on-your-next-flight/)).
   *Ours:* a "landing window" helper: for each candidate landing day in the 60 days, colour = how many
   hours of sunlight and Earth link follow touchdown before the first night. Answers "when should we
   land at B?" Secondary feature.
7. **Dot/lollipop plot per metric instead of radar.** data-to-viz recommends lollipops or faceted bars
   for few series, parallel coordinates for many series or mixed scales
   ([checked](https://www.data-to-viz.com/caveat/spider.html)).
   *Ours:* one horizontal row per metric, scale from worst to best in the polar region (normalised,
   with real units printed), a coloured dot per site. Winner is the dot furthest toward "better".
8. **Parallel coordinates with brushing for experts.** Facebook HiPlot: brush ranges on axes, reorder
   axes, colour lines by a dimension (repo archived 2024)
   ([search result only](https://github.com/facebookresearch/hiplot)).
   *Ours:* an "Expert" tab in the Finder showing the top 50 candidates across slope, elevation, Sun %,
   Earth %, longest night, longest outage; brushing an axis is the same as setting a hard filter.
9. **Category grouping with sticky identity header.** Apple compare: rows grouped (Display, Battery, ...),
   column header and price stay visible (checked above). *Ours:* the secondary table groups rows as
   Terrain / Power / Communications, with site colour swatches and names sticky at the top.
10. **Better/worse deltas relative to a chosen baseline.** Game loadout and sports stat comparisons show
    green "+12" / red "-3" next to each stat (from memory, not checked). *Ours:* user can pin one site
    as "baseline"; others show signed deltas in the table ("+18 pts sunlight", "+2.3 d longest night"),
    coloured by better/worse for the current mission profile, not by sign.

---

## 2. Recommended design

### Site Finder

- **Layout (desktop):** left panel 320 px "What do you need?"; centre the existing 3D Moon with the
  suitability heat map draped over terrain; right panel 300 px "Top candidates". Layer switcher collapses
  into the map's corner while the finder is open.
- **Left panel, top to bottom:** (a) preset buttons: Ice prospecting / Solar lander / Comms relay /
  Custom. (b) Criteria list, one row per metric: name, a segmented control Must / Prefer / Ignore, and a
  range slider with a histogram of that metric across the region behind the slider track (so the user
  sees how much area a cut-off removes). For "Prefer", a direction toggle (more / less) and an
  Importance control Low / Med / High (maps to weights 1/2/3, normalised). (c) Live count: "Passing
  area: 12%". (d) If zero, the relaxation hint.
- **Map:** hard-filtered-out area is darkened (multiply 0.25, keep terrain shading visible so geography
  is still readable); passing area uses a single-hue sequential ramp (dark to bright) of the weighted
  score. Numbered markers 1-10 at the shortlist spots. Legend: "Dim = ruled out; brighter = better fit".
- **Right panel:** tabs Best match / one per Prefer criterion. Each row: rank number, short auto name
  ("Rim of Shackleton, 2.1 km NE"), match bar (0-100), 2-3 reason chips, a checkbox "Compare".
  Hover row highlights marker and flies the camera on click. Selecting 2-3 checkboxes enables a
  sticky "Compare 3 sites" button at the panel bottom.
- **Primary vs secondary:** primary is the map plus top 3 rows; weights and histograms are visible but
  quiet; parallel coordinates sit behind an "Expert" tab.
- **Narrow screen (< 768 px):** full-screen map; criteria become a bottom sheet (peek shows preset chips
  and passing %); shortlist is a horizontal swipe carousel of cards above the sheet; markers sync to the
  card in view.

### Comparison View (recommended: "Verdict + shared timeline")

- **Header strip:** 2-3 site chips, each with a fixed colour (colour-blind-safe, e.g. blue / orange /
  purple), name, mission-fit score, and a "baseline" pin. Mission profile from the Finder shown as a
  small editable chip ("Solar lander") - changing it re-ranks everything.
- **Region 1, Verdict (top, full width):** 2-4 generated sentences in the RTINGS style, ordered by
  weighted impact: "A is the best fit for a solar lander: sunlit 84% vs 61% and 52%. B has the shortest
  communication outage (0 h). C is flattest (1.2 deg) but has a 9-day night." Each sentence names the
  winner and the trade-off; no sentence for metrics that are near-equal.
- **Region 2, Shared timeline (primary, full width):** 60-day axis. Per site, two 10 px lanes: Sun
  (yellow = lit, dark = night) and Earth (blue = in view, dark = outage). Sites stacked, labelled with
  their colour chip. A "now" line and a draggable time cursor shared across all lanes; the longest night
  and longest outage per site are outlined with a bracket and a label ("9.1 d"). Bottom lane "All sites
  lit" / "All sites linked" highlights common windows. Dragging the cursor updates the 3D scene and
  panoramas.
- **Region 3, Metric dot rows (primary, beside or under the timeline):** one row per metric (slope,
  elevation, Sun %, Earth %, longest night, longest outage). Axis runs worse (left) to better (right) for
  the current profile, with the region's range as faint background and the user's hard limit as a
  vertical tick. One dot per site in its colour; the winning dot is filled and labelled with value;
  others hollow with values. Winner per criterion = rightmost dot; ties (within tolerance) shown as
  overlapping dots with "about equal".
- **Region 4, Panoramas (secondary, collapsible):** the three 360-degree horizon strips stacked and
  aligned on azimuth (N at the same x), all at the cursor time, with Sun and Earth icons. Stacking
  makes "A's Earth sits just above a ridge that blocks it at C" visible.
- **Region 5, Detail table (secondary, collapsed):** grouped Terrain / Power / Comms; "differences only"
  toggle; deltas vs baseline.
- **Narrow screen:** header chips become a sticky row; Verdict first; timeline switches to the
  per-day calendar strip (one cell per day per site per lane, 60 cells wrapping into ~2 rows of 30)
  with tap for details; dot rows stay (they are naturally narrow); panoramas swipe one at a time.

**Runner-up: "Small multiples per site" (one column card per site, each with its own mini timeline,
panorama, and four numbers, with winners badged).** Easier to build from the existing site cards and
good for a single site's story, but comparison requires eye travel between columns and timelines are
not aligned on one axis, which is the owner's current complaint in a nicer wrapper. Use it only if time
runs out; at minimum, give all mini timelines the same scale and the same pixel width.

---

## 3. Anti-patterns to avoid

1. **Radar charts for site comparison.** Our axes have different units and directions (low slope good,
   high sunlight good or bad depending on mission); shape depends on axis order and area exaggerates
   gaps (data-to-viz, checked above). Use dot rows instead.
2. **Opaque "best" score.** Kayak's Best is criticised because users cannot see the weighting (and it
   mixes in revenue, per its own page). Always show the reason chips and let users open the weights.
3. **Green/red winner colouring tied to sign, not to need.** More sunlight is "better" for a solar
   lander and "worse" for ice. Colour must follow the active mission profile.
4. **Rainbow heat maps.** A multi-hue ramp invents boundaries; a dark-to-bright single-hue (or
   perceptually uniform, e.g. viridis/magma) ramp matches the "brightest = best" brief
   (from memory, not checked).
5. **Separate time axes per site.** Two 60-day bars in different cards cannot be compared at a glance;
   one shared axis and a shared cursor are required.
6. **Ranking pixels instead of places.** A raw top-N of the raster returns clusters of neighbours;
   enforce minimum spacing (e.g. 1-2 km) and merge into named zones.

---

## 4. Visual polish (dark 3D planetary scene)

1. **One harsh key light, near-black fill.** The polar Sun is a few degrees above the horizon; keep the
   real directional light, add only a very low ambient (plus faint earthshine on the Earth-facing side)
   so PSRs read as true black with the heat map visible on top. Tone-map with ACES filmic in three.js
   (from memory, not checked).
2. **Heat map as emissive overlay, not paint.** Blend suitability additively on terrain so the brightest
   candidates glow slightly even in shadowed craters; ruled-out area multiplies darker. Keeps relief.
3. **Glassy dark panels.** Semi-transparent dark panels with background blur and a 1 px light border
   (common in sci-fi game HUDs and Apple visionOS style) (from memory, not checked); keep text contrast
   at WCAG AA despite transparency.
4. **Consistent site colours everywhere.** The site's colour appears on its marker, its timeline lanes,
   its panorama frame and its dot; nothing else in the UI uses those three hues.
5. **Monospace numerals, units dimmer.** Tabular figures for values ("84%"), lighter weight for units,
   so columns of changing values don't jitter when scrubbing time.
6. **Leader lines from marker to label.** Game/film HUD style: a thin line from the 3D marker to a
   screen-space label that never overlaps terrain, with a distance-based fade (from memory, not checked).
7. **Camera fly-to with ease and short duration (~0.8 s)**, and reduced-motion support: cut instead of
   fly when `prefers-reduced-motion` is set.
8. **Subtle bloom only on the Sun and Earth icons** in panoramas and the sky, not on UI text.

---

## Sources opened or found this session

- ArcGIS Suitability Modeler widget: https://doc.arcgis.com/en/experience-builder/latest/configure-widgets/suitability-modeler-widget.htm
- Finviz Screener: https://finviz.com/screener.ashx
- RTINGS side-by-side announcement: https://www.rtings.com/company/side-by-side
- Apple iPhone compare: https://www.apple.com/iphone/compare/
- The Photographer's Ephemeris web timeline: https://photoephemeris.com/en-GB/help/tpe-web/using-the-tpe-web-timeline-and-altitude-chart/
- Kayak "How KAYAK works": https://www.kayak.co.uk/company
- Google Flights tips (date grid, price graph): https://blog.google/products-and-platforms/products/travel/how-to-find-the-best-deal-on-your-next-flight/
- Windy compare (community thread): https://community.windy.com/topic/26304/understanding-the-compare-forecast-feature-in-windy-com
- data-to-viz radar caveats: https://www.data-to-viz.com/caveat/spider.html
- HiPlot: https://github.com/facebookresearch/hiplot
- Redfin draw search: https://www.redfin.com/news/?p=31460
- Morgen time-zone planner: https://www.morgen.so/timezone-meeting-planner
