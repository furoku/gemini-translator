// Background Script - Gemini Translator (Cloud API)

const DEFAULT_MODEL = 'gemini-2.0-flash-lite';
const MODEL_MIGRATION_KEY = 'geminiModelMigratedTo25FlashLite';

const MODEL_STATS_DAY_KEY = 'modelStatsDayKey';
const MODEL_STATS_RESET_HOUR_LOCAL = 4;
const SETTINGS_SITE_WHITELIST_KEY = 'siteWhitelist';
const DYNAMIC_SCRIPT_ID = 'gx-dynamic-content';

function normalizeHost(input) {
  const raw = String(input || '').trim().toLowerCase();
  if (!raw) return '';
  const noProto = raw.replace(/^https?:\/\//, '');
  const host = noProto.split('/')[0].split(':')[0];
  return host.replace(/\.+$/, '');
}

function isXSiteHost(host) {
  const h = normalizeHost(host);
  return h === 'x.com' || h.endsWith('.x.com') || h === 'twitter.com' || h.endsWith('.twitter.com');
}

function hostToMatchPatterns(host) {
  const h = normalizeHost(host);
  if (!h) return [];
  if (h.startsWith('*.')) {
    const bare = h.replace(/^\*\./, '');
    return [`*://${h}/*`, `*://${bare}/*`];
  }
  if (h.includes('*')) {
    return [`*://${h}/*`];
  }
  return [`*://${h}/*`, `*://*.${h}/*`];
}

function uniqueList(list) {
  return Array.from(new Set(list));
}

async function updateDynamicContentScripts() {
  const res = await chrome.storage.local.get([SETTINGS_SITE_WHITELIST_KEY]);
  const whitelist = Array.isArray(res[SETTINGS_SITE_WHITELIST_KEY]) ? res[SETTINGS_SITE_WHITELIST_KEY] : [];
  const targets = whitelist.filter((host) => !isXSiteHost(host));
  const matches = uniqueList(targets.flatMap(hostToMatchPatterns));

  const allowed = [];
  for (const pattern of matches) {
    // eslint-disable-next-line no-await-in-loop
    const ok = await chrome.permissions.contains({ origins: [pattern] });
    if (ok) allowed.push(pattern);
  }

  try {
    await chrome.scripting.unregisterContentScripts({ ids: [DYNAMIC_SCRIPT_ID] });
  } catch (e) {
    // ignore if not registered
  }

  if (allowed.length === 0) return;

  await chrome.scripting.registerContentScripts([{
    id: DYNAMIC_SCRIPT_ID,
    js: ['gemlab-utils.js', 'content.js'],
    matches: allowed,
    runAt: 'document_idle'
  }]);
}

function getModelStatsDayKey(now = new Date()) {
  const shifted = new Date(now.getTime() - MODEL_STATS_RESET_HOUR_LOCAL * 60 * 60 * 1000);
  const y = shifted.getFullYear();
  const m = String(shifted.getMonth() + 1).padStart(2, '0');
  const d = String(shifted.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function ensureModelStatsResetAt4am() {
  const dayKey = getModelStatsDayKey();
  const currentData = await chrome.storage.local.get([MODEL_STATS_DAY_KEY, 'modelStats']);
  if (currentData[MODEL_STATS_DAY_KEY] !== dayKey) {
    await chrome.storage.local.set({ modelStats: {}, [MODEL_STATS_DAY_KEY]: dayKey });
    return {};
  }
  return currentData.modelStats || {};
}

const DIR_EN_JA = 'en_to_ja';
const DIR_JA_EN = 'ja_to_en';

function normalizeGlossary(glossary) {
  const list = Array.isArray(glossary) ? glossary : [];
  return list
    .map((p) => ({ from: String(p?.from || '').trim(), to: String(p?.to || '').trim() }))
    .filter((p) => p.from && p.to)
    .slice(0, 30);
}

function buildGlossaryBlock(glossary) {
  const pairs = normalizeGlossary(glossary);
  if (!pairs.length) return '';
  const lines = pairs.map((p) => `- "${p.from}" => "${p.to}"`).join('\n');
  return `\nGLOSSARY (mandatory, do not ignore):\n${lines}\n`;
}

function splitSegments(text) {
  return String(text || '').split(/\n?---SEPARATOR---\n?/);
}

function isStringArray(value) {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

function stripCodeFences(text) {
  const t = String(text || '').trim();
  if (!t.startsWith('```')) return t;
  return t.replace(/^```[a-zA-Z0-9_-]*\n?/, '').replace(/\n?```$/, '').trim();
}

function extractJsonArray(text) {
  const cleaned = stripCodeFences(text);
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    // fallthrough
  }
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start >= 0 && end > start) {
    const slice = cleaned.slice(start, end + 1);
    try {
      return JSON.parse(slice);
    } catch (e) {
      return null;
    }
  }
  return null;
}

function needsLengthFix(inputSeg, outputSeg) {
  const inText = String(inputSeg || '');
  const outText = String(outputSeg || '');
  const inLen = inText.trim().length;
  const outLen = outText.trim().length;

  if (inLen === 0) return false;

  // Translation can legitimately expand/contract across languages,
  // but if it becomes extremely short, it's likely a bad/summarized output.
  if (inLen >= 80 && outLen < Math.max(12, Math.round(inLen * 0.35))) return true;
  if (inLen >= 200 && outLen < Math.max(30, Math.round(inLen * 0.4))) return true;
  if (outLen < 8 && inLen > 40) return true;

  return false;
}

function buildPrompt(text, direction = DIR_EN_JA, glossary = []) {
  const target = direction === DIR_JA_EN ? 'English' : 'Japanese';
  return `You are a professional translator. Translate the following text to ${target}.
IMPORTANT RULES:
- Output ONLY the translation.
- Do NOT provide explanations, notes, or pronunciation guide.
- Do NOT summarize or compress the meaning. Do not omit details, entities, numbers, URLs, or quoted text.
- If the input contains placeholders like "<<GX_0_URL_0>>", preserve them EXACTLY as-is. Do not add or remove schemes (e.g., do not change a URL by adding "https://").
- Keep the separator "---SEPARATOR---" exactly as is between translation segments.
- Maintain the same number of segments as the input.
${buildGlossaryBlock(glossary)}

Input Text:
${text}`;
}

function buildArrayPrompt(texts, direction = DIR_EN_JA, glossary = []) {
  const target = direction === DIR_JA_EN ? 'English' : 'Japanese';
  const inputJson = JSON.stringify(Array.isArray(texts) ? texts : []);
  return `You are a professional translator.
Translate each item in the INPUT JSON ARRAY into ${target}.

IMPORTANT RULES:
- Output ONLY a valid JSON array of strings.
- The output JSON array length MUST equal the input length.
- Do NOT wrap in markdown/code fences.
- Do NOT add keys/objects; output must be like ["...","..."].
- Do NOT provide explanations, notes, or extra text.
- Do NOT summarize or omit details, entities, numbers, URLs, or quoted text.
- If an item contains placeholders like "<<GX_0_URL_0>>", preserve them EXACTLY as-is. Do not add or remove schemes (e.g., do not change a URL by adding "https://").
${buildGlossaryBlock(glossary)}

INPUT JSON ARRAY:
${inputJson}`;
}

function buildArrayFixPrompt(texts, draftText, direction = DIR_EN_JA, glossary = []) {
  const target = direction === DIR_JA_EN ? 'English' : 'Japanese';
  const inputJson = JSON.stringify(Array.isArray(texts) ? texts : []);
  return `You are a professional translator.
The DRAFT output is invalid or does not match the required JSON array shape.
Rewrite it correctly.

IMPORTANT RULES:
- Output ONLY a valid JSON array of strings translated to ${target}.
- The output JSON array length MUST equal the input length.
- Do NOT wrap in markdown/code fences.
- Do NOT provide explanations, notes, or extra text.
- Do NOT summarize or omit details.
- Preserve placeholders like "<<GX_0_URL_0>>" exactly as-is.
${buildGlossaryBlock(glossary)}

INPUT JSON ARRAY:
${inputJson}

DRAFT OUTPUT (invalid):
${String(draftText || '')}`;
}

function buildArrayLengthFixPrompt(texts, draftArray, direction = DIR_EN_JA, glossary = []) {
  const target = direction === DIR_JA_EN ? 'English' : 'Japanese';
  const inputJson = JSON.stringify(Array.isArray(texts) ? texts : []);
  const draftJson = JSON.stringify(isStringArray(draftArray) ? draftArray : []);
  return `You are a professional translator.
Some items in the DRAFT translation are too short and likely omitted content.
Rewrite the entire array as faithful translations to ${target}, without summarizing, and without omitting details.

IMPORTANT RULES:
- Output ONLY a valid JSON array of strings.
- The output JSON array length MUST equal the input length.
- Do NOT wrap in markdown/code fences.
- Preserve placeholders like "<<GX_0_URL_0>>" exactly as-is.
- For each item, do not drastically shorten compared to the input item. Expand by translating missing information (do not invent new information).
${buildGlossaryBlock(glossary)}

INPUT JSON ARRAY:
${inputJson}

DRAFT JSON ARRAY:
${draftJson}`;
}

function buildLengthFixPrompt(inputText, draftText, direction = DIR_EN_JA, glossary = []) {
  const target = direction === DIR_JA_EN ? 'English' : 'Japanese';
  return `You are a professional translator. The following DRAFT translation is too short and likely omitted content.
Rewrite it as a faithful translation to ${target}, without summarizing, and without omitting details.

IMPORTANT RULES:
- Output ONLY the translation.
- If the input contains placeholders like "<<GX_0_URL_0>>", preserve them EXACTLY as-is.
- Keep the separator "---SEPARATOR---" exactly as is between translation segments.
- Maintain the same number of segments as the input.
- For each segment, do not drastically shorten compared to the input segment. If the draft is short, expand by translating the missing information (not by adding new information).
${buildGlossaryBlock(glossary)}

Input Text:
${inputText}

Draft Translation:
${draftText}`;
}

function buildSegmentFixPrompt(inputText, draftText, direction = DIR_EN_JA, glossary = []) {
  const target = direction === DIR_JA_EN ? 'English' : 'Japanese';
  return `You are a professional translator. The following DRAFT translation has an INVALID segment structure.
Rewrite it as a faithful translation to ${target}.

IMPORTANT RULES:
- Output ONLY the translation.
- Do NOT summarize or omit details.
- If the input contains placeholders like "<<GX_0_URL_0>>", preserve them EXACTLY as-is.
- Keep the separator "---SEPARATOR---" exactly as is between translation segments.
- Maintain the same number of segments as the input. Do not add or remove separators.
${buildGlossaryBlock(glossary)}

Input Text:
${inputText}

Draft Translation:
${draftText}`;
}

async function translateWithGeminiPrompt(prompt, apiKey, modelName = DEFAULT_MODEL) {
  if (!apiKey) {
    throw new Error('API Key is missing. Please set it in the extension options.');
  }

  const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`;

  const response = await fetch(`${API_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: String(prompt || '') }] }]
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error('Gemini API Error:', errorData);
    const status = response.status;
    const reason = errorData.error?.message || 'Failed to fetch from Gemini API';
    throw new Error(`HTTP ${status}: ${reason}`);
  }

  const data = await response.json();
  const out = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!out) {
    throw new Error('No translation in response');
  }

  return out;
}

async function translateWithGemini(text, apiKey, modelName = DEFAULT_MODEL, direction = DIR_EN_JA, glossary = []) {
  if (!apiKey) {
    throw new Error('API Key is missing. Please set it in the extension options.');
  }

  const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`;

  const response = await fetch(`${API_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents: [{
        parts: [{
          text: buildPrompt(text, direction, glossary)
        }]
      }]
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error('Gemini API Error:', errorData);
    const status = response.status;
    const reason = errorData.error?.message || 'Failed to fetch from Gemini API';
    throw new Error(`HTTP ${status}: ${reason}`);
  }

  const data = await response.json();
  const translation = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!translation) {
    throw new Error('No translation in response');
  }

  return translation;
}

async function translateArrayWithGemini(texts, apiKey, modelName = DEFAULT_MODEL, direction = DIR_EN_JA, glossary = []) {
  if (!apiKey) {
    throw new Error('API Key is missing. Please set it in the extension options.');
  }

  const input = Array.isArray(texts) ? texts.map((t) => String(t ?? '')) : [];
  if (!input.length) return [];

  const raw1 = await translateWithGeminiPrompt(buildArrayPrompt(input, direction, glossary), apiKey, modelName);
  let arr = extractJsonArray(raw1);

  if (!isStringArray(arr) || arr.length !== input.length) {
    const raw2 = await translateWithGeminiPrompt(buildArrayFixPrompt(input, raw1, direction, glossary), apiKey, modelName);
    arr = extractJsonArray(raw2);
  }

  if (!isStringArray(arr) || arr.length !== input.length) {
    throw new Error('Invalid translation structure');
  }

  const bad = input.some((s, i) => needsLengthFix(s, arr[i]));
  if (bad) {
    try {
      const raw3 = await translateWithGeminiPrompt(buildArrayLengthFixPrompt(input, arr, direction, glossary), apiKey, modelName);
      const arr3 = extractJsonArray(raw3);
      if (isStringArray(arr3) && arr3.length === input.length) return arr3;
    } catch (e) {
      // ignore and fallback to arr
    }
  }

  return arr;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'gx-update-content-scripts') {
    updateDynamicContentScripts()
      .then(() => sendResponse({ success: true }))
      .catch((e) => sendResponse({ success: false, error: e?.message || String(e) }));
    return true;
  }
  if (message?.type === 'OPEN_OPTIONS_PAGE') {
    try {
      chrome.runtime.openOptionsPage();
      sendResponse({ success: true });
    } catch (e) {
      sendResponse({ success: false, error: e?.message || String(e) });
    }
    return true;
  }
  if (message.type === 'TRANSLATE_TEXT_BG') {
    (async () => {
      try {
        // Get Settings & State
        const settings = await chrome.storage.local.get([
          'geminiApiKey',
          'geminiModel',
          'isAutoTranslateEnabled',
          'statsInputChars',
          'statsOutputChars',
          'translationDirection',
          'glossaryPairs',
          MODEL_MIGRATION_KEY
        ]);

        // Check if Enabled (Default true). Allow manual/forced translation.
        if (settings.isAutoTranslateEnabled === false && !message.force) {
          sendResponse({ success: false, error: 'Translation disabled by user.' });
          return;
        }

        const apiKey = settings.geminiApiKey;
        let model = settings.geminiModel || DEFAULT_MODEL;
        if (!settings[MODEL_MIGRATION_KEY]) {
          model = DEFAULT_MODEL;
          await chrome.storage.local.set({
            geminiModel: DEFAULT_MODEL,
            [MODEL_MIGRATION_KEY]: true
          });
        }
        const direction = message.direction || settings.translationDirection || DIR_EN_JA;
        const glossary = normalizeGlossary(message.glossary || settings.glossaryPairs || []);

        const inputTexts = Array.isArray(message.texts)
          ? message.texts.map((t) => String(t ?? ''))
          : splitSegments(message.text);

        // Execute Translation (prefer JSON array to avoid delimiter issues)
        let translations = null;
        try {
          translations = await translateArrayWithGemini(inputTexts, apiKey, model, direction, glossary);
        } catch (e) {
          // Backward-compatible fallback to legacy delimiter prompt
          const joined = inputTexts.join('\n---SEPARATOR---\n');
          let translation = await translateWithGemini(joined, apiKey, model, direction, glossary);

          // Fallbacks: fix segment structure first, then fix extreme shortening.
          try {
            const inSegs = splitSegments(joined);
            let outSegs = splitSegments(translation);

            if (outSegs.length !== inSegs.length) {
              const fixedStructure = await translateWithGeminiPrompt(buildSegmentFixPrompt(joined, translation, direction, glossary), apiKey, model);
              if (splitSegments(fixedStructure).length === inSegs.length) {
                translation = fixedStructure;
                outSegs = splitSegments(translation);
              }
            }

            const sameCount = inSegs.length === outSegs.length;
            const bad = sameCount && inSegs.some((s, i) => needsLengthFix(s, outSegs[i]));
            if (bad) {
              const fixed = await translateWithGeminiPrompt(buildLengthFixPrompt(joined, translation, direction, glossary), apiKey, model);
              if (splitSegments(fixed).length === inSegs.length) translation = fixed;
            }
          } catch (e2) {
            // ignore
          }

          const outSegs = splitSegments(translation);
          if (outSegs.length !== inputTexts.length) throw e;
          translations = outSegs;
        }

        // Update Stats (Async, no await needed)
        const inputLen = inputTexts.reduce((sum, t) => sum + String(t || '').length, 0);
        const outputLen = (translations || []).reduce((sum, t) => sum + String(t || '').length, 0);

        const modelStats = await ensureModelStatsResetAt4am();

        // Initialize entries if missing
        if (!modelStats[model]) {
          modelStats[model] = { input: 0, output: 0 };
        }

        // Increment per-model stats
        modelStats[model].input += inputLen;
        modelStats[model].output += outputLen;

        chrome.storage.local.set({ modelStats: modelStats });

        sendResponse({ success: true, data: translations });
      } catch (e) {
        console.error('Translation failed:', e);
        // If API key is missing, try opening options page
        if (e.message.includes('API Key is missing')) {
          chrome.runtime.openOptionsPage();
        }
        sendResponse({ success: false, error: e.message });
      }
    })();
    return true; // Async response
  }
});

chrome.runtime.onInstalled.addListener(() => {
  updateDynamicContentScripts().catch(() => {});
});

chrome.runtime.onStartup.addListener(() => {
  updateDynamicContentScripts().catch(() => {});
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;
  if (changes[SETTINGS_SITE_WHITELIST_KEY]) {
    updateDynamicContentScripts().catch(() => {});
  }
});
