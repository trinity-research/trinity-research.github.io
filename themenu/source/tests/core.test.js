import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalize, safeHttps, haversineMiles, menuState, selectRestaurants, menuIdFromHash, parseDirectory } from '../assets/core.js';
const data = JSON.parse(readFileSync(new URL('../data/demo.json', import.meta.url)));
const records = parseDirectory(data, { allowDemo: true });

test('canonical directory is valid and does not contain fixtures', () => {
  const publicData = JSON.parse(readFileSync(new URL('../data/restaurants.json', import.meta.url)));
  assert.equal(publicData.demo, undefined);
  const realRecords = parseDirectory(publicData);
  assert.equal(realRecords.length, publicData.restaurants.length);
  assert.ok(realRecords.every(r => !r.id.startsWith('demo-') && !r.name.includes('(Fictional)')));
  assert.throws(() => parseDirectory(data), /Demo/);
});
test('search ignores accents and case, including dish descriptions', () => {
  assert.equal(normalize(' CAFÉ '), 'cafe');
  assert.equal(selectRestaurants(records, { query: 'CAFE' })[0].restaurant.id, 'demo-cobalt-cafe');
  assert.equal(selectRestaurants(records, { query: 'pepper jelly' })[0].restaurant.id, 'demo-bayou-table');
});
test('cuisine and city filters combine with search', () => {
  assert.equal(selectRestaurants(records, { cuisine: 'Cajun', city: 'Shreveport' }).length, 0);
  assert.equal(selectRestaurants(records, { cuisine: 'Cajun', city: 'Bossier City' }).length, 1);
  assert.equal(selectRestaurants(records, { query: 'nonexistent' }).length, 0);
});
test('default order is alphabetical and unaffected by branding or availability', () => {
  const original = selectRestaurants(records).map(r => r.restaurant.id);
  const changed = structuredClone(records).map(r => ({ ...r, branding: { tier: r.branding.tier === 'branded' ? 'free' : 'branded', logo: null } }));
  assert.deepEqual(selectRestaurants(changed).map(r => r.restaurant.id), original);
  assert.deepEqual(original, ['demo-bayou-table', 'demo-cobalt-cafe', 'demo-north-market']);
});
test('Haversine handles identical locations and known city distance', () => {
  assert.equal(haversineMiles({ latitude: 32, longitude: -93 }, { latitude: 32, longitude: -93 }), 0);
  const miles = haversineMiles({ latitude: 40.7128, longitude: -74.006 }, { latitude: 34.0522, longitude: -118.2437 });
  assert.ok(miles > 2440 && miles < 2450);
});
test('only verified coordinates can affect distance ranking', () => {
  const samples = structuredClone(records);
  samples[0].coordinates = { latitude: 32, longitude: -93, accuracy: 'approximate' };
  samples[1].coordinates = { latitude: 32, longitude: -93, accuracy: 'verified' };
  const sorted = selectRestaurants(samples, { position: { latitude: 32, longitude: -93 } });
  assert.equal(sorted[0].restaurant.id, 'demo-cobalt-cafe');
  assert.equal(sorted[0].distance, 0);
  assert.equal(sorted.find(r => r.restaurant.id === 'demo-bayou-table').distance, null);
  assert.equal(selectRestaurants(samples)[0].restaurant.id, 'demo-bayou-table');
});
test('branding never influences distance order', () => {
  const samples = structuredClone(records);
  samples[0].coordinates = { latitude: 32, longitude: -93, accuracy: 'verified' };
  samples[1].coordinates = { latitude: 33, longitude: -93, accuracy: 'verified' };
  samples[1].branding.tier = 'branded';
  assert.equal(selectRestaurants(samples, { position: { latitude: 32, longitude: -93 } })[0].restaurant.id, 'demo-bayou-table');
});
test('freshness boundary is configurable and explicit statuses are retained', () => {
  const menu = records[0].menu;
  assert.equal(menuState(menu, 30, new Date('2026-12-17')), 'verified');
  assert.equal(menuState(menu, 30, new Date('2026-12-18')), 'needs_review');
  assert.equal(menuState(menu, 7, new Date('2026-11-25')), 'needs_review');
  assert.equal(menuState({ ...menu, status: 'outdated' }, 30, new Date('2026-11-17')), 'outdated');
  assert.equal(menuState({ ...menu, last_verified: '2027-01-01' }, 30, new Date('2026-11-17')), 'needs_review');
  assert.equal(menuState(records[2].menu), 'missing');
});
test('deep link decoding is safe for malformed and missing IDs', () => {
  assert.equal(menuIdFromHash('#menu/demo-bayou-table'), 'demo-bayou-table');
  assert.equal(menuIdFromHash('#menu/%E0%A4%A'), null);
  assert.equal(menuIdFromHash('#menu/a%2Fb'), 'a/b');
  assert.equal(menuIdFromHash('#other'), null);
});
test('only HTTPS links without credentials are allowed', () => {
  for (const value of ['javascript:alert(1)', 'http://example.com', '//example.com', 'https://user:secret@example.com', '/relative']) assert.equal(safeHttps(value), null);
  assert.equal(safeHttps('https://example.com/menu'), 'https://example.com/menu');
});
test('runtime parser rejects bad records and duplicate IDs', () => {
  assert.throws(() => parseDirectory({ ...data, version: 1 }, { allowDemo: true }));
  assert.throws(() => parseDirectory({ ...data, restaurants: [records[0], records[0]] }, { allowDemo: true }));
  const invalid = structuredClone(data); invalid.restaurants[0].menu.categories[0].items[0].price = -1;
  assert.throws(() => parseDirectory(invalid, { allowDemo: true }));
});
test('untrusted text is rendered through textContent; no HTML interpolation or tracking storage', () => {
  const source = readFileSync(new URL('../assets/app.js', import.meta.url), 'utf8');
  assert.ok(source.includes('element.textContent = text'));
  for (const unsafe of ['innerHTML', 'insertAdjacentHTML', 'localStorage', 'sessionStorage', 'eval(']) assert.equal(source.includes(unsafe), false);
});
function luminance(hex) {
  const rgb = hex.match(/[a-f0-9]{2}/gi).map(v => parseInt(v, 16) / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
}
function contrast(a, b) { const values = [luminance(a), luminance(b)].sort((x, y) => y - x); return (values[0] + .05) / (values[1] + .05); }
const brand = JSON.parse(readFileSync(new URL('../brand/tokens.json', import.meta.url)));
test('all concept text, action, focus, and control colors meet their contrast roles', () => {
  for (const palette of Object.values(brand.palettes)) {
    const colors = { ...brand.shared, ...palette };
    const pairs = [['ink','paper'], ['accent','paper'], ['action-ink','action-bg'], ['muted','paper'], ['muted','surface'], ['warning','warning-bg']];
    for (const [fg, bg] of pairs) assert.ok(contrast(colors[fg], colors[bg]) >= 4.5, `${palette.label}: ${fg}/${bg}`);
    for (const [fg, bg] of [['focus','paper'], ['focus','surface'], ['control','paper'], ['action-border','paper']]) assert.ok(contrast(colors[fg], colors[bg]) >= 3, `${palette.label}: ${fg}/${bg}`);
  }
  // Signal yellow is a fill with ink text, never small text or a focus ring on white.
  assert.ok(contrast(brand.palettes.signal.signal, brand.palettes.signal.paper) < 3);
});
test('production branding uses the standard mark and isolates reversed-t assets from the app', () => {
  assert.equal(brand.default_palette, 'utility');
  assert.equal(brand.default_wordmark, 'standard');
  const standard = readFileSync(new URL('../assets/wordmark.svg', import.meta.url), 'utf8');
  const reversed = readFileSync(new URL('../docs/brand/assets/utility-reversed-t.svg', import.meta.url), 'utf8');
  assert.ok(!standard.includes('scale(-1'));
  assert.ok(reversed.includes('scale(-1 1)'));
  assert.equal(standard, reversed.replace(' transform="translate(8 0) scale(-1 1)"', ''));
  assert.ok(standard.includes('<title id="brand-name">theMenu</title>'));
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(!html.includes('reversed-t'));
  assert.ok(html.includes('aria-label="theMenu home"'));
});
