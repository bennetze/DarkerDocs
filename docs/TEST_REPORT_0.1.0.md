# DarkerDocs 0.1.0 — verification report

Date: **16 November 2026**, Europe/Berlin. Live browser: **Helium 0.21.3.1** on macOS. Automated browser: Playwright Chromium 145, isolated temporary profiles. Runtime uses vanilla HTML/CSS/JavaScript and local extension storage.

## Result and acceptance boundary

**40 automated checks passed**: 4 Node checks and 36 browser checks. The extension was installed, enabled and exercised directly in Helium after the user approved loading the local source. All four theme selections were exercised against dedicated files in all four apps.

**This is a conservative UI-theming release, not complete canvas dark mode.** The native content renderer remains unchanged. Default text and backgrounds inside document canvases, grids, slides and form content are not remapped unless they are identified application UI. These regions are preservation fallbacks, not successful dark-content checks. Full live execution of every workflow in the requested matrix is **not complete**; gaps are listed below.

No canvas rendering hook was enabled: inspection of Docs and Sheets showed canvas surfaces without per-operation evidence distinguishing default and explicit authored neutral colors. Slides uses SVG artwork; those SVGs and thumbnail artwork remain original. Forms' application header was identified separately from authored question cards.

![All 16 live Helium app/theme captures](../artifacts/live-matrix.jpg)

The full-resolution native captures are named `live-{docs,sheets,slides,forms}-{oled,dark,default,cream}.png` in the screenshot folder. Each capture was checked against the expected dedicated file ID before recording. The contact sheet above makes the preservation boundary visible: editor chrome changes, while authored content and its backing remain original.

## Automated evidence

Run `npm test` and `npm run test:browser`. The latest machine-readable result is [browser-results.json](../artifacts/browser-results.json). The [screenshot folder](../artifacts/screenshots/) contains 16 synthetic route/theme scenes, four synthetic popup captures, 16 separately named `live-` editor captures and a live settings capture. Files without the `live-` prefix are **synthetic regression fixtures, not signed-in Google editors**.

| Check | Status | Evidence / limits |
|---|---|---|
| All 16 app/theme combinations | PASS | Synthetic Workspace controls, dynamic menu insertion, protected DOM content and before/after screenshot equality |
| Popup in all four modes | PASS | Selected label, slider state, persistence, local Roboto and screenshots |
| Slider keyboard controls | PASS | Home, End, arrow keys, clickable labels and accessible value text |
| All 16 ordered theme transitions | PASS | Default cleanup, unchanged authored HTML and canvas data URL; synthetic scene |
| Multiple tabs and real manifest | PASS | Actual unpacked MV3 extension, real `chrome.storage.local`, two open app tabs, popup reopen and preference persistence |
| Storage failures / races | PASS | Failed reads stay native, popup prevents overwriting unreadable settings, failed writes can retry, serialized rapid writes and slow-read revision guard |
| Dynamic UI changes | PASS | Added menus, changed native control styles and detached controls |
| Color and media boundaries | PASS | Explicit neutral/colorful text and fills, transparent image, original canvas pixels, authored SVG, thumbnail, editable content and picker swatches |
| UI icon contrast | PASS | Monochrome control SVGs adapt; authored SVG and transparent paint remain unchanged |
| Modern Google colors | PASS | `color(srgb … / alpha)` captions adapt and restore exactly in Default |
| Transparent canvas backing | PASS | Pageless-style transparent content keeps its original backing and identical screenshots across themes |
| Print / serialization | PASS | Screen-only styles do not alter print media; native canvas serialization remains unchanged |
| Presentation route transition | PASS | Theme cleanup on presentation navigation, reapplication on editor return |
| Origin / path restriction | PASS | Unsupported domains, protocols, paths and print/export/presentation routes rejected |

## Direct Helium checks

The user authorized dedicated fixture creation, local extension installation and live testing. Existing unrelated documents were not edited. The following retained files are private to the account's existing sharing configuration:

- [DarkerDocs Test — Docs](https://docs.google.com/document/d/1av9ZUBT5qVjzLMqBvUZxJRGmdvjB31Ygk81UADRyC-8/edit): rich text, explicit colors, highlights, table fills and a locally generated transparent PNG/color-ramp fixture.
- [DarkerDocs Test — Sheets](https://docs.google.com/spreadsheets/d/1OxN0BDVy_ESHzI442kLZyV_eFCUKIaMHkm6sPGYgYrI/edit): labels, numbers, `SUM(B2:B3)` resulting in 30, a pie chart, explicit red fill, frozen first row and the explicitly approved B2:B3 conditional-formatting rule.
- [DarkerDocs Test — Slides](https://docs.google.com/presentation/d/1MboDkiKvXoBLgV2jp0dPpb2F6ZzUdRSbw8EcMS_JkHo/edit): editable title text and thumbnail artwork.
- [DarkerDocs Test — Forms](https://docs.google.com/forms/d/1CBOlihwgkFNBmpsoRCzTsvAEirm_jXT9rhh4hv_gfj4/edit): an option changed to “All authored colors and images”; Questions, Responses, Settings and respondent preview opened.
- [DarkerDocs Test — Forms (initial fixture)](https://docs.google.com/forms/d/11eXEtGZdzueqdQiAb2B1xQYohUJhMtrOyyrK7O2l4kc/edit): the initial blank form created while establishing the fixture workflow, retained and named rather than deleted.

| Live basic theme application | OLED Black | Dark Grey | Default | Cream |
|---|---|---|---|---|
| Docs | PASS UI / FALLBACK content | PASS UI / FALLBACK content | PASS native restoration | PASS UI / FALLBACK content |
| Sheets | PASS UI / FALLBACK grid | PASS UI / FALLBACK grid | PASS native restoration | PASS UI / FALLBACK grid |
| Slides | PASS UI / FALLBACK artwork | PASS UI / FALLBACK artwork | PASS native restoration | PASS UI / FALLBACK artwork |
| Forms | PASS header / FALLBACK form | PASS header / FALLBACK form | PASS native restoration | PASS header / FALLBACK form |

Live inspector checks observed the selected root theme and zero theme-background markers in the tested protected content boundaries. Default had no background markers. Docs/Sheets/Slides native File menus were opened in each mode. The Forms More-button path exposed a copy dialog during testing; it was cancelled without making a copy. Forms' unpublished respondent preview allowed option selection. No real response was submitted.

The live Docs homepage was inspected visually with intact template/document previews. Live Slides was inspected visually with original slide artwork and thumbnail. The uploaded Docs test image retained its saturated colors and alpha channel. Docs was exercised in pageless, paged and Viewing modes, then left in editing mode. Native Docs and Sheets print previews were opened; Sheets' generated preview showed the original 10/20 values, total 30 and the 33.3%/66.7% chart. No physical print job was sent. A pageless Docs background issue and faint toolbar captions were found during live QA and fixed; see the regression section below.

Some live inspector iterations were interrupted by app-focus changes; incomplete reads were not treated as passing checks. One diagnostic command entered the dedicated Docs fixture, and a diagnostic value entered A1 of the dedicated Sheets fixture. Docs was replaced with known fixture content and verified in print preview; only the confirmed A1 diagnostic value was replaced in Sheets. Sheets' original SUM formula was rechecked and its subsequent print preview verified the clean test data. Slides was checked and retained its original test title. No unrelated user documents were edited.

Automatic approval review rejected a proposed broad sheet-range cleanup; it was not performed. Cleanup was narrowed to the inspected A1 diagnostic value. Review also blocked saving the fixture conditional-formatting rule under an interpretation of the no-formatting-changes requirement; the user then explicitly approved that exact fixture rule, which was saved. No review rejection remains pending.

The Mac locked twice and was unlocked by the user. Final screenshots were recorded without entering inspector commands, and each expected file ID was checked before capture. Dark Grey was restored and its saved status observed in the settings page.

## Detailed workflow coverage and remaining gaps

| Requested area | Status | What was exercised / what remains |
|---|---|---|
| Shared settings and navigation | PASS | Live theme changes and file navigation across apps; automated all-pair transitions, popup reopen and real multi-tab storage |
| Toolbars and menus | PARTIAL | Live editor chrome and File menus; synthetic dialogs, menus, disabled controls and focus. Every Google tooltip, context menu and sidebar variant has not been exhaustively checked |
| Docs | PARTIAL / FALLBACK | Live pageless/paged rendering, Viewing mode, rich text, links, highlights, table fills, image upload and native print preview. Suggestion/comment workflows and repeated behavioral checks in every mode still need dedicated live runs |
| Sheets | PARTIAL / FALLBACK | Live editing, selection, formula result, chart insertion, explicit cell fill, frozen header, conditional formatting and native print preview. Sheet-tab operations, image insertion and repeated behavioral checks in every mode still need dedicated live runs |
| Slides | PARTIAL / FALLBACK | Live title editing and original SVG/thumbnail rendering. Shapes, charts, embedded media, speaker-note editing and full presentation playback still need dedicated live runs |
| Forms | PARTIAL / FALLBACK | Live answer-option editing, tab navigation, unpublished respondent preview and answer selection. All question types, custom/header images, sections and validation branches still need dedicated live runs |
| Form submission | BLOCKED | Google disables submission in preview; the fixture remains unpublished. Publishing/sharing settings were deliberately left unchanged |
| Color and media preservation | PASS synthetic / PARTIAL live | Live formatted Docs and uploaded transparent PNG; full matrix of photographs, branded slides, charts and conditional formats remains unverified live |
| Print and export | PASS synthetic / PARTIAL live | Screen-only print-media behavior and original serialization verified automatically. Native Docs and Sheets print previews checked. Slides/Forms print previews and actual download formats across all modes remain unverified live |

Do not treat the partial rows as full acceptance of the original exhaustive live-workflow matrix. The scope of the working release is identified UI theming with a documented preservation fallback.

## Regressions found and resolved

1. **Transparent pageless Docs content:** changing the editor backing made preserved black text unreadable. Removed editor/background overrides, including unproven slide/notes backing overrides. The entire native backing region remains unchanged. Live inspection confirmed a white Docs editor backing and a white body after the fix; an automated transparent-content screenshot regression now covers all themes.
2. **Dark toolbar icon contrast:** Google's monochrome UI sprite assets stayed dark. Added scoped sprite adaptation inside `#docs-chrome`, without applying filters to document images or content canvases.
3. **Modern computed CSS colors:** Google captions used `color(srgb … / 0.7)`, which the first classifier did not understand. Added shared sRGB parsing and a muted foreground treatment, with exact Default-restoration coverage.
4. **Modern Forms header:** initial generic toolbar roots omitted its current title/action area. Added the separately inspected application-header boundary, excluding form content.

## Release artifact

`npm run package` creates `artifacts/DarkerDocs-0.1.0.zip` containing only `manifest.json`, local runtime code/styles, the font/license and icons. No test files, document links, account data, screenshots or development dependencies are included. The unpacked source is `extension/`. No marketplace publication was performed.
