"""Keep the interactive app and generated formats on the same disclosure copy."""
import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load_notice():
    return json.loads((ROOT / 'content/menu-notice.json').read_text(encoding='utf-8'))


def expected_module():
    notice = json.dumps(load_notice(), ensure_ascii=False, indent=2)
    return ('// Generated from content/menu-notice.json by scripts/build_menu_notice.py.\n'
            f'const notice = {notice};\n'
            'notice.details = Object.freeze(notice.details);\n'
            'export const MENU_NOTICE = Object.freeze(notice);\n')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    path = ROOT / 'assets/menu-notice.js'
    content = expected_module()
    if args.check:
        if not path.is_file() or path.read_text(encoding='utf-8') != content:
            raise SystemExit('Run python scripts/build_menu_notice.py to update disclosure copy.')
        print('Disclosure copy matches its source.')
    else:
        path.write_text(content, encoding='utf-8', newline='\n')
        print('Generated shared disclosure module.')


if __name__ == '__main__':
    main()
