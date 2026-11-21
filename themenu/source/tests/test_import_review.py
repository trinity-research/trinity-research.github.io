import copy
import unittest
from datetime import date

from scripts.review_import import observations_for, review_diff, validate_sources
from scripts.validate_data import ROOT, read_json


class ImportReviewTests(unittest.TestCase):
    def setUp(self):
        self.today = date(2026, 11, 17)
        r = copy.deepcopy(read_json(ROOT / 'data/demo.json')['restaurants'][0])
        r.update(id='test-location', name='Import test fixture', coordinates=None,
                 official_url='https://restaurant.test/location')
        r['branding'] = {'tier': 'free', 'logo': None}
        m = r['menu']
        m.update(status='needs_review', reviewer='Test transcription; maintainer review pending')
        m['source'].update(url='https://restaurant.test/menu', label='Location-specific online-order menu',
                           content_basis='public_facts', evidence='Synthetic test evidence only.')
        for c in m['categories']:
            for i in c['items']:
                i.update(description='', photos=[])
        self.data = {'version': 2, 'region': 'Test region', 'restaurants': [r]}
        self.registry = {'version': 1, 'sources': [{
            'restaurant_id': r['id'], 'identity_url': r['official_url'], 'menu_url': m['source']['url'],
            'checked_on': m['last_verified'], 'collection_method': 'manual_official_source',
            'content_basis': 'public_facts', 'ordering_context': m['source']['label'],
            'refresh_after_days': 30, 'automation_approved': False,
            'access_review': 'Test fixture, no automated access approved.',
            'maintainer_review': {'status': 'pending', 'reviewer': None, 'reviewed_on': None},
            'notes': ['Synthetic test input only.'], 'observations': list(observations_for(r).values())}]}

    def errors(self):
        return validate_sources(self.data, self.registry, today=self.today)

    def test_manual_facts_with_pending_review_pass(self):
        self.assertEqual(self.errors(), [])

    def test_real_directory_matches_registered_observations(self):
        self.assertEqual(validate_sources(read_json(ROOT / 'data/restaurants.json'),
                                         read_json(ROOT / 'data/source-registry.json')), [])

    def test_price_drift_and_missing_observation_fail(self):
        source = self.registry['sources'][0]
        source['observations'][0]['price'] = 999
        self.assertTrue(self.errors())
        source['observations'] = source['observations'][1:]
        self.assertTrue(self.errors())

    def test_duplicate_and_unknown_registry_entries_fail(self):
        self.registry['sources'].append(copy.deepcopy(self.registry['sources'][0]))
        self.assertTrue(self.errors())
        self.registry['sources'][1]['restaurant_id'] = 'unknown-location'
        self.assertTrue(self.errors())
        self.registry['sources'] = []
        self.assertTrue(self.errors())

    def test_duplicate_observation_fails(self):
        observations = self.registry['sources'][0]['observations']
        observations.append(copy.deepcopy(observations[0]))
        self.assertTrue(self.errors())

    def test_wrong_channel_source_date_and_future_check_fail(self):
        source = self.registry['sources'][0]
        for key, value in [('ordering_context', 'Different channel'),
                           ('menu_url', 'https://restaurant.test/other-location'),
                           ('checked_on', '2026-11-18'),
                           ('identity_url', 'https://user:secret@restaurant.test/')]:
            with self.subTest(key=key):
                original = source[key]
                source[key] = value
                self.assertTrue(self.errors())
                source[key] = original

    def test_pending_review_cannot_be_verified(self):
        self.data['restaurants'][0]['menu']['status'] = 'verified'
        self.assertTrue(self.errors())

    def test_approval_requires_actual_maintainer_and_nonfuture_date(self):
        review = self.registry['sources'][0]['maintainer_review']
        review['status'] = 'approved'
        self.assertTrue(self.errors())
        review.update(reviewer='Test maintainer', reviewed_on='2026-11-17')
        self.assertEqual(self.errors(), [])
        review['reviewed_on'] = '2026-11-18'
        self.assertTrue(self.errors())

    def test_verified_reviewer_matches_approving_maintainer(self):
        menu = self.data['restaurants'][0]['menu']
        menu['status'] = 'verified'
        review = self.registry['sources'][0]['maintainer_review']
        review.update(status='approved', reviewer='Test maintainer', reviewed_on='2026-11-17')
        self.assertTrue(self.errors())
        menu['reviewer'] = review['reviewer']
        self.assertEqual(self.errors(), [])

    def test_choice_price_drift_is_checked(self):
        item = self.data['restaurants'][0]['menu']['categories'][0]['items'][0]
        item['choices'] = [{'id': 'bowl', 'name': 'Bowl', 'price': 12,
                            'price_verified_at': '2026-11-17'}]
        source = self.registry['sources'][0]
        source['observations'] = list(observations_for(self.data['restaurants'][0]).values())
        self.assertEqual(self.errors(), [])
        source['observations'][-1]['price'] = 99
        self.assertTrue(self.errors())

    def test_manual_lane_cannot_enable_automation(self):
        self.registry['sources'][0]['automation_approved'] = True
        self.assertTrue(self.errors())

    def test_missing_menu_has_no_observations_or_menu_verification(self):
        self.data['restaurants'][0]['menu'].update(status='missing', is_partial=False,
            categories=[], source=None, last_verified=None, reviewer=None)
        source = self.registry['sources'][0]
        source.update(menu_url=None, observations=[])
        self.assertEqual(self.errors(), [])
        source['observations'] = [{'item_id': 'unconfirmed', 'choice_id': None,
                                  'name': 'Unconfirmed', 'price': None, 'price_verified_at': None}]
        self.assertTrue(self.errors())

    def test_review_diff_includes_add_remove_and_changed_prices_without_mutation(self):
        before = copy.deepcopy(self.data)
        candidate = copy.deepcopy(before)
        items = candidate['restaurants'][0]['menu']['categories'][0]['items']
        items[0]['price'] = 10
        removed = items.pop()
        added = copy.deepcopy(items[0])
        added.update(id='new-dish', name='New test dish', price=None, price_verified_at=None, choices=[])
        items.append(added)
        expected = copy.deepcopy(candidate)
        report = review_diff(before, candidate)
        self.assertIn('-> USD 10.00', report)
        self.assertIn('Remove ' + removed['name'], report)
        self.assertIn('Add New test dish: unknown', report)
        self.assertEqual(candidate, expected)


if __name__ == '__main__':
    unittest.main()
