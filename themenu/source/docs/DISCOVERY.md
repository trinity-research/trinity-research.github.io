# Search and agent discovery

This pass adds ordinary crawlable pages and documented static data. It does not guarantee search ranking, AI citations, or traffic. No remote repository, production site, Search Console account, custom domain, or DNS was changed.

## Generated outputs

Run `python scripts/build.py` and preview the **built** `dist/` directory. Generated discovery pages are not part of the authoring shell at the repository root.

| Path | Purpose |
| --- | --- |
| `/` | Restaurant directory with links already in the HTML, before JavaScript |
| `/menus/ID/` | Static HTML menu snapshot, excerpt, or an honest unavailable-menu page; no JavaScript required |
| `/menus/ID/menu.json` | Restaurant-shaped JSON; menu status evaluated at build time; source, permission, dates, prices, options, and media metadata retained |
| `/menus/ID/index.md` | Readable Markdown with source, coverage, review dates, and price limitations |
| `/menus/ID/menu.jsonld` | Schema.org WebPage → Restaurant → Menu → MenuSection → MenuItem representation |
| `/menu-index.json` | Version 1 discovery manifest with links, recorded/effective status, build timestamp, review threshold, and disclaimer |
| `/data/menu-index.schema.json` | JSON Schema contract for the discovery manifest |
| `/data/restaurants.json` | Unmodified version 2 canonical records |
| `/data/schema.json`, `/data/restaurant.schema.json` | Schemas for the directory and individual records |
| `/agents/`, `/agents/index.md` | Human-readable and Markdown ingestion guide |
| `/index.md` | Markdown restaurant directory |
| `/llms.txt` | Optional concise directory using the community proposal |
| `/sitemap.xml` | Absolute HTML URLs, generated after a real public base URL is configured |

All formats derive from the same reviewed canonical records. They are public read-only static files, not a live ordering or write API. There is no new account, secret, database, tracking SDK, or paid-ranking logic.

## Accuracy and permissions

The current canonical directory contains zero records. Public discovery outputs also contain zero records. Fictional samples are not promoted into structured data, menu pages, Markdown, or the discovery index. The existing optional demo still works in the interactive app; its links use nofollow and its page sets noindex/nofollow. Robots excludes the demo JSON and demo query routes where crawler rules are honored. These rules are not access control and cannot prevent every requester from reading a public fixture.

Menu JSON keeps the same restaurant schema as the source, with an effective status calculated at build time. The index also retains the recorded status. Canonical data is never rewritten. Every consumer must recompute age from `last_verified` and `price_verified_at` at the time of use: the build itself can become stale. Build timestamps are not restaurant-verification dates.

The visible price disclaimer appears in static HTML and Markdown and is carried in the discovery index. Null prices stay null; zero remains a recorded zero. Schema.org Offers are emitted only for prices within the review threshold on a currently verified snapshot. Unknown, stale, needs-review, and outdated prices never become Offer objects. No inventory availability, ratings, hours, diet suitability, ordering action, or offer-validity deadline is invented. Options remain as recorded; the generator does not reinterpret all choices as surcharges or infer a total.

The source JSON was already public; individual JSON exports retain its public permission and review metadata. Private agreements, personal data, and secrets must never be placed in canonical records. Publication metadata does not prove ownership or factual accuracy. Public factual imports do not claim restaurant consent. Rights-managed text and media keep their source-specific terms; discovery files do not grant a new blanket license for those assets.

## Deployment setting

Set `site.config.json` → `public_base_url` to the actual approved HTTPS site URL, including any project path. This setting does not create or configure a domain. Keep it null for local review.

With null, generated HTML is noindex/follow, links are relative, and no sitemap or guessed canonical URL is emitted. With a configured URL, pages get absolute canonical URLs. indexable=true enables index/follow and the sitemap; the current Trinity draft keeps indexable=false until launch review. The publication gate now requires both this real URL and the approved correction issue destination. No live publication was attempted.

The interactive app retains its existing menu hashes and browser history. Restaurant anchors also expose the stable HTML URLs, so opening a menu in a new tab works in a built artifact. Canonical tags follow the active menu. Home structured data is removed while an interactive detail view is shown, preventing a mismatched directory schema on a menu view. Standalone menu pages include their own structured data, protected by an exact CSP hash instead of unsafe-inline.

## Crawlers and host boundaries

The generated wildcard crawler policy permits public menu pages and discovery data, including OAI-SearchBot and Googlebot; exclusions precede the general allow rule for parser compatibility. There is no new model-training opt-in setting: existing general crawler access is preserved, and crawler permission is not a reuse license.

Robots is authoritative only at `https://HOST/robots.txt`. On a GitHub Pages project URL, a robots file inside the project path cannot control the host's crawler policy. Configuring origin-level rules would require separate owner authorization; this pass does not change the existing Trinity Research origin. Inspect the actual host/CDN rules after an approved deployment. Do not add bot challenges to public HTML/data if those clients are intended to read it.

Search and training crawlers serve different purposes. If the owner later wants a different training policy, decide that separately from search discovery rather than assuming all AI access is one setting.

## After approved publication

Verify representative pages with a raw HTTP fetch as well as a browser: the name, dishes, source, disclaimer, and ordinary links must be present without script execution. Validate structured data against Schema.org; optional Google rich-result eligibility is a separate question, not guaranteed by using a Schema.org type. Confirm that live canonical URLs match the deployed host and project path, the sitemap returns successfully, and the host does not block intended crawlers.

An authorized owner can then verify the property in Google Search Console/Bing Webmaster Tools and submit the sitemap. These account actions were not performed. Compare aggregate search/referral evidence after release before claiming traffic gains. No analytics was added to the product.

## Primary references checked November 17, 2026

- [Google: AI features and your website](https://developers.google.com/search/docs/appearance/ai-features) — existing SEO fundamentals, crawlability, visible textual content, internal links, and matching structured data; no special AI markup is required.
- [Schema.org Restaurant](https://schema.org/Restaurant), [Menu](https://schema.org/Menu), [MenuSection](https://schema.org/MenuSection), [MenuItem](https://schema.org/MenuItem), [Offer](https://schema.org/Offer) — the public vocabulary used here.
- [Google: build and submit a sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap) — absolute, accurate crawlable URLs; no invented modification dates.
- [OpenAI crawler documentation](https://developers.openai.com/api/docs/bots) — OAI-SearchBot and GPTBot have independent purposes and controls.
- [llms.txt proposal](https://llmstxt.org/) — optional Markdown guide and alternate-format discovery, not a search inclusion or licensing guarantee.
