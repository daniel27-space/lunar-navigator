# Design language: Lunar Landing Site Navigator

Status: proposal, 2026-11-14. Scope: everything drawn over the 3D Moon (chrome, panels, charts in panels).
Map layer ramps (the colours draped on the terrain) are data, not chrome, and keep their own rules (section 3.4).
Research on site-finder and comparison patterns is in `docs/research/design-references.md`; this file does not repeat it.

Sources: "checked" = page opened 2026-11-14. "From memory, not checked" = general knowledge, not confirmed this session.

## 1. Principles

1. **Chrome is grey; hue always means data.** Panels, buttons and text use one neutral ramp; colour is reserved for a fixed list of meanings. Refactoring UI says greys carry nearly everything and accent colours are for states and categories, used sparingly ([checked](https://www.refactoringui.com/previews/building-your-color-palette)).
2. **Colour is a backup, never the only signal.** Every coloured meaning also has a letter, shape, position or word. NN/g: colour should reinforce what position or shape already says, and colour-blind readers lose hue-only signals ([checked](https://www.nngroup.com/articles/dashboards-preattentive/)).
3. **A fixed, pre-defined scale beats ad-hoc values.** Pick a palette, spacing steps and type sizes once and use only those. Refactoring UI warns against generating shades on the fly ([checked](https://www.refactoringui.com/previews/building-your-color-palette)); Carbon builds spacing in 2/4/8 px steps ([checked](https://carbondesignsystem.com/elements/spacing/overview/)); Atlassian uses tokens instead of raw px ([checked](https://atlassian.design/foundations/spacing)).
4. **Let values speak; demote labels.** In dense data, labels are smaller and quieter than values, or merged into the value ("Sunrise in 5.4 d") ([checked](https://refactoringui.com/previews/labels-are-a-last-resort)).
5. **Compare on one grid.** Items in columns, attributes in rows, the same alignment in every column, a sticky identity header, and an option to hide rows that do not differ ([NN/g comparison tables, checked](https://www.nngroup.com/articles/comparison-tables/)).
6. **Readable over any terrain.** Text at least 4.5:1, large text and UI boundaries/focus at least 3:1, measured against the lightest the panel can get over a sunlit crater ([WCAG 2.2 1.4.3, checked](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html); [1.4.11, checked](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)).
7. **Fingers first.** Never below 24 x 24 px ([WCAG 2.5.8, checked](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)); 44 px on touch screens, between Apple's 44 pt (from memory, not checked) and Android's 48 dp ([checked](https://developer.android.com/guide/topics/ui/accessibility/apps)).
8. **Every pixel of ink earns its place.** No decorative borders, glows or second legends; remove before adding (Tufte's data-ink ratio, from memory, not checked).

## 2. Audit of the current UI (App.css, App.tsx, ui/*.tsx, scene/Missions.tsx)

**Colours in chrome (should be about 6, are 25+):**
- Text greys: `#e8eaee` (body), `#aab0bb` (`.muted`, dt, ticks, `.utc`), `#c9ced8` (`.legend`, `.tip`), `#cfd3da` (`.help ul`, `.chips em`), `#9aa1ad` (`.cmp-now b`), `#8b93a1` (`.bites u`), `#fff` (`.tip b`, cursor, `.cmp-all`), `#0b0c0f` (text on `.on`).
- Panel backgrounds: `rgba(14,16,20, .82)` (`.hint/.pin/.status/.legend`), `.85` (`.timebar`), `.86` (`.site`, `.tabs button`), `.88` (`.finder`, `.compare`), `.95` (`.tip`), `rgba(20,22,27,.9)` (`.missions`). Blur 6 px on some, none on `.legend` or `.tip`.
- Borders: `rgba(255,255,255, .06 / .1 / .14 / .16)`.
- Five unrelated accents doing interactive jobs: yellow `#ffcf4a` (scrubber `accent-color`, `.site.active` border), green `#4fc38a` (`.filter` slider, `.now .ok`), green `#29b875` (`.finder` slider, `.fit` tint), lemon `#fff26b` (shortlist hover border, rank ring, 3D rank marker in `numberTexture`), light blue `#9cc8ff` (`.help summary` link, also Earth chip text).
- Warning/negative: orange `#ff8f4d`/`#ffb27a` (`.bites .tight`), red `#ff7a7a` (longest-night bracket), `#c0504a`/`#ffb4ae` (error), `#e0625a` (crashed mission), grey `#6b7280` (`.now .bad`).
- Site colours `SITE_COLORS = ['#b79bff', '#5fd38d', '#ff8f6b']` (store.ts): the green repeats the "ok" green and the slider greens; the orange is next to the warning orange; purple vs Earth blue collapses for protanopia (simulated, section 3.3).
- Mission status (Missions.tsx): landed `#4fc38a` (same as "ok"), planned and candidate both `#ffcf4a` (same as the Sun).
- PSR layer legend says "Blue areas", the same hue family as Earth view.

**Font sizes:** 8 px (SVG `.tl-tick`, `.pano .off`; unreadable on a phone), 11 (`h3`, `.chips em`, `.cmp-now b`), 12, 12.5 (`.help`), 13 (`.finder`, `.compare`, `.stats`, `.now > div`, `.filter`), 14 (body, `h2`), 16 (`h1`, `.fit b`). Weights 500, 600, 700 mixed; winners use bold **plus** underline **plus** site colour.

**Paddings (16 different values):** `0 5`, `0 6`, `0 7`, `0 8`, `2 4`, `2 8`, `3 6`, `3 8`, `5 6`, `5 8`, `6 8`, `6 10`, `8 10`, `10 12`, `12 16`, `2 4 2 8`. **Gaps:** 2, 3, 4, 6, 8, 10, 12, 16. **Radii:** 1, 2, 3, 4, 5, 6, 8, 10, `0 6 6 0`, 50 %.

**Structure:** `.panel` declared twice (lines 54 and 133); `.site` border declared twice (137, 403); `.seg button.on` duplicates `button.on`; panel tops hard-coded `92px` and heights `calc(100vh - 190px)` (break when the header wraps, which it does at 1440 px with 8 layer buttons).

**Touch targets below 24 px:** `.seg button` (3 px padding, 12 px text: about 23 px tall), `.cmp-x` and card `×` (`padding: 0 7/8`: about 20 px), `.finder h3 button` (2 px padding), chips. Range thumbs are browser default (about 16 px).

**Value formatting:** coordinates `79.599°S` in the card header but `79.60°S` in the shortlist and signed `-79.60°, -30.86°` in the compare table; elevation `-1211 m` (hyphen, no separator); Sun elevation 2 decimals (`-7.73°`) vs slope 1 (`0.5°`); `0.0 h` next to `14.5 d`; "Earthset in more than 60 d" wraps to 3 lines; verdict says `13.9 days` while rows say `13.9 d`; timeline ticks `11-12` (MM-DD) while the date input shows `14/11/2026, 08:13 AM` (locale, 12 h); headings mix sentence case (`h2`) and 11 px uppercase (`h3`).

**Phone (<= 760 px):** finder moves to `bottom: 76px; max-height: 42vh` and the right panel stays at `top: 92px; max-height: 38vh`, so together they cover about 80 % of the Moon; the 8-button layer bar wraps to 3 rows; no safe-area insets.

**Comparison panel (f3.jpg):** six different left edges (site rows with 3 px bar + 8 px padding, verdict bar, bold line, muted paragraph, timeline with its own 2.5 px colour tick, dot rows at 0); five text blocks before the first chart; site colour appears as border, dot, value text, verdict bar and status-chip-free name; status chips "Dark/Earth" repeat per row; values sit in a free `flex` row under each track, so the three numbers never line up between measures.

## 3. Tokens

Paste into `:root` (App.css top). Every literal colour, size or radius in CSS and TSX is replaced by one of these.

```css
:root {
  /* 3.1 Neutral surfaces (dark UI over a black scene). Elevation = lighter, not shadow. */
  --scene:        #000000;              /* canvas clear colour (unchanged) */
  --surface-1:    rgb(20 22 27 / 0.92); /* #14161b: every panel, sheet, time bar, legend. Replaces rgba(14,16,20,.82/.85/.86/.88) */
  --surface-1-solid: #14161b;           /* used when backdrop-filter is unsupported or reduced-transparency */
  --surface-2:    #1d2027;              /* rows, inputs, unselected buttons, chart track bg. Replaces rgba(255,255,255,.04/.06/.07) */
  --surface-3:    #272a32;              /* hover on surface-2; tooltip. Replaces rgba(255,255,255,.12), rgba(14,16,20,.95) */
  --border:       rgb(255 255 255 / 0.10); /* panel edge, row dividers. Replaces .06/.1/.14/.16 */
  --border-strong:#6b7280;              /* control outline when nothing else marks it (3.74:1 on surface-1) */

  /* 3.2 Text. Ratios vs #14161b / vs worst case (#222429 = panel at 0.92 over sunlit regolith #c8c8c8) */
  --text-1: #eceef2;  /* 15.6:1 / 13.4:1  values, titles. Replaces #e8eaee, #fff, #cfd3da, #c9ced8 */
  --text-2: #b4bac4;  /*  9.3:1 /  8.0:1  labels, body copy. Replaces #aab0bb, #9aa1ad */
  --text-3: #8e95a1;  /*  6.0:1 /  5.2:1  captions, units, axis ticks, disabled. Replaces #8b93a1 */
  --on-accent: #0b0c0f;

  /* One interactive accent: neutral ink. Selected = filled light; link = text-1 + underline.
     Replaces #ffcf4a (scrubber, active card), #4fc38a/#29b875 (sliders), #fff26b (hover, rank ring), #9cc8ff (links) */
  --accent:       #eceef2;
  --accent-hover: #ffffff;
  --focus-ring:   0 0 0 2px #0b0c0f, 0 0 0 4px #ffffff; /* >= 3:1 against both panel and terrain */

  /* 3.3 Data colours: fixed meanings, never used for chrome or selection */
  --data-sun:     #ffcf4a;  /* in sunlight, Sun disc and path. 12.3:1 */
  --data-earth:   #5aa9ff;  /* Earth in view, Earth disc. Replaces #4a9eff (5.0:1 -> 7.4:1) */
  --data-night:   #7a8294;  /* darkness, longest night/outage bracket. Replaces #ff7a7a, #6b7280 */
  --data-gap:     #2a2e36;  /* empty lane (no Sun / no Earth). Replaces rgba(255,255,255,.07) */
  --data-psr:     #9fe7f5;  /* permanent shadow / ice. Replaces the "blue" PSR overlay */
  --data-warn:    #ff9f43;  /* barely passes, tightest limit. Replaces #ff8f4d, #ffb27a */
  --data-danger:  #ff7a6b;  /* errors, crashed missions only. Replaces #c0504a, #ffb4ae, #e0625a */
  --data-ok:      #4fc38a;  /* landed missions only (map markers); never "good" in panels */
  --data-fit-ramp: linear-gradient(90deg, #0a4d57, #29b875, #e9f7a8); /* finder suitability */

  /* Site identity: A, B, C. Replace SITE_COLORS. Min pairwise CIELAB dE 19.7 under simulated
     protanopia, deuteranopia and tritanopia (Machado 2009 matrices, computed here); >= 18.7 from
     every data colour. Used as swatches, lane ticks, dots and 3D markers - never as text colour. */
  --site-a: #6afbcb;  /* mint    14.0:1 */
  --site-b: #826afb;  /* violet   4.7:1 */
  --site-c: #cb4dcb;  /* magenta  4.7:1 */

  /* 3.4 Spacing: 4 px base */
  --sp-0: 2px; --sp-1: 4px; --sp-2: 8px; --sp-3: 12px; --sp-4: 16px; --sp-5: 24px; --sp-6: 32px; --sp-7: 48px;

  /* 3.5 Type: one family, tabular figures on every panel */
  --font: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  --fs-cap: 11px;  --lh-cap: 16px;  /* axis ticks, chip text. Min size anywhere, incl. SVG; 12px on phones (15 Nov) */
  --fs-sm: 12px;   --lh-sm: 16px;   /* captions, labels, legend */
  --fs-md: 14px;   --lh-md: 20px;   /* body, buttons, values */
  --fs-lg: 16px;   --lh-lg: 24px;   /* panel titles, verdict, h1 */
  --fs-xl: 20px;   --lh-xl: 28px;   /* one hero number per panel (finder area) */
  --fw-regular: 400; --fw-medium: 500; --fw-semibold: 600;   /* no 700 */

  /* 3.6 Shape and depth */
  --r-sm: 4px;  /* chips, bars, swatches */
  --r-md: 8px;  /* buttons, inputs, rows */
  --r-lg: 12px; /* panels, sheets, time bar */
  --r-full: 999px;
  --blur: blur(12px) saturate(120%);
  --shadow-1: 0 8px 24px rgb(0 0 0 / 0.45); /* floating panels only; sheets add --shadow-up */
  --shadow-up: 0 -8px 24px rgb(0 0 0 / 0.45);
  --touch: 44px;  /* min hit area on coarse pointers */
  --ctl-h: 32px;  /* control height, fine pointer */
  --header-h: 56px; --timebar-h: 56px;
}
@media (pointer: coarse) { :root { --ctl-h: 44px; } }
.panel-surface { background: var(--surface-1); border: 1px solid var(--border); border-radius: var(--r-lg);
  backdrop-filter: var(--blur); box-shadow: var(--shadow-1); font-variant-numeric: tabular-nums; }
@media (prefers-reduced-transparency: reduce) { :root { --surface-1: var(--surface-1-solid); } }
```

Notes. Dark-theme practice: a near-black (not pure black) surface, lighter surfaces for higher layers, and slightly desaturated accents (Material dark theme, from memory, not checked; the m2/m3 pages did not render). Status colours are a separate set from categorical ones (Carbon data-viz palettes, [checked](https://carbondesignsystem.com/data-visualization/color-palettes/)); here that is `--data-warn/danger/ok` vs `--site-*`. Tabular figures keep digits the same width so columns and scrubbed values do not jitter ([MDN, checked](https://developer.mozilla.org/en-US/docs/Web/CSS/font-variant-numeric)). Map layer ramps in `LAYERS` (App.tsx) stay as they are, but the PSR overlay changes to `--data-psr`, and legend text names colours by meaning ("ice-blue = never sunlit"). 3D markers: rank markers use `--accent` ring (was `#fff26b`); site pins use `--site-*` with a dark 2 px outline and their letter.

## 4. Formatting values

One helper module (`lib/format.ts`) owns every rule below; no `toFixed` in JSX.

| Quantity | Rule | Examples |
|---|---|---|
| Share of time | integer %, no space; `<1%` and `>99%` at the ends | `48%`, `<1%` |
| Duration | `< 48 h`: hours, 1 decimal under 10 h else integer; `>= 48 h`: days, 1 decimal; zero = `none`; open-ended = `> 60 d` | `0.5 h`, `14 h`, `13.9 d`, `none`, `> 60 d` |
| Slope | 1 decimal, no space | `1.1°` |
| Sun / Earth elevation | 1 decimal, signed with true minus `−` | `−7.7°`, `+52.7°` |
| Coordinates | 3 decimals (about 30 m on the Moon), hemisphere letter, no sign | `79.599°S, 30.862°W` |
| Elevation | integer metres, thin-space thousands, true minus | `−1 211 m` |
| Distance | `< 1 km` integer metres; else 1 decimal km | `850 m`, `2.4 km` |
| Area | integer km² with separators; 1 decimal under 10 | `35 926 km²`, `7.4 km²` |
| Date/time | always UTC, 24 h, ISO order: `2026-11-14 08:13 UTC`; axis ticks `12 Nov` | |

- Space between number and unit for letter units (`13.9 d`, `850 m`), none for `%` and `°`. Write "d" and "h" in values, "days" and "hours" only in sentences.
- Numbers right-aligned in any column; labels left-aligned. Missing value = `–` in `--text-3`, never `n/a` or `NaN`.
- Key-value row: label `--fs-sm` `--text-2` left, value `--fs-md` `--fw-medium` `--text-1` right, same baseline, row height 24 px (32 px coarse). Two pairs per row on desktop cards; one per row on phone.
- Sentence case everywhere, including section headers and buttons. No uppercase letter-spaced headings.
- The time-bar date input uses the same UTC format (custom display, not the locale `datetime-local` rendering).

## 5. Components

All controls: height `--ctl-h`, padding `0 var(--sp-3)`, radius `--r-md`, `--fs-md`, `--fw-medium`. On coarse pointers, an invisible hit area extends to `--touch` when the drawn control is smaller.

| State | Rule |
|---|---|
| hover (fine pointer only) | background one step up (`--surface-2` -> `--surface-3`) |
| active/pressed | `transform: translateY(1px)`; no colour change |
| selected (`aria-pressed`/`aria-selected`) | `--accent` fill, `--on-accent` text |
| focus-visible | `box-shadow: var(--focus-ring)`; never removed |
| disabled | `--text-3` text, `--surface-2` fill, `cursor: not-allowed`, no hover |

- **Primary button** (one per panel at most: "Compare top 3"): `--accent` fill, `--on-accent` text.
- **Secondary**: `--surface-2` fill, `--border` outline.
- **Ghost** (close `×`, "Fly to"): transparent, `--text-2`, square `--ctl-h` with a 16 px icon; hover `--surface-2`.
- **Segmented control** (presets, More/Less/Either, PSR, rates, view, layers): one `--surface-2` track with `--sp-0` inner padding and `--r-md`; segments share it, selected segment filled `--accent`. Replaces `.seg`, `.presets`, `.tabs`, `.layers`, `.rates` styles.
- **Tabs** (Compare / Site by site): an underline tab bar inside the panel header (2 px `--accent` underline, `--text-1` selected, `--text-2` others), not two floating buttons above the panel.
- **Slider**: track 4 px `--data-gap`, filled part `--text-2`, thumb 16 px `--accent` circle with `--surface-1` 2 px ring (hit area `--touch`). Label row above: name left in `--text-2`, current value right in `--text-1` tabular ("Slope at most · **10°**"). Two-thumb range = one track with two thumbs, not two sliders. No coloured `accent-color` anywhere.
- **Panel/card**: `.panel-surface`, padding `--sp-4` (`--sp-3` on phone), internal vertical rhythm: `--sp-3` between items in a section, `--sp-5` between sections. Header row (title + actions) is sticky inside the scroll area.
- **Section header**: `--fs-sm`, `--fw-semibold`, `--text-2`, sentence case, `--sp-2` below, optional action at right.
- **Chip/badge**: height 20 px, padding `0 var(--sp-2)`, `--r-sm`, `--fs-cap`, `--surface-2` fill, `--text-2`. A data chip adds a 6 px dot of the data colour before the word; it is never filled with the colour. Warn chip = `--data-warn` dot + text stays `--text-1`.
- **Site badge**: 20 px circle, fill `--site-*`, letter A/B/C in `--on-accent` 11 px semibold. The only way site identity is shown in panels.
- **Legend**: inside the panel or in one legend box (bottom-left), `--fs-sm`; swatch 12 x 8 px `--r-sm`; ramp 8 px high with end labels in `--text-3`.
- **Tooltip**: `--surface-3` solid, `--r-md`, padding `--sp-2 --sp-3`, `--fs-sm`, max 280 px, title `--fs-md --fw-semibold`.
- **Time bar**: `.panel-surface`, height `--timebar-h`; left to right: play (ghost, square), rate segmented (`1 h/s 6 h/s 1 d/s 7 d/s`), scrubber (flex 1, thumb `--accent`, not yellow), UTC date button. Scrubber track shows nothing else.
- **Layer switcher**: desktop = segmented control, one row, labels shortened to fit ("Find a site", "Sun now", "Sun avg", "Earth avg", "Shadow", "Height", "Slope"); phone = one "Layers" button opening a list sheet with radio rows and a one-line description each.

## 6. Layout

**Desktop (>= 1100 px).**
```
+-----------------------------------------------------------------------------------+
| Lunar Landing Site Navigator   [South pole|Whole Moon]  [Go to mission v]   (56)  |
| [Find a site|Sun now|Sun avg|Earth avg|Shadow|Height|Slope]                 (40)  |
| +-- finder 320 --+                                         +-- sites 400 ---+     |
| | sticky header  |            3D Moon                      | sticky header  |     |
| | scrolls        |                                         | scrolls        |     |
| +----------------+                                         +----------------+     |
| [legend 300, only when finder is off]                                             |
| [> | 1h/s 6h/s 1d/s 7d/s | ===========o================ | 2026-11-14 08:13 UTC] 56 |
+-----------------------------------------------------------------------------------+
```
- Outer margin `--sp-4`; gap between stacked chrome `--sp-2`. Panels: `top: calc(var(--header-h) + 40px + var(--sp-4))`, `bottom: calc(var(--timebar-h) + 2 * var(--sp-4))`. Each panel scrolls inside; the page never scrolls. The finder panel is 320 px, the sites panel 400 px when comparing and 360 px for cards.
- The map stays interactive between panels; panels never cover more than 50 % of the width.

**Tablet (761-1099 px).** One side panel at a time (360 px), chosen by a `[Find | Sites]` segmented control in the header; the layer row scrolls horizontally rather than wrapping.

**Phone (<= 760 px).**
- Top: one 48 px bar: title shortened to "Lunar Navigator", `Layers` button, `⋯` menu (view, mission). `padding-top: env(safe-area-inset-top)`.
- One **non-modal bottom sheet** holds both panels, switched by `[Find | Sites]` at its top. Snap points: peek 120 px (handle, switcher, one summary line: "35 926 km² meets every limit" or the verdict sentence), half 50 dvh, full 88 dvh. The Moon stays draggable above the sheet at peek and half. A visible close/minimise button sits at the sheet top, and the browser Back gesture collapses the sheet; never stack a second sheet (NN/g bottom sheets, [checked](https://www.nngroup.com/articles/bottom-sheet/)).
- The time bar docks above the sheet: row 1 play + date, row 2 full-width scrubber; rate moves into the `⋯` menu. `padding-bottom: env(safe-area-inset-bottom)`.
- All primary actions (Compare, rank rows, close) sit in the lower 60 % of the screen for one-handed reach; the top bar holds only rarely used items.
- Inputs and the date field use 16 px text so iOS Safari does not zoom on focus (from memory, not checked).

## 7. Comparison view, redone

**Single focal point:** the verdict sentence. Everything else is evidence under it, on one 4-column grid:
`grid-template-columns: 1fr repeat(N, 64px)` (N = 2 or 3), column gap `--sp-2`. The label column and the value columns line up from the identity header to the last row; the timeline spans all columns.

**Order:**
1. **Identity header (sticky).** One row per site is gone. One row of column heads: site badge A/B/C + short name (truncated with ellipsis, full name in `title`) above each value column; `×` remove appears on hover/focus of the head (always visible on touch). Clicking a head flies to the site. This is the only place names appear; everything below uses the badge letter.
2. **Verdict.** `--fs-lg`, `--text-1`, max 1 sentence, max about 120 characters: "**A** suits a solar lander best: shortest night (13.9 d) and Earth always in view." Below it at most one `--fs-sm --text-2` line: "Leads on 3 of 5 measures. Judged for: Solar lander ▾" (the mission chip opens the profile). No coloured bars, no bullet list.
3. **Shared timeline (60 days).** Per site one 12 px Sun lane over one 6 px Earth lane, 6 px between sites, badge letter in the label column. Lanes `--data-sun` / `--data-earth` on `--data-gap`. Longest night: 2 px `--data-night` bracket under the Sun lane, its value printed only in the measure row. Bottom strip "All sunlit" in `--text-2`. Cursor 1 px `--accent` with a 16 px drag handle; ticks `--fs-cap --text-3` every 15 days (`12 Nov`). Status now is read off the cursor, so the "Dark / Earth" chips are removed. Legend: one line, `--fs-sm`: "▬ Sun ▬ Earth ⌐ longest night · drag to move the clock".
4. **Measures (one row each, 32 px):** label left (`--fs-sm --text-2`) with a direction hint glyph `↑` / `↓` in `--text-3` (meaning "higher/lower is better" for this mission; full words in `title`); values right-aligned in site columns, `--fs-md`, tabular. Winner: `--fw-semibold --text-1` plus a 6 px dot of its site colour after the value; others `--fw-regular --text-2`. Ties (within tolerance): no winner marked, row label gains "about equal". Rows: Time in sunlight, Longest night, Earth in view, Longest gap without Earth, Slope. Hairline `--border` between rows.
5. **Hidden by default** (one `Details ▸` disclosure): dot-track scale per measure, elevation, coordinates, Sun elevation now, terrain resolution, method note ("60 days from 2026-11-12 UTC, observer 2 m, differences under 3 points, 0.5 d or 1° ignored"), and a "Show only differences" toggle.

**Desktop wireframe (400 px panel, 16 px padding, 368 px content):**
```
+------------------------------------------------+
| Compare   Site by site              (tabs)     |
|------------------------------------------------|
|                          (A)    (B)    (C)     |  sticky, 40 px
|                         Solar1 Solar2 Solar3   |
|------------------------------------------------|
| C suits a solar lander best: shortest night    |  16/24 semibold
| (13.9 d), Earth always in view.                |
| Leads on 1 of 5 measures · Solar lander v      |  12 text-2
|                                                |  24
| Next 60 days                                   |  section header
|  A  [####____######_____####___]               |  Sun 12 px
|     [==========================]               |  Earth 6 px
|  B  [###_____#####______###____]               |
|     [==========================]               |
|  C  [####___######______####___]               |
|     [==========================]               |
| all [##_______###________##____]       |cursor |
|      12 Nov   27 Nov   12 Dec   27 Dec   11 Jan|
| ▬ Sun ▬ Earth ⌐ longest night · drag to scrub |
|                                                |  24
| Measures                  A      B      C      |
| Time in sunlight   ↑    50%    48%   52% •     |  32 px rows
| Longest night      ↓  14.5 d 15.0 d 13.9 d •   |
| Earth in view      ↑   100%   100%   100%      |  tie: "about equal"
| Longest Earth gap  ↓   none   none   none      |
| Slope              ↓   0.5°   0.4° • 1.2°      |
|                                                |
| Details >                                      |
+------------------------------------------------+
```

**Phone (sheet at half height, 343 px content):** same order and grid with 56 px value columns. Header row shows badges only (names in the Details list). The timeline keeps all sites but drops tick labels to 3 (start, middle, end). Peek state shows only badges + the verdict sentence. With more than 3 sites (not allowed today) the grid would switch to two columns at a time, per NN/g's "about two items on mobile".
```
+-----------------------------------+
|  ====  (handle)          [Find|Sites] [v] |
| C suits a solar lander best:      |
| shortest night (13.9 d).          |
|                  (A)  (B)  (C)    |
| A [###___####___]                 |
| B [##____####___]                 |
| C [###___#####__]                 |
|   12 Nov     12 Dec      11 Jan   |
| Sunlight   ↑   50%  48%  52% •    |
| Night      ↓ 14.5d 15.0d 13.9d •  |
| Earth      ↑  100% 100% 100%      |
| Earth gap  ↓  none none none      |
| Slope      ↓  0.5° 0.4°• 1.2°     |
| Details >                         |
+-----------------------------------+
```

## 8. Site card and finder panel

**Site card** (360 px; one per pinned site in "Site by site"). Order: header (badge, name, ghost `×`; coordinates line below in `--text-2`: `79.599°S, 30.862°W · −1 211 m · slope 0.5°`), then **Now** as two key-value rows with a data-colour dot (no green/grey side bars), then timeline (same component and scale as the comparison, single site), then 2 x 2 key-values, then `Horizon view ▸` (panorama, collapsed unless the card is active) and `How to read this ▸`. Method note in `--fs-sm --text-3`, one line plus "more" link. Active card: 2 px `--accent` outline, not a yellow border.
```
+--------------------------------------+
| (A) Solar #1                     [x] |
| 79.599°S, 30.862°W · −1 211 m · 0.5° |
|                                      |
| ● Dark     Sunrise in 5.4 d          |  ● = data-night dot
| ● Earth    Earthset > 60 d           |  ● = data-earth dot
|  [####_____######______####____]     |
|  [==============================]    |
|   12 Nov        12 Dec       11 Jan  |
| In sunlight   50%  Longest night 14.5 d |
| Earth in view 100% Longest gap   none   |
| Horizon view >   How to read this >  |
+--------------------------------------+
```
**Finder panel** (320 px). Order: title "What do you need from a site?", preset segmented control (2 x 2), one-line preset description, then criteria (each = label row with value + slider + optional More/Less/Either segmented), then a **result block** with the hero number (`--fs-xl`) "35 926 km² meet every limit", the per-limit bars (bars `--text-3`, the tightest limit gets a `--data-warn` dot and the word "tightest", not an orange label), fit-ramp legend, then **Shortlist** with the single primary button "Compare top 3". Shortlist row: rank in a 20 px outlined circle, coordinates, match bar (`--text-2` fill), up to 3 chips. Footnotes collapsed under `About these numbers ▸`.
```
+--------------------------------+
| What do you need from a site?  |
| [Solar lander ][Ice prospect.] |
| [Base near ice][Radio-quiet  ] |
| Flat, sunlit, radio link.      |
| Slope at most            10°   |
| ----o-------------------       |
| In sunlight        35-100%     |
| ----o-----------------o        |
| [More is better|Less|Either]   |
| Earth in view      50-100%     |
| ...                            |
| 35 926 km²  meet every limit   |  20/28
| Slope      ======----   60%    |
| Earth view ==------  • 26%  tightest |
| just passes [ramp] best fit    |
| Shortlist      [Compare top 3] |
| (1) 79.600°S, 30.860°W  =====  |
|     slope 0.5° · sun 50% · Earth 100% |
| About these numbers >          |
+--------------------------------+
```

## 9. Do / Don't

1. **Do** use `--accent` (neutral ink) for every selected, focused or primary state. **Don't** give a slider, link or hover border its own colour (no yellow scrubber, green sliders, lemon hover, blue links).
2. **Do** reserve yellow for the Sun and blue for Earth in every view. **Don't** use them for mission status, selection or the time scrubber.
3. **Do** show site identity as badge A/B/C + colour, defined once at the top of a view. **Don't** colour text, borders or whole rows with site colours.
4. **Do** align all numbers in right-aligned tabular columns on one grid. **Don't** put values in free-flowing rows under charts.
5. **Do** mark a winner with weight plus one small dot. **Don't** stack bold + underline + colour + enlarged marker.
6. **Do** format every value through `lib/format.ts` (one decimal rule per quantity, UTC, true minus). **Don't** call `toFixed` in JSX.
7. **Do** keep every target >= 24 px, and >= 44 px on touch. **Don't** ship `padding: 0 7px` close buttons or 3 px-padded segments.
8. **Do** keep text >= 11 px including SVG ticks, and check contrast against the panel over sunlit terrain. **Don't** use 8 px tick labels.
9. **Do** on phones use one bottom sheet with peek/half/full and a close button. **Don't** float two panels over the Moon or wrap the layer bar into three rows.
10. **Do** hide method notes, raw tables and help behind one disclosure per panel. **Don't** add a new colour, size or spacing value without adding it to section 3 first.

## 10. Implementation notes (2026-11-14)

Built in `web/src/App.css`, `App.tsx`, `ui/*`, `lib/format.ts`. Where the build differs from the text above:

**Deviations**
- Thousands separator is U+202F (narrow no-break space), not U+2009, so a number never wraps mid-figure.
- Finder preference switch reads "Prefer more / Prefer less / Either" ("Less" alone was ambiguous). Shortlist facts are one plain line (as in the wireframe), not chips.
- Site card: "Horizon view" and "How to read this" are two disclosure buttons side by side with their content below. Sun and Earth elevation sit at the right of the two "now" rows (hidden on phones). The method note leads with the terrain resolution and gets a warn dot when times are only rough (300 m, 2.7 km or no terrain).
- Comparison: "about equal" sits on a second line under the label (it does not fit beside it with three sites). Sites are always listed in badge order A, B, C. Details also holds the name + coordinates list. On phones each site head is a pill: badge (fly to) + remove. "Judged for: ..." opens the site finder.
- Phone: the layer list and the `⋯` menu are pop-overs under the header, not sheets (only one sheet exists). The layer legend and ramp live in the layer list. Tapping "Find" turns the finder on. At full height the sheet hides the time bar. The 3D view is resized to the space above the sheet (peek and half) so the Moon stays centred and tappable. Peek shows the verdict with the leader's badge, not all badges.
- Tablet: the `[Find | Sites]` switch only appears while the finder is on; otherwise the legend and the sites panel both fit.
- Date: the time bar shows a button in the UTC format; pressing it swaps in the browser's date-time picker until it loses focus.
- View switch (South Pole / Whole Moon) highlights the last one chosen.
- Mission markers: planned = neutral ink, candidate = `--text-3` grey (yellow is the Sun's).
- Tokens added (all in `:root`): `--scrim-top`, `--hairline`, `--line`, `--badge`, `--dot`, `--thumb`, `--track`, `--lane-sun`, `--lane-earth`, `--row-h`, `--slider-h`, `--seg-h`, `--cmp-col`, `--cmp-row`, `--tabs-h`, `--w-*` (panel and column widths), `--sheet-peek/half/full`, `--phone-bar`, `--fs-input`, `--ease`. `--header-h` is no longer used for layout: header, panels and time bar are one flex column, so a wrapping header cannot overlap the panels.

**Not done (outside the allowed files)**
- `web/index.html` needs `viewport-fit=cover` in the viewport meta for the `env(safe-area-inset-*)` paddings to take effect on notched phones; without it the browser keeps the page inside the safe area itself.
- The finder's map colours in the terrain shader still end in the old lemon; the panel legend uses `--data-fit-ramp`. Only the permanent-shadow overlay colour was changed in the shader.
- Preset names in `lib/finder.ts` are unchanged; the short names ("Solar lander") are mapped in `ui/FinderPanel.tsx`.

## 11. Changes of 15 Nov 2026 (polish pass)

No new tokens. What changed, and the rule behind each:

- **Mission panel as a cover.** The picture runs edge to edge at the top and fades into the panel (the mask is on the image only, so the credit stays readable). Then the name at `--fs-xl`, an uppercase caption with operator and kind, and a strip of three facts every mission has: date, craft height, country. The fact list below drops what the strip and caption already say. On a phone the name comes first so it shows in the minimised sheet.
- **Site card headline.** One sentence under the header: the share of the 60 days in sunlight at `--fs-xl`, then Earth in `--text-2`. It states and does not judge (`ui/siteSentence.ts`). In Explorer the Sun and Earth elevation asides are hidden.
- **Two views that differ at a glance.** The view's name is a pill beside the title; planner panels use `--r-md` and `--border-strong`. In Explorer the corner legend shows only while it is a colour key.
- **"Map layers" label** is joined onto the left end of its segmented control (`--surface-2`), so it reads over lit ground.
- **Guide and welcome dots:** done is `--text-3`, the current step is a longer `--accent` bar, the tick is `--accent`. `--data-ok` green stays reserved for landed missions.
- **Sun and Earth edge chips** (`scene/SkyCompass.*`): a 24 px pill at the edge of the 3D view with a disc in `--data-sun` or `--data-earth`, the body's name and a wedge pointing to it; shown only while the body is off screen or behind the Moon. Not clickable.
- **Sun in the mission view** has a soft glare from the same texture as the globe view; nothing animates.
- **Phone:** the sheet starts at peek; the time bar is one row with a short date ("15 Nov 04:58 UTC", still UTC); the 3D view ends above the time bar; guide links are `--touch` high.
- **Welcome:** "Skip to the Moon" goes straight to the Explorer view with no guide (the tour is a link in the empty sites panel and in the menu); the Explorer card is marked "Recommended for a first visit" with an `--accent` border.
- **Data and method** (`ui/DataMethod.*`): one dialog with the method, the headline checks, the NASA data used and what is generated. Opened from the corner card's credit line and from the top of the settings in the menu. New token `--scrim` (dims the app behind a dialog).
- **Planner site card:** the Sun and Earth heights in the two "now" rows are `--fs-md`, medium, `--text-1`; Explorer hides them.
- **New tokens:** `--fs-display: 28px` / `--lh-display: 32px`, used only for the mission name in the mission panel. On phones `--fs-cap` is 12 px.
- **Explorer time bar** has no speed chips; the speed is under Guides and settings. (Departs from section 5's time bar spec, for Explorer only.)
- **Explorer site card** starts with the Horizon view closed.
- **Mission view light:** the Sun's light comes from its real height (floor 1.5 degrees), so shadows have their real length; level ground dims to about half below 5 degrees. Day and night lights are mixed by the share of the Sun's disc above the skyline, so sunrise and sunset are gradual. The night fill light stays, so the craft can always be seen.
- **After the simulated-user test:** "Find a site" carries a sliders icon (24 px grid, stroke 1.5, `currentColor`), not a magnifying glass. The corner legend adds the marker key (landed, lost on landing, planned) on the Whole Moon view. A site card's period heading ends with "drag to move the clock". A new point is named by its badge letter.
- **Finder, Custom profile: "What matters most".** One row per thing the shortlist is ranked on (flat ground, sunlight, Earth view, nearness to shadow), each with the existing segmented switch: Low, Normal, High (the term counts half, the same, double). It changes the order only, never which ground passes, and the ranking caption says what was weighted. Shown in Custom only; the named presets rank with everything equal.
