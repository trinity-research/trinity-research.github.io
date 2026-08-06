// Minimal RSS/Atom parsing and HTML escaping. Node built-ins only - no
// dependencies, no lockfile, no install step. Shared by fetch-signals.mjs,
// render-signals.mjs, and check-sources.mjs.

export function decodeEntities(input) {
  return String(input)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#0?39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&") // must run last
    .trim();
}

export function stripTags(input) {
  return decodeEntities(String(input).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

export function escapeHtml(input) {
  return String(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function firstMatch(block, patterns) {
  for (const re of patterns) {
    const m = block.match(re);
    if (m && m[1] && m[1].trim()) return m[1];
  }
  return "";
}

// Handles both RSS 2.0 <item> and Atom <entry>.
export function parseFeed(xml) {
  const blocks = [...xml.matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/g)].map((m) => m[2]);

  return blocks.map((block) => {
    const title = stripTags(firstMatch(block, [/<title\b[^>]*>([\s\S]*?)<\/title>/i]));

    // Atom puts the URL in an attribute; RSS puts it in the element body.
    let link = firstMatch(block, [
      /<link\b[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i,
      /<link\b(?![^>]*rel=["'](?:self|replies|enclosure|edit)["'])[^>]*href=["']([^"']+)["']/i,
      /<link\b[^>]*>([\s\S]*?)<\/link>/i,
      /<guid\b[^>]*isPermaLink=["']true["'][^>]*>([\s\S]*?)<\/guid>/i
    ]);
    link = decodeEntities(link);

    const rawDate = firstMatch(block, [
      /<pubDate\b[^>]*>([\s\S]*?)<\/pubDate>/i,
      /<published\b[^>]*>([\s\S]*?)<\/published>/i,
      /<updated\b[^>]*>([\s\S]*?)<\/updated>/i,
      /<dc:date\b[^>]*>([\s\S]*?)<\/dc:date>/i
    ]);
    const parsed = rawDate ? new Date(decodeEntities(rawDate)) : null;
    const date = parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;

    const summary = stripTags(
      firstMatch(block, [
        /<description\b[^>]*>([\s\S]*?)<\/description>/i,
        /<summary\b[^>]*>([\s\S]*?)<\/summary>/i,
        /<content\b[^>]*>([\s\S]*?)<\/content>/i
      ])
    );

    return { title, link, date, summary };
  }).filter((item) => item.title && /^https?:\/\//.test(item.link));
}

export async function fetchFeed(url, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        // Some Microsoft properties 403 a bare fetch with no UA.
        "user-agent": "TrinityResearchSignals/1.0 (+https://trinity-research.com/signals.html)",
        accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*"
      }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

export const isoDay = (d) => new Date(d).toISOString().slice(0, 10);

export function rfc822(d) {
  return new Date(d).toUTCString().replace("GMT", "+0000");
}
