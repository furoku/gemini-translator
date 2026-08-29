const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

const modelPolicy = require('../model-policy.js');
const storageGuard = require('../ui-storage-guard.js');
const siteRegistryUi = require('../site-registry-ui.js');

test('retired Gemini model IDs migrate to the current stable Flash-Lite', () => {
  assert.equal(modelPolicy.normalizeModel('gemini-2.0-flash-lite'), modelPolicy.DEFAULT_MODEL);
  assert.equal(modelPolicy.normalizeModel('gemini-3.1-flash-lite-preview'), modelPolicy.DEFAULT_MODEL);
  assert.equal(modelPolicy.normalizeModel('gemini-3.5-flash-lite'), 'gemini-3.5-flash-lite');
  assert.equal(modelPolicy.normalizeModel('gemini-3.1-flash-lite'), 'gemini-3.1-flash-lite');
  assert.equal(modelPolicy.normalizeModel('gemini-2.5-flash-lite'), 'gemini-2.5-flash-lite');
});

test('model migration writes both current and legacy guard keys', async () => {
  const data = { geminiModel: 'gemini-3.1-flash-lite-preview' };
  const storage = {
    async get(keys) {
      return Object.fromEntries(keys.filter((key) => Object.hasOwn(data, key)).map((key) => [key, data[key]]));
    },
    async set(values) {
      Object.assign(data, values);
    }
  };
  const model = await modelPolicy.migrateLocalStorage(storage);
  assert.equal(model, modelPolicy.DEFAULT_MODEL);
  assert.equal(data.geminiModel, modelPolicy.DEFAULT_MODEL);
  assert.equal(data.geminiModelMigratedTo35FlashLite, true);
  assert.equal(data.geminiModelMigratedTo25FlashLite, true);
});

test('site settings reject hostile hosts and neutralize markup in selectors', () => {
  assert.equal(storageGuard.sanitizeHost('https://Example.COM/path'), 'example.com');
  assert.equal(storageGuard.sanitizeHost('x.com" onmouseover="alert(1)'), '');
  assert.equal(storageGuard.sanitizeSelectorText('</textarea><img src=x>'), '＜/textarea>＜img src=x>');
});

test('site registry rendering treats every stored value as text', () => {
  const dom = new JSDOM('<div id="root"></div>');
  const root = dom.window.document.getElementById('root');
  siteRegistryUi.render({
    document: dom.window.document,
    root,
    registry: [{ host: 'example.com', enabled: true }],
    rules: [{ host: 'example.com', include: '</textarea><img src=x>', exclude: '<script>alert(1)</script>' }],
    hostMatches: (a, b) => a === b
  });

  assert.equal(root.querySelectorAll('img,script').length, 0);
  assert.equal(root.querySelector('[data-site-include]').value, '</textarea><img src=x>');
  assert.equal(root.querySelector('[data-site-exclude]').value, '<script>alert(1)</script>');
  assert.equal(root.querySelector('.site-host').textContent, 'example.com');
});
