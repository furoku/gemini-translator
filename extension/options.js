/* global chrome */

const DEFAULT_MODEL = 'gemini-2.0-flash-lite';
const MODEL_MIGRATION_KEY = 'geminiModelMigratedTo25FlashLite';
const MODEL_STATS_DAY_KEY = 'modelStatsDayKey';
const MODEL_STATS_RESET_HOUR_LOCAL = 4;

const DIR_EN_JA = 'en_to_ja';
const DIR_JA_EN = 'ja_to_en';

const SETTINGS_EXCLUDE_KEYWORDS_KEY = 'excludeKeywords';
const SETTINGS_DAILY_COST_LIMIT_USD_KEY = 'dailyCostLimitUsd';
const SETTINGS_DAILY_TOTAL_CHARS_LIMIT_KEY = 'dailyTotalCharsLimit';
const SETTINGS_CACHE_ENABLED_KEY = 'enableTranslationCache';
const SETTINGS_GLOSSARY_KEY = 'glossaryPairs';
const SETTINGS_SITE_WHITELIST_KEY = 'siteWhitelist';
const SETTINGS_SITE_MODE_KEY = 'siteMode';
const SETTINGS_SITE_RULES_KEY = 'siteRules';
const SETTINGS_TRANSLATE_COLOR_DEFAULT_KEY = 'translateColorDefault';
const SETTINGS_TRANSLATE_COLOR_RULES_KEY = 'translateColorRules';

const API_KEY_REGEX = /^AIza[0-9A-Za-z\-_]{35}$/;
const TEST_TIMEOUT_MS = 5000;

function getModelStatsDayKey(now = new Date()) {
  const shifted = new Date(now.getTime() - MODEL_STATS_RESET_HOUR_LOCAL * 60 * 60 * 1000);
  const y = shifted.getFullYear();
  const m = String(shifted.getMonth() + 1).padStart(2, '0');
  const d = String(shifted.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function setMsg(el, text, ok) {
  el.textContent = String(text || '');
  el.classList.remove('ok', 'ng');
  if (ok === true) el.classList.add('ok');
  if (ok === false) el.classList.add('ng');
}

function parseLineList(input) {
  return String(input || '')
    .split(/\r?\n|,/g)
    .map((s) => s.trim())
    .filter(Boolean);
}


function parseCostLimit(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function parseCharsLimit(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  const n = Number(s.replace(/,/g, ''));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

function parseGlossaryPairs(input) {
  const lines = parseLineList(input);
  const pairs = [];
  for (const line of lines) {
    const m = String(line).match(/^(.+?)(?:=|=>|→)(.+)$/);
    if (!m) continue;
    const from = String(m[1]).trim();
    const to = String(m[2]).trim();
    if (!from || !to) continue;
    pairs.push({ from, to });
    if (pairs.length >= 30) break;
  }
  return pairs;
}

function normalizeHost(input) {
  const raw = String(input || '').trim().toLowerCase();
  if (!raw) return '';
  const noProto = raw.replace(/^https?:\/\//, '');
  const host = noProto.split('/')[0].split(':')[0];
  return host.replace(/\.+$/, '');
}

function parseWhitelist(input) {
  return parseLineList(input)
    .map(normalizeHost)
    .filter(Boolean);
}

function parseSiteRules(input) {
  const lines = parseLineList(input);
  const rules = [];
  lines.forEach((line) => {
    const parts = String(line || '').split('|').map((s) => s.trim());
    const host = normalizeHost(parts[0]);
    if (!host) return;
    const include = parts[1] || '';
    const exclude = parts[2] || '';
    rules.push({ host, include, exclude });
  });
  return rules;
}

function normalizeColorName(input) {
  const s = String(input || '').trim().toLowerCase();
  if (s === 'inherit') return 'inherit';
  if (s === 'blue') return 'blue';
  if (s === 'green') return 'green';
  if (s === 'orange') return 'orange';
  return '';
}

function parseColorRules(input) {
  const lines = parseLineList(input);
  const rules = [];
  lines.forEach((line) => {
    const parts = String(line || '').split('|').map((s) => s.trim());
    const host = normalizeHost(parts[0]);
    if (!host) return;
    const color = normalizeColorName(parts[1]);
    if (!color) return;
    rules.push({ host, color });
  });
  return rules;
}

function formatColorRules(rules) {
  const list = Array.isArray(rules) ? rules : [];
  return list
    .map((r) => {
      const host = normalizeHost(r?.host);
      const color = normalizeColorName(r?.color);
      if (!host || !color) return '';
      return `${host} | ${color}`.trim();
    })
    .filter(Boolean)
    .join('\n');
}

function formatSiteRules(rules) {
  const list = Array.isArray(rules) ? rules : [];
  return list
    .map((r) => {
      const host = normalizeHost(r?.host);
      if (!host) return '';
      const include = String(r?.include || '').trim();
      const exclude = String(r?.exclude || '').trim();
      return `${host} | ${include} | ${exclude}`.trim();
    })
    .filter(Boolean)
    .join('\n');
}

async function testApiKey(key, model) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TEST_TIMEOUT_MS);
  try {
    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:countTokens?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: 'ping' }] }] }),
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      if (resp.status === 403) throw new Error('キーが無効か権限がありません (403)');
      if (resp.status === 429) throw new Error('リクエスト上限に達しました (429)');
      throw new Error(err.error?.message || `HTTP ${resp.status}`);
    }
  } catch (e) {
    clearTimeout(timer);
    if (e.name === 'AbortError') throw new Error('キー確認がタイムアウトしました (5秒)');
    throw e;
  }
}

function humanizeKeyTestError(err) {
  const msg = String(err?.message || err || '');
  const m = msg.toLowerCase();
  if (!msg) return '確認に失敗しました。もう一度お試しください。';
  if (m.includes('403') || m.includes('permission') || m.includes('unauth')) return 'このAPIキーでは利用できません。キーと権限を確認してください。';
  if (m.includes('429')) return '混み合っています。少し待ってからもう一度お試しください。';
  if (m.includes('timeout') || m.includes('5秒') || m.includes('abort')) return '通信がタイムアウトしました。時間をおいて再試行してください。';
  return '確認に失敗しました。キーを確認して、もう一度お試しください。';
}

function qs(id) {
  return document.getElementById(id);
}

async function load() {
  qs('gx-daykey').textContent = `DayKey: ${getModelStatsDayKey()}`;
  try {
    if (chrome?.runtime?.getManifest) {
      const v = chrome.runtime.getManifest().version || '-';
      const el = qs('gx-brand-version');
      if (el) el.textContent = `バージョン ${v}`;
      const who = qs('gx-brand-author');
      if (who) {
        who.textContent = 'Mojofull';
        if (who.tagName === 'A') who.setAttribute('href', 'https://bit.ly/4shaBYM');
      }
    }
  } catch (e) {
    // ignore
  }

  const res = await chrome.storage.local.get([
    'geminiApiKey',
    'geminiModel',
    'translationDirection',
    SETTINGS_EXCLUDE_KEYWORDS_KEY,
    SETTINGS_DAILY_COST_LIMIT_USD_KEY,
    SETTINGS_DAILY_TOTAL_CHARS_LIMIT_KEY,
    SETTINGS_CACHE_ENABLED_KEY,
    SETTINGS_GLOSSARY_KEY,
    SETTINGS_SITE_WHITELIST_KEY,
    SETTINGS_SITE_MODE_KEY,
    SETTINGS_SITE_RULES_KEY,
    SETTINGS_TRANSLATE_COLOR_DEFAULT_KEY,
    SETTINGS_TRANSLATE_COLOR_RULES_KEY,
    MODEL_MIGRATION_KEY
  ]);

  const model = res.geminiModel || DEFAULT_MODEL;
  qs('gx-model').value = model;

  const dir = res.translationDirection || DIR_EN_JA;
  qs('gx-direction').value = (dir === DIR_JA_EN) ? DIR_JA_EN : DIR_EN_JA;

  qs('gx-apikey').value = (res.geminiApiKey || '').trim();

  const keywords = (res[SETTINGS_EXCLUDE_KEYWORDS_KEY] || [])
    .map((s) => String(s || '').trim().toLowerCase())
    .filter(Boolean);
  qs('gx-exclude-keywords').value = keywords.join('\n');

  const costLimit = (typeof res[SETTINGS_DAILY_COST_LIMIT_USD_KEY] === 'number') ? res[SETTINGS_DAILY_COST_LIMIT_USD_KEY] : null;
  qs('gx-cost-limit').value = costLimit ? String(costLimit) : '';

  const charsLimit = (typeof res[SETTINGS_DAILY_TOTAL_CHARS_LIMIT_KEY] === 'number') ? res[SETTINGS_DAILY_TOTAL_CHARS_LIMIT_KEY] : null;
  qs('gx-chars-limit').value = charsLimit ? String(charsLimit) : '';

  qs('gx-cache-enabled').checked = res[SETTINGS_CACHE_ENABLED_KEY] !== false;
  const gp = Array.isArray(res[SETTINGS_GLOSSARY_KEY]) ? res[SETTINGS_GLOSSARY_KEY] : [];
  const pairs = gp
    .map((p) => ({ from: String(p?.from || '').trim(), to: String(p?.to || '').trim() }))
    .filter((p) => p.from && p.to)
    .slice(0, 30);
  qs('gx-glossary').value = pairs.map((p) => `${p.from}=${p.to}`).join('\n');

  const whitelist = Array.isArray(res[SETTINGS_SITE_WHITELIST_KEY]) ? res[SETTINGS_SITE_WHITELIST_KEY] : [];
  qs('gx-whitelist').value = whitelist.map(normalizeHost).filter(Boolean).join('\n');
  qs('gx-site-mode').value = (res[SETTINGS_SITE_MODE_KEY] === 'advanced') ? 'advanced' : 'simple';
  qs('gx-site-rules').value = formatSiteRules(res[SETTINGS_SITE_RULES_KEY]);
  qs('gx-translate-color-default').value = normalizeColorName(res[SETTINGS_TRANSLATE_COLOR_DEFAULT_KEY]) || 'inherit';
  qs('gx-translate-color-rules').value = formatColorRules(res[SETTINGS_TRANSLATE_COLOR_RULES_KEY]);
}

async function save({ validateKey = true } = {}) {
  const msg = qs('gx-msg');
  setMsg(msg, '保存中...', true);

  const model = qs('gx-model').value || DEFAULT_MODEL;
  const direction = qs('gx-direction').value === DIR_JA_EN ? DIR_JA_EN : DIR_EN_JA;
  const apiKey = (qs('gx-apikey').value || '').trim();

  if (apiKey && !API_KEY_REGEX.test(apiKey)) {
    setMsg(msg, 'APIキーの形式が正しくありません', false);
    return;
  }
  if (validateKey && apiKey) {
    try {
      setMsg(msg, 'キー確認中...', true);
      await testApiKey(apiKey, model);
    } catch (e) {
      setMsg(msg, humanizeKeyTestError(e), false);
      return;
    }
  }

  const excludeKeywords = parseLineList(qs('gx-exclude-keywords').value)
    .map((s) => String(s || '').trim().toLowerCase())
    .filter(Boolean);

  const dailyCostLimitUsd = parseCostLimit(qs('gx-cost-limit').value);
  const dailyTotalCharsLimit = parseCharsLimit(qs('gx-chars-limit').value);

  const enableTranslationCache = !!qs('gx-cache-enabled').checked;
  const glossaryPairs = parseGlossaryPairs(qs('gx-glossary').value);
  const siteWhitelist = parseWhitelist(qs('gx-whitelist').value);
  const siteMode = qs('gx-site-mode').value === 'advanced' ? 'advanced' : 'simple';
  const siteRules = parseSiteRules(qs('gx-site-rules').value);
  const translateColorDefault = normalizeColorName(qs('gx-translate-color-default').value) || 'inherit';
  const translateColorRules = parseColorRules(qs('gx-translate-color-rules').value);

  await chrome.storage.local.set({
    geminiModel: model,
    translationDirection: direction,
    geminiApiKey: apiKey || '',
    [SETTINGS_EXCLUDE_KEYWORDS_KEY]: excludeKeywords,
    [SETTINGS_DAILY_COST_LIMIT_USD_KEY]: dailyCostLimitUsd,
    [SETTINGS_DAILY_TOTAL_CHARS_LIMIT_KEY]: dailyTotalCharsLimit,
    [SETTINGS_CACHE_ENABLED_KEY]: enableTranslationCache,
    [SETTINGS_GLOSSARY_KEY]: glossaryPairs,
    [SETTINGS_SITE_WHITELIST_KEY]: siteWhitelist,
    [SETTINGS_SITE_MODE_KEY]: siteMode,
    [SETTINGS_SITE_RULES_KEY]: siteRules,
    [SETTINGS_TRANSLATE_COLOR_DEFAULT_KEY]: translateColorDefault,
    [SETTINGS_TRANSLATE_COLOR_RULES_KEY]: translateColorRules,
    [MODEL_MIGRATION_KEY]: true
  });

  setMsg(msg, '保存しました', true);
  setTimeout(() => setMsg(msg, '', null), 2000);
}

async function resetStats() {
  const el = qs('gx-reset-msg');
  setMsg(el, '統計をリセット中...', true);
  const dayKey = getModelStatsDayKey();
  await chrome.storage.local.set({ modelStats: {}, [MODEL_STATS_DAY_KEY]: dayKey });
  setMsg(el, '統計をリセットしました', true);
  setTimeout(() => setMsg(el, '', null), 2500);
}

async function resetSettings() {
  const el = qs('gx-reset-msg');
  setMsg(el, '設定を初期化中...', true);
  await chrome.storage.local.set({
    translationDirection: DIR_EN_JA,
    [SETTINGS_EXCLUDE_KEYWORDS_KEY]: [],
    [SETTINGS_DAILY_COST_LIMIT_USD_KEY]: null,
    [SETTINGS_DAILY_TOTAL_CHARS_LIMIT_KEY]: null,
    [SETTINGS_CACHE_ENABLED_KEY]: true,
    [SETTINGS_GLOSSARY_KEY]: [],
    [SETTINGS_SITE_WHITELIST_KEY]: [],
    [SETTINGS_SITE_MODE_KEY]: 'simple',
    [SETTINGS_SITE_RULES_KEY]: [],
    [SETTINGS_TRANSLATE_COLOR_DEFAULT_KEY]: 'inherit',
    [SETTINGS_TRANSLATE_COLOR_RULES_KEY]: []
  });
  await load();
  setMsg(el, '設定を初期化しました（APIキーは保持）', true);
  setTimeout(() => setMsg(el, '', null), 3000);
}

function bind() {
  qs('gx-save').addEventListener('click', () => save({ validateKey: true }));
  qs('gx-test').addEventListener('click', async () => {
    const msg = qs('gx-msg');
    const key = (qs('gx-apikey').value || '').trim();
    const model = qs('gx-model').value || DEFAULT_MODEL;
    if (!key) {
      setMsg(msg, 'APIキーを入力してください', false);
      return;
    }
    if (!API_KEY_REGEX.test(key)) {
      setMsg(msg, 'APIキーの形式が正しくありません', false);
      return;
    }
    try {
      setMsg(msg, 'キー確認中...', true);
      await testApiKey(key, model);
      setMsg(msg, 'キーは有効です', true);
    } catch (e) {
      setMsg(msg, `キー確認失敗: ${e.message || String(e)}`, false);
    }
  });

  // Autosave on change (best-effort, without key validation to avoid noisy network)
  const autosaveIds = [
    'gx-model',
    'gx-direction',
    'gx-cost-limit',
    'gx-chars-limit',
    'gx-exclude-keywords',
    'gx-glossary',
    'gx-whitelist',
    'gx-site-mode',
    'gx-site-rules',
    'gx-translate-color-default',
    'gx-translate-color-rules',
    'gx-cache-enabled'
  ];
  autosaveIds.forEach((id) => {
    qs(id).addEventListener('change', () => save({ validateKey: false }));
  });

  qs('gx-reset-stats').addEventListener('click', resetStats);
  qs('gx-reset-settings').addEventListener('click', resetSettings);

  const insertExample = (id, example) => {
    const el = qs(id);
    if (!el) return;
    const current = String(el.value || '').trim();
    el.value = current ? `${current}\n${example}` : example;
    save({ validateKey: false });
  };

  qs('gx-insert-whitelist-example')?.addEventListener('click', () => {
    insertExample('gx-whitelist', 'x.com\nexample.com\nnews.example.com');
  });

  qs('gx-insert-rules-example')?.addEventListener('click', () => {
    insertExample(
      'gx-site-rules',
      'example.com | main, article | header, footer, nav, .menu\nnews.example.com | #content | .sidebar, .footer'
    );
  });

  qs('gx-insert-color-example')?.addEventListener('click', () => {
    insertExample('gx-translate-color-rules', 'x.com | blue\nexample.com | green');
  });
}

(async function main() {
  bind();
  await load();
})();
