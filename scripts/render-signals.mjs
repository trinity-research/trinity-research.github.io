// Step 3 of the daily signals pipeline - the ONLY script that writes HTML.
//
// Claude writes prose into data/signals.json and touches nothing else, so a bad
// generation can produce weak copy but cannot break the page. This script owns
// the markup.
//
// Regenerates: signals.html, feed.xml, sitemap.xml, and the strip on index.html
// between the <!-- signals:start --> / <!-- signals:end --> markers.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { escapeHtml, rfc822 } from "./feedlib.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://trinity-research.com";
const STRIP_COUNT = 3;
const FEED_COUNT = 20;

const signalsPath = join(root, "data/signals.json");
if (!existsSync(signalsPath)) {
  console.error("data/signals.json not found - nothing to render.");
  process.exit(1);
}

const entries = JSON.parse(readFileSync(signalsPath, "utf8"));

// Validate before writing anything. A malformed entry should fail loudly here
// rather than render a broken page.
const required = ["date", "title", "url", "source", "take"];
const bad = [];
entries.forEach((entry, i) => {
  for (const field of required) {
    if (typeof entry[field] !== "string" || !entry[field].trim()) {
      bad.push(`entry ${i}: missing or empty "${field}"`);
    }
  }
  if (entry.url && !/^https?:\/\//.test(entry.url)) bad.push(`entry ${i}: url is not absolute`);
  if (entry.date && !/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) bad.push(`entry ${i}: date is not YYYY-MM-DD`);
});
if (bad.length) {
  console.error("data/signals.json failed validation:");
  for (const problem of bad) console.error("  " + problem);
  process.exit(1);
}

entries.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

const longDate = (iso) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  });

const itemHtml = (entry) => `        <article class="signal-item">
          <div class="signal-date">${escapeHtml(longDate(entry.date))}</div>
          <div>
            <h3><a href="${escapeHtml(entry.url)}" rel="noopener">${escapeHtml(entry.title)}</a></h3>
            <p>${escapeHtml(entry.take)}</p>
            <span class="signal-source">${escapeHtml(entry.source)}</span>
          </div>
        </article>`;

/* ---------- signals.html ---------- */

const latestDate = entries.length ? entries[0].date : new Date().toISOString().slice(0, 10);

const signalsHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="Short notes on Power Platform releases, Microsoft 365 changes, and applied AI tooling - what changed and whether it matters. Published on weekdays by Trinity Research.">
  <link rel="canonical" href="${SITE}/signals.html">
  <meta name="author" content="Freddie Hunt, Joshua Hunt, PhD">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Trinity Research">
  <meta property="og:title" content="Signals | Trinity Research">
  <meta property="og:description" content="Business automation and applied AI, tracked as it changes. Short notes on what shipped and whether it matters.">
  <meta property="og:url" content="${SITE}/signals.html">
  <meta property="og:image" content="${SITE}/social-card.png">
  <meta property="og:image:type" content="image/png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="Trinity Research social card">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="Signals | Trinity Research">
  <meta name="twitter:description" content="Business automation and applied AI, tracked as it changes.">
  <meta name="twitter:image" content="${SITE}/social-card.png">
  <title>Signals | Trinity Research</title>
  <link rel="icon" href="favicon.svg" type="image/svg+xml">
  <link rel="alternate" type="application/rss+xml" title="Trinity Research Signals" href="${SITE}/feed.xml">
  <link rel="stylesheet" href="styles.css?v=20260805a">
</head>
<body>
  <header class="site-header">
    <a class="brand" href="index.html" aria-label="Trinity Research home">
      <span class="brand-mark">T</span>
      <span>Trinity Research</span>
    </a>
    <nav aria-label="Primary">
      <a href="index.html#capabilities">Capabilities</a>
      <a href="index.html#work">Work</a>
      <a href="slssm-01.html">Research</a>
      <a href="signals.html" class="active" aria-current="page">Signals</a>
      <a href="index.html#contact">Contact</a>
    </nav>
  </header>

  <main id="top">
    <section class="band statement">
      <div class="section-heading">
        <p class="eyebrow">Signals</p>
        <h2>Business automation, tracked as it changes.</h2>
        <p>
          Short notes on Power Platform releases, Microsoft 365 changes, and
          applied AI tooling. Each entry links the source and says what actually
          changed. Where something is minor, it says that too.
        </p>
      </div>

      <div class="signal-strip">
${entries.length ? entries.map(itemHtml).join("\n") : `        <p class="signal-empty">No entries yet.</p>`}
      </div>

      <p class="signal-more">
        <a href="${SITE}/feed.xml">Subscribe by RSS</a> &middot;
        <a href="index.html">Back to Trinity Research</a>
      </p>
    </section>
  </main>

  <footer class="site-footer">
    <div>
      <strong>Trinity Research</strong>
      <span>Applied research, automation, and predictive systems.</span>
    </div>
    <span>Independent research group. <a href="mailto:contact@trinity-research.com">contact@trinity-research.com</a></span>
  </footer>
</body>
</html>
`;

writeFileSync(join(root, "signals.html"), signalsHtml);

/* ---------- feed.xml ---------- */

const feedItems = entries.slice(0, FEED_COUNT).map((entry) => `    <item>
      <title>${escapeHtml(entry.title)}</title>
      <link>${escapeHtml(entry.url)}</link>
      <guid isPermaLink="true">${escapeHtml(entry.url)}</guid>
      <pubDate>${rfc822(entry.date + "T12:00:00Z")}</pubDate>
      <source url="${SITE}/feed.xml">${escapeHtml(entry.source)}</source>
      <description>${escapeHtml(entry.take)}</description>
    </item>`).join("\n");

const feedXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Trinity Research Signals</title>
    <link>${SITE}/signals.html</link>
    <atom:link href="${SITE}/feed.xml" rel="self" type="application/rss+xml"/>
    <description>Business automation and applied AI, tracked as it changes. Short notes from Trinity Research on what shipped and whether it matters.</description>
    <language>en-us</language>
    <lastBuildDate>${rfc822(latestDate + "T12:00:00Z")}</lastBuildDate>
    <item>
      <title>Observable Spectral Dynamics in a Recurrent Sequence Model</title>
      <link>${SITE}/research-note.html</link>
      <guid isPermaLink="true">${SITE}/research-note.html</guid>
      <pubDate>Sun, 28 Jun 2026 00:00:00 +0000</pubDate>
      <description>Research note with rounded evidence from Project SLSSM-01's v3 short-context run, including EDMD concordance, signed phase behavior, prompt manifold observations, and the long-memory limitation.</description>
    </item>
${feedItems}
  </channel>
</rss>
`;

writeFileSync(join(root, "feed.xml"), feedXml);

/* ---------- sitemap.xml ---------- */

const today = new Date().toISOString().slice(0, 10);
const hntedManifest = join(root, "data/hnted-pages.json");
const hntedPages = existsSync(hntedManifest) ? JSON.parse(readFileSync(hntedManifest, "utf8")) : [];
const hntedSitemap = hntedPages.map(page => {
  if (!/^\/hnted\/[a-z0-9/.-]*$/.test(page.path) || !/^\d{4}-\d{2}-\d{2}$/.test(page.modified) || !/^[01](\.\d+)?$/.test(page.priority)) throw new Error("Invalid HNTED sitemap entry");
  return `  <url><loc>${SITE}${escapeHtml(page.path)}</loc><lastmod>${page.modified}</lastmod><changefreq>monthly</changefreq><priority>${page.priority}</priority></url>`;
}).join("\n");
const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${SITE}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${SITE}/signals.html</loc>
    <lastmod>${latestDate}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>${SITE}/slssm-01.html</loc>
    <lastmod>2026-07-10</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>${SITE}/research-note.html</loc>
    <lastmod>2026-07-10</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
${hntedSitemap}
</urlset>
`;

writeFileSync(join(root, "sitemap.xml"), sitemapXml);

/* ---------- index.html strip ---------- */

const indexPath = join(root, "index.html");
const indexHtml = readFileSync(indexPath, "utf8");
const START = "<!-- signals:start -->";
const END = "<!-- signals:end -->";
const start = indexHtml.indexOf(START);
const end = indexHtml.indexOf(END);

if (start === -1 || end === -1 || end < start) {
  console.error(`index.html is missing the ${START} / ${END} markers - strip not updated.`);
  process.exit(1);
}

const strip = entries.length
  ? `      <div class="signal-strip">
${entries.slice(0, STRIP_COUNT).map(itemHtml).join("\n")}
      </div>
      <p class="signal-more"><a href="signals.html">Read all signals</a></p>`
  : `      <div class="signal-strip">
        <p class="signal-empty">The first entries publish once the daily pipeline is live.</p>
      </div>`;

writeFileSync(
  indexPath,
  indexHtml.slice(0, start + START.length) + "\n" + strip + "\n      " + indexHtml.slice(end)
);

console.log(`Rendered ${entries.length} signal(s):`);
console.log("  signals.html, feed.xml, sitemap.xml, index.html strip");
