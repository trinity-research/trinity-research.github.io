# Verification record — November 17, 2026

## Automated checks

- Canonical manifest: 0 restaurant entries; valid.
- Fictional manifest: 3 entries; valid only with explicit demo mode.
- Python unittest: 15 passed. Covers schema failures, duplicate records/IDs/JSON keys, unsafe URLs, unsupported/missing price verification, future dates, invalid address format, approximate coordinates, missing provenance, logo/media restrictions, and demo isolation.
- Node test runner: 14 passed. Covers accent-insensitive dish/name search, filters, alphabetical and Haversine ordering, branding independence, freshness boundary, deep-link parsing, runtime parsing, HTTPS handling, DOM text rendering policy, and actual text/control contrast calculations.
- Production publishing gate: expected to refuse publication while correctionUrl is unset.

## Chrome checks performed on localhost

- Public default route shows an honest empty directory, an optional fictional-sample link, and no location prompt.
- Fictional route clearly identifies sample restaurants, dishes, and prices.
- Search for CAFE matches Café; dish search for corn matches its restaurant.
- City filtering yields the expected count.
- A restaurant link opens the native menu in one action; menu heading receives focus.
- Browser Back and Forward restore list/menu. Reload preserves a direct menu link.
- Keyboard Enter on a restaurant link opens its menu.
- Free rows have no logo. The optional branded fixture remains in alphabetical order.
- 320px and 390px widths: document width does not exceed viewport width.

## Reproducible browser checks

Generate local-only fixtures with `python scripts/prepare_browser_smoke.py`. The generated files are excluded from source and deployment. Open `http://127.0.0.1:8765/.browser-fixtures/location-denied.html?demo=1`. This uses the real app with a deterministic denied geolocation stub; it cannot request the user's real location. Click Use my location and check that denial is announced, city selection still works, and rows stay alphabetical.

Before release, also check on a physical iPhone/Android device, at 200% browser zoom, with a screen reader, and with genuine browser permission denial. Automated text contrast checks do not constitute a complete accessibility audit. When inspecting prices, verify that the Seasonal greens unknown price has no numeric placeholder and that the Bayou Table menu is visibly an excerpt.

Simulated location denial was checked in Chrome: the denial message appeared and the first row stayed Bayou Table (alphabetical order). The built artifact also passed a deep-link check at `/dist/?demo=1#menu/demo-bayou-table`. The browser screenshot API timed out; desktop capture then stopped because the tool could not confirm the current Chrome URL. No screenshots were saved in that pass. No CI runs or repository review rules have been verified remotely because there is no new remote repository yet.

## Brand-brief follow-up

The user-supplied brief is applied. Both unit suites total 29 tests; token-derived contrast checks cover all three palettes and generated asset checks confirm the production mark stays standard. The actual browser checks above were performed before the compact-header refinement. Current-turn browser results, screenshots, and 200% zoom checks will be listed here only if completed. The three concepts and the reversed-t pair are review materials, not user-tested identities.

### Current-turn Chrome follow-up

- The refined 390px directory reports 375px document width (no horizontal overflow), a 26px heading, cobalt #275DFF, and regular-weight 400 lowercase wordmark text.
- At 320px, the document is 305px wide; both free fixture rows have no image. Search for CAFE, menu opening, and browser Back still work after the brand changes.
- The review board loads all five 176px-wide SVG assets, each with the accessible name theMenu. Product-card copy is identical across all three palette concepts, and the board fits the 320px viewport. The temporary viewport override was reset after checks.
- Full-page screenshot capture timed out again. There are no saved screenshot files. The preserved before-source and the current app allow a later screenshot pass; neither is presented as a captured image.
- Actual 200% browser zoom, physical-device and screen-reader checks remain pending. No claim of complete WCAG compliance or participant recognition results is made.

## Price/menu notice follow-up

- The shared disclosure is in `assets/menu-notice.js`; its wording and scope are recorded in MENU_NOTICE.md.
- JavaScript syntax checks, all 14 Node tests, generated brand checks, data validation, and the static build pass. No new tests were added for this copy and presentation change.
- Chrome confirms that the short directory notice is visible and that the full main warning is visible above the first dish price on the excerpt menu.
- Keyboard Enter on the native supplementary disclosure opens the additional details. A missing-menu view also displays the notice.
- The notice supplements source verification and correction handling. It does not establish legal immunity or replace legal review of binding terms.

## Search and agent discovery follow-up

- All 47 tests pass: 33 Python tests (15 publication-validation + 18 discovery-generation checks) and 14 Node tests. Shared brand/disclosure generation checks and the static build pass.
- Discovery checks cover source/provenance/date preservation, null and zero prices, stale and unknown Offer exclusion, per-price ages, empty public output, schema validation, project-path links, canonical/sitemap generation, CSP hashes, HTML/script escaping, unsafe path rejection, and crawler-rule compatibility.
- The real built menu-index.json validates against its exported schema and contains zero restaurant records. No fictional restaurant menu pages are generated in public dist/.
- Chrome checked isolated, noindex test fixtures under .browser-fixtures/discovery-preview/. These files and their synthetic prices are excluded from the deployable artifact.
- The enhanced list exposes a permanent HTML menu href, while an ordinary click still opens the existing hash menu view in one action. Browser Back restores focus to the correct restaurant and restores the home structured data. The directory schema is absent from a detail view.
- Opening the permanent HTML URL displays the dishes, source, excerpt label, price disclaimer, and format links. It has zero executable script-file dependencies; Menu JSON-LD is present and the disclaimer precedes the first price.
- The actual built /agents/ guide loads and honestly reports zero published restaurants, with links to the discovery index, canonical JSON, schema, and Markdown contract.
- Public base URL remains unset. Preview HTML is noindex; no sitemap or guessed canonical domain is emitted. The expected publishing gate fails until an actual approved URL and correction destination are configured. No external indexing, publication, DNS change, or search-console submission was performed.

## Trinity component and facts-first follow-up

- The user changed the destination to the existing Trinity Research repository under /themenu/, with GitHub branch review before live-site connection. A component package contains generated files plus editable source; its exporter cannot enter the parent homepage or source directory through generated file paths.
- The wordmark gap is 2px instead of 6px; generated concept/SVG MENU positions also move 4px closer.
- Menu sources now use content_basis, including public_facts for names/prices transcribed in our own layout without claiming restaurant consent. Public-facts imports omit descriptive prose. Separate media permission metadata is unchanged. Tests cover public validation without owner consent, copied-description rejection in that import mode, and rejection of public_facts as a media permission.
- All 55 tests pass: 41 Python and 14 Node. Export safety/integrity checks cover an unrecognized target, source/path escape, source/output drift, and removal of stale generated files without changing a parent homepage.
- The planned /themenu/ URL and GitHub correction destination are configured, with indexable=false for the development draft. No live merge, Pages configuration, DNS, or homepage navigation change is part of packaging.


## First real import - November 20, 2026

- The active authoring folder is now `C:/Users/huntf/OneDrive/Documents/theMenu`. Its source matched the existing draft PR before this batch (ignoring checkout line endings).
- Four actual locations were checked using official public source text. Superior Grill and Flying Heart have partial excerpts (14 dishes and 17 numeric item/size prices). Chick-fil-A and McDonald's have unavailable local menus. No coordinates, descriptions, media or guessed local prices were added.
- Imported excerpts remain needs_review. The source registry has pending maintainer reviews and no approved automated access. The read-only review command checks complete item/choice observations, source URLs, dates, ordering contexts and review state. The build runs that check before generating output.
- All 69 tests pass: 55 Python and 14 Node. The static build, brand/disclosure checks and directory/source validation pass. New cases cover source/price drift, null prices, size choices, duplicate/missing sources and observations, unsafe URLs, future dates, approval attribution and review-state enforcement. Discovery checks preserve ordering context in HTML, JSON, Markdown and JSON-LD and withhold structured Offer prices for pending menus.
- Local HTTP checks returned 200 for all four HTML/JSON/Markdown/JSON-LD routes, discovery files and representative assets. The disclaimer precedes menu dishes, no fictional records enter the discovery index, the source registry is absent from deployable output, draft pages remain noindex and no sitemap is emitted.
- Preview runs on this computer at http://127.0.0.1:8765/ and serves the OneDrive dist directory. It is not a published or cross-device URL.
- Browser-control tools are unavailable in this session. No new browser screenshots, viewport/zoom checks, physical-device checks or screen-reader results are claimed. Prior browser results above concern earlier revisions; current visual release checks remain pending.
- Source transcription does not constitute an independent maintainer approval or a live price-feed guarantee. The access-review and maintainer-review steps must be completed before enabling a collector or marking imports verified.
