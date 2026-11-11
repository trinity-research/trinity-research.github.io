# Trinity Research

**Live site: [trinity-research.com](https://trinity-research.com)**

Source for the Trinity Research site. Trinity Research is Freddie Hunt and
Joshua Hunt, PhD: language model research and optimization, business process
automation, predictive modeling, and data ingestion systems.

## Pages

| Page | What it is |
|---|---|
| `index.html` | Capabilities, selected work, the signals strip, and the team. |
| `slssm-01.html` | The Project SLSSM-01 research dossier — evidence, synthetic visualizations, and the disclosure boundary. |
| `research-note.html` | The long-form research note: metric definitions, skeptic FAQ, limitations, citation blocks. |
| `signals.html` | Generated. Business automation and applied AI, updated on weekdays. |
| `hnted/` | HNTED hunting dashboard: sun/moon timing, both daily lunar windows, and regional whitetail rut context. |
| `hnted/field-notes/` | Four short, source-linked hunting research articles. |
| `hnted/waterfowl/` | Free waterfowl guide: upstream forecasts, dated snow/cold/river observations, and sourced bird reports. |

## HNTED

HNTED is a static, browser-based field-planning project by Trinity Research.
The deer dashboard's weather integration remains deferred. The waterfowl guide
connects saved NWS/ECCC forecasts, NOAA snow analysis and daily station history,
USGS river stages, and dated agency reports. Camera import, accounts, and
automatic article generation are not enabled.
Sun/moon calculations and geographic rut matching run on the visitor's device.
Saved spots and preferences stay in that browser.

Town search uses a bundled GeoNames US town index under CC BY 4.0, with source
and license attribution in the app. It has no geocoding API calls, API key,
ZIP-code lookup, or property-address search. GPS and manual coordinates are
available for locations outside that index.

Edit `data/hnted-articles.json` and rebuild reviewed articles with
`node scripts/build-hnted-notes.mjs --public`. Publication settings live in
`data/hnted-publication.json`. Add new article URLs to `data/hnted-pages.json`;
`node scripts/render-signals.mjs` preserves these entries in the root sitemap.
Hunting articles are separate from the business-automation Signals feed.
The HNTED app requires no server route; only its static files are published.
Its astronomy library license is retained in `hnted/vendor/SUNCALC-LICENSE.txt`.

Waterfowl data can be refreshed with `node scripts/refresh-hnted-waterfowl.mjs`.
The workflow in `.github/workflows/daily-waterfowl.yml` is scheduled at 4:17 AM
America/Chicago, with hourly backup checks at minute 41 UTC and a manual run
available in GitHub Actions. Healthy backup checks skip provider collection. Its source
reference is retained in `docs/daily-waterfowl-workflow.yml`.
It refreshes weather and snow/cold/river snapshots, checks all 18 configured
agency report feeds, and imports six numeric survey series after strict date
and table validation: Loess Bluffs, Iowa, both INHS river inventories, Missouri,
and Tennessee Black Bayou. Other sources receive newer-report notices or
unavailable-check warnings. Hourly backup checks trigger another source sweep
after six hours. Forecast collection has its own three-hour target and refreshes
the other public sources in that same bounded run; GitHub's schedule is approximate. The job validates its data,
commits only generated public records, and explicitly
requests a Pages build, waits for it, and verifies current live data. Normal
pushes retry transient errors without force pushes or overwriting branch changes.
Pages polling checks all recent matching builds, so a failed sibling does not
override a successful or in-progress build of the same commit. Persistent build
failure permits at most two additional rebuild requests within the bounded wait;
actual failures and stale live data still fail the workflow.
Narrative summaries and unsupported numeric formats still require review;
the guide links newer reports without relabeling old observations. Daily
checks do not create daily surveys. Source-check and survey dates stay separate, with older data
retained when a refresh fails and partial coverage labeled when permitted.
No external API keys or local Windows routine are needed for this data job.

The Weather fronts layer decodes NOAA WPC's public coded surface analysis and
short-range forecast bulletins into `hnted/waterfowl/data/fronts.json`. It shows
front/boundary lines and H/L pressure centers at explicit valid times, using the
same map projection and zoom. The selected spot's calendar day filters the
available positions; no missing times or local arrival estimates are invented.
The cloud routine collects fronts alongside weather. Failed sources retain
their saved dates; analyses older than 12 hours are not drawn. The pure decoder
is `scripts/wpc-fronts.mjs`; the collector is
`scripts/update-hnted-waterfowl-fronts.mjs`. The coding guide is
[NOAA's bulletin documentation](https://www.wpc.ncep.noaa.gov/html/read_coded_bull_hr.shtml).
An isolated malformed analysis boundary can be omitted with an explicit
partial-geometry notice. Missing coordinates are never guessed; broader errors
retain the previous source frames. Forecast parsing remains strict.

Run `node scripts/check-hnted-waterfowl-health.mjs --require-fresh --live` to
check saved timestamps, actual forecast coverage, river observation times,
agency-source monitoring, failed jobs, and the published data. Numeric PDF
imports require Poppler's `pdftotext`; the workflow installs it from Ubuntu's
package repository when needed. No PDF-reader executable is committed.
GitHub schedules can be delayed or dropped;
the hourly backup uses the same scheduler. On November 5 the missed daily
update was recovered manually, and a transient GitHub push rejection cleared
on retry. A successful manual run does not prove scheduled triggering.
Local development snapshots update separately. The page checks its published
completion marker every 15 minutes while visible and when returning after at
least five minutes. Check for updates forces a check. New files update in place,
preserving the selected day, city, species, filters, and map/list view. Failed or
inconsistent downloads retain the prior view and show a warning. These requests
fetch shared static files and do not send visitor coordinates. Daily cold-history
cards distinguish NOAA archive observation dates from source-check times; those
records can lag even when today's forecasts and collection job are current.

`slssm-01.html`, `signals.html`, `feed.xml`, and `sitemap.xml` are the only
pages with generated content; everything else is hand-written.

## Project SLSSM-01

The dossier covers an independent research effort studying recurrent language
models with observable spectral dynamics. Its primary sequence mechanism uses
state evolution rather than quadratic self-attention, which is what makes its
internal memory behavior measurable in the first place.

Every number in the dossier is author-reported, rounded, from one run, and
externally unreplicated. The site says this before any reader has to ask. Model
weights and checkpoints, training code and recipes, exact architecture
equations, raw activations, and raw mode tables are deliberately excluded.

The measurement method has a standalone, reproducible demonstration on public
Pythia-14m training checkpoints: a pre-specified protocol with dated post-run
amendments, pinned model commits, shuffled-pairing and persistence controls,
and CPU-only runtime of a few seconds.

**[github.com/trinity-research/pythia-edmd-demo](https://github.com/trinity-research/pythia-edmd-demo)**

The demo validates the measurement method on a public model. It does not
validate this model's claims; the dossier is explicit about that distinction.

## The signals pipeline

```
scripts/fetch-signals.mjs   RSS feeds  ->  data/inbox.json     deterministic
/daily-signals skill        inbox      ->  data/signals.json   Claude writes prose only
                                       ->  data/skipped.json   rejects, so they stay rejected
scripts/render-signals.mjs  signals    ->  signals.html, feed.xml, sitemap.xml,
                                           and the strip in index.html
```

The split is the point: Claude writes takes into JSON and edits nothing else,
so a weak generation costs a weak entry rather than a broken page. The render
script validates every entry and fails rather than publishing a malformed one.

Every inbox item must end up in either `signals.json` or `skipped.json`.
Anything in neither is fetched again tomorrow and re-read every day until it
ages out.

### Scheduling

**This runs locally, not in CI.** A working GitHub Actions version is kept at
[`docs/daily-signals-workflow.yml`](docs/daily-signals-workflow.yml) as a
reference copy — deliberately not under `.github/workflows/` because it
needs the Claude GitHub App (not installed). This separate Signals workflow
has not been enabled by the HNTED data publication.
Activation steps are in the file's header.

```powershell
.\scripts\run-signals.ps1 -DryRun      # everything except commit and push
.\scripts\run-signals.ps1              # the real thing
.\scripts\register-signals-task.ps1 -At 03:30   # weekdays, as you, while logged on
.\scripts\register-signals-task.ps1 -Remove
```

Logs land in `%LOCALAPPDATA%\TrinityResearch\signals-logs` — outside the repo,
so they are never committed or served publicly. They are pruned after 30 days.

The runner refuses to start on a dirty working tree, so nothing of yours gets
swept into an automated commit. It also reverts `inbox.json` and exits cleanly
if Claude judged every item off-topic.

Two things the schedule depends on, both tied to your user session:

- **The gh token lives in the Windows keyring**, protected against your
  profile. The task is therefore registered as *interactive* — as you, while
  logged on. A task set to "run whether user is logged on or not" starts
  without your profile loaded and usually cannot read it, so the push fails.
  To run while logged off, switch the remote to an SSH key first.
- **A powered-off machine does not run.** `-WakeToRun` wakes a sleeping one;
  `StartWhenAvailable` catches a missed run at next logon.

Check on it with `Get-ScheduledTaskInfo -TaskName TrinityResearch-Signals`
(`LastTaskResult` of 0 is success).

### Tuning the feed

Edit `scripts/sources.json` — no code change needed:

- `priority` — `1` is the core niche and always gets slots first. Default `3`.
- `maxPerSource` — stops one prolific blog taking the whole day.
- `maxPerPriority` — ceiling per band. This is what keeps a quiet Power
  Platform week from turning the page into a general AI news feed: on those
  days it publishes three on-topic items instead of six off-topic ones.

After editing, run `node scripts/check-sources.mjs` to confirm every feed still
resolves and parses. Feeds rot; this tells you which one.

### Running the stages by hand

```sh
node scripts/fetch-signals.mjs     # writes data/inbox.json
claude "/daily-signals"            # writes data/signals.json + data/skipped.json
node scripts/render-signals.mjs    # regenerates the pages
```

## Repository notes

Pure static site, no build step and no dependencies: clone and open
`index.html` to preview locally. The scripts use Node built-ins only, so there
is no `package.json`, no lockfile, and nothing to install. Deployed by GitHub
Pages from `main` at the repository root; `CNAME` points at
`trinity-research.com`.

`social-card.png` is a raster export of `social-card.svg` at 1200×630. If you
edit the SVG, re-export the PNG — the OG tags declare those exact dimensions.

Maintained by Freddie Hunt and Joshua Hunt, PhD. Contact:
[contact@trinity-research.com](mailto:contact@trinity-research.com)
