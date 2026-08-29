import './model-policy.js';

const policy = globalThis.GeminiTranslatorModelPolicy;
try {
  await policy.migrateLocalStorage(chrome.storage.local);
} catch (error) {
  console.warn('[Gemini Translator] model migration failed', error);
}

await import('./background.js');
