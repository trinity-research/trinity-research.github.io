import { CONFIG } from './config.js';
import { safeHttps } from './core.js';
const id = new URLSearchParams(location.search).get('restaurant') || '[restaurant name or ID]';
const text = document.getElementById('correction-text');
text.value = `Restaurant: ${id}\nPublic menu/source URL: \nWhat needs to change: \nPermission to reuse menu content (if applicable): `;
if (CONFIG.correctionUrl && safeHttps(CONFIG.correctionUrl)) {
  const link = document.getElementById('issue-link'); link.href = CONFIG.correctionUrl; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.hidden = false;
  document.getElementById('submission-status').textContent = 'Use GitHub to submit the correction for maintainer review. Signing in to GitHub may be required to submit; reading menus never needs an account.';
}
document.getElementById('copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(text.value); document.getElementById('copy-status').textContent = 'Copied. Your correction has not been sent.'; }
  catch { text.focus(); text.select(); document.getElementById('copy-status').textContent = 'Select and copy the text manually. Your correction has not been sent.'; }
});
