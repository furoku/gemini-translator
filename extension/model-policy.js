(function attachModelPolicy(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.GeminiTranslatorModelPolicy = api;
})(globalThis, function createModelPolicy() {
  const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
  const SUPPORTED_MODELS = Object.freeze([
    DEFAULT_MODEL,
    'gemini-3.1-flash-lite',
    'gemini-2.5-flash-lite'
  ]);
  const LEGACY_MODELS = new Set([
    'gemini-2.0-flash',
    'gemini-2.0-flash-001',
    'gemini-2.0-flash-lite',
    'gemini-2.0-flash-lite-001',
    'gemini-2.0-flash-lite-preview',
    'gemini-2.0-flash-lite-preview-02-05',
    'gemini-2.5-flash-lite-preview-09-2025',
    'gemini-3.1-flash-lite-preview'
  ]);
  const CURRENT_MIGRATION_KEY = 'geminiModelMigratedTo35FlashLite';
  const LEGACY_MIGRATION_KEY = 'geminiModelMigratedTo25FlashLite';

  function normalizeModel(value) {
    const model = String(value || '').trim();
    if (SUPPORTED_MODELS.includes(model)) return model;
    if (!model || LEGACY_MODELS.has(model)) return DEFAULT_MODEL;
    return DEFAULT_MODEL;
  }

  async function migrateLocalStorage(storageArea) {
    if (!storageArea?.get || !storageArea?.set) {
      throw new Error('Chrome local storage is unavailable');
    }
    const current = await storageArea.get([
      'geminiModel',
      CURRENT_MIGRATION_KEY,
      LEGACY_MIGRATION_KEY
    ]);
    const normalized = normalizeModel(current.geminiModel);
    const needsWrite =
      normalized !== current.geminiModel ||
      current[CURRENT_MIGRATION_KEY] !== true ||
      current[LEGACY_MIGRATION_KEY] !== true;
    if (needsWrite) {
      await storageArea.set({
        geminiModel: normalized,
        [CURRENT_MIGRATION_KEY]: true,
        [LEGACY_MIGRATION_KEY]: true
      });
    }
    return normalized;
  }

  return {
    DEFAULT_MODEL,
    SUPPORTED_MODELS,
    LEGACY_MODELS,
    CURRENT_MIGRATION_KEY,
    LEGACY_MIGRATION_KEY,
    normalizeModel,
    migrateLocalStorage
  };
});
