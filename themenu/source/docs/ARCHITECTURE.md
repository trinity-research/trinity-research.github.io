# theMenu architecture — v0.2

The app is buildless HTML/CSS/JavaScript. `index.html` loads `assets/app.js`; `assets/core.js` holds deterministic search, parsing, freshness, routing, and ranking helpers. `assets/config.js` isolates base path and policy settings. `assets/styles.css` centralizes brand tokens. No business logic depends on the palette or branded entitlement.

`data/restaurants.json` is the canonical versioned content store. For this small curated pilot one manifest is simpler to review than a database or a manifest plus many restaurant files. `data/schema.json` is the authoritative directory schema; `restaurant.schema.json` exports the same restaurant definitions. `validate_data.py` adds cross-record consistency, source/price/date, link, and media checks. These checks do not establish real-world accuracy or permission.

The update path is: owner correction issue → maintainer verifies source/rights → content PR → automated checks → designated human approval → authorized merge → manually approved publication. No content is auto-extracted or auto-published. Git retains the source and rollback history; no write credential reaches the browser.

The list works without location permission. On explicit action, the browser holds coordinates in memory and sorts only restaurants with independently verified coordinate metadata. Ungeocoded records follow alphabetically. Distances remain estimates because browser location has uncertainty. Reloading clears coordinates; the user can also clear them in the current tab. No analytics, accounts, persistent storage, or geolocation network request is implemented by the app.

Menus use hash deep links, which work on static GitHub Pages without server rewrites. UI rendering inserts untrusted strings through `textContent`; external URLs are checked for HTTPS. CSP blocks third-party scripts and connections. Optional HTTPS media loads only if added with permission metadata; external media hosts would receive ordinary image requests. There are no remote media requests in the canonical empty directory.

`build.py` validates records and copies an allowlist into `dist/`. Legacy/reference files stay out of that artifact. The separate repository can host at `/theMenu/`, `/themenu/`, or its own domain using relative paths; the current integration targets the existing Trinity Research /themenu/ path and does not need DNS changes.

The build also runs `scripts/discovery.py`: the home list is prerendered, each canonical record gets an ordinary HTML menu URL, and JSON, Markdown, Schema.org, and discovery metadata derive from the same data. Interactive hashes remain supported. The public_base_url setting controls canonicals, sitemap URLs, and indexability; null means a noindex preview. See DISCOVERY.md for crawler/host boundaries, freshness semantics, and the optional llms.txt guide.

A database becomes useful when volume or owner self-service makes moderated PR edits impractical. Billing remains out of scope; the handoff's approximately $19/location/month is an unvalidated future hypothesis, not a live offer.
