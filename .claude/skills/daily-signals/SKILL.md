---
name: daily-signals
description: Write short original takes on the items in data/inbox.json and append them to data/signals.json. Used by the daily signals GitHub Actions workflow; also runnable locally to preview a day's output before it publishes.
allowed-tools: Read, Edit, Write, WebFetch
---

# Daily signals

You are writing the day's entries for the Signals feed on trinity-research.com —
short notes on business automation and applied AI for people who build and run
this software.

## What to do

1. Read `data/inbox.json`. It holds newly-published items, each with `title`,
   `url`, `source`, `published`, and a `summary` pulled from the feed.
2. Read `data/signals.json`. It is a JSON array of already-published entries,
   newest first.
3. For each inbox item, write a take (see below), then prepend a new object to
   the array in `data/signals.json`:

```json
{
  "date": "YYYY-MM-DD",
  "title": "The item's title, lightly cleaned up if the feed mangled it",
  "url": "The item's URL, unchanged",
  "source": "The item's source, unchanged",
  "take": "Your 2-3 sentence take."
}
```

Use the item's `published` value as `date`. Keep the array newest-first.

4. For every inbox item you **skip**, append an object to the array in
   `data/skipped.json` so it is never fetched again:

```json
{ "url": "The item's URL", "date": "YYYY-MM-DD", "reason": "Why, in a few words" }
```

   This matters. Anything you leave out of both files comes back tomorrow and
   every day until it ages out, and you will read and reject it again each time.
   Every inbox item must end up in exactly one of the two files.

5. Stop there. Edit **no other file**. In particular do not touch `signals.html`,
   `index.html`, `feed.xml`, or `sitemap.xml` — `scripts/render-signals.mjs`
   generates all four from `data/signals.json` after you finish, and hand-edits
   would be overwritten anyway.

If `data/inbox.json` is empty or missing, change nothing and say so.

## Writing the take

Two to three sentences. Say **what actually changed** and **whether it matters**
to someone running business automation or shipping applied AI.

The voice of this site is plain, declarative, and specific. It earns trust by
being narrow and by naming limits before a reader has to ask. Match it:

- Lead with the concrete change, not with why it's exciting.
- Say plainly when something is minor, incremental, or a rename. Most releases
  are. A feed where everything is significant is worth nothing.
- Prefer "Power Automate adds X" to "Microsoft is revolutionizing Y."
- No hype words: revolutionary, game-changing, must-know, unlock, supercharge,
  seamless, empower.
- No exclamation marks. No rhetorical questions. No "stay tuned."
- Second and third sentences should carry the practical consequence: what a
  builder would now do differently, or explicitly that they would not.

## Accuracy rules — these matter most

- **Only state what the source supports.** The `summary` field is often
  truncated. If it does not tell you enough to write something true, use
  WebFetch on the item's URL to read the actual page.
- **If it still isn't clear, write a shorter, vaguer, accurate take.** Never
  invent version numbers, dates, pricing, licence tiers, feature names, or
  availability. A dull true sentence beats a sharp invented one.
- **Preview vs GA is load-bearing** — do not describe something as generally
  available when the source says preview, and say which it is when you know.
- Do not editorialise about companies or predict what they will do next.
- Skip an inbox item entirely if it is off-topic. Skipping is correct and
  expected — record it in `data/skipped.json` as described above. Skip:
  - anything with no connection to business automation, the Microsoft stack,
    or tooling a builder would actually use;
  - general AI industry news — funding, model releases, safety incidents,
    benchmark results, adoption or seat-count milestones. This feed is about
    what changed in tools people operate, not about the AI industry;
  - pure marketing, momentum PR, and roundups with no product substance;
  - listicles and affiliate-shaped "best X tools" posts;
  - event announcements and generic explainers that teach nothing new.

  When in doubt, skip. A short on-topic post is worth more than a long one
  padded with drift, and the page promises Power Platform, Microsoft 365, and
  applied AI tooling specifically.

## Before you finish

Confirm that `data/signals.json` still parses as valid JSON and that every new
entry has all five fields filled in. The render script validates this and will
fail the build on a malformed entry, so it is cheaper to check now.
