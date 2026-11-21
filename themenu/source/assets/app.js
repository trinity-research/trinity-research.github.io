import { CONFIG } from './config.js';
import { MENU_NOTICE } from './menu-notice.js';
import { menuState, selectRestaurants, menuIdFromHash, parseDirectory, safeHttps } from './core.js';
const $ = id => document.getElementById(id);
const demo = new URLSearchParams(location.search).get('demo') === '1';
const base = new URL(CONFIG.basePath, document.baseURI);
const rootCanonical = document.querySelector('link[rel="canonical"]')?.href || null;
const rootStructuredData = document.getElementById('page-structured-data');
if (demo) {
  let robots = document.querySelector('meta[name="robots"]');
  if (!robots) { robots = node('meta'); robots.name = 'robots'; document.head.append(robots); }
  robots.content = 'noindex,nofollow';
  rootStructuredData?.remove();
}
const state = { records: [], cuisine: 'All', position: null, loaded: false };
$('home-menu-notice').textContent = MENU_NOTICE.short;
const dateText = value => value ? new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`)) : 'Not yet verified';
function node(tag, text, className) { const element = document.createElement(tag); if (text !== undefined) element.textContent = text; if (className) element.className = className; return element; }
function link(text, url, className) { const a = node('a', text, className); a.href = url; return a; }
function externalLink(text, url, className) { const href = safeHttps(url); if (!href) return null; const a = link(text, href, className); a.target = '_blank'; a.rel = 'noopener noreferrer'; return a; }
function correctionLink(id) {
  let url = new URL('corrections.html', base); if (id) url.searchParams.set('restaurant', id);
  if (CONFIG.correctionUrl && safeHttps(CONFIG.correctionUrl)) { url = new URL(CONFIG.correctionUrl); if (id) url.searchParams.set('title', `Menu correction: ${id}`); }
  return link('Suggest a correction', url.href, 'correction-link');
}
function filters() {
  $('filters').replaceChildren();
  for (const cuisine of ['All', ...new Set(state.records.map(r => r.cuisine).sort())]) {
    const button = node('button', cuisine, 'filter'); button.type = 'button'; button.setAttribute('aria-pressed', String(cuisine === state.cuisine));
    button.addEventListener('click', () => { state.cuisine = cuisine; for (const child of $('filters').children) child.setAttribute('aria-pressed', String(child === button)); renderList(); });
    $('filters').append(button);
  }
}
function empty(title, message) { const box = node('div', undefined, 'empty-state'); box.append(node('h3', title), node('p', message)); return box; }
function renderList() {
  const query = $('search').value;
  const rows = selectRestaurants(state.records, { query, cuisine: state.cuisine, city: $('city').value, position: state.position });
  $('clear-search').hidden = !query;
  const count = `${rows.length} restaurant${rows.length === 1 ? '' : 's'}`;
  $('results-count').textContent = count; $('announcer').textContent = `${count} found.`;
  $('sort-label').textContent = state.position ? 'Distance where verified · then A–Z' : 'A–Z · no paid ranking';
  $('restaurants').replaceChildren();
  if (!rows.length) {
    const box = state.records.length ? empty('Nothing on the menu here.', 'Try another restaurant, dish, cuisine, or city.') : empty('The directory is getting ready.', 'We’re checking sources before adding local restaurants. No menu items or prices have been published yet.');
    if (!state.records.length && !demo) { const url = new URL(location.href); url.searchParams.set('demo', '1'); const sample = link('Explore a fictional sample →', url.href, 'text-link'); sample.rel = 'nofollow'; box.append(sample); }
    $('restaurants').append(box);
  }
  for (const { restaurant: r, distance } of rows) {
    const article = node('article', undefined, 'restaurant-row');
    const a = link('', demo ? `#menu/${encodeURIComponent(r.id)}` : new URL(`menus/${encodeURIComponent(r.id)}/`, base).href, 'restaurant-link');
    a.dataset.restaurantId = r.id;
    a.addEventListener('click', event => { if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return; event.preventDefault(); history.pushState({ fromList: true }, '', `#menu/${encodeURIComponent(r.id)}`); renderRoute(true); });
    if (r.branding.tier === 'branded' && r.branding.logo && r.branding.logo.permission_basis && safeHttps(r.branding.logo.source_url)) {
      const image = node('img', undefined, 'restaurant-logo'); const url = r.branding.logo.url.startsWith('assets/') ? new URL(r.branding.logo.url, base).href : safeHttps(r.branding.logo.url);
      if (url) { image.src = url; image.alt = r.branding.logo.alt; image.width = 44; image.height = 44; a.append(image); }
    }
    const info = node('span', undefined, 'restaurant-info'); info.append(node('span', r.name, 'restaurant-name'));
    info.append(node('span', `${r.cuisine} · ${r.address.city}${distance !== null ? ` · ~${distance.toFixed(1)} mi` : ''}`, 'restaurant-meta'));
    const status = menuState(r.menu, CONFIG.staleAfterDays);
    let label = status === 'missing' ? 'Menu unavailable' : r.menu.is_partial ? 'Menu excerpt' : 'Menu';
    if (status === 'needs_review') label += ' · needs review'; if (status === 'outdated') label += ' · outdated';
    info.append(node('span', label, `menu-label${status === 'missing' ? ' unavailable' : ''}`));
    const arrow = node('span', '↗', 'row-arrow'); arrow.setAttribute('aria-hidden', 'true'); a.append(info, arrow); article.append(a); $('restaurants').append(article);
  }
  $('restaurants').setAttribute('aria-busy', 'false');
}
function renderMenu(r) {
  rootStructuredData?.remove();
  const container = $('detail-content'); container.replaceChildren();
  const heading = node('div', undefined, 'menu-heading'); heading.append(node('p', `${r.cuisine.toUpperCase()} / ${r.address.city.toUpperCase()}`, 'eyebrow'));
  const title = node('h1', r.name); title.id = 'restaurant-name'; title.tabIndex = -1; heading.append(title, node('p', [r.address.street, r.address.city, `${r.address.region} ${r.address.postal_code}`].join(', '))); container.append(heading);
  const status = menuState(r.menu, CONFIG.staleAfterDays);
  const provenance = node('div', undefined, `provenance${status !== 'verified' ? ' warning' : ''}`);
  const labels = { verified: r.menu.is_partial ? 'Verified menu excerpt' : 'Verified menu snapshot', needs_review: 'Menu needs review', outdated: 'Outdated menu snapshot', missing: 'Menu unavailable here' };
  provenance.append(node('p', labels[status]));
  provenance.append(node('p', `Last verified: ${dateText(r.menu.last_verified)}${r.menu.reviewer ? ` · Reviewed by ${r.menu.reviewer}` : ''}`));
  if (r.menu.categories.length) provenance.append(node('p', r.menu.is_partial ? 'This is an excerpt, not the full menu. Options or items may be omitted.' : 'A verified snapshot, not a live menu.'));
  if (status === 'needs_review') provenance.append(node('p', 'This menu is awaiting review. Check the original source for current details.'));
  if (r.menu.source) { const source = externalLink(`${r.menu.source.label} ↗`, r.menu.source.url, 'source-link'); if (source) provenance.append(source); }
  else if (r.official_url) { const official = externalLink('Restaurant website ↗', r.official_url, 'source-link'); if (official) provenance.append(official); }
  container.append(provenance);
  const notice = node('aside', undefined, 'menu-notice');
  notice.setAttribute('aria-labelledby', 'menu-notice-title');
  const noticeTitle = node('h2', MENU_NOTICE.title); noticeTitle.id = 'menu-notice-title';
  notice.append(noticeTitle, node('p', MENU_NOTICE.summary));
  const details = node('details'); details.append(node('summary', MENU_NOTICE.detailsTitle));
  for (const paragraph of MENU_NOTICE.details) details.append(node('p', paragraph));
  notice.append(details); container.append(notice);
  if (!r.menu.categories.length) container.append(empty('No verified menu yet.', 'This listing has no published dishes or prices.'));
  if (r.menu.categories.length) {
    const nav = node('nav', undefined, 'category-nav'); nav.setAttribute('aria-label', 'Menu sections');
    r.menu.categories.forEach(category => nav.append(link(category.name, `#category-${category.id}`))); // Scroll without replacing the menu route.
    nav.addEventListener('click', event => { const anchor = event.target.closest('a'); if (!anchor || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return; event.preventDefault(); const section = document.getElementById(anchor.hash.slice(1)); section?.scrollIntoView({ block: 'start' }); section?.querySelector('h2')?.focus({ preventScroll: true }); });
    container.append(nav);
  }
  for (const category of r.menu.categories) {
    const section = node('section', undefined, 'menu-category'); section.id = `category-${category.id}`; const title = node('h2', category.name); title.tabIndex = -1; section.append(title);
    for (const item of category.items) {
      const article = node('article', undefined, 'dish'); const info = node('div', undefined, 'dish-info'); info.append(node('h3', item.name)); if (item.description) info.append(node('p', item.description));
      if (item.choices?.length) { const list = node('ul', undefined, 'choice-list'); for (const choice of item.choices) list.append(node('li', `${choice.name}${choice.price !== null && choice.price_verified_at ? ` · ${money(choice.price, item.currency)}` : ''}`)); info.append(list); }
      if (item.photos?.length) {
        const photos = node('div', undefined, 'photo-list');
        for (const photo of item.photos) { const url = safeHttps(photo.url); if (!url || !photo.permission_basis || !photo.credit) continue; const figure = node('figure'); const image = node('img'); image.src = url; image.alt = photo.alt; image.loading = 'lazy'; image.width = 160; image.height = 120; figure.append(image, node('figcaption', `${photo.credit} · ${photo.license}`)); photos.append(figure); }
        info.append(photos);
      }
      article.append(info); if (item.price !== null && item.price_verified_at && r.menu.source?.content_basis) article.append(node('span', money(item.price, item.currency), 'price')); section.append(article);
    }
    container.append(section);
  }
  container.append(correctionLink(r.id));
  document.title = `${r.name} menu — theMenu${demo ? ' (fictional sample)' : ''}`;
  if (rootCanonical && !demo) document.querySelector('link[rel="canonical"]').href = new URL(`menus/${encodeURIComponent(r.id)}/`, rootCanonical).href;
}
function money(price, currency = 'USD') { return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(price); }
function renderRoute(focus = false) {
  if (!state.loaded) return;
  const id = menuIdFromHash(location.hash); const onMenu = location.hash.startsWith('#menu/');
  $('home').hidden = onMenu; $('detail').hidden = !onMenu;
  if (onMenu) {
    const r = state.records.find(record => record.id === id);
    if (r) renderMenu(r); else { const title = node('h1', 'Menu not found.'); title.id = 'restaurant-name'; title.tabIndex = -1; $('detail-content').replaceChildren(title, node('p', 'This menu link is unavailable. Return to the restaurant list.')); document.title = 'Menu not found — theMenu'; }
    if (focus) { window.scrollTo(0, 0); $('restaurant-name').focus({ preventScroll: true }); }
  } else { document.title = `theMenu — Just the menu. Nothing else.${demo ? ' (fictional sample)' : ''}`; if (rootCanonical) document.querySelector('link[rel="canonical"]').href = rootCanonical; if (rootStructuredData && !demo && !rootStructuredData.isConnected) document.head.append(rootStructuredData); renderList(); if (focus) { const returnId = menuIdFromHash(state.returnHash || ''); const returnRow = [...document.querySelectorAll('.restaurant-link')].find(a => a.dataset.restaurantId === returnId); (returnRow || $('page-title')).focus({ preventScroll: true }); } }
  if (onMenu) state.returnHash = location.hash;
}
$('search').addEventListener('input', renderList);
$('clear-search').addEventListener('click', () => { $('search').value = ''; renderList(); $('search').focus(); });
$('city').addEventListener('change', renderList);
$('back').addEventListener('click', () => { if (history.state?.fromList) history.back(); else { history.replaceState(null, '', location.pathname + location.search); renderRoute(true); } });
window.addEventListener('popstate', () => renderRoute(true)); window.addEventListener('hashchange', () => renderRoute(true));
$('location').addEventListener('click', () => {
  if (state.position) { state.position = null; $('location').textContent = '◎ Use my location'; $('location-status').textContent = 'Location cleared. Showing restaurants A–Z.'; renderList(); return; }
  if (!navigator.geolocation) { $('location-status').textContent = 'Location is unavailable. Choose an area; results stay A–Z.'; return; }
  $('location').disabled = true; $('location-status').textContent = 'Requesting location permission…';
  navigator.geolocation.getCurrentPosition(position => {
    state.position = { latitude: position.coords.latitude, longitude: position.coords.longitude };
    $('location').disabled = false; $('location').textContent = '× Stop using location';
    const hasCoordinates = state.records.some(r => r.coordinates?.accuracy === 'verified');
    $('location-status').textContent = hasCoordinates ? 'Estimated distance for verified restaurant locations; other listings follow A–Z. Your location stays in this tab.' : 'No verified restaurant coordinates yet. Showing A–Z. Your location stays in this tab.';
    renderList();
  }, error => { $('location').disabled = false; state.position = null; $('location-status').textContent = error.code === 1 ? 'Location denied. Choose an area; results stay A–Z.' : 'Location unavailable. Choose an area; results stay A–Z.'; renderList(); }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 0 });
});
async function start() {
  $('demo-banner').hidden = !demo;
  try { const response = await fetch(new URL(demo ? CONFIG.demoDataPath : CONFIG.dataPath, base), { credentials: 'omit' }); if (!response.ok) throw new Error('Directory request failed'); const data = await response.json(); if (demo && data.demo !== true) throw new Error('Expected fictional fixtures'); state.records = parseDirectory(data, { allowDemo: demo }); state.loaded = true; filters(); renderRoute(Boolean(location.hash)); }
  catch { state.loaded = false; $('restaurants').replaceChildren(empty('The directory couldn’t load.', 'Please refresh to try again. The menu data may be temporarily unavailable.')); $('restaurants').setAttribute('aria-busy', 'false'); $('location').disabled = true; $('announcer').textContent = 'The directory could not load.'; }
}
start();
