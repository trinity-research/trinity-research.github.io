#!/usr/bin/env python3
"""Build a whitelisted static artifact without copying handoff material or tests."""
import shutil
import subprocess
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from scripts.discovery import generate, load_settings


def main():
    subprocess.run([sys.executable, 'scripts/build_brand.py', '--check'], cwd=ROOT, check=True)
    subprocess.run([sys.executable, 'scripts/build_menu_notice.py', '--check'], cwd=ROOT, check=True)
    for arguments in [[], ['data/demo.json', '--demo']]:
        subprocess.run([sys.executable, 'scripts/validate_data.py', *arguments], cwd=ROOT, check=True)
    output = ROOT / 'dist'
    if output.exists():
        if output.is_symlink() or output.resolve() != ROOT.resolve() / 'dist':
            raise RuntimeError('Refusing to replace output outside the workspace')
        shutil.rmtree(output)
    output.mkdir()
    for name in ['index.html', 'corrections.html', 'robots.txt']:
        shutil.copy2(ROOT / name, output / name)
    shutil.copytree(ROOT / 'assets', output / 'assets')
    (output / 'data').mkdir()
    for name in ['restaurants.json', 'demo.json']:
        shutil.copy2(ROOT / 'data' / name, output / 'data' / name)
    import json
    base, days = load_settings()
    data = json.loads((ROOT / 'data/restaurants.json').read_text(encoding='utf-8'))
    settings = json.loads((ROOT / 'site.config.json').read_text(encoding='utf-8'))
    manifest = generate(output, data, base=base, days=days, indexable=settings.get('indexable', bool(base)))
    (output / '.nojekyll').touch()
    print(f"Built dist/ with {len(manifest['restaurants'])} crawlable restaurant pages and public discovery files. Nothing deployed.")
    if base is None:
        print('Preview mode: noindex; canonical URLs and sitemap await site.config.json public_base_url.')
    elif not settings.get('indexable', True):
        print('Draft mode: planned /themenu/ canonicals are configured; pages remain noindex and no sitemap is emitted.')


if __name__ == '__main__':
    main()
