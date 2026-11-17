# theMenu — Trinity Research pilot

Prepared for `https://trinity-research.com/themenu/`. A feature-branch/draft-PR copy is for review; it is not live until an approved merge publishes the existing Pages branch.

The static website files are in this folder. Editable source, data, schemas, tests, brand assets, and build scripts live in [source/](source/). Unrelated Trinity Research pages, CNAME, root robots/sitemap, and existing workflows are outside this component.

## Refine and rebuild

```sh
cd themenu/source
python -m pip install -r requirements-dev.txt
python -B -m unittest discover -s tests -p "test_*.py"
node --test tests/core.test.js
python scripts/build_brand.py
python scripts/build_menu_notice.py
python scripts/export_trinity.py --target ..
```

Commit both `themenu/source/` and the regenerated component files. `build-manifest.json` lets CI check source/output synchronization and stale-file removal. CI also uploads a static preview ZIP; it does not deploy the main website.

The current draft is noindex and contains no real restaurant records. `?demo=1` opts into visibly fictional samples; those records never enter discovery feeds. Indexability can be enabled in source/site.config.json after launch review.

Menu ingestion supports independently recorded public facts for any restaurant, including fast-food chains. Record real sources, locations, and verification dates; separately licensed descriptions, logos, and photos have their own requirements. See [the ingestion proposal](source/docs/INGESTION_PLAN.md) and [data guide](source/docs/DATA_GUIDE.md).
