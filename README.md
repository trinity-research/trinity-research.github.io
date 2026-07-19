# Project SLSSM-01 Public Site

This folder is a self-contained static public site prototype for GitHub Pages.

It intentionally uses synthetic visualization data. Do not replace the charts with raw Project SLSSM-01 analysis outputs unless the material has been redacted and approved for public release.

The page is intended as a research credibility dossier, not as the final public face of a company.

Use `Project SLSSM-01` as the public codename until naming and trademark clearance are reviewed. Do not reintroduce earlier internal names into the public site without review.

## Files

- `index.html` - public page
- `research-note.html` - public research note
- `sitemap.xml` - search engine sitemap
- `robots.txt` - crawler guidance
- `feed.xml` - RSS feed for updates
- `social-card.svg` - editable source for the social/newsletter preview image
- `social-card.png` - 1200 x 630 raster social preview used by page metadata
- `evidence/checkpoint-summary.csv` - rounded public checkpoint artifact mirrored from the research note
- `configure-release.ps1` - one-time release helper for canonical, social, feed, sitemap, robots, citation, and launch-post URLs
- `assets/` - optimized public profile images
- `styles.css` - layout and visual design
- `site.js` - synthetic atlas, prompt trace, concordance sketch, and evidence charts
- `CNAME` - GitHub Pages custom-domain binding

The Evidence section includes rounded summaries from the private v3 short-context run. Keep those summaries high level. Do not replace them with raw mode tables, raw activations, or model checkpoints.

## Release Configuration

Release URLs are configured for `https://trinity-research.com`, with the
reproducible demo at `https://github.com/trinity-research/pythia-edmd-demo`.
If either URL ever changes, rerun the helper from this folder in one pass:

```powershell
.\configure-release.ps1 -SiteUrl 'https://new-site.example' -DemoRepoUrl 'https://github.com/org/repo'
```

Note the helper replaces its placeholder tokens, so on an already-configured
tree the old URLs must be swapped back to the placeholders first (or edit the
files directly).

The visitor counter was intentionally removed. If analytics are added later, use a
clearly documented privacy-respecting service rather than a local-storage display.

## Recommended Publishing Pattern

Do not make the private research repository public.

Create a separate clean public repository that contains only the contents of this `public_site` folder. Then enable GitHub Pages for that public repository.

## Public-Safety Reminder

The public site should not contain:

- source code for Project SLSSM-01
- Colab notebooks
- checkpoints
- raw logs
- raw activations
- exact model equations
- exact training recipes
- private analysis CSV/JSON files

Public evidence can include:

- rounded checkpoint summaries
- aggregate charts
- qualitative conclusions
- explicit statements about what remains unsolved
