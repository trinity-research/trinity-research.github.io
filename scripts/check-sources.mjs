// Diagnostic: confirms every feed in sources.json resolves and parses.
// Run after editing sources.json. Not part of the daily workflow.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { fetchFeed, parseFeed } from "./feedlib.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(readFileSync(join(root, "scripts/sources.json"), "utf8"));

let bad = 0;
for (const source of config.sources) {
  try {
    const xml = await fetchFeed(source.url);
    const items = parseFeed(xml);
    const newest = items.find((i) => i.date);
    if (items.length === 0) {
      console.log(`FAIL  ${source.name} - resolved but parsed 0 items`);
      bad++;
    } else {
      const age = newest ? Math.round((Date.now() - newest.date) / 86400000) : "?";
      console.log(`ok    ${source.name} - ${items.length} items, newest ${age}d old`);
      console.log(`        "${items[0].title.slice(0, 70)}"`);
    }
  } catch (err) {
    console.log(`FAIL  ${source.name} - ${err.message}`);
    console.log(`        ${source.url}`);
    bad++;
  }
}

console.log(bad === 0 ? "\nAll sources healthy." : `\n${bad} source(s) need attention.`);
process.exit(bad === 0 ? 0 : 1);
