> Session decision (2026-11-17): the user chose a separate theMenu repository. See docs/HANDOFF_AUDIT.md (or HANDOFF_AUDIT.md in this folder) for the local implementation decisions. Historical deployment instructions below do not override that choice.

# Codex implementation task — theMenu MVP

## Context

Target: `trinity-research/trinity-research.github.io`, branch `main`, public GitHub Pages site with `CNAME=trinity-research.com`. Existing site includes root HTML pages and other project folders, including `hnted/`. **Do not modify or remove existing pages, CNAME, research datasets, or workflows.** Work on a feature branch and open a pull request.

Product: **theMenu**. Brand promise: *Just the menu. Nothing else.* Nearby-first list. No login, checkout, carts, ranking-for-payment, ratings, clutter, or forced outbound navigation. Restaurant logo is absent on free listings; an optional paid branding entitlement can be added later. Every restaurant's menu and corrections remain free to access/publish. Paid branding must never alter organic distance ranking.

## Branding directive (Brand Sprint 01)

Read `docs/BRAND_SPEC.md` first. Implement **Utility / Cobalt** as the provisional identity: lowercase small `the` with oversized heavy, blocky `MENU`; ink `#141414`, cobalt `#275DFF`, white `#FFFFFF`, restrained light surface `#F5F6F8`. Keep **“Just the menu. Nothing else.”** as the primary tagline and **“Bold brand. Invisible interface. Just the menu.”** as the internal north star. The standard lowercase `t` is default; the reversed `t` is a separate A/B test candidate only. Isolate wordmark, tokens and brand variants so changes do not affect menus or ranking. Do not add branding clutter or require an account. Verify text/control contrast and focus states. This is exploratory branding, not a validated trademark or consumer-tested identity.

## MVP Deliverables

1. Deploy at `/themenu/`, leaving existing Trinity Research homepage and custom domain untouched. Preserve the visual and interaction behavior of supplied `themenu/index.html` as a starting point, not as a final data architecture.
2. Extract hardcoded restaurant/menu records from inline JS into published JSON under `/themenu/data/`, preferably one manifest plus one JSON file per restaurant. Validate with JSON Schema and a lightweight CI job. Don't silently invent details in extraction.
3. Search restaurants by name/cuisine and dishes with accent-insensitive matching; category filtering; one-tap menu opening; direct deep link to a menu; browser back/forward history; keyboard and screen-reader accessibility.
4. Geolocation optional; only request on user action and fall back gracefully to an explicit city selector (Shreveport/Bossier initially). Sort by distance ONLY for accurately geocoded locations and with permission; otherwise explain fallback ordering. Do not use approximate coordinates as precise pin/distance values. No analytics/third-party tracking SDK by default.
5. Show menu provenance and accurate publication/verification dates. Distinguish `verified`, `needs_review`, `missing`, and `outdated` transparently. Mark any excerpts as excerpts, not complete menus. Unknown prices are null/not shown. No guessed prices. External menu link can be a fallback but should not pretend to meet the one-tap native-menu promise.
6. Menu edit workflow: restaurant submits an issue or a form that creates a GitHub issue (without exposing write tokens to client); maintainers review changes and merge a PR. At MVP, a `mailto:` link or an external GitHub issue template is acceptable with clear copy. No fake "reported" success state.
7. Add unit checks for schema, duplicate IDs, bad URLs, prices, provenance, HTML escaping, and stale data markers. Include manual mobile tests and accessibility basics. Use relative paths so GitHub Pages subpath works.
8. Update documentation with how to add/update a restaurant, verify sources, run tests, preview locally, and deploy.

## Data model

Each restaurant needs stable ID, display name, cuisine, address/city, optional verified coordinates, contact/official source URL, menu provenance, last verified date, menu status, optional categorized dishes with optional descriptions, numeric price or null, currency. Optional restaurant-provided photo URLs only with permissions/licensing. Branding entitlement is a separate boolean/config flag, default false. Do not build a billing system yet. Preserve pricing options and modifiers carefully. See `data/restaurant.schema.json` and `data/example.json` for a proposed initial schema, adjust with documented migrations if useful.

## Publication / legal guardrails

Respect menu copyrights, website terms and rate limits. Request restaurant permission for logo/photos or use assets they license to the project. Linking to official menus is allowed as a fallback; bulk republishing or crawling needs legal/source review. No Google Places content caching outside its allowed terms. No fabricated verification timestamps; preserve actual source and reviewer. No unreviewed AI OCR extraction into production. Don't call the two existing limited menu previews full menus.

## GitHub data architecture

**MVP**: Static GitHub Pages + version-controlled JSON + GitHub Actions validation + reviewed PRs. Advantages: free/low cost, history/rollback, no secrets in browser, no database needed for read-only content. Limits: pull-request moderation needed, no atomic high-volume writes, no private customer data, not a scalable self-service admin system. Consider Supabase/Postgres only when the volume or owner self-service requires it. GitHub Actions must have least-privilege permissions; protect the main branch where possible; no automatic live overwrite by scraped data.

## Definition of done

- `/themenu/` renders on GitHub Pages while `/` remains identical.
- Sample data loads from JSON and search/menu UI works on an iPhone-sized viewport.
- Browser back and direct links work.
- Invalid JSON fails CI; valid data passes with a reproducible command.
- Free listings do not display restaurant logos; `isBranded` does not influence distance sorting.
- Every displayed menu section or price is traceable to source and verification date, or is explicitly labeled unverified.
- No login/cart/payment flows.
- Utility/Cobalt brand follows `docs/BRAND_SPEC.md`; ordinary lowercase `t` is the default, experimental reversed `t` is isolated and not used for accessibility labels.
- Colors are centralized, high-contrast, and verified at mobile sizes; no logo splash interrupts the restaurant-list-first experience.
- PR includes screenshots, test evidence, and detailed changed-file list.

## Suggested initial tasks for Codex

A. Inspect repository tree, GitHub Pages settings, existing Actions, and README first.
B. Branch `feature/themenu-mvp` from `main`.
C. Add files under `themenu/` only; add isolated Actions workflow if needed.
D. Migrate `const data` in existing prototype into JSON; make no content changes unless justified.
E. Add schema validator, documentation and small deterministic tests.
F. Run tests; open PR. Don't merge or deploy to production without review.
