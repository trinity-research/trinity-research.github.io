import base64
import copy
import hashlib
import json
import shutil
import tempfile
import unittest
from datetime import date
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlsplit
from urllib.robotparser import RobotFileParser
from xml.etree import ElementTree as ET

from jsonschema import Draft202012Validator, FormatChecker
from scripts.discovery import ROOT, effective_status, generate, link_to, public_base_url


class HtmlFacts(HTMLParser):
    def __init__(self, html):
        super().__init__()
        self.links, self.structured, self.csp = [], [], ''
        self.in_structured = False
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if tag in ('a', 'link') and values.get('href'):
            self.links.append(values['href'])
        if tag == 'script' and values.get('type') == 'application/ld+json':
            self.in_structured = True
        if tag == 'meta' and values.get('http-equiv') == 'Content-Security-Policy':
            self.csp = values['content']

    def handle_endtag(self, tag):
        if tag == 'script':
            self.in_structured = False

    def handle_data(self, value):
        if self.in_structured:
            self.structured.append(value)


class DiscoveryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.output = Path(self.temp.name)
        self.data = json.loads((ROOT / 'data/demo.json').read_text(encoding='utf-8'))
        self.data.pop('demo')
        # Synthetic unit-test inputs only. They never replace canonical data.
        for r in self.data['restaurants']:
            r['name'] = r['name'].replace('(Fictional)', '(Test fixture)')
            if r['menu']['source']:
                r['menu']['source']['content_basis'] = 'permission_granted'
                r['menu']['source']['url'] = 'https://restaurant.test/menu'
            if r['branding']['logo']:
                r['branding']['logo']['permission_basis'] = 'permission_granted'
        self.today = date(2026, 11, 17)
        self.base = 'https://menus.test/themenu/'

    def build(self, base='configured'):
        shutil.copy2(ROOT / 'index.html', self.output / 'index.html')
        return generate(self.output, self.data, base=self.base if base == 'configured' else base,
                        today=self.today, built_at='2026-11-17T12:00:00+00:00')

    def read(self, name):
        return (self.output / name).read_text(encoding='utf-8')

    def test_home_is_crawlable_before_javascript_and_has_real_menu_links(self):
        self.build()
        html = self.read('index.html')
        self.assertIn('Bayou Table (Test fixture)', html)
        self.assertIn('menus/demo-bayou-table/', HtmlFacts(html).links)
        self.assertNotIn('Loading the directory', html)
        self.assertIn('read menus without JavaScript', html)

    def test_static_menu_contains_dishes_and_notice_without_executable_js(self):
        self.build()
        html = self.read('menus/demo-bayou-table/index.html')
        self.assertIn('Sweet corn fritters', html)
        self.assertIn('This is an excerpt, not the full menu', html)
        self.assertLess(html.index('Prices &amp; menu availability'), html.index('$8.00'))
        self.assertNotIn('src="../../assets/app.js"', html)
        self.assertIn('../../assets/brand.css', html)

    def test_manifest_validates_and_links_to_all_formats_on_a_project_url(self):
        manifest = self.build()
        schema = json.loads((ROOT / 'data/menu-index.schema.json').read_text(encoding='utf-8'))
        Draft202012Validator(schema, format_checker=FormatChecker()).validate(manifest)
        first = manifest['restaurants'][0]
        for field in ['html_url', 'json_url', 'markdown_url']:
            self.assertTrue(first[field].startswith(self.base + 'menus/'))
        self.assertEqual(manifest['built_at'], '2026-11-17T12:00:00+00:00')
        self.assertEqual(first['last_verified'], '2026-11-17')

    def test_exported_record_preserves_provenance_and_matches_restaurant_schema(self):
        self.build()
        record = json.loads(self.read('menus/demo-bayou-table/menu.json'))
        schema = json.loads((ROOT / 'data/restaurant.schema.json').read_text(encoding='utf-8'))
        Draft202012Validator(schema, format_checker=FormatChecker()).validate(record)
        self.assertEqual(record['menu']['source'], self.data['restaurants'][0]['menu']['source'])
        self.assertTrue(record['menu']['is_partial'])
        self.assertIsNone(record['menu']['categories'][0]['items'][1]['price'])

    def test_unknown_and_stale_prices_never_become_schema_offers(self):
        self.build()
        fresh = json.loads(self.read('menus/demo-bayou-table/menu.jsonld'))['mainEntity']['hasMenu']
        items = fresh['hasMenuSection'][0]['hasMenuItem']
        self.assertEqual(items[0]['offers']['priceCurrency'], 'USD')
        self.assertIn('2026-11-17', items[0]['offers']['description'])
        self.assertNotIn('offers', items[1])
        stale = json.loads(self.read('menus/demo-cobalt-cafe/menu.jsonld'))
        self.assertNotIn('"offers"', json.dumps(stale))
        self.assertNotIn('availability', items[0]['offers'])

    def test_old_item_price_is_not_promoted_even_when_menu_was_recently_reviewed(self):
        self.data['restaurants'][0]['menu']['categories'][0]['items'][0]['price_verified_at'] = '2026-01-01'
        self.build()
        menu = json.loads(self.read('menus/demo-bayou-table/menu.jsonld'))['mainEntity']['hasMenu']
        self.assertNotIn('offers', menu['hasMenuSection'][0]['hasMenuItem'][0])

    def test_zero_price_is_preserved_and_not_mistaken_for_unknown(self):
        self.data['restaurants'][0]['menu']['categories'][0]['items'][0]['price'] = 0
        self.build()
        menu = json.loads(self.read('menus/demo-bayou-table/menu.jsonld'))['mainEntity']['hasMenu']
        self.assertEqual(menu['hasMenuSection'][0]['hasMenuItem'][0]['offers']['price'], '0.00')

    def test_derived_freshness_does_not_rewrite_source_or_invent_dates(self):
        original = copy.deepcopy(self.data)
        self.today = date(2026, 12, 18)
        manifest = self.build()
        self.assertEqual(manifest['restaurants'][0]['menu_status'], 'needs_review')
        self.assertEqual(manifest['restaurants'][0]['recorded_menu_status'], 'verified')
        record = json.loads(self.read('menus/demo-bayou-table/menu.json'))
        self.assertEqual(record['menu']['status'], 'needs_review')
        self.assertEqual(record['menu']['last_verified'], '2026-11-17')
        self.assertEqual(self.data, original)

    def test_source_data_cannot_close_a_script_or_inject_html(self):
        value = '</script><script>alert("test")</script><img src=x onerror=alert(1)>'
        self.data['restaurants'][0]['name'] = value
        self.build()
        html = self.read('menus/demo-bayou-table/index.html')
        self.assertNotIn('<img src=x', html)
        self.assertNotIn('<script>alert', html)
        structured = json.loads(HtmlFacts(html).structured[0])
        self.assertEqual(structured['mainEntity']['name'], value)

    def test_jsonld_is_allowed_by_an_exact_csp_hash_without_unsafe_inline(self):
        self.build()
        for path in ['index.html', 'menus/demo-bayou-table/index.html']:
            facts = HtmlFacts(self.read(path))
            digest = base64.b64encode(hashlib.sha256(facts.structured[0].encode()).digest()).decode()
            self.assertIn('sha256-' + digest, facts.csp)
            self.assertNotIn('unsafe-inline', facts.csp)

    def test_missing_menu_does_not_claim_dishes_or_offers(self):
        self.build()
        record = json.loads(self.read('menus/demo-north-market/menu.jsonld'))
        self.assertNotIn('hasMenu', record['mainEntity'])
        self.assertIn('Menu unavailable', record['description'])

    def test_sitemap_uses_absolute_urls_and_never_fake_lastmod_or_demo_query(self):
        self.build()
        root = ET.fromstring(self.read('sitemap.xml'))
        urls = [node.text for node in root.iter() if node.tag.endswith('}loc')]
        self.assertIn(self.base, urls)
        self.assertIn(self.base + 'menus/demo-bayou-table/', urls)
        self.assertTrue(all(value.startswith(self.base) and '?' not in value and '#' not in value for value in urls))
        self.assertNotIn('lastmod', self.read('sitemap.xml'))

    def test_preview_has_relative_links_no_guessed_domain_and_no_sitemap(self):
        manifest = self.build(base=None)
        self.assertEqual(manifest['restaurants'][0]['html_url'], 'menus/demo-bayou-table/')
        self.assertIn('noindex,follow', self.read('index.html'))
        self.assertNotIn('rel="canonical"', self.read('index.html'))
        self.assertFalse((self.output / 'sitemap.xml').exists())
        self.assertEqual(link_to('llms.txt', current='menus/id/index.html'), '../../llms.txt')

    def test_demo_and_unsafe_record_paths_are_rejected(self):
        self.data['demo'] = True
        with self.assertRaises(ValueError): self.build()
        self.data.pop('demo')
        self.data['restaurants'][0]['id'] = '../../escape'
        with self.assertRaises(ValueError): self.build()

    def test_branding_has_no_effect_on_discovery_order(self):
        first = [r['id'] for r in self.build()['restaurants']]
        for r in self.data['restaurants']: r['branding']['tier'] = 'branded'
        second = [r['id'] for r in self.build()['restaurants']]
        self.assertEqual(first, second)

    def test_robots_allows_search_and_documents_source_specific_rights(self):
        self.build()
        robots = RobotFileParser()
        robots.parse(self.read('robots.txt').splitlines())
        self.assertTrue(robots.can_fetch('OAI-SearchBot', self.base + 'menus/demo-bayou-table/'))
        self.assertTrue(robots.can_fetch('Googlebot', self.base + 'menu-index.json'))
        self.assertFalse(robots.can_fetch('OAI-SearchBot', self.base + 'data/demo.json'))
        self.assertIn('no blanket reuse or training license', self.read('llms.txt'))

    def test_empty_public_directory_exports_no_synthetic_menu_content(self):
        self.data = json.loads((ROOT / 'data/restaurants.json').read_text(encoding='utf-8'))
        manifest = self.build()
        self.assertEqual(manifest['restaurants'], [])
        self.assertFalse((self.output / 'menus').exists())
        for path in ['index.html', 'llms.txt', 'menu-index.json', 'index.md']:
            self.assertNotIn('Bayou Table', self.read(path))

    def test_invalid_public_urls_are_rejected(self):
        for value in ['http://menus.test', 'https://user:secret@menus.test/', 'https://menus.test/?token=abc',
                      'https://menus.test/#route', 'https://example.com/', 'https://menus.test/a/../b/',
                      'https://menus.test/%2e%2e/', 'https://menus.test:bad/', 'https://bad<host>/']:
            with self.subTest(value=value), self.assertRaises(ValueError): public_base_url(value)
        self.assertEqual(public_base_url('https://menus.test/themenu'), self.base)

    def test_draft_can_use_planned_canonicals_without_inviting_indexing(self):
        shutil.copy2(ROOT / 'index.html', self.output / 'index.html')
        generate(self.output, self.data, base=self.base, today=self.today, indexable=False)
        self.assertIn('noindex,follow', self.read('index.html'))
        self.assertIn('rel="canonical"', self.read('index.html'))
        self.assertFalse((self.output / 'sitemap.xml').exists())


if __name__ == '__main__':
    unittest.main()
