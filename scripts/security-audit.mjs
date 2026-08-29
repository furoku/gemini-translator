import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const extension = path.join(root, 'extension');
const manifest = JSON.parse(fs.readFileSync(path.join(extension, 'manifest.json'), 'utf8'));

function fail(message) {
  console.error(`[security-audit] FAIL: ${message}`);
  process.exit(1);
}
function ok(message) {
  console.log(`[security-audit] OK: ${message}`);
}

if (manifest.background?.service_worker !== 'background-entry.js' || manifest.background?.type !== 'module') {
  fail('manifest must use the model-migration background entry module');
}
ok('background migration entry is active');

const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split(/\r?\n/).filter(Boolean);
const forbidden = tracked.filter((file) => file === 'extension/Their' || file.startsWith('extension/node_modules/'));
if (forbidden.length) fail(`forbidden tracked files: ${forbidden.slice(0, 10).join(', ')}`);
ok('node_modules and stray placeholder are not tracked');

for (const page of ['options.html', 'popup.html']) {
  const source = fs.readFileSync(path.join(extension, page), 'utf8');
  if (source.includes('fonts.googleapis.com')) fail(`${page} must not load remote fonts`);
  if (source.includes('gemini-3.1-flash-lite-preview')) fail(`${page} exposes a retired model`);
  if (!source.includes('gemini-3.5-flash-lite')) fail(`${page} does not expose the current stable model`);
}
ok('UI model lists and extension pages are current and offline');

const policy = fs.readFileSync(path.join(extension, 'model-policy.js'), 'utf8');
if (!policy.includes("const DEFAULT_MODEL = 'gemini-3.5-flash-lite'")) {
  fail('current default model is not pinned in model-policy.js');
}

const optionsPage = fs.readFileSync(path.join(extension, 'options.html'), 'utf8');
const requiredOptionsOrder = [
  'model-policy.js',
  'ui-storage-guard.js',
  'site-registry-ui.js',
  'options.js',
  'options-safe-ui.js'
];
let cursor = -1;
for (const file of requiredOptionsOrder) {
  const index = optionsPage.indexOf(file);
  if (index <= cursor) fail(`options script order is unsafe around ${file}`);
  cursor = index;
}

const popupPage = fs.readFileSync(path.join(extension, 'popup.html'), 'utf8');
const requiredPopupOrder = ['model-policy.js', 'ui-storage-guard.js', 'popup.js', 'popup-pricing.js'];
cursor = -1;
for (const file of requiredPopupOrder) {
  const index = popupPage.indexOf(file);
  if (index <= cursor) fail(`popup script order is unsafe around ${file}`);
  cursor = index;
}
ok('UI guards load before settings controllers and safe overrides load after them');

console.log('[security-audit] all checks passed');
