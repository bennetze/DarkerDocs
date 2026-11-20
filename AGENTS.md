# Working on DarkerDocs

This file applies to the entire repository. Follow the current user's instructions and applicable tool rules when they differ from these project defaults.

## Start here

- Read [README.md](README.md) for installation, behavior and development commands.
- Read [docs/TEST_REPORT.md](docs/TEST_REPORT.md) before changing adapters or making validation claims. It records live evidence, regressions, preservation fallbacks and unfinished coverage.
- Treat [docs/TEST_REPORT_0.1.0.md](docs/TEST_REPORT_0.1.0.md) as historical. Its UI-only preservation strategy was superseded by 0.2.0.
- Inspect the current source and test results rather than assuming a historical check count still applies.

## Product requirements

DarkerDocs is a lightweight Manifest V3 extension for **Helium**, covering Google Docs, Sheets, Slides and Forms, including their homepages and supported editor/reading/respondent views.

- Use vanilla JavaScript, CSS and HTML. Keep runtime dependencies, telemetry, external requests, remote fonts and account synchronization out of the extension.
- Keep access restricted to the four supported HTTPS paths on `docs.google.com`. The current API permission is only `storage`; there is no background worker. Do not broaden permissions or origins incidentally.
- Keep one shared setting across apps and the popup, with no per-app overrides.
- Preserve the exact slider order: **OLED Black → Dark Grey → Default → Cream**. First use is **Dark Grey**.
- Store `{ theme: "oled" | "dark" | "default" | "cream" }` under `darkerdocs.settings.v1` in local extension storage. Changes propagate through storage events.
- OLED uses true black. Dark Grey is deep charcoal. Cream is warm amber/ivory, inspired by Night Shift. Keep popup and page palettes consistent.
- Match the observed Google Workspace visual language: bundled Roboto, rounded surfaces, blue accents, restrained spacing and accessible controls.
- Support dragging, clickable labels, arrows, Home/End, visible focus and announced selection. Respect reduced motion.

### Preservation is a release requirement

- Extension behavior must remain visual. Never alter saved formatting, document models, content, Google account preferences or sharing permissions to implement a theme.
- Visible text and paint may adapt for contrast while retaining chromatic hue families. Monochrome colors may invert. Do not confuse pastel colors with grey.
- Preserve image colors and transparency, including monochrome images and lettering embedded in images.
- Theme Slides' surrounding UI, workspace, filmstrip and notes area; keep actual slide artwork, artwork previews and presentation playback original.
- Keep print/export appearance original. Default must restore Google's native page appearance.
- Do not use page-wide inversion, hue rotation or filters that recolor authored images. Existing filters are narrowly targeted at identified UI sprites.
- Retain an original affected surface when safe rendering cannot be established. Identify this as a **preservation fallback**, not successful full content theming.
- Never reload tabs automatically.

## Source map

| Path | Responsibility |
|---|---|
| `extension/manifest.json` | Scope, permissions, execution worlds and popup entry |
| `extension/shared/core.js` | Settings, URL/output guards, palettes and color mapping |
| `extension/shared/themes.css` | Shared CSS tokens and transition styles |
| `extension/content/content.js` | Isolated-world DOM theming, batched observers, storage updates, notices and diagnostics |
| `extension/content/content.css` | Scoped app fixes, display-copy visibility and print rules |
| `extension/content/renderer.js` | MAIN-world Docs/Sheets canvas adapter |
| `extension/content/renderer.bundle.js` | Generated MAIN-world entry; **do not edit directly** |
| `extension/popup/` | Toolbar popup |
| `extension/diagnostics.html`, `diagnostics.js` | Local, read-only maintenance view |
| `extension/assets/` | Bundled font, license and icons |
| `tests/` | Node checks, synthetic browser fixtures and real-manifest integration |
| `scripts/build.py`, `scripts/package.py` | Bundle generation and runtime-only ZIP packaging |

Run `python3 scripts/build.py` after changing core.js or renderer.js. The build uses only Python's standard library and concatenates them into renderer.bundle.js. Keep this MAIN entry separate from the isolated world's shared/core.js path: reusing the identical script path across both worlds caused an observed Chromium injection/deduplication failure.

### DOM adapter invariants

- Measure Google's native styles while `data-dd-measuring` disables our color rules. Otherwise repeated scans can remap already-themed values.
- Preserve transparent foreground/text-fill layers. Google overlays a title input and label; painting both produces duplicate, offset lettering.
- Handle each border side separately. Coloring all sides from the top border turns transparent CSS arrows into rectangles.
- A CSS mask's background is its foreground paint; mapping it like a panel background makes icons disappear.
- Preserve media, picker swatches and original Slides SVG boundaries. Check inherited colors as well as explicit fills.
- Use scoped, batched mutation handling, not continuous polling. Ignore mutations caused by our own display surfaces/styles and clean up detached elements.

### Canvas adapter invariants

- Call the original native drawing operation and preserve its validation, return values, getters and source pixels.
- Theme a separate screen copy inside a pointer-transparent, aria-hidden, closed-shadow host. Do not expose the display copy as the app's real canvas.
- Preserve native serialization/readback and native pointer/keyboard targets. Handle transforms, clipping, save/restore and canvas resets correctly.
- Keep images as images; do not recolor their pixel data as if it were authored text or a neutral background.
- Bound retained history and release obsolete snapshots. Charge recorded scratch tiles for retained commands rather than a full bitmap on every cropped draw. Reuse unchanged image copies and invalidate them when their source changes.
- Keep preservation/reload fallbacks readable and release their retained resources. Display-copy failures must not escape into Google's application code.
- **Sheets' print preview stays on the editor URL.** Preserve the visible `.waffle-printing-pane` output boundary in addition to URL guards and print events. Leaving screen-copy hosts in that view caused duplicate printed pages. Restore the selected theme on exit without writing Default to settings.

### Popup and animation pitfalls

- Helium caps the actual toolbar popup at about **600 CSS px**. Target a complete body of at most **580 px**, including status and footer, after the bundled font loads.
- Test the actual toolbar popup, not only popup.html opened as a tall browser tab.
- Update slider/selection state immediately. Deferring it into an animation callback broke rapid keyboard input.
- Keep the View Transition update callback synchronous. Awaiting requestAnimationFrame inside it caused multi-second rendering stalls.
- Preserve ordered setting writes and startup revision guards; a slow read or old write must not overwrite a newer selection.

## Build and automated verification

From the repository root:

~~~sh
python3 scripts/build.py
node --test tests/*.test.cjs
npm ci --ignore-scripts --omit=optional
npx --no-install playwright install chromium
npm test
npm run test:browser
python3 scripts/package.py
python3 scripts/verify_release.py
~~~

- Third-party npm modules are allowed only for testing. Editing, building, packaging and using the extension must require no npm modules. Do not add formatters, bundlers or other non-testing packages.
- Node and Python 3 are development tools; Playwright and its transitive dependencies are testing-only. The Node checks use only built-in modules; build/package/release verification use Python's standard library. Keep source formatting consistent manually.
- Browser tests use isolated Chromium profiles and deterministic synthetic pages. The manifest integration test loads the real unpacked extension.
- The browser-test and package scripts rebuild automatically. Node tests alone do not rebuild the MAIN bundle.
- Match checks to the change. Documentation-only work does not require launching browsers or rebuilding release artifacts.
- Rendering changes require meaningful preservation, Default restoration and output checks. Retain regression coverage for bugs you fix.
- Test every affected app in all four themes. Check both steady states and transitions, including Default and reduced motion.
- Screenshot capture can wait for fonts; layout assertions should also await `document.fonts.ready`.
- `artifacts/browser-results.json` is overwritten by each browser run, including filtered runs. Finish release verification with the full suite; do not present a filtered result as full coverage.

The **0.2.0 baseline, recorded 2026-11-16**, was 5 Node checks plus 47 browser checks, all passing. This is historical evidence, not a guarantee about future changes.

## Maintaining `.gitignore`

- Review and update [`.gitignore`](.gitignore) in the same change when tooling, build or test output paths, release artifacts, or files referenced by documentation change. Use scoped rules for caches, dependencies and routine generated output.
- Keep source files, `package-lock.json`, test fixtures, and the generated `extension/content/renderer.bundle.js` eligible for version control. The bundle is required for a ready-to-load checkout.
- Keep README assets and test-report evidence eligible for version control. When the README or test report references a new release ZIP, checksum, or verification file, update the release exceptions for those paths. Keep historical exceptions while their references remain.
- Verify changed rules with `git check-ignore --no-index` using representative paths that should be ignored and paths that should remain eligible for version control.

## Direct Helium testing

- Use the available computer-use tooling for the user's signed-in Helium session (macOS bundle ID `net.imput.helium`). Follow that tool's current documentation and confirmation requirements.
- Do not attach Playwright/CDP or shell automation to the user's browser profile. Playwright is for separate test profiles.
- Use fresh accessibility state between UI actions and verify the intended fixture URL before editing or capturing it.
- **Never paste diagnostic JavaScript into Google Docs or Sheets.** Earlier focus mistakes inserted commands into test content. Prefer the extension's local diagnostics page and scoped message exchange.
- Diagnostics must not collect document text, inspect unrelated tabs or add a tabs permission. An all-tabs diagnostic query was rejected; the current design communicates only with already-scoped content scripts.
- If the Mac locks, ask for an unlock and continue independent local work. Do not attempt to bypass the lock or authentication.
- After reloading the unpacked extension in `chrome://extensions`, reload existing Workspace test tabs so their content-script contexts are current.
- Native menus/popups may appear asynchronously. Reobserve transient UI rather than reusing stale element IDs.
- Screenshots may arrive as JPEG bytes despite a chosen .png filename. Detect the format before parsing image headers. Any format normalization must preserve decoded pixels and color profiles.

### Fixtures and account changes

Use the retained **DarkerDocs Test** files linked in the test report. Keep them available for review.

Fixture setup may intentionally author test data within the user's authorized scope; this is distinct from the extension modifying saved formatting. Do not edit unrelated files, change sharing, publish the extension or treat a historical fixture approval as blanket authorization for new account changes.

Forms preview currently prevents real submission. Record that scenario as **blocked**; do not publish a form or broaden responder access merely to obtain a passing result.

## Evidence and delivery

- Distinguish **pass**, **fail**, **blocked**, **unverified** and **preservation fallback**. Synthetic tests do not prove Google's complete editing engine works.
- Keep native captures separate from synthetic regression screenshots. Current native evidence is under `artifacts/v0.2/`; synthetic scenes are under `artifacts/screenshots/`.
- Delete images created for demos, checks, debugging or other temporary uses as soon as they are no longer needed. Before finishing a task, remove any unneeded images it generated, including duplicate captures and intermediate exports. Keep images still used by the extension, documentation, tests, retained evidence or requested deliverables.
- Preserve canonical editor links in the report; do not publish transient presentation/authentication tokens.
- Verify original print previews and saved output, including page counts. Never send a physical print job as a test.
- The broader live matrix remains partial: advanced Docs editing/views/comments, Sheets image/tab variants, richer Slides content/notes, Forms question types/header images/sections/validation, and additional export formats. Consult the report and close relevant gaps instead of claiming exhaustive acceptance.
- For runtime releases, keep manifest/package/lock versions and installation notes consistent, rebuild, run relevant checks and update the report with actual evidence.
- `npm run package` writes `artifacts/DarkerDocs-<version>.zip` containing only `extension/` contents, rooted at manifest.json. Keep account data, fixture URLs, screenshots, PDFs, tests and dependencies out of it.
- Verify ZIP entries against the unpacked source and update checksums/verification metadata when shipping a changed ZIP.
- Report what changed, how it was verified and material remaining gaps. Do not silently turn a fallback or an unperformed live test into a pass.
