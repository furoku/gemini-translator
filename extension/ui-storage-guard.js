(function installUiStorageGuard(root, factory) {
  const api = factory(root.GeminiTranslatorModelPolicy);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.GeminiTranslatorUiStorageGuard = api;
  if (root.chrome?.storage?.local) api.install(root.chrome.storage.local);
})(globalThis, function createUiStorageGuard(modelPolicy) {
  const HOST_PATTERN = /^(?:\*\.)?(?:localhost|(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,62}|(?:\d{1,3}\.){3}\d{1,3})$/;
  let installed = false;

  function sanitizeHost(value) {
    const raw = String(value || '')
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .split('/')[0]
      .split(':')[0]
      .replace(/\.+$/, '');
    return HOST_PATTERN.test(raw) ? raw : '';
  }

  function sanitizeSelectorText(value) {
    return String(value || '')
      .replace(/\0/g, '')
      .replace(/</g, '＜')
      .trim();
  }

  function sanitizeRegistry(value) {
    const list = Array.isArray(value) ? value : [];
    const seen = new Set();
    return list.flatMap((entry) => {
      const host = sanitizeHost(typeof entry === 'string' ? entry : entry?.host);
      if (!host || seen.has(host)) return [];
      seen.add(host);
      return [{ host, enabled: typeof entry === 'string' ? true : entry.enabled !== false }];
    });
  }

  function sanitizeWhitelist(value) {
    const seen = new Set();
    return (Array.isArray(value) ? value : []).flatMap((entry) => {
      const host = sanitizeHost(entry);
      if (!host || seen.has(host)) return [];
      seen.add(host);
      return [host];
    });
  }

  function sanitizeRules(value) {
    return (Array.isArray(value) ? value : []).flatMap((entry) => {
      const host = sanitizeHost(entry?.host);
      if (!host) return [];
      return [{
        ...entry,
        host,
        include: sanitizeSelectorText(entry?.include),
        exclude: sanitizeSelectorText(entry?.exclude),
        spaScanEnabled: entry?.spaScanEnabled === true
      }];
    });
  }

  function sanitizePayload(input) {
    const output = { ...(input || {}) };
    if (Object.hasOwn(output, 'geminiModel') && modelPolicy) {
      output.geminiModel = modelPolicy.normalizeModel(output.geminiModel);
    }
    if (Object.hasOwn(output, 'siteRegistry')) {
      output.siteRegistry = sanitizeRegistry(output.siteRegistry);
    }
    if (Object.hasOwn(output, 'siteWhitelist')) {
      output.siteWhitelist = sanitizeWhitelist(output.siteWhitelist);
    }
    if (Object.hasOwn(output, 'siteRules')) {
      output.siteRules = sanitizeRules(output.siteRules);
    }
    return output;
  }

  function requestContainsKey(keys, key) {
    if (keys == null) return true;
    if (typeof keys === 'string') return keys === key;
    if (Array.isArray(keys)) return keys.includes(key);
    return Object.hasOwn(keys, key);
  }

  function install(storageArea) {
    if (!storageArea || installed) return;
    installed = true;
    const originalGet = storageArea.get.bind(storageArea);
    const originalSet = storageArea.set.bind(storageArea);

    storageArea.get = function guardedGet(keys, callback) {
      const handle = (result) => {
        const sanitized = sanitizePayload(result);
        if (requestContainsKey(keys, 'geminiModel') && modelPolicy) {
          sanitized.geminiModel = modelPolicy.normalizeModel(sanitized.geminiModel);
        }
        const changed = JSON.stringify(result || {}) !== JSON.stringify(sanitized);
        if (changed) Promise.resolve(originalSet(sanitized)).catch(() => {});
        return sanitized;
      };
      if (typeof callback === 'function') {
        return originalGet(keys, (result) => callback(handle(result)));
      }
      return Promise.resolve(originalGet(keys)).then(handle);
    };

    storageArea.set = function guardedSet(items, callback) {
      const sanitized = sanitizePayload(items);
      if (typeof callback === 'function') return originalSet(sanitized, callback);
      return originalSet(sanitized);
    };
  }

  return {
    sanitizeHost,
    sanitizeSelectorText,
    sanitizeRegistry,
    sanitizeWhitelist,
    sanitizeRules,
    sanitizePayload,
    install
  };
});
