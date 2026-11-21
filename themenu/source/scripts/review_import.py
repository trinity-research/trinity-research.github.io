#!/usr/bin/env python3
"""Validate manual source observations and produce a review diff; never publish."""
import argparse
import json
import sys
from datetime import date
from pathlib import Path
from urllib.parse import urlsplit

from jsonschema import Draft202012Validator, FormatChecker

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from scripts.validate_data import read_json, validate


def observations_for(restaurant):
    result = {}
    for category in restaurant['menu']['categories']:
        for item in category['items']:
            for choice_id, value in [(None, item)] + [(c['id'], c) for c in item['choices']]:
                result[(item['id'], choice_id)] = {
                    'item_id': item['id'], 'choice_id': choice_id, 'name': value['name'],
                    'price': value['price'], 'price_verified_at': value['price_verified_at']}
    return result


def validate_sources(data, registry, *, today=None):
    today = today or date.today()
    errors = validate(data, today=today)
    schema = read_json(ROOT / 'data/source-registry.schema.json')
    registry_errors = list(Draft202012Validator(schema, format_checker=FormatChecker()).iter_errors(registry))
    errors.extend('registry/' + '/'.join(map(str, e.absolute_path)) + ': ' + e.message for e in registry_errors)
    if errors:
        return errors
    records = {r['id']: r for r in data['restaurants']}
    seen = set()
    for source in registry['sources']:
        label = source['restaurant_id']
        def check(condition, message):
            if not condition:
                errors.append(label + ': ' + message)
        check(label not in seen, 'duplicate source registry entry')
        seen.add(label)
        check(label in records, 'source references unknown restaurant')
        if label not in records:
            continue
        for url in [source['identity_url'], source['menu_url']]:
            if url is None:
                continue
            parts = urlsplit(url)
            check(parts.scheme == 'https' and bool(parts.hostname) and not parts.username and not parts.password
                  and not any(c.isspace() for c in url), 'source URL must be safe HTTPS without credentials')
        checked = source['checked_on']
        check(date.fromisoformat(checked) <= today, 'future source check')
        review = source['maintainer_review']
        if review['status'] == 'approved':
            check(bool(review['reviewer']) and bool(review['reviewed_on']), 'approval needs a maintainer and date')
            if review['reviewed_on']:
                check(checked <= review['reviewed_on'] <= today.isoformat(), 'approval date must follow source check and not be future')
        else:
            check(review['reviewer'] is None and review['reviewed_on'] is None, 'pending review cannot claim approval')
        r = records[label]
        menu = r['menu']
        if menu['source']:
            check(source['menu_url'] == menu['source']['url'], 'menu URL differs from registered source')
            check(source['ordering_context'] == menu['source']['label'], 'ordering context must be visible in menu source label')
            check(checked == menu['last_verified'], 'source check and menu date differ')
            check(source['content_basis'] == menu['source']['content_basis'], 'content basis differs')
            if menu['status'] == 'verified':
                check(menu['reviewer'] == review['reviewer'], 'verified menu reviewer must match the approving maintainer')
            if review['status'] == 'pending':
                check(menu['status'] in ('needs_review', 'outdated'), 'unapproved import must remain needs_review or outdated')
        else:
            check(source['menu_url'] is None, 'missing menu cannot claim a menu source')
        expected = observations_for(r)
        actual = {}
        for observation in source['observations']:
            key = (observation['item_id'], observation['choice_id'])
            check(key not in actual, 'duplicate item/choice observation')
            actual[key] = observation
        check(actual == expected, 'observations must match every item/choice name, price and date exactly')
    for missing in records.keys() - seen:
        errors.append(missing + ': missing source registry entry')
    return errors


def review_diff(baseline, candidate):
    """Stable item/choice IDs distinguish price changes from removed/new items."""
    before = {r['id']: r for r in baseline['restaurants']}
    after = {r['id']: r for r in candidate['restaurants']}
    lines = ['# Menu import review', '', 'Draft facts only. Maintainer review is required before merge.', '']
    def amount(value):
        return 'unknown' if value is None else f'USD {value:.2f}'
    def clean(value):
        return str(value).replace('\n', ' ').replace('\r', ' ')
    for rid in sorted(before.keys() | after.keys()):
        old, new = before.get(rid), after.get(rid)
        if old == new:
            continue
        record = new or old
        action = 'Added' if old is None else 'Removed' if new is None else 'Changed'
        lines.extend([f'## {action}: {clean(record["name"])} ({rid})', ''])
        if new:
            menu = new['menu']
            lines.append(f'- State: {menu["status"]}; coverage: {"excerpt" if menu["is_partial"] else "unavailable" if menu["status"] == "missing" else "snapshot"}.')
            if menu['source']:
                lines.append(f'- Context: {clean(menu["source"]["label"])}.')
                lines.append(f'- Source: {menu["source"]["url"]} (checked {menu["last_verified"]}).')
            else:
                lines.append('- No local items or prices confirmed; menu remains unavailable.')
        if old and new:
            for key in ['name', 'cuisine', 'address', 'coordinates', 'official_url', 'branding']:
                if old[key] != new[key]:
                    lines.append(f'- Changed {key}: {clean(json.dumps(old[key], ensure_ascii=False))} -> {clean(json.dumps(new[key], ensure_ascii=False))}.')
            if old['menu'] != new['menu']:
                lines.append('- Menu content or review metadata changed; inspect the JSON diff before approval.')
        left = observations_for(old) if old else {}
        right = observations_for(new) if new else {}
        for key in sorted(left.keys() | right.keys(), key=lambda k: (k[0], k[1] or '')):
            was, now = left.get(key), right.get(key)
            if was == now:
                continue
            value = now or was
            name = clean(value['name']) + (f' [choice of {key[0]}]' if key[1] else '')
            if was is None:
                lines.append(f'- Add {name}: {amount(now["price"])}.')
            elif now is None:
                lines.append(f'- Remove {name}: previously {amount(was["price"])}.')
            else:
                lines.append(f'- Change {name}: {amount(was["price"])} -> {amount(now["price"])}; name/date metadata must also be reviewed.')
        lines.append('')
    if before == after:
        lines.extend(['No restaurant changes.', ''])
    lines.extend(['Automated collection and publication are disabled. Unknown prices stay unknown.', ''])
    return '\n'.join(lines)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--candidate', type=Path, default=ROOT / 'data/restaurants.json')
    parser.add_argument('--registry', type=Path, default=ROOT / 'data/source-registry.json')
    parser.add_argument('--baseline', type=Path, help='Prior canonical directory for a read-only diff')
    parser.add_argument('--report', type=Path, help='Write Markdown review report; requires --baseline')
    args = parser.parse_args()
    if args.report and not args.baseline:
        parser.error('--report requires --baseline')
    try:
        data, registry = read_json(args.candidate), read_json(args.registry)
        errors = validate_sources(data, registry)
        baseline = read_json(args.baseline) if args.baseline else None
        if baseline is not None:
            errors.extend('baseline: ' + e for e in validate(baseline))
        if errors:
            print('Import review failed:\n' + '\n'.join('- ' + e for e in errors), file=sys.stderr)
            return 1
        if baseline is not None:
            report = review_diff(baseline, data)
            if args.report:
                args.report.write_text(report, encoding='utf-8', newline='\n')
                print('Wrote review report: ' + str(args.report))
            else:
                print(report)
        print(f'Validated {len(registry["sources"])} manual sources. No publication or automated collection performed.')
    except (OSError, ValueError, TypeError) as error:
        print('Import review failed: ' + str(error), file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
