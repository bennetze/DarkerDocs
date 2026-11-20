# DarkerDocs — verification report

## 0.3.1 output preservation, canvas replay and diagnostics — 20 November 2026

- Sheets suspends both theme adapters when an existing in-app print pane is revealed via its `hidden` attribute, then restores the selected theme on exit. Same-document navigation to an output or playback route clears the theme and its display copies, and returning to the editor restores the theme. The real-manifest fixture exercises history push, replace and Back across the MAIN and isolated worlds. [Chromium Navigation API](https://developer.chrome.com/docs/web-platform/navigation-api)
- Docs and Sheets record bounded raster snapshots of mutable `OffscreenCanvas` sources. The display copy keeps the recorded pixels across palette changes. Non-finite rectangle calls retain earlier drawing history. Display copies follow native canvas visibility and opacity.
- A valid storage change after a failed popup read restores the slider and buttons. Diagnostics distinguish the selected palette from the applied appearance and identify output and playback views, pending switches, and whole-page or partial preservation fallbacks. The copyable schema remains allowlisted.
- Palette switches reuse DOM color rules already generated for the selected theme. Canvas layout and opacity are measured in one batch before updating the display copies. The synthetic benchmark measures the synchronous content-script work and renderer refresh separately, alongside end-to-end time through the next animation frame. [Performance results](../artifacts/performance.json)

**Automated verification:** all **7 Node checks and 85 browser checks passed**. The full browser run took 4.3 minutes with zero skipped, unexpected, or flaky cases. Coverage includes all ordered theme transitions in each app, reduced motion, Default restoration, native canvas readback, and original output fixtures. [Full browser results](../artifacts/browser-results.json)

**Synthetic PDF output:** all 16 PDFs contain one page. Poppler rendered identical pixels in all four themes within each app and matched that app’s 0.3.0 Default output. One representative render per app was visually inspected. [PDF checks](../artifacts/synthetic-output/pdf-verification.json)

The same synthetic workload used 3,000 DOM cells, 16 added canvases and 12 reduced-motion theme changes for both releases. The figures are descriptive timings from isolated Chromium 145 on macOS arm64.

| Theme change | 0.3.0 median / p95 | 0.3.1 median / p95 |
|---|---:|---:|
| Through the next animation frame | 342.9 / 2552.9 ms | 137.2 / 447.1 ms |
| Synchronous DOM adapter work | 153.1 / 159.4 ms | 2.7 / 54.8 ms |
| Synchronous canvas renderer refresh | 161.8 / 2367.3 ms | 128.0 / 187.7 ms |

Estimated retained resources remained 8.18 MiB. The font-loaded popup measured 384 × 574 CSS px in the intrinsic sizing check.

**Package:** all 21 runtime ZIP entries match the unpacked source. Repackaging produced identical archive and metadata bytes. SHA-256 `b2bfda5b6bc6c0f57c77e9681797efbd887a21a29fb029195eeee91dcf851861`. [ZIP](../artifacts/DarkerDocs-0.3.1.zip), [checksum](../artifacts/DarkerDocs-0.3.1.sha256), [per-file verification](../artifacts/DarkerDocs-0.3.1.verification.json).

**Live scope:** 0.3.1 was tested in isolated Chromium with synthetic Workspace fixtures. The signed-in Helium session and native exports were not exercised for this release. The earlier Helium evidence and the remaining live coverage below are historical. Forms real submission remains blocked by the unpublished fixture.

## Testing-only npm dependencies — 17 November 2026

Removed Prettier, its formatting scripts, ignore file and CI formatting step. The only direct npm dependency is now pinned `@playwright/test` 1.58.2, used for browser tests and the synthetic performance benchmark through `playwright` / `playwright-core`. Build, packaging and release verification use only Python 3's standard library; Node checks use built-in modules. README and repository instructions now document development without npm modules and restrict future npm packages to testing. CI builds, runs Node checks and verifies the package before installing any npm modules. CI and the documented test install disable package lifecycle scripts and omit optional dependencies, including `fsevents` (which remains an optional transitive lockfile entry).

- **PASS:** with `node_modules` temporarily unavailable, `python3 scripts/build.py`, all **7 Node checks**, `python3 scripts/package.py` and `python3 scripts/verify_release.py` succeeded.
- **PASS:** the regenerated MAIN bundle, ZIP, checksum and per-file verification metadata are byte-for-byte unchanged. All **21 runtime ZIP entries** still match source; version remains **0.3.0**, SHA-256 `2c9b28fd1eb056442b3b48b35f808f420485c713fcc05bfee9c81fb9b74ff3ca`.
- **PASS:** a clean `npm ci --ignore-scripts --omit=optional` installed only the three Playwright packages. `npx --no-install playwright test --list` discovered the existing **80 browser tests**. An initial offline install could not complete because the local npm cache lacked an archive; the subsequent clean install fetched the pinned test packages with lifecycle scripts disabled.
- **PASS:** the complete **80-check browser suite** passed in **4.3 minutes**, with no skipped, unexpected or flaky cases, after the clean testing-only install (`npm run test:browser`). Together with the 7 Node checks, **87 automated checks passed**. Discovery initially overwrote the saved report with listing-only results; this subsequent full run restored actual execution evidence in [browser-results.json](../artifacts/browser-results.json).
- **Scope:** no extension runtime source changed. Performance measurement and native Helium checks were not repeated. Earlier native evidence and remaining live gaps below are unchanged. Historical references to Prettier describe the tooling used at that time, which has now been removed.

## Theme switching recovery — 17 November 2026

**Reproduced and recovered in the signed-in Helium session, version 0.3.0.** The actual toolbar popup saved Cream, while the retained Sheets editor stayed dark. The local diagnostics page initially received no responses from any of the four open fixture tabs. DarkerDocs was enabled, had site access and was loaded from this repository's `extension/` folder.

Reloading the retained Docs, Sheets, Slides and Forms fixture tabs restored their extension connections. This is consistent with stale content-script contexts after an unpacked-extension reload; the precise earlier invalidation event was not observed. No runtime patch, permission change, extension reinstall or new release package was necessary.

- **PASS, propagation:** after recovery, selecting Dark Grey, OLED Black, Default and Cream through the actual toolbar popup was acknowledged by all four apps through fresh local diagnostics requests. Subsequent theme selections required no further page reloads. No fallback reasons were reported.
- **PASS, representative visual checks:** Sheets changed from Cream to Dark Grey; Docs showed OLED Black and restored its native white page in Default, with its color-test image retained; Slides showed a Cream workspace and notes area with original white slide/thumbnail artwork; Forms showed its Cream editor.
- **PASS, Default cleanup:** all four pages reported zero color rules and zero display copies in Default. The shared preference was finally returned to Dark Grey, acknowledged by all four pages.
- **Scope:** no runtime source changed, and automated suites, print/export, reduced motion and the full per-app visual matrix were not repeated for this session repair. This does not replace or expand the release acceptance claims below. No new native screenshot files were saved.

## 0.3.0 reliability, maintenance and coverage — 17 November 2026

This release implements the proposed runtime and maintenance improvements. **Advanced live coverage remains partial**; expanded synthetic workflows are not full Google Workspace acceptance. Forms submission remains **BLOCKED** in the unpublished preview.

### Implemented changes

| Improvement | Implementation and evidence |
|---|---|
| Popup startup race | Initial reads cannot replace a newer storage event, whether the read succeeds or fails. Delayed-read browser regressions retain Cream instead of reverting to Dark Grey. |
| Page startup failure race | The failure handler now checks the same revision as the success handler; a failed startup read cannot replace a newer theme with Default. |
| Bounded generated CSS | Reusable CSSOM slots, reference counting, detached-element cleanup and separate native reads / extension writes. Limit: 4,096 live color tokens. Exhaustion preserves the complete original page with a compact notice; explicit theme selection retries. This is a preservation fallback. |
| Canvas resource accounting | A 96 MiB per-page estimated retained-resource budget covers recorded operations, strings/arrays, retained image data, display bitmaps and temporary replay bitmaps. Per-surface history remains bounded. Image caches use weak references; Default releases display bitmaps. This estimate does not measure all browser/GPU allocation overhead. |
| Failure isolation | Native drawing still runs with native validation and return values. Guarded recording, image copying, resets, property mirroring and display work fall back without throwing extension failures into Workspace. A deliberate ImageData-copy failure regression verifies original native pixels and no escaped exception. |
| Preservation notices | Compact, expandable and dismissible. Reasons distinguish artwork preservation, history limits, memory limits and display failures. Reloading is not promised as a permanent solution. Whole-page fallback notices retain readable native-color styling. |
| Local diagnostics | Popup Help & diagnostics link, readable status, version, fallback reasons, estimated resources, request correlation and Copy diagnostics with manual-copy recovery. A fixed export schema excludes document text, URLs, tab titles and class names. Notes diagnostics contain only bounded counts and paint values. No new permissions or unrelated-tab queries. |
| Preference recovery | Explicit Retry for failed reads and writes. The saved message describes automatic updates without claiming that every page acknowledged application. Ordered writes and external-event reconciliation remain in place. |
| Four-app illustrations | Docs, Sheets, Slides and Forms preview controls never change settings. Slides artwork stays white/original in its illustration. The actual toolbar popup was inspected with the complete footer in all four themes. |
| Contrast and accessibility | Contextual DOM ink mapping uses the native opaque background, adjusts lightness while retaining hue/saturation and alpha, and preserves transparent title layers. Representative mapped background/text pairs meet 4.5:1. Keyboard controls, announced state, focus, reduced motion and enlarged-text reachability are covered. Actual VoiceOver speech and browser zoom beyond normal scale are UNVERIFIED. |
| Richer workflows and output | Synthetic typing/table editing, comment/suggestion surfaces, sheet tabs/conditional fills/charts, original Slides artwork/notes, and Forms controls/validation/section visibility run across all four themes. Sixteen one-page PDFs retain identical rendered pixels to Default within each app. Native checks are listed separately below. |
| Releases and maintainability | Handwritten JS/CSS/HTML and tests are formatted with pinned development-only Prettier; generated MAIN entry stays separate. Packaging uses an exact allowlist, deterministic ZIP metadata, version/bundle checks, byte comparison, SHA-256 and per-file verification metadata. GitHub Actions is configured for build, formatting, Node/browser tests, benchmark and package verification. Remote CI execution is UNVERIFIED because no hosted run was performed. |

### Native Helium evidence

The existing unpacked extension was reloaded as **0.3.0**. Retained fixture tabs were refreshed after the adapter update. The shared preference was returned to **Dark Grey**.

- **PASS:** actual toolbar popup in Cream, OLED Black, Default and Dark Grey; previews and Help & diagnostics are operable and the footer is complete. Native testing caught a narrow-popup regression introduced by viewport-relative width constraints. An intrinsic 384 px width fixes negotiation; a separate benchmark assertion starts at a 225 px viewport and verifies the popup remains 384 px wide and under 580 px tall.
- **PASS on fixture:** Docs formatted content, table and original color-test image; comments panel and Editing/Suggesting/Viewing controls were opened and inspected. No comment was posted and no suggestion was authored. Repeated native typing/table-edit sequences remain UNVERIFIED for this release.
- **PASS on fixture:** Sheets B4 navigation displayed `=SUM(B2:B3)` and 30; fills, frozen row and chart remained visible. In-app print preview retained original colors with **Total: 1 page**, and exit restored the selected theme. No physical print job was sent; no new native output file is claimed.
- **PASS on fixture:** Slides slide/thumbnail artwork remained original. A native typing check exposed black SVG notes text on a dark notes surface. Notes are now excluded from the original-slide SVG boundary; reloading and repeating the check produced readable notes while preserving the slide. Temporary note text was removed, leaving the original empty notes. All four modes have a regression for this boundary. Richer native shape/chart/photo fixtures remain UNVERIFIED.
- **PASS on fixture:** Forms editor and required multiple-choice preview remain readable. The question-type control was inspected without changing it. Preview still shows Not published, This form isn't accepting responses and a disabled submission button. Actual submission is **BLOCKED**; publishing, sharing and responder access were unchanged. Native header-image, all-question-type, validation and section workflows remain UNVERIFIED.
- Native screenshots were visually inspected through computer-use tooling. No newly saved native screenshot files are claimed. Historical native captures under `artifacts/v0.2/` remain separate from synthetic evidence.

### Automated verification and performance

**PASS: 87 automated checks — 7 Node checks and the complete 80-check browser suite.** The final full browser run took 4.3 minutes, with no skipped, unexpected or flaky cases. Commands: `npm run format:check`, `npm test`, `npm run test:browser`, `npm run benchmark`, `npm run package`, `npm run verify:release`. All six runtime JavaScript files also pass syntax checks. [Full browser results](../artifacts/browser-results.json), [verification summary](../artifacts/verification-summary.json).

The final benchmark recorded 0.3 ms median / 0.4 ms p95 redraw batches and 225.9 ms median / 1622.5 ms p95 theme changes, including the next animation frame. Estimated retained resources were 8.18 MiB, with no fallback and 321 generated CSS rules. Intrinsic popup size was 384 × 574 CSS px. Chromium version: 145.0.7632.6; macOS arm64. Earlier intermediate stress failures and the superseded interrupted run are not acceptance results for this source.

The synthetic benchmark uses 3,000 DOM cells, 16 additional canvases, 40 redraw iterations and 12 theme changes with reduced motion. It asserts resource limits and intrinsic popup sizing; timings are descriptive, not a cross-device performance guarantee. Full rescans can still take over a second in this heavy fixture. Results: [performance.json](../artifacts/performance.json).

Synthetic workflow PDFs and print screenshots are under `artifacts/synthetic-output/`. Poppler inspection found one page in every PDF; within each app all four rendered pixel buffers exactly matched Default. The four representative rendered outputs were visually inspected. These PDFs are browser fixtures, not new exports from the signed-in Google editors. [PDF checks](../artifacts/synthetic-output/pdf-verification.json).

### Package verification

Version is **0.3.0** in manifest, package, lockfile, README and installation notes. [Installation ZIP](../artifacts/DarkerDocs-0.3.0.zip) contains **21 runtime entries**, each matching unpacked source. [SHA-256](../artifacts/DarkerDocs-0.3.0.sha256) and [per-file metadata](../artifacts/DarkerDocs-0.3.0.verification.json) are generated and verified automatically. Rebuilding the same source produced the same ZIP hash. Negative checks rejected mismatched versions, extra entries, incorrect checksums and changed source files. [Release checks](../artifacts/release-checks.json).

Current ZIP SHA-256: **2c9b28fd1eb056442b3b48b35f808f420485c713fcc05bfee9c81fb9b74ff3ca**.

The ZIP excludes tests, screenshots, PDFs, fixture URLs, account data, benchmarks, development dependencies and CI files. Scope remains the four supported paths with `storage` as the only API permission. No marketplace publication was performed.

The broader historical live-matrix gaps below remain material except where the new native evidence explicitly closes a scenario. Remaining live workflows and export formats are not counted as passes.

---

## Extension error-list review — 16 November 2026

Helium contained one recorded error: **`Uncaught ReferenceError: DarkerDocs is not defined`**, at **`content/content.js:3`**, on the retained Docs fixture. This is consistent with the earlier cross-world script-path injection failure described below. The current manifest already uses a separate MAIN bundle and injects isolated `shared/core.js` before `content/content.js`.

**PASS, fresh native startup:** reloaded DarkerDocs in Helium, refreshed the existing Docs fixture, cleared the captured diagnostic entry and refreshed Docs again. The error page remained empty. The live OLED surface displayed the formatted text, table and color-test image without a preservation/reload notice. The selected setting and document content were unchanged. The retained entry therefore appears historical; no runtime patch was needed. Other native apps and exports were not repeated for this review.

Added a Node regression for dependency order, distinct script paths across worlds and the generated bundle's current source contents. Extended the real-manifest integration check to load all four apps, propagate all four theme states, reload each app, restore Default and assert no uncaught browser errors.

Validation: **6 Node checks passed**, plus **1 targeted real-manifest browser check passed** (`npm test`, `npm run test:browser -- tests/manifest.spec.cjs --reporter=list`). The initial sandboxed Chromium launch aborted before test execution; the isolated test passed outside that sandbox. This targeted run does not replace the earlier full-suite result; `artifacts/browser-results.json` was left intact. All **20 installation ZIP entries** still match the unpacked runtime byte for byte, with the unchanged 0.2.1 checksum below. No version bump or new package was needed.

## 0.2.1 graduated transitions — 16 November 2026

Theme switching now takes approximately **980 ms** with an eased, overlapping sequence: background/root crossfade **900 ms**, popup text and selected page headings **760 ms after a 120 ms delay**, controls **740 ms after a 240 ms delay**. Selection and ordered storage writes remain immediate. Popup CSS transitions retarget from their current colors during rapid input. Page snapshots are bounded to 12 heading layers and 16 control layers, and their temporary names are released on completion or interruption.

Canvas content stays together in the root crossfade. Native drawing, source pixels, readback, serialization and image data are unchanged. Midpoint screenshot checks allow at most one 8-bit channel level of compositor rounding for original raster colors. Printing, Sheets' output pane, navigation and reduced motion cancel active snapshots. Native style measurements do not interpolate colors.

Validation: **62 automated checks passed: 5 Node checks and the complete 57-check browser suite** (`npm test`, `npm run test:browser`). The full browser run took approximately 4.2 minutes. It covers all 16 ordered theme pairs in each of the four apps, staggered snapshot timing and cleanup, popup timing/rapid selection, reduced motion, print interruption, Sheets' output boundary, original native canvas pixels and raster colors during the crossfade. Existing preservation, Default restoration, real-manifest and storage checks also pass. [Current full results](../artifacts/browser-results.json). Results below for 0.2.0 and the earlier concurrent icon-refresh attempt are historical; this clean run supersedes that failed attempt for the current source.

Direct Helium check: reloaded the unpacked **0.2.1** extension, refreshed the retained Docs fixture and exercised the actual toolbar popup in **Cream, Default, Dark Grey and OLED Black**. Observed the graduated transition and complete footer; the new icon was visible. The original **OLED Black** preference was restored. The final Docs surface retained its formatted text, table and color-test image without a preservation/reload notice. Native screenshots were inspected through computer-use tooling; no new native artifact files are claimed. Live Sheets, Slides, Forms and native exports were not repeated for this motion change; their earlier evidence and broader gaps remain below.

Synthetic midpoint captures are **artifacts/screenshots/{docs,sheets,slides,forms}-transition-midpoint.png**. The current installation ZIP is **artifacts/DarkerDocs-0.2.1.zip**, with **artifacts/DarkerDocs-0.2.1.sha256**. All **20 entries** match the unpacked runtime files byte for byte; the SHA-256 is **0ca0812e3bc121f53f53b1e03c2e24512d0108622ffab624bd8d35b5b0020488**. Manifest, package and lock versions are **0.2.1**. The historical delivery section below describes 0.2.0.

## 0.2.0 baseline

Date: **16 November 2026**, Europe/Berlin. Direct testing used **Helium on macOS**. Automated testing used isolated Chromium profiles with **Playwright 1.58.2**. The exported PDFs report a Chrome 157 print engine.

## Result

**52 automated checks passed: 5 Node checks and 47 browser checks.** The unpacked extension was updated and tested directly in Helium. The four editors and their four homepages were captured in all four themes. The actual toolbar popup was tested in every theme and reopened to verify the saved preference. **Dark Grey was left active.**

The reported visual issues are implemented and verified on the retained fixtures. This report distinguishes those results from the broader original workflow matrix: some advanced live scenarios remain unverified, as listed below. It does not claim exhaustive Google Workspace compatibility.

![Sixteen native editor/theme captures](../artifacts/v0.2/live-matrix.jpg)

## Requested fixes

| Request | Result | Evidence |
|---|---|---|
| Satisfying transitions | PASS | Approximately 300 ms crossfade in popup and supported pages; all 16 ordered theme transitions, rapid selection and reduced-motion checks |
| Darker Dark Grey | PASS | Workspace #101214, paper #191b1e; actual popup and editor captures |
| Night Shift-like Cream | PASS | Warm workspace #f5d5a1 and paper #ffe4b7, shared across apps and popup |
| Docs workspace and paper | PASS | Native paged fixture themed in all four modes; visible text, tables, links and highlights adapt |
| Visible text colors without changing saved colors | PASS on fixtures | Hue-preserving display mapping; strict neutral classification retains pastel green; original native canvas data/readback and PDF colors |
| Header rough edges | PASS | UI-only sprite contrast, masked Share icon treated as foreground, transparent CSS-arrow sides preserved, readable tooltips |
| Duplicate title | PASS | Native input and label are not painted simultaneously; focused and unfocused title checked in all four themes |
| File browser | PASS | Four homepages × four modes; loaded fixture rows checked before capture; consistent list/gutter surfaces, original template artwork |
| Sheets grid | PASS | Grid, formula bar and headers adapt; native A100/A1000 navigation, frozen first row and SUM(B2:B3) checked; solid/conditional fills retain color families |
| Slides workspace and sidebar | PASS | Workspace, filmstrip, notes surface and Themes browser adapt; slide and preview artwork remain original |
| Slides clipped labels | PASS | Insertion rail widened; full Transform label and high-contrast icons visible |
| Forms | PASS on fixture | Cards, editable question text, all three editor tabs, theme sidebar and respondent preview in four modes; picker swatches stay original |
| Popup rough edge found during testing | PASS | Actual toolbar popup initially clipped bottom text; compact layout now measures at most 580 px in regression tests, with complete footer visible live |
| Output preservation | PASS for tested outputs | Docs and Sheets each exported as an original-color, one-page PDF while OLED was selected; original Sheets in-app print preview restored |

## Automated checks

The final commands were **npm test** and **npm run test:browser**. Machine-readable browser results: [browser-results.json](../artifacts/browser-results.json).

| Area | Result | Scope |
|---|---|---|
| Settings, first run and invalid values | PASS | All four values; first use Dark Grey |
| Origin/path and output guards | PASS | Unsupported origins, protocols and paths rejected; presentation/print/export routes excluded |
| Manifest | PASS | MV3, document-start injection, four supported paths, storage-only API permission |
| All app/theme combinations | PASS | 16 deterministic scenes, dynamic menus, unchanged original canvas serialization |
| Popup | PASS | Four modes, bundled font, selected state, complete panel under height cap, visible footer |
| Slider and persistence | PASS | Labels, arrows, Home/End, failed-write retry, rapid writes, read failures and revision races |
| Actual manifest integration | PASS | Real unpacked extension, isolated browser, two-tab storage propagation and popup preference reopening |
| All theme-to-theme transitions | PASS | 16 ordered pairs, display changes, exact native canvas preservation and Default cleanup |
| Print media and in-app output view | PASS | Four modes; original backgrounds, visible native canvases, no screen-copy hosts in Sheets print view, restoration on exit |
| Raster preservation | PASS | Exact screenshot pixels for white/monochrome images; unchanged native readback and exports |
| Nested drawing and resets | PASS | Offscreen tiles, clipping, transforms, width resets and repeated image repainting |
| Large scrolling tiles | PASS | Large recorded scratch canvases and repeated cropped draws avoid spurious fallback |
| UI details | PASS | Transparent title layer, focus, CSS arrows, masked icons, tooltip text, dynamic color changes and file-list surfaces |
| Slides artwork | PASS | Original SVG fills/text in artwork and previews while the surrounding sidebar themes |
| Forms DOM | PASS | Editable text and pastel/card surfaces adapt without editing authored inline styles |
| Reduced motion | PASS | Theme animation skipped |
| Ambiguous/oversized surfaces | PASS as preservation fallback | Original readable surface retained, original serialization unchanged, appropriate notice; not counted as full content theming |

Synthetic screenshots are in [artifacts/screenshots](../artifacts/screenshots/). Native screenshots are separately named in [artifacts/v0.2](../artifacts/v0.2/). Synthetic fixtures exercise extension behavior; they are not a simulation of Google's complete editing engine.

## Direct Helium evidence

The following dedicated fixtures remain available with their existing sharing settings:

- [DarkerDocs Test — Docs](https://docs.google.com/document/d/1av9ZUBT5qVjzLMqBvUZxJRGmdvjB31Ygk81UADRyC-8/edit): default and colored text, explicit black/white/grey, highlights, table fills and the transparent color-ramp PNG.
- [DarkerDocs Test — Sheets](https://docs.google.com/spreadsheets/d/1OxN0BDVy_ESHzI442kLZyV_eFCUKIaMHkm6sPGYgYrI/edit): 10/20 values, SUM total 30, red fill, approved green conditional-formatting rule, frozen first row and pie chart.
- [DarkerDocs Test — Slides](https://docs.google.com/presentation/d/1MboDkiKvXoBLgV2jp0dPpb2F6ZzUdRSbw8EcMS_JkHo/edit): original test title, thumbnail and presentation artwork.
- [DarkerDocs Test — Forms](https://docs.google.com/forms/d/1CBOlihwgkFNBmpsoRCzTsvAEirm_jXT9rhh4hv_gfj4/edit): required multiple-choice question and authored answer option; retained unpublished.
- [Initial Forms fixture](https://docs.google.com/forms/d/11eXEtGZdzueqdQiAb2B1xQYohUJhMtrOyyrK7O2l4kc/edit): retained from the original setup.

| Live scenario | OLED | Dark Grey | Default | Cream |
|---|---|---|---|---|
| Docs editor, paper, image and formatted content | PASS | PASS | PASS original | PASS |
| Docs title focus and File menu | PASS | PASS | PASS | PASS |
| Sheets grid, A100/A1000 navigation and formula | PASS | PASS | PASS original | PASS |
| Slides editor and original slide | PASS | PASS | PASS original | PASS |
| Slides Themes sidebar, previews and insertion rail | PASS | PASS | PASS | PASS |
| Forms Questions/Responses/Settings and theme sidebar | PASS | PASS | PASS | PASS |
| Forms respondent preview and radio selection | PASS | PASS | PASS | PASS |
| Each of the four app homepages | PASS | PASS | PASS original | PASS |
| Actual toolbar popup and theme selection | PASS | PASS | PASS | PASS |

The editor capture filenames are **{docs,sheets,slides,forms}-{oled,dark,default,cream}.png**. Homepages use **home-**; additional states use **docs-menu-**, **docs-title-focus-**, **sheets-scroll-**, **slides-sidebar-**, **forms-sidebar-**, **forms-responses-**, **forms-settings-**, **forms-preview-** and **popup-live-**.

The final basic editor captures had no unexpected preservation or reload notice. Normal Sheets scrolling remained themed after correcting scratch-tile memory accounting. Slides presentation playback was opened directly in Helium and retained its original appearance; it was exited without changing the deck.

The live Forms theme panel was inspected without choosing new font, header or theme settings. Its named color swatches and background swatches remained original. The preview answer was selected only in the unpublished preview; no real response was submitted. An attempted preview reload displayed an unsaved-changes alert, which was cancelled.

## Output verification

The original-color native exports are retained as:

- [Docs PDF](../artifacts/v0.2/DarkerDocs-Test-Docs.pdf), with [rendered proof](../artifacts/v0.2/docs-pdf-original.png).
- [Sheets PDF](../artifacts/v0.2/DarkerDocs-Test-Sheets.pdf), with [rendered proof](../artifacts/v0.2/sheets-pdf-original.png).

Both contain **one page**. Poppler-rendered proofs were visually inspected: white paper, original black text, explicit colored text/fills, the unchanged color-ramp image and the original chart colors/percentages. Screenshots of native print previews are retained. No physical print job was sent.

A regression initially themed Sheets' internal print preview and caused duplicate printed pages. The inspected **waffle-printing-pane** output boundary now suspends DOM theming and removes screen-copy canvases. The retest produced the original preview and a one-page PDF. This boundary is covered in all four themes automatically.

## Preservation fallbacks and limits

- Opaque gradient artwork whose safe recoloring cannot be established retains its entire original affected canvas surface. A preservation notice identifies it.
- Exceeding retained drawing-history limits preserves a readable original surface and requests a manual reload. There is no automatic reload.
- Raster images, including embedded lettering and transparency, are never recolored. Embedded image text therefore does not gain theme-specific ink.
- Cross-origin embedded panels remain native because no additional origins or all-frame permissions are requested.
- The selected ordinary live fixtures rendered without these content fallbacks. The explicit fallback tests are successful preservation checks, not fully themed-content checks.

## Broader original matrix: remaining live coverage

The original plan requested more than the reported screenshots. The following distinctions remain material:

| Area | Status | Remaining scope |
|---|---|---|
| Shared behavior, homepages, modes, menus and popup | PASS for recorded scenarios | All-pair transitions and multi-tab persistence also covered automatically |
| Docs advanced editing | PARTIAL live | Paged/pageless and Viewing were exercised in 0.1; not all were repeated with 0.2. Comments, suggestion workflows and repeated typing/table-edit sequences need dedicated live runs |
| Sheets advanced content | PARTIAL live | Native grid, formula, frozen row, fills, chart and scrolling checked; raster-image insertion, every conditional-format variant and sheet-tab operations were not repeated live in every mode |
| Slides advanced content | PARTIAL live | Original slide, thumbnails, theme previews, workspace and playback checked; authored shapes/charts/photos and speaker-note editing need richer live fixtures |
| Forms advanced content | PARTIAL live | Tabs, theme sidebar, multiple-choice and preview selection checked; all question types, custom header images, section navigation and validation branches need richer live fixtures |
| Forms real submission | BLOCKED | Google disables submission in preview; publishing and sharing remain unchanged |
| Output formats | PARTIAL live / PASS automated preservation | Native Docs/Sheets PDF proofs and original Slides playback checked. All Google download formats and Slides/Forms print flows were not exhausted |

These gaps are not counted as full acceptance of the original exhaustive workflow matrix. They do not erase the recorded fixes or substitute synthetic tests for unperformed live actions.

## Regressions found and resolved

1. Identical shared script paths across MAIN and isolated worlds caused a real-manifest startup failure. A generated MAIN-world bundle now provides an independent entry.
2. Waiting for an animation frame inside the View Transition update callback delayed theme changes. The commit is synchronous; renderer updates join the same theme event.
3. Deferred popup rendering interfered with rapid range inputs. Selection state updates immediately and storage writes remain serialized.
4. Treating only a top border as all four sides turned CSS arrows into blocks. Each nontransparent side now retains its own geometry.
5. A background-colored Share mask became low contrast. Mask paint now uses foreground mapping; native UI sprites retain their alpha and are treated separately.
6. Overlapping title layers caused duplicate lettering. Only the active title layer receives visible ink.
7. Native file-list surface differences produced blocks and gutters. The list scaffold is now consistent while hover/selection feedback remains.
8. Large retina scratch canvases were charged as full pixel snapshots on every cropped draw, causing ordinary scrolling to fall back. Recorded tiles retain bounded commands; unchanged image copies are reused and obsolete full-repaint history is released.
9. Loose neutral classification removed pastel green's hue, and bright highlights reduced contrast. Authored paint/ink now uses stricter neutral classification, with dark highlight luminance constrained.
10. Sheets' in-app output view must remain original even though its URL stays on the editor route. It is now detected independently.
11. The real toolbar popup exposed clipping not visible in a tall page fixture. The compact layout is checked after font loading in a 600 px viewport and fits within 580 px.

Read-only diagnostics replaced a proposed all-tabs query that automatic approval review rejected. No unrelated-tab query or extra permission was used. Diagnostics communicate only through the four already-scoped content scripts. No approval request remains pending.

## Delivery

The unpacked extension is **extension/**. The installation ZIP is **artifacts/DarkerDocs-0.2.0.zip**. It contains runtime source, assets and licensing; it excludes test files, account data, screenshots, PDFs, fixture URLs and development dependencies. No publication or sharing-permission changes were performed.

The earlier UI-only report remains available as [TEST_REPORT_0.1.0.md](TEST_REPORT_0.1.0.md).


## Icon refresh — 16 November 2026

The original 1024 × 1024, 16-bit Display P3 design was moved unchanged from the repository root to [assets/DarkerDocs.png](../assets/DarkerDocs.png). Runtime assets are optimized 8-bit sRGB RGBA PNGs at 16, 32, 48, 64 and 128 px, resized with Lanczos sampling and retaining transparent corners. The source design is excluded from the ZIP.

The manifest's extension icons and explicit toolbar icons, popup header, popup/diagnostics favicons and README branding now use the new design. The popup selects the 64 px asset at 2× scale. Historical native captures remain unchanged; the README uses an updated synthetic popup preview.

| Check | Result | Evidence |
|---|---|---|
| Icon encoding and references | PASS | All five exact dimensions, 8-bit RGBA, embedded sRGB profile, transparent alpha, valid local manifest/HTML references |
| Node checks | PASS | `npm test`: 5 checks |
| Popup, all four themes | PASS | Four popup checks in the full browser attempt; screenshots under `artifacts/screenshots/popup-*.png` visually inspected |
| Retina popup, all four themes | PASS | Separate isolated Chromium check: 64 px asset displayed at 32 px; identical decoded icon pixels across themes; body height 575 px after fonts load |
| Full browser attempt | FAIL / concurrent changes | 48 passed, 9 failed out of 57. Animation source and test files changed during the run; failures concern transition completion, transition image pixels and canvas screenshot pixels. This attempt is not a clean acceptance result for the current source. [Retained run](../artifacts/icon-refresh-browser-results.json) |
| Actual Helium toolbar after icon refresh | UNVERIFIED | Native toolbar testing was not repeated for this asset update |
| Installation ZIP | PASS at packaging | `DarkerDocs-0.2.1.zip`: all 20 entries matched unpacked runtime files byte for byte; original design, tests and account artifacts excluded; SHA-256 refreshed |

The project version changed concurrently to 0.2.1. The current icon-bearing package is [DarkerDocs-0.2.1.zip](../artifacts/DarkerDocs-0.2.1.zip), with [checksum](../artifacts/DarkerDocs-0.2.1.sha256). The clean 0.2.1 transition verification at the top of this report supersedes this concurrent browser attempt and includes a later actual Helium popup check. Historical 0.2.0 evidence and remaining live-coverage limits remain above.
