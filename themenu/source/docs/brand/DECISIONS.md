# Brand decisions — November 17, 2026

The user supplied Brand system v0.1 in this session and confirmed it as the brand-sprint source of truth. Its content matches `docs/BRAND_SPEC.md`. The earlier user choice of a separate theMenu repository still governs deployment: no existing Trinity Research pages, workflows, CNAME, or DNS are changed.

## Implementation

- Utility / Cobalt remains the sole product default. The header uses ordinary lowercase `the` at regular weight and heavy block `MENU`; accessible labels, metadata, titles, copy, and search continue to say theMenu.
- The product tagline is “Just the menu. Nothing else.” The footer uses “No sign-ups. No carts. No nonsense.” No numerical tap-count claim is made.
- Replaced the larger introductory heading with a compact “Restaurants near you” heading and reduced header/intro spacing so the restaurant list sits higher. No splash, logo animation, extra account step, or new product theme selector was introduced.
- `brand/tokens.json` is the source for palette roles, spacing scale, body/wordmark fonts, sizes, supporting copy, and defaults. `scripts/build_brand.py` generates the default CSS/SVG plus isolated comparison assets. Builds check for drift. The public styles contain no literal brand colors.
- Three comparable color concepts live in `docs/brand/`: Utility/Cobalt, Signal/Yellow, Human/Teal. Their product mockups share layout, type, and fictional text. These review materials are excluded from `dist/`.
- The reversed-t SVG changes only the transform on the ordinary t. Its accessible title is still theMenu. It is confined to review assets and is not imported into the product.
- Signal yellow has insufficient contrast against white for text or an essential control outline. That concept uses dark ink for text/focus and yellow as a fill with dark text. Cobalt and teal use white text on their action fills. Tests calculate the actual ratios from the source tokens.
- Menus, filters, navigation, and ranking logic are unchanged. Free listings have no logos; optional branding continues to have no ranking effect. No photos, icons, mascot, remote font, billing flow, or tracking was added.

## Verification and limits

The Python and Node suites total 29 passing tests. The generated brand assets match the token source, and the static build passes. Color checks cover all three concepts' text/action/focus/control roles; these are not a complete WCAG audit.

The prior app pass checked search, city filtering, menu opening, Back/Forward, deep-link reload, keyboard Enter, free-row logos, and 320px/390px overflow in Chrome. Simulated location denial and built-artifact subpath deep links also passed. These functional checks predate this compact-header refinement; the current turn additionally checked the compact header at 320px/390px, search, menu opening, browser Back, free-row logo behavior, and the comparison board. Details are in QA.md.

The previous turn's browser screenshot calls timed out, and desktop capture was stopped because the tool could not confirm Chrome's active URL. A before-refinement source snapshot is preserved locally at `.browser-fixtures/brand-before/` for reproducible before/after review. It is ignored and excluded from deployment. Screenshot evidence, actual 200% browser zoom, physical-device checks, and screen-reader checks remain pending unless explicitly recorded as completed in QA.md. No screenshot or participant result is fabricated.

The exploratory 15-person protocol and blank worksheet are in TEST_PLAN.md. No participants have been recruited, no results have been collected, no identity is declared proven, and no trademark clearance is claimed.

## Follow-up spacing and hosting direction

The user requested a tighter gap between the and MENU. The shared gap is now 2px instead of 6px, and generated SVG/concept label positions move 4px closer consistently. The standard t remains unchanged. The destination is now an existing Trinity Research /themenu/ component in a feature branch/draft PR; this supersedes the earlier separate-repository decision.
