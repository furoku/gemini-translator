import fs from 'fs';
import path from 'path';

const repoRoot = process.cwd();
const manifestPath = path.join(repoRoot, 'extension', 'manifest.json');

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exitCode = 1;
}

function assertFileExists(relPath) {
  const fullPath = path.join(repoRoot, relPath);
  if (!fs.existsSync(fullPath)) {
    fail(`Missing referenced file: ${relPath}`);
  }
}

if (!fs.existsSync(manifestPath)) {
  fail('extension/manifest.json not found');
  process.exit(1);
}

let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
} catch (err) {
  fail(`Invalid JSON in manifest: ${err.message}`);
  process.exit(1);
}

if (manifest.manifest_version !== 3) {
  fail('manifest_version should be 3');
}
if (!manifest.name) {
  fail('manifest.name is required');
}
if (!manifest.version) {
  fail('manifest.version is required');
}
if (!manifest.description) {
  fail('manifest.description is required');
}

if (manifest.background?.service_worker) {
  assertFileExists(path.join('extension', manifest.background.service_worker));
}

if (manifest.options_ui?.page) {
  assertFileExists(path.join('extension', manifest.options_ui.page));
}

if (manifest.action?.default_popup) {
  assertFileExists(path.join('extension', manifest.action.default_popup));
}

for (const script of manifest.content_scripts || []) {
  for (const jsFile of script.js || []) {
    assertFileExists(path.join('extension', jsFile));
  }
}

function checkIcons(iconMap) {
  if (!iconMap) return;
  for (const iconPath of Object.values(iconMap)) {
    assertFileExists(path.join('extension', iconPath));
  }
}

checkIcons(manifest.icons);
checkIcons(manifest.action?.default_icon);

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log('Manifest validation passed.');
