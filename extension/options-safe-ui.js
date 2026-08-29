/* global renderSiteRegistry, siteRegistryCache, siteRulesCache, normalizeSiteRegistry, hostMatches, qs */

renderSiteRegistry = function renderSiteRegistrySafely(registry) {
  globalThis.GeminiTranslatorSiteRegistryUi.render({
    document,
    root: qs('gx-site-registry'),
    registry: normalizeSiteRegistry(registry),
    rules: siteRulesCache,
    hostMatches
  });
};

renderSiteRegistry(siteRegistryCache);
