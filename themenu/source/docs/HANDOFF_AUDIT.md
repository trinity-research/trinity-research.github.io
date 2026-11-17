> Current update: the user has superseded the initial separate-repository decision with an existing Trinity Research /themenu/ component and clarified facts-first coverage for all restaurant types. The historical audit below describes the earlier baseline. See INGESTION_PLAN.md and the current README.

# Handoff audit — November 17, 2026

The user explicitly chose a separate theMenu repository in this session. This decision supersedes the old README and docs/CODEX_TASK.md instructions to add a subtree to the existing Trinity Research repository. Original instructions remain as historical context. Existing production repositories, domains, and DNS were not accessed or changed.

## Source inventory and disposition

| Handoff material | Finding | Decision |
| --- | --- | --- |
| `reference/theMenu-pilot.html` and duplicate `themenu/index.html` | Ten real-restaurant candidates; two priced menu excerpts; no documented reuse permission or reviewer evidence; two approximate coordinate pairs | Keep as reference only; exclude from build; migrate no restaurant records |
| `data/restaurants.json` | Empty version-1 manifest | Upgrade to empty version-2 canonical directory |
| Two restaurant schemas and synthetic example | Incompatible field names, statuses, coordinates, and provenance requirements | Consolidate v2 snake_case model; update schemas and synthetic example |
| `site/main.js` | Reads sibling data, lacks complete history handling and freshness policy | Keep legacy reference; replace with root-served modular app |
| Pages workflow | Automatic deployment on pushes to main, publishing entire repository | Replace with dispatch-only workflow; publish `dist/` only; add correction-destination gate |
| Brand specification | Utility/Cobalt provisional brief already present | Implement tokens and ordinary lowercase t; additional brand markdown still pending |

## Data migration

No existing menu prices, business addresses, phone numbers, or verification claims were promoted into canonical data. Three fictional records in `data/demo.json` exercise excerpt, needs-review, missing-menu, unknown-price, and optional-branding states. Each name and the visible demo banner identify the content as fictional. Their permission metadata is `synthetic_demo`, which is prohibited in canonical data.

Schema version 2 replaces status/menu field ambiguity with nested `menu.status`, `menu.source`, `menu.last_verified`, stable category/dish/choice IDs, and explicit media credit/permission fields. An absent menu has no source or verification claim. Approximate restaurant coordinates cannot pass schema validation.

## Deliberately unfinished release inputs

- The additional user brand-name markdown was supplied later on November 17, 2026 and applied; see brand/DECISIONS.md for that pass and its remaining visual/participant checks.
- No approved remote owner/repository or correction inbox exists in this workspace.
- Required review and environment protection rules must be configured in the eventual repository; local workflow files cannot enforce repository settings themselves.
- No actual restaurant has been independently verified for publication. Automated checks validate structure and internal consistency, not truth, ownership, licensing, or legal permission.
- No billing, scraping, scheduled source fetching, trademark clearance, or production deployment was performed.
