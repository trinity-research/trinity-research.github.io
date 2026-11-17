import copy
import json
import tempfile
import unittest
from datetime import date
from pathlib import Path
from scripts.validate_data import ROOT, read_json, validate


class ValidationTests(unittest.TestCase):
    def setUp(self):
        self.data = read_json(ROOT / 'data/demo.json')
        self.today = date(2026, 11, 17)

    def errors(self):
        return validate(self.data, allow_demo=True, today=self.today)

    def test_public_directory_passes(self):
        self.assertEqual(validate(read_json(ROOT / 'data/restaurants.json'), today=self.today), [])

    def test_explicitly_labeled_fixtures_pass(self):
        self.assertEqual(self.errors(), [])

    def test_demo_cannot_be_canonical(self):
        self.assertTrue(validate(self.data, today=self.today))
        self.data['demo'] = False
        self.assertTrue(validate(self.data, today=self.today))

    def test_missing_required_field(self):
        del self.data['restaurants'][0]['address']
        self.assertTrue(self.errors())

    def test_duplicate_restaurant_category_and_dish_ids(self):
        for mutation in ['restaurant', 'category', 'dish']:
            with self.subTest(mutation=mutation):
                original = copy.deepcopy(self.data)
                r = self.data['restaurants'][0]
                if mutation == 'restaurant': self.data['restaurants'].append(copy.deepcopy(r))
                if mutation == 'category': r['menu']['categories'].append(copy.deepcopy(r['menu']['categories'][0]))
                if mutation == 'dish': r['menu']['categories'][0]['items'].append(copy.deepcopy(r['menu']['categories'][0]['items'][0]))
                self.assertTrue(self.errors())
                self.data = original

    def test_invalid_and_credential_urls(self):
        for url in ['javascript:alert(1)', 'http://example.com', 'https://person:secret@example.com/menu', 'https://example.com/with space']:
            self.data['restaurants'][0]['menu']['source']['url'] = url
            self.assertTrue(self.errors(), url)

    def test_price_cannot_be_negative_boolean_or_unverified(self):
        item = self.data['restaurants'][0]['menu']['categories'][0]['items'][0]
        for price in [-1, True]:
            item['price'] = price
            self.assertTrue(self.errors())
        item['price'] = 8
        item['price_verified_at'] = None
        self.assertTrue(self.errors())

    def test_unknown_price_is_null_without_date(self):
        item = self.data['restaurants'][0]['menu']['categories'][0]['items'][0]
        item['price'] = None
        item['price_verified_at'] = None
        self.assertEqual(self.errors(), [])

    def test_future_dates_and_missing_provenance_fail(self):
        r = self.data['restaurants'][0]
        r['menu']['last_verified'] = '2027-01-01'
        self.assertTrue(self.errors())
        r['menu']['last_verified'] = '2026-11-17'
        r['menu']['source'] = None
        self.assertTrue(self.errors())

    def test_invalid_address_and_approximate_coordinates_fail(self):
        r = self.data['restaurants'][0]
        r['address']['postal_code'] = 'unknown'
        self.assertTrue(self.errors())
        r['address']['postal_code'] = '71111'
        r['coordinates'] = {'latitude':32,'longitude':-93,'accuracy':'approximate','verified_at':'2026-11-17','source_url':'https://example.com/demo'}
        self.assertTrue(self.errors())

    def test_free_listing_cannot_have_logo(self):
        self.data['restaurants'][1]['branding']['tier'] = 'free'
        self.assertTrue(self.errors())

    def test_missing_menu_cannot_claim_verification(self):
        self.data['restaurants'][2]['menu']['last_verified'] = '2026-11-17'
        self.assertTrue(self.errors())

    def test_media_requires_credits_and_permission(self):
        r = self.data['restaurants'][1]
        del r['branding']['logo']['credit']
        self.assertTrue(self.errors())

    def test_duplicate_json_keys_and_nonfinite_values_fail(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'bad.json'
            for value in ['{"id":1,"id":2}', '{"price":NaN}', '{"price":Infinity}']:
                path.write_text(value, encoding='utf-8')
                with self.assertRaises(ValueError): read_json(path)

    def test_shape_schema_rejects_unsupported_fields(self):
        self.data['restaurants'][0]['paidRank'] = 1
        self.assertTrue(self.errors())

    def test_public_facts_do_not_require_restaurant_consent(self):
        r = self.data['restaurants'][0]
        r['menu']['source']['content_basis'] = 'public_facts'
        for category in r['menu']['categories']:
            for item in category['items']:
                item['description'] = ''
        r['id'] = 'validation-fixture'
        r['name'] = 'Validation fixture'
        r['menu']['source']['url'] = 'https://restaurant.test/menu'
        public_data = {'version': 2, 'region': 'Validation fixture only', 'restaurants': [r]}
        self.assertEqual(validate(public_data, today=self.today), [])

    def test_public_facts_do_not_allow_unreviewed_descriptive_copy(self):
        self.data['restaurants'][0]['menu']['source']['content_basis'] = 'public_facts'
        self.assertTrue(self.errors())

    def test_public_facts_are_not_a_media_permission_basis(self):
        self.data['restaurants'][1]['branding']['logo']['permission_basis'] = 'public_facts'
        self.assertTrue(self.errors())


if __name__ == '__main__':
    unittest.main()
