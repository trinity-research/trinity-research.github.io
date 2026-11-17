#!/usr/bin/env python3
"""Validate schema plus publication rules. This tool does not contact external sources."""
import argparse
import json
import math
import re
import sys
from datetime import date
from pathlib import Path
from urllib.parse import urlsplit
from jsonschema import Draft202012Validator, FormatChecker
ROOT = Path(__file__).resolve().parents[1]


def read_json(path):
    def reject_constant(value):
        raise ValueError(f'Non-finite JSON constant: {value}')
    def unique_keys(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError(f'Duplicate JSON key: {key}')
            result[key] = value
        return result
    return json.loads(Path(path).read_text(encoding='utf-8'), parse_constant=reject_constant, object_pairs_hook=unique_keys)


def validate(data, *, allow_demo=False, today=None):
    today = today or date.today()
    schema = read_json(ROOT / 'data/schema.json')
    errors = []
    for error in Draft202012Validator(schema, format_checker=FormatChecker()).iter_errors(data):
        errors.append(f"{'/'.join(str(x) for x in error.absolute_path) or '/'}: {error.message}")
    if errors:
        return errors
    demo = data.get('demo') is True
    if demo and not allow_demo:
        errors.append('Fictional demo data cannot be published as the canonical directory')
    ids = set()

    def check(condition, message):
        if not condition:
            errors.append(message)

    def valid_date(value, label):
        if value is None:
            return
        check(date.fromisoformat(value) <= today, f'{label}: future verification date')

    def https(value, label):
        if value is None:
            return
        parts = urlsplit(value)
        check(parts.scheme == 'https' and bool(parts.hostname) and not parts.username and not parts.password and not re.search(r'\s', value), f'{label}: safe HTTPS URL required')
        if not demo:
            check(parts.hostname not in ('example.com', 'example.org', 'example.net', 'localhost') and not parts.hostname.endswith('.invalid'), f'{label}: placeholder source is not publishable')

    def media(value, label, local_logo=False):
        if not value:
            return
        if local_logo and value['url'].startswith('assets/'):
            check('..' not in value['url'].split('/') and '\\' not in value['url'] and '?' not in value['url'] and '#' not in value['url'] and (ROOT / value['url']).is_file(), f'{label}: local logo must exist inside assets')
        else:
            https(value['url'], label)
        https(value['source_url'], label + ' source')
        check(demo or value['permission_basis'] != 'synthetic_demo', f'{label}: synthetic permission is demo-only')

    for r in data['restaurants']:
        label = r['id']
        check(label not in ids, f'{label}: duplicate restaurant id')
        ids.add(label)
        check(demo or '(Fictional)' not in r['name'], f'{label}: fictional fixture in public directory')
        if demo:
            check('(Fictional)' in r['name'], f'{label}: demo name must identify fictional content')
        https(r['official_url'], label + ' website')
        if r['coordinates']:
            https(r['coordinates']['source_url'], label + ' coordinates')
            valid_date(r['coordinates']['verified_at'], label + ' coordinates')
        check(r['branding']['tier'] == 'branded' or r['branding']['logo'] is None, f'{label}: free listing cannot have a logo')
        media(r['branding']['logo'], label + ' logo', local_logo=True)
        m = r['menu']
        valid_date(m['last_verified'], label)
        check((m['status'] == 'missing') == (not m['categories']), f'{label}: menu status/categories mismatch')
        if m['status'] == 'missing':
            check(m['last_verified'] is None and m['source'] is None and m['reviewer'] is None, f'{label}: missing menu cannot claim verification')
        else:
            check(bool(m['last_verified']) and bool(m['reviewer']) and bool(m['source']), f'{label}: published menu needs source, reviewer, and verification date')
        if m['source']:
            https(m['source']['url'], label + ' menu source')
            valid_date(m['source']['verified_at'], label + ' source')
            check(demo or m['source']['content_basis'] != 'synthetic_demo', f'{label}: synthetic permission is demo-only')
            check(m['source']['verified_at'] == m['last_verified'], f'{label}: source/menu verification dates must agree')
        category_ids, item_ids = set(), set()
        for category in m['categories']:
            check(category['id'] not in category_ids, f'{label}: duplicate category id')
            category_ids.add(category['id'])
            for item in category['items']:
                check(item['id'] not in item_ids, f'{label}: duplicate dish id')
                item_ids.add(item['id'])
                if m['source'] and m['source']['content_basis'] == 'public_facts':
                    check(not item['description'].strip(), f'{label}: public_facts imports omit descriptive prose; use a separately reviewed content basis for descriptions')
                choice_ids = set()
                for priced, kind in [(item, 'dish')] + [(c, 'choice') for c in item['choices']]:
                    if kind == 'choice':
                        check(priced['id'] not in choice_ids, f'{label}: duplicate choice id')
                        choice_ids.add(priced['id'])
                    value = priced['price']
                    check(value is None or (not isinstance(value, bool) and math.isfinite(value)), f'{label}: invalid {kind} price')
                    check((value is None) == (priced['price_verified_at'] is None), f'{label}: {kind} price needs matching verification date; unknown prices must be null')
                    valid_date(priced['price_verified_at'], label + ' price')
                    if priced['price_verified_at'] and m['last_verified']:
                        check(priced['price_verified_at'] <= m['last_verified'], f'{label}: price verification is newer than menu review')
                for photo in item['photos']:
                    media(photo, label + ' photo')
    return errors


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('path', nargs='?', default=str(ROOT / 'data/restaurants.json'))
    parser.add_argument('--demo', action='store_true', help='Allow clearly labeled synthetic fixtures; never use for public records')
    args = parser.parse_args()
    try:
        data = read_json(args.path)
        errors = validate(data, allow_demo=args.demo)
    except (OSError, ValueError, TypeError) as error:
        print(f'Invalid data: {error}', file=sys.stderr)
        return 1
    if errors:
        print('Validation failed:\n' + '\n'.join(f'- {error}' for error in errors), file=sys.stderr)
        return 1
    print(f"Validated {len(data['restaurants'])} restaurant entries{' (fictional fixtures)' if data.get('demo') else ''}")
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
