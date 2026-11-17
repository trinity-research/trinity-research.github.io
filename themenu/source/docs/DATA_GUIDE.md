# Restaurant and menu maintenance

## Add or correct a listing

1. Use a stable lowercase-hyphen ID and verify the official restaurant name and structured US address. This pilot requires a US state code and ZIP code; format checks do not verify that an address exists.
2. For a missing menu, set `menu.status` to `missing`, `categories` to `[]`, and source, reviewer, and last_verified to null. Never fabricate a verification date merely to list a restaurant.
3. Record `menu.source.content_basis`: `public_facts` for independently transcribed factual names/prices, or `restaurant_submitted`, `licensed_feed`, or `permission_granted` for other reviewed sources. Owner opt-in is not required for every factual listing. `public_facts` imports leave descriptions empty; it does not authorize copying photographs, menu artwork/PDFs, or creative prose. Record the source/collection review in `evidence`; keep private documents out of Git.
4. Record the actual reviewer and source review date. Source verification and menu last_verified dates must agree. Price dates cannot be later than that menu review. Unknown price = null and price_verified_at = null. Preserve sizes/options as explicitly named choices; choice prices are displayed exactly as recorded, without silently calculating a meal total.
5. Mark excerpts with is_partial=true. Use needs_review or outdated as appropriate. The UI also marks verified snapshots older than the configurable threshold as needs_review; this does not rewrite the source JSON.
6. Include coordinates only after verifying the premises location, with source URL and date. Approximate geocodes are omitted rather than treated as exact.
7. Free branding has logo=null. Optional branded logos and any dish photos need creator, credit, license, permission basis, descriptive alt text, and source. Local logos must live under assets/; photos use authorized HTTPS URLs. No branded field can change organic ranking.
8. Run both unit suites and the validator, inspect the rendered result, and open a content PR. A designated maintainer reviews the factual details, content basis, and any applicable media permissions before approving. Accuracy corrections stay free.

## Model and fixtures

`data/schema.json` uses JSON Schema draft 2020-12. Every object rejects additional fields. Restaurant, category, dish, and choice IDs are stable. Prices are USD numbers or null; currency generalization is deliberately deferred. Media arrays support multiple photos. Dates use YYYY-MM-DD.

`data/example.json` is a fictional record illustrating shape; it is not a real listing. `data/demo.json` has a mandatory demo marker and visible fictional names. Validate it only with `python scripts/validate_data.py data/demo.json --demo`. Do not copy synthetic permission metadata into canonical data. The default public validator rejects it, even if someone removes the top-level marker.

## Source changes

Review official sources manually and respect source terms, robots policy, licensing, and rate limits. There is no scraper or scheduled checking job in this pass. A future scheduled checker may open a review issue about changed sources; it must never overwrite or publish extracted menu prices.

## Unpublished model migration

The source field `menu.source.permission_basis` was renamed to `content_basis` before the first GitHub PR. `public_facts` is now supported for factual imports without claiming restaurant consent. Existing synthetic fixtures were migrated. Media keeps its distinct `permission_basis`; a public-facts source is not a media license. See INGESTION_PLAN.md for the scope and primary U.S. references.
