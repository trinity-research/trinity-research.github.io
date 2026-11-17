# Trinity Research /themenu integration

The user’s updated destination is trinity-research/trinity-research.github.io at https://trinity-research.com/themenu/. This supersedes the earlier separate-repository plan.

Editable source is packaged at themenu/source/, and its generated static files are committed at themenu/. The existing repository documents GitHub Pages publication from main/root. A feature branch and draft PR let code review continue before changing main. Merging into the publishing branch can publish the new component; that is a separate review step.

The component adds its own validation workflow and correction issue template. Existing homepage, CNAME, styles/scripts, datasets, robots/sitemap, HNTED pages, and existing workflows remain outside its scope. There is no new standalone Pages deployment workflow at repository root. The previous standalone recipe is retained only as a reference document.

Run the checks in the component README, then run `python scripts/export_trinity.py --target ..` from themenu/source to rebuild the committed component. Commit source and generated files together. CI checks their fingerprints and uploads a reviewable static ZIP without deploying it.

The planned public URL and correction issue URL are configured; indexable=false keeps the pilot noindex and omits its sitemap until launch review. The component’s robots file is not the origin-level policy. Do not replace the existing root robots.txt or sitemap.xml as part of component builds.

For rollback, revert the component change through a reviewed PR and let the existing Pages publication path handle the approved main-branch result. Do not force-push or change DNS to roll back this feature.
