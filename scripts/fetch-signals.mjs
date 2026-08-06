// Step 1 of the daily signals pipeline.
//
// Polls every feed in scripts/sources.json, drops anything already published or
// older than maxAgeDays, and writes the survivors to data/inbox.json for the
// /daily-signals skill to write takes on.
//
// A dead feed is logged and skipped - one bad source never fails the run.
// Node built-ins only.

import { readFileSync, writeFileSync, existsSync, appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { fetchFeed, parseFeed, isoDay } from "./feedlib.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(readFileSync(join(root, "scripts/sources.json"), "utf8"));

const signalsPath = join(root, "data/signals.json");
const published = existsSync(signalsPath) ? JSON.parse(readFileSync(signalsPath, "utf8")) : [];

// Items Claude judged off-topic. Without this the same rejected articles come
// back every run for the whole maxAgeDays window and get re-read and
// re-rejected, burning a generation each time.
const skippedPath = join(root, "data/skipped.json");
const skipped = existsSync(skippedPath) ? JSON.parse(readFileSync(skippedPath, "utf8")) : [];

// Normalize so a trailing slash or utm tag can't sneak a duplicate through.
const canonical = (url) => {
  try {
    const u = new URL(url);
    u.hash = "";
    u.search = "";
    return (u.origin + u.pathname).replace(/\/+$/, "").toLowerCase();
  } catch {
    return String(url).toLowerCase();
  }
};

const seen = new Set([
  ...published.map((entry) => canonical(entry.url)),
  ...skipped.map((entry) => canonical(entry.url))
]);
const cutoff = Date.now() - config.maxAgeDays * 86400000;

const collected = [];
for (const source of config.sources) {
  try {
    const xml = await fetchFeed(source.url);
    const items = parseFeed(xml);
    let kept = 0;
    for (const item of items) {
      if (!item.date || item.date.getTime() < cutoff) continue;
      const key = canonical(item.link);
      if (seen.has(key)) continue;
      seen.add(key);
      collected.push({
        title: item.title,
        url: item.link,
        source: source.name,
        published: isoDay(item.date),
        priority: source.priority ?? 3,
        sortKey: item.date.getTime(),
        summary: item.summary.slice(0, 500)
      });
      kept++;
    }
    console.log(`  ${source.name}: ${items.length} items, ${kept} new and in window`);
  } catch (err) {
    console.log(`  ${source.name}: SKIPPED (${err.message})`);
  }
}

// Priority first, then recency. The Power Platform feeds publish far less often
// than the general tech blogs, so sorting on date alone crowds out exactly the
// niche this feed is meant to own.
collected.sort((a, b) => a.priority - b.priority || b.sortKey - a.sortKey);

// Two caps, both before the global one:
//
//   maxPerSource     - stops one prolific blog taking the whole day.
//   maxPerPriority   - stops the broad feeds filling every slot on a quiet
//                      day. The Power Platform sources publish weekly; the
//                      general tech and AI feeds publish hourly. Without this
//                      cap a slow week silently turns a business-automation
//                      feed into a general AI news feed. Better to publish
//                      three on-topic items than six off-topic ones.
const perSource = new Map();
const perPriority = new Map();
const selected = collected
  .filter((item) => {
    const usedSource = perSource.get(item.source) ?? 0;
    if (usedSource >= config.maxPerSource) return false;

    const cap = config.maxPerPriority?.[String(item.priority)] ?? config.maxItemsPerRun;
    const usedPriority = perPriority.get(item.priority) ?? 0;
    if (usedPriority >= cap) return false;

    perSource.set(item.source, usedSource + 1);
    perPriority.set(item.priority, usedPriority + 1);
    return true;
  })
  .slice(0, config.maxItemsPerRun)
  .sort((a, b) => b.sortKey - a.sortKey)
  .map(({ sortKey, priority, ...rest }) => rest);

writeFileSync(join(root, "data/inbox.json"), JSON.stringify(selected, null, 2) + "\n");

console.log(`\n${selected.length} item(s) written to data/inbox.json`);
for (const item of selected) console.log(`  - [${item.source}] ${item.title}`);

// Let the workflow skip the Claude step entirely on an empty day.
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `has_new=${selected.length > 0}\n`);
  appendFileSync(process.env.GITHUB_OUTPUT, `count=${selected.length}\n`);
}
