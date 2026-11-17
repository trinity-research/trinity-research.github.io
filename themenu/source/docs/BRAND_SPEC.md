# theMenu — Brand system v0.1 (provisional)

Confirmed by the user's pasted brief on November 17, 2026. See [implementation decisions](brand/DECISIONS.md), [comparison materials](brand/index.html), and [exploratory test plan](brand/TEST_PLAN.md). The user separately chose a new theMenu repository; references below to the pilot path do not authorize changes to Trinity Research.

**Status:** working hypothesis for implementation and testing, **not** a finalized identity or trademark clearance. This file is the source of truth for the brand sprint, and Codex should keep its values centralized rather than scattering them through markup.

## North star

**Bold brand. Invisible interface. Just the menu.**

Product tagline: **Just the menu. Nothing else.**
Supporting promise: **No sign-ups. No carts. No nonsense.** Only promise a specific number of taps/clicks after measuring the actual shipped flow across location permission, search and menu availability states.

Brand adjectives: direct, fast, accessible, practical, trustworthy, distinctive. Avoid trendy food-delivery tropes, busy restaurant images, heavy shadows, intrusive ads, account prompts, and checkout metaphors.

## Wordmark exploration

- Use a small lowercase `the` supporting a visually dominant **`MENU`** in bold, blocky, highly legible sans-serif type.
- Favor clear letterforms, distinctive proportions/spacing and compact silhouettes. Avoid stencil-like gaps or novelty shapes that obscure `MENU`.
- Primary baseline: regular lowercase `the` plus large bold `MENU`.
- **Experimental alternate**: reversed/mirrored lowercase `t` in `the` (only if it remains easy to read). Keep it as a separate test asset; do not ship as the default until tested against the normal letter.
- Do not use the reversed character in the accessible name, HTML title, metadata, copy, alt text, or search keywords: the name is always `theMenu`.
- Logo stays legible in grayscale and at small mobile header sizes; supply SVG plus fallback plain text, with appropriate accessible labeling.
- No unnecessary icon or mascot for the MVP; consider a favicon only after the direction is validated.
- Do not claim this wordmark is custom-licensed or legally cleared until rights and trademark checks are complete.

## Working direction: Utility / Cobalt (Option A)

Color tokens (initial candidates, not universally approved contrast pairings):

| Token | Hex | Usage |
|---|---|---|
| Ink | `#141414` | Primary text and wordmark |
| Cobalt | `#275DFF` | Brand accent, deliberate interactive emphasis |
| White | `#FFFFFF` | Main surfaces |
| Muted surface | `#F5F6F8` | Subtle controls and separators |

Use mainly white and ink; cobalt should be a memorable accent, not fill the page. Verify all foreground/background combinations using actual contrast calculations before deploying. Aim for WCAG 2.2 AA: minimum 4.5:1 for normal body text, 3:1 for large text and essential non-text controls. Do not assume cobalt on white meets every use. Add visible focus indicators, reduced-motion support and test zoom.

Alternative sprint directions to test, **not** simultaneous product themes:

- **Signal / Yellow:** `#101010`, `#F4D43B`, `#FFFFFF`; compare distinctiveness and contrast.
- **Human / Teal:** `#16242A`, `#007D87`, `#FFFFFF`; compare approachability and recognition.

## Website application

- Restaurant list remains the default. No splash/hero screen, logo animation or branded interruption between a tap and a menu.
- Wordmark appears modestly in the site header; restaurant names and menus remain the dominant content.
- Free listings: plain-text restaurant name, cuisine, menu and location information, **no restaurant logo**.
- Future paid branding (e.g. optional branded listing and logo) must be clearly differentiated but cannot change organic distance ordering or free menu access. Billing is out of scope for MVP.
- Avoid large branding images, layout shifts, decorative fonts in food lists, and complex transitions.
- Centralize colors, spacing, font stacks, logo SVG and brand configuration. Prefer system font fallback and do not require a paid webfont.
- Keep variant styling switchable without rewriting content/behavior. Branding should not control menu data or ranking logic.

## Sprint/testing plan

Treat all proposals as hypotheses until tested with people who were not involved in designing them.

1. Produce three comparable wordmark/color concepts: Utility/Cobalt (default), Signal/Yellow, Human/Teal. Control layout so comparisons are meaningful.
2. For reversed `t`, test an otherwise identical normal-`t` and reversed-`t` version; do not confound with a different color or typeface.
3. Pilot with about 15 participants across ages 18–34, 35–54, 55+ (five per bracket). This is *exploratory*, not representative or statistically conclusive.
4. Show each option for three seconds (counterbalanced order); record unaided brand-name recall, first-impression purpose recognition, legibility at actual mobile sizes, and delayed recall.
5. Record qualitative confusion (especially whether people read `the` with the backwards `t`) and any accessibility failures. Favor a recognizable, legible choice over novelty.
6. Document test materials and results before declaring a winner. Do not claim that one variant is 'proven' without evidence.

## Codex acceptance criteria for this pass

- Document the provisional brand rules here and implement Utility/Cobalt as the default on the `/themenu/` pilot, without changing its core interaction model.
- Wordmark `the` / `MENU` hierarchy is visible but not dominant over the restaurant list.
- Add a toggle/config or reproducible mock assets for testing standard vs. reversed `t`; **default is standard**.
- Style tokens live in one file or config, easy to swap; no business logic depends on the palette.
- Meet accessible contrast and keyboard focus standards for all shipped UI, test at 320px+ widths and 200% zoom.
- Do not change the root Trinity Research site, `CNAME`, existing unrelated pages or workflows.
- Include before/after screenshots and a brief record of brand decisions in the PR.
