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
reference copy — deliberately not under `.github/workflows/`, both because it
needs the Claude GitHub App (not installed) and because pushing into that
directory requires the `workflow` OAuth scope the gh token here does not carry.
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
