"""Stage or verify the /themenu component without changing other Trinity Research files."""
import argparse
import hashlib
import json
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE_FILES = ['.gitignore', 'README.md', 'index.html', 'corrections.html', 'package.json',
                'requirements-dev.txt', 'robots.txt', 'site.config.json']
SOURCE_DIRS = ['assets', 'brand', 'content', 'data', 'docs', 'scripts', 'tests', 'integration']
MANIFEST = 'build-manifest.json'


def digest(content):
    return hashlib.sha256(content).hexdigest()


def source_files():
    files = {name: ROOT / name for name in SOURCE_FILES}
    for directory in SOURCE_DIRS:
        for path in (ROOT / directory).rglob('*'):
            if path.is_file() and '__pycache__' not in path.parts and path.suffix != '.pyc':
                files[path.relative_to(ROOT).as_posix()] = path
    return dict(sorted(files.items()))


def source_fingerprint(files):
    hasher = hashlib.sha256()
    for name, path in files.items():
        hasher.update(name.encode('utf-8') + b'\0' + path.read_bytes() + b'\0')
    return hasher.hexdigest()


def safe_child(target, name):
    if name in ('', '.') or '\\' in name or Path(name).is_absolute() or '..' in Path(name).parts or Path(name).parts[0].casefold() == 'source':
        raise ValueError(f'Unsafe generated path: {name}')
    path = target / name
    if not path.resolve().is_relative_to(target.resolve()):
        raise ValueError(f'Path leaves theMenu component: {name}')
    return path


def check(target):
    manifest = json.loads((target / MANIFEST).read_text(encoding='utf-8'))
    if manifest['source_sha256'] != source_fingerprint(source_files()):
        raise ValueError('Source changed: rebuild the component with python scripts/export_trinity.py --target ..')
    for name, expected in manifest['files'].items():
        path = safe_child(target, name)
        if not path.is_file() or digest(path.read_bytes()) != expected:
            raise ValueError(f'Generated file changed or is missing: {name}')
    actual = {p.relative_to(target).as_posix() for p in target.rglob('*')
              if p.is_file() and p.relative_to(target).parts[0] != 'source' and p.name != MANIFEST}
    if actual != set(manifest['files']):
        raise ValueError('Unexpected or stale generated files exist outside themenu/source')
    print('Trinity component matches its source and generated-file hashes.')


def export(target, *, run_build=True):
    target = target.resolve()
    if target.name.lower() != 'themenu' or target == ROOT or target.is_relative_to(ROOT / 'dist'):
        raise ValueError('Target must be a dedicated themenu component directory, separate from source and dist')
    source_target = target / 'source'
    if target.exists() and any(target.iterdir()) and not (target / MANIFEST).is_file():
        raise ValueError('Refusing to overwrite a nonempty directory without this component manifest')
    if run_build:
        subprocess.run([sys.executable, '-B', str(ROOT / 'scripts/build.py')], cwd=ROOT, check=True)
    files = source_files()
    previous = json.loads((target / MANIFEST).read_text(encoding='utf-8')) if (target / MANIFEST).exists() else {'files': {}}
    target.mkdir(parents=True, exist_ok=True)
    if source_target.resolve() != ROOT:
        for name, path in files.items():
            destination = source_target / name
            if not destination.resolve().is_relative_to(source_target.resolve()):
                raise ValueError('Source export leaves its target')
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, destination)
    generated = {p.relative_to(ROOT / 'dist').as_posix(): p.read_bytes() for p in (ROOT / 'dist').rglob('*') if p.is_file()}
    generated['README.md'] = (ROOT / 'integration/COMPONENT_README.md').read_bytes()
    for obsolete in set(previous['files']) - set(generated):
        path = safe_child(target, obsolete)
        if path.is_file():
            path.unlink()
    for name, content in generated.items():
        destination = safe_child(target, name)
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(content)
    manifest = {'version': 1, 'source_sha256': source_fingerprint(files),
                'files': {name: digest(content) for name, content in sorted(generated.items())}}
    (target / MANIFEST).write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    check(target)
    print(f'Prepared {len(generated)} static files and {len(files)} source files in {target}')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--target', type=Path, default=ROOT.parent if ROOT.name == 'source' and ROOT.parent.name == 'themenu' else None)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    if args.target is None:
        parser.error('--target is required outside the integrated themenu/source checkout')
    target = args.target.resolve()
    if target.name.lower() != 'themenu':
        parser.error('target directory must be named themenu')
    try:
        check(target) if args.check else export(target)
    except (ValueError, OSError, KeyError) as error:
        raise SystemExit(str(error))


if __name__ == '__main__':
    main()
