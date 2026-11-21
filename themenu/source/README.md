# theMenu

Just the menu. Nothing else.

A local-first implementation of a static restaurant menu directory for Shreveport–Bossier City. The current destination is **trinity-research/trinity-research.github.io under /themenu/**, following the user’s updated direction on November 17, 2026. Development is staged in a feature branch/draft PR before any merge or publication. This supersedes the earlier separate-repository plan.

## Preview

Requires Python 3.12+ and Node 22+ for checks; the website has no JavaScript package dependencies or build framework.

```powershell
python -m pip install -r requirements-dev.txt
python scripts/build.py
python -m http.server 8765 --bind 127.0.0.1 --directory dist
```

Open `http://127.0.0.1:8765/`. The draft directory contains four real locations. Superior Grill and Flying Heart have official-source excerpts marked needs review; Chick-fil-A and McDonald's remain menu unavailable because local menus/prices were not confirmed. These are newly checked sources, not migrated prototype prices. Use `http://127.0.0.1:8765/?demo=1` for three explicitly fictional test restaurants. Demo records are never loaded by the default route.

If the existing server is serving the repository root, open `/dist/` instead. Use the built artifact for menu URLs and agent discovery; generated pages do not exist in the authoring shell. Brand review materials remain under the source `docs/brand/` directory and are excluded from the artifact.

## Checks and static artifact

```powershell
python scripts/validate_data.py
python scripts/review_import.py
python scripts/validate_data.py data/demo.json --demo
python -m unittest discover -s tests -p "test_*.py" -v
node --test tests/core.test.js
python scripts/build.py
```

`dist/` contains only deployable website files. The build excludes legacy HTML, handoff documents, schemas, tests, and repository metadata. `assets/config.js` centralizes the base path, data URLs, freshness threshold, and approved correction destination. All website resources resolve relative to the site root, so the same artifact works at `/` or a GitHub Pages project path.

## Included

- Utility/Cobalt provisional identity, with normal lowercase `the` and heavy `MENU`.
- Reproducible three-color brand comparisons and an isolated reversed-t test asset under `docs/brand/`.
- Accent-insensitive restaurant/dish search, cuisine and city filters, menu deep links and browser history.
- Opt-in, tab-memory-only location; Haversine ranking uses verified coordinates only. Branding does not affect sort order.
- Structured menu snapshots, excerpts, unknown prices, choices, source/reviewer/date labels, and automatic needs-review labeling after 30 days.
- Visible price/menu-change notices, with update limitations and a reminder to confirm current details with the restaurant; see [notice wording](docs/MENU_NOTICE.md).
- Optional licensed photos and branded logos, with schema and permission metadata checks.
- JSON Schema plus publication validation, Python/Node tests, CI, and a manually triggered Pages workflow.
- Crawlable HTML menu URLs, Schema.org menu data, JSON/Markdown exports, a versioned discovery index, and an optional llms.txt guide; see [discovery documentation](docs/DISCOVERY.md).
- A correction preparation page with honest unsent status and a configured GitHub issue destination.

## Next inputs

1. Review the supplied brand brief implementation at `http://127.0.0.1:8765/docs/brand/`. It includes three comparable concepts, the isolated t experiment, and a prepared participant-testing plan; no participant results are claimed.
2. Review the /themenu/ component draft in the existing Trinity Research repository. The planned URL and correction destination are configured. indexable=false keeps the pilot noindex until launch review; the feature branch does not change the published main branch.
3. Review the first real import in [the batch notes](docs/imports/2026-11-20.md) and [item/price diff](docs/imports/2026-11-20-diff.md), then add more restaurants after source/price verification. Public factual transcriptions do not require owner opt-in; protected text and media use their own documented basis. No original pilot prices, coordinates, or claimed verification dates were migrated.

See [handoff audit](docs/HANDOFF_AUDIT.md), [data guide](docs/DATA_GUIDE.md), [deployment and rollback](docs/DEPLOYMENT.md), [verification record](docs/QA.md), and [brand brief](docs/BRAND_SPEC.md).

Brand tokens live in `brand/tokens.json`. After editing them, run `python scripts/build_brand.py`, then run the normal tests/build. `python scripts/build_brand.py --check` verifies generated CSS/SVGs without changing them. The alternative palettes and mirrored t stay in review materials; the directory has no theme toggle.

Price-disclosure copy lives in `content/menu-notice.json`. After editing it, run `python scripts/build_menu_notice.py`; all generated menu formats use the same copy. Rebuild after any source or config change.

The Trinity package contains generated files in themenu/ and editable files in themenu/source/. See [integration instructions](integration/COMPONENT_README.md) when using the exported component and [ingestion plan](docs/INGESTION_PLAN.md) for factual-source imports.
