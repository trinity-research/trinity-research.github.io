# Menu ingestion proposal

## Coverage and default approach

The directory can cover independent restaurants and chains, including fast food. Restaurant opt-in is not a general prerequisite for a factual listing. Start with a Shreveport–Bossier pilot containing a mix of independent restaurants and specific chain locations, then expand geography using the same model. The current canonical directory still has no real records; no prices were invented or copied from the old prototype.

The default is a text-only factual transcription: restaurant/location, item names, categories we normalize, sizes/options, numeric prices where actually verified, and a source URL/date. In our model, `menu.source.content_basis=public_facts` records this approach without claiming restaurant consent. Those imports omit descriptive prose. An empty description is acceptable. Private owner agreements and account credentials stay out of public Git data.

## Acquisition lanes

| Lane | How it starts | Ongoing updates |
| --- | --- | --- |
| Public official menu facts | Review the restaurant's own public menu, location-specific page, or permitted data endpoint; transcribe the facts into our layout | Check approved sources for changes; stage a diff and review the actual items/prices before publication |
| Restaurant-supplied menu | Owner optionally provides a public menu/export and indicates any permission for descriptive copy or media | Owner suggests changes; maintainer reviews and merges a content PR |
| Authorized provider connection | A restaurant chooses to connect a provider account or a licensed feed is acquired | A server-side adapter maps provider IDs, locations, variations, and modifiers to our schema; credentials stay in server/CI secret storage |

Square's Catalog API is a concrete future adapter: catalog reads use seller-authorized access and `ITEMS_READ`; that authorization is for the provider account, not a requirement to list every restaurant. Do not assume every provider exposes a freely reusable public menu API. Build provider adapters only after selecting actual participating sources and their permitted access method. [Square Catalog API](https://developer.squareup.com/docs/catalog-api/what-it-does), [Square OAuth](https://developer.squareup.com/docs/oauth-api/overview).

## Proposed pipeline

1. Maintain an approved source registry per physical location, including its source URL, collection method, access/terms review, content basis, and expected refresh cadence.
2. Initially collect a small mixed pilot manually to prove address, item, price, and modifier mapping. Do not spend the pilot building a universal scraper.
3. Add narrow adapters for permitted official HTML/JSON sources or authorized feeds. Preserve source IDs and source-observation times. Fetch server-side with caching, bounded retries, rate limits, and checks for changed formats; avoid access controls or login bypasses.
4. Normalize into a staging record. Unknown prices stay null. OCR/AI may assist transcription, but uncertain prices and ambiguous option totals remain unresolved for a human to inspect.
5. Validate schema, duplicate IDs, source/price dates, coverage, and content basis. Show a review diff for added/removed items and changed prices. Fail closed on unexpected structures rather than mass-replacing menu content.
6. After human review, merge a content PR and rebuild the static HTML/data exports. Automated source checks may raise a review task; they do not auto-publish extracted prices.

For fast food, a brand is not a single universal price list. Keep physical locations separate and record the applicable ordering context. A delivery-app markup, combo price, promotion, breakfast-only item, or regional option must not silently become an all-location dine-in price. If only a chain-wide item list is known, list items without guessing local prices and label coverage honestly.

## Copyright, content, and access distinction

For a U.S. directory, the facts/expressive-content distinction supports the facts-first plan. Facts are not protected by copyright; the Copyright Office also excludes names and short phrases. Independently reporting facts is different from copying a menu photograph/PDF, creative descriptions, artwork, or a distinctive creative arrangement. Media and descriptive-copy uses need their own appropriate basis. This project does not imply restaurant endorsement from a listing.

This is not a conclusion that every source can be scraped or every use is lawful. Contractual access terms, technical restrictions, trademarks, and non-U.S. rules can require separate analysis. Review the actual collection method before scaling a particular source. A price disclaimer does not resolve source-access or content-rights questions.

Primary references checked November 17, 2026: [Feist, 499 U.S. 340](https://www.law.cornell.edu/supremecourt/text/499/340), [Copyright Office Circular 33](https://www.copyright.gov/circs/circ33.pdf), [37 CFR 202.1](https://www.copyright.gov/title37/202/37cfr202-1.html).
