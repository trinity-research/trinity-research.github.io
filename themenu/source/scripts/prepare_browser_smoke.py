"""Generate an ignored, non-deployable test page for a deterministic denied location."""
from pathlib import Path
root = Path(__file__).resolve().parents[1]
output = root / '.browser-fixtures'
output.mkdir(exist_ok=True)
html = (root / 'index.html').read_text(encoding='utf-8')
html = html.replace('<head>', '<head>\n  <base href="../">')
html = html.replace('src="./assets/app.js"', 'src="./tests/location-denied.js"')
(output / 'location-denied.html').write_text(html, encoding='utf-8')
print('Prepared .browser-fixtures/location-denied.html; no actual location permission is requested.')
