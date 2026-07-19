# Project SLSSM-01 — Public Research Dossier

**Live site: [trinity-research.com](https://trinity-research.com)**

This repository is the source of the public research dossier for Project
SLSSM-01, an independent research effort studying recurrent language models
with observable spectral dynamics. The model's primary sequence mechanism uses
state evolution rather than quadratic self-attention, which is what makes its
internal memory behavior measurable in the first place.

The dossier is a credibility document, not a company homepage or a model
recipe. Its limitations are stated on the page, prominently, as part of the
argument.

## What the dossier contains

- A [research note](https://trinity-research.com/research-note.html) covering
  the research question, evidence from the v3 short-context run, metric
  definitions, a skeptic FAQ, and the disclosure boundary.
- Rounded evidence summaries: training movement, validation probes, EDMD
  concordance, signed phase behavior, and the long-memory limitation that
  motivates the next experiment
  ([evidence/checkpoint-summary.csv](evidence/checkpoint-summary.csv)).
- Interactive visualizations that are **synthetic by design** and labeled as
  such. They illustrate the diagnostic vocabulary (Spectral Atlas, EDMD
  Concordance, Prompt Manifold); they are not raw analysis outputs.

## Check the method yourself

The measurement method has a standalone, reproducible demonstration on public
Pythia-14m training checkpoints: a preregistered protocol, pinned model
commits, shuffled-pairing and persistence controls, and CPU-only runtime of a
few seconds.

**[github.com/trinity-research/pythia-edmd-demo](https://github.com/trinity-research/pythia-edmd-demo)**

The demo validates the measurement method on a public model. It does not
validate this model's claims; the dossier is explicit about that distinction.

## What is deliberately not here

Every number in the dossier is author-reported, rounded, from one run, and
externally unreplicated. The site says this before any reader has to ask.
This repository and the site intentionally exclude model weights and
checkpoints, training code and recipes, exact architecture equations, raw
activations, and raw mode tables.

## Repository notes

This is a pure static site with no build step: clone and open `index.html`
to preview locally. `configure-release.ps1` rewrites every canonical,
social-card, feed, sitemap, and citation URL in one pass if the domain ever
changes; the tree is currently configured for `https://trinity-research.com`.

Maintained by Freddie Hunt and Joshua Hunt, PhD.
