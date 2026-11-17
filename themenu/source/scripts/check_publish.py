"""Require a real correction destination before any approved public deployment."""
import re
import sys
from pathlib import Path
from urllib.parse import urlsplit
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from scripts.discovery import load_settings
base, _days = load_settings()
if base is None:
    raise SystemExit('Publishing blocked: set the actual public_base_url in site.config.json for canonical URLs and the sitemap.')
config = (Path(__file__).resolve().parents[1] / 'assets/config.js').read_text(encoding='utf-8')
match = re.search(r"correctionUrl:\s*['\"]([^'\"]+)['\"]", config)
if not match:
    raise SystemExit('Publishing blocked: configure the approved correction issue URL in assets/config.js first.')
url = urlsplit(match.group(1))
if url.scheme != 'https' or url.hostname != 'github.com' or url.username or url.password or not re.fullmatch(r'/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/issues/new', url.path):
    raise SystemExit('Publishing blocked: correctionUrl must be the approved GitHub repository issues/new URL.')
print('Correction destination configured. Human approval and repository protections are still required.')
