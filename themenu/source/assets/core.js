export function normalize(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('en-US').trim();
}
export function safeHttps(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null; }
  catch { return null; }
}
export function haversineMiles(a, b) {
  const radians = Math.PI / 180;
  const h = Math.sin((b.latitude - a.latitude) * radians / 2) ** 2 +
    Math.cos(a.latitude * radians) * Math.cos(b.latitude * radians) *
    Math.sin((b.longitude - a.longitude) * radians / 2) ** 2;
  return 3958.7613 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}
export function menuState(menu, staleAfterDays = 30, today = new Date()) {
  if (!menu || menu.status === 'missing' || !menu.categories?.length) return 'missing';
  if (menu.status !== 'verified') return menu.status;
  const verified = Date.parse(`${menu.last_verified}T00:00:00Z`);
  const day = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return !Number.isFinite(verified) || verified > day || (day - verified) / 86400000 > staleAfterDays ? 'needs_review' : 'verified';
}
export function selectRestaurants(records, { query = '', cuisine = 'All', city = 'all', position = null } = {}) {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  return records.filter(r => (cuisine === 'All' || r.cuisine === cuisine) && (city === 'all' || r.address.city === city))
    .filter(r => {
      const text = normalize([r.name, r.cuisine, r.address.city, ...r.menu.categories.flatMap(c => [c.name, ...c.items.flatMap(i => [i.name, i.description])])].join(' '));
      return words.every(word => text.includes(word));
    }).map(restaurant => ({ restaurant, distance: position && restaurant.coordinates?.accuracy === 'verified' ? haversineMiles(position, restaurant.coordinates) : null }))
    .sort((a, b) => {
      if (a.distance !== null && b.distance !== null) return a.distance - b.distance || a.restaurant.name.localeCompare(b.restaurant.name);
      if (a.distance !== null) return -1;
      if (b.distance !== null) return 1;
      return a.restaurant.name.localeCompare(b.restaurant.name, 'en', { sensitivity: 'base' });
    });
}
export function menuIdFromHash(hash) {
  if (!hash.startsWith('#menu/')) return null;
  try { return decodeURIComponent(hash.slice(6)); } catch { return null; }
}
export function parseDirectory(data, { allowDemo = false } = {}) {
  if (!data || data.version !== 2 || !Array.isArray(data.restaurants) || typeof data.region !== 'string') throw new Error('Unsupported directory format');
  if (data.demo === true && !allowDemo) throw new Error('Demo data cannot be used as the public directory');
  const ids = new Set();
  for (const r of data.restaurants) {
    if (!r || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(r.id) || ids.has(r.id) || !r.name || !r.cuisine ||
        !r.address?.city || !Array.isArray(r.menu?.categories) || !r.branding || !['free', 'branded'].includes(r.branding.tier)) throw new Error('Invalid restaurant record');
    ids.add(r.id);
    for (const category of r.menu.categories) {
      if (!category.name || !Array.isArray(category.items) || category.items.some(i => !i.name || (i.price !== null && (typeof i.price !== 'number' || !Number.isFinite(i.price) || i.price < 0)))) throw new Error('Invalid menu record');
    }
  }
  return data.restaurants;
}
