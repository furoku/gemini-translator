/* global chrome */

const DEFAULT_MODEL = 'gemini-2.0-flash-lite';
const DIR_EN_JA = 'en_to_ja';
const DIR_JA_EN = 'ja_to_en';
const API_KEY_REGEX = /^AIza[0-9A-Za-z\-_]{35}$/;
const TEST_TIMEOUT_MS = 5000;

const SETTINGS_EXCLUDE_KEYWORDS_KEY = 'excludeKeywords';
const SETTINGS_DAILY_COST_LIMIT_USD_KEY = 'dailyCostLimitUsd';
const SETTINGS_DAILY_TOTAL_CHARS_LIMIT_KEY = 'dailyTotalCharsLimit';
const SETTINGS_GLOSSARY_KEY = 'glossaryPairs';
const SETTINGS_SITE_WHITELIST_KEY = 'siteWhitelist';
const SETTINGS_SITE_MODE_KEY = 'siteMode';
const SETTINGS_SITE_RULES_KEY = 'siteRules';
const SETTINGS_TRANSLATE_COLOR_DEFAULT_KEY = 'translateColorDefault';
const SETTINGS_TRANSLATE_COLOR_RULES_KEY = 'translateColorRules';

const qs = (id) => document.getElementById(id);
const statusEl = () => qs('gx-status');

function setStatus(text, tone = 'info') {
  const el = statusEl();
  if (!el) return;
  el.textContent = text;
  if (tone === 'error') el.style.color = '#f4212e';
  else if (tone === 'success') el.style.color = '#00ba7c';
  else el.style.color = '#536471';
}

function parseLineList(input) {
  return String(input || '')
    .split(/\r?\n|,/g)
    .map((s) => s.trim())
    .filter(Boolean);
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

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs && tabs[0] ? tabs[0] : null;
}

async function loadSettings() {
  const res = await chrome.storage.local.get([
    'geminiModel',
    'translationDirection',
    'isAutoTranslateEnabled',
    'geminiApiKey',
    SETTINGS_EXCLUDE_KEYWORDS_KEY,
    SETTINGS_DAILY_COST_LIMIT_USD_KEY,
    SETTINGS_DAILY_TOTAL_CHARS_LIMIT_KEY,
    SETTINGS_GLOSSARY_KEY,
    SETTINGS_SITE_WHITELIST_KEY,
    SETTINGS_SITE_MODE_KEY,
    SETTINGS_SITE_RULES_KEY,
    SETTINGS_TRANSLATE_COLOR_DEFAULT_KEY,
    SETTINGS_TRANSLATE_COLOR_RULES_KEY
  ]);
  qs('gx-model').value = res.geminiModel || DEFAULT_MODEL;
  qs('gx-direction').value = res.translationDirection || DIR_EN_JA;
  qs('gx-auto').checked = res.isAutoTranslateEnabled !== false;
  qs('gx-apikey').value = (res.geminiApiKey || '').trim();
  qs('gx-exclude-keywords').value = (res[SETTINGS_EXCLUDE_KEYWORDS_KEY] || []).join('\n');
  qs('gx-cost-limit').value = (typeof res[SETTINGS_DAILY_COST_LIMIT_USD_KEY] === 'number')
    ? String(res[SETTINGS_DAILY_COST_LIMIT_USD_KEY])
    : '';
  qs('gx-chars-limit').value = (typeof res[SETTINGS_DAILY_TOTAL_CHARS_LIMIT_KEY] === 'number')
    ? String(res[SETTINGS_DAILY_TOTAL_CHARS_LIMIT_KEY])
    : '';
  const gp = Array.isArray(res[SETTINGS_GLOSSARY_KEY]) ? res[SETTINGS_GLOSSARY_KEY] : [];
  qs('gx-glossary').value = gp
    .map((p) => `${String(p?.from || '').trim()}=${String(p?.to || '').trim()}`)
    .filter(Boolean)
    .join('\n');
  const whitelist = Array.isArray(res[SETTINGS_SITE_WHITELIST_KEY]) ? res[SETTINGS_SITE_WHITELIST_KEY] : [];
  qs('gx-whitelist').value = whitelist.map(normalizeHost).filter(Boolean).join('\n');
  qs('gx-site-mode').value = res[SETTINGS_SITE_MODE_KEY] === 'advanced' ? 'advanced' : 'simple';
  qs('gx-site-rules').value = formatSiteRules(res[SETTINGS_SITE_RULES_KEY]);
  qs('gx-translate-color-default').value = normalizeColorName(res[SETTINGS_TRANSLATE_COLOR_DEFAULT_KEY]) || 'inherit';
  qs('gx-translate-color-rules').value = formatColorRules(res[SETTINGS_TRANSLATE_COLOR_RULES_KEY]);
  setStatus('準備完了', 'info');
}

async function saveAll({ validateKey = false } = {}) {
  const model = qs('gx-model').value || DEFAULT_MODEL;
  const direction = qs('gx-direction').value === DIR_JA_EN ? DIR_JA_EN : DIR_EN_JA;
  const apiKey = (qs('gx-apikey').value || '').trim();
  if (apiKey && !API_KEY_REGEX.test(apiKey)) {
    setStatus('APIキーの形式が正しくありません', 'error');
    return;
  }
  if (validateKey && apiKey) {
    try {
      setStatus('キー確認中...', 'info');
      await testApiKey(apiKey, model);
    } catch (e) {
      setStatus(`キー確認失敗: ${e.message || String(e)}`, 'error');
      return;
    }
  }

  const excludeKeywords = parseLineList(qs('gx-exclude-keywords').value).map((s) => s.toLowerCase()).filter(Boolean);
  const dailyCostLimitUsd = parseCostLimit(qs('gx-cost-limit').value);
  const dailyTotalCharsLimit = parseCharsLimit(qs('gx-chars-limit').value);
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
    [SETTINGS_GLOSSARY_KEY]: glossaryPairs,
    [SETTINGS_SITE_WHITELIST_KEY]: siteWhitelist,
    [SETTINGS_SITE_MODE_KEY]: siteMode,
    [SETTINGS_SITE_RULES_KEY]: siteRules,
    [SETTINGS_TRANSLATE_COLOR_DEFAULT_KEY]: translateColorDefault,
    [SETTINGS_TRANSLATE_COLOR_RULES_KEY]: translateColorRules
  });

  const tab = await getActiveTab();
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: 'PAGE_SET_DIRECTION', direction });
  }
  setStatus('設定を保存しました', 'success');
}

async function saveAutoToggle() {
  const enabled = !!qs('gx-auto').checked;
  await chrome.storage.local.set({ isAutoTranslateEnabled: enabled });
  const tab = await getActiveTab();
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: 'PAGE_SET_AUTO', enabled });
  }
  setStatus(enabled ? '自動翻訳をオンにしました' : '自動翻訳をオフにしました', 'success');
}

async function sendPageCommand(type) {
  const tab = await getActiveTab();
  if (!tab?.id) {
    setStatus('有効なタブが見つかりません', 'error');
    return;
  }
  chrome.tabs.sendMessage(tab.id, { type }, (resp) => {
    if (chrome.runtime.lastError) {
      setStatus('このページでは操作できません', 'error');
      return;
    }
    if (resp?.success) {
      setStatus(type === 'PAGE_CLEAR_CACHE' ? 'キャッシュを消去しました' : '再翻訳を開始しました', 'success');
    } else {
      setStatus('操作に失敗しました', 'error');
    }
  });
}

async function refreshSiteStatus() {
  const tab = await getActiveTab();
  if (!tab?.id) return;
  chrome.tabs.sendMessage(tab.id, { type: 'PAGE_GET_STATUS' }, (resp) => {
    if (chrome.runtime.lastError) {
      qs('gx-site-status').textContent = 'このページでは状態取得できません。';
      return;
    }
    const status = resp || {};
    const allowed = status.isSiteAllowed ? '対象' : '対象外';
    const mode = status.siteMode === 'advanced' ? '上級' : '簡易';
    const type = status.isXHost ? 'X/Twitter' : '一般サイト';
    qs('gx-site-status').textContent = `${type} / ${allowed} / モード: ${mode}`;
  });
}

async function init() {
  const tab = await getActiveTab();
  if (tab?.url) {
    try {
      const host = new URL(tab.url).host;
      qs('gx-host').textContent = host ? `現在のページ: ${host}` : '現在のページ: -';
    } catch (e) {
      qs('gx-host').textContent = '現在のページ: -';
    }
  }

  await loadSettings();
  await refreshSiteStatus();

  qs('gx-model').addEventListener('change', () => saveAll({ validateKey: false }));
  qs('gx-direction').addEventListener('change', () => saveAll({ validateKey: false }));
  qs('gx-auto').addEventListener('change', saveAutoToggle);
  qs('gx-retranslate').addEventListener('click', () => sendPageCommand('PAGE_RETRANSLATE'));
  qs('gx-clear-cache').addEventListener('click', () => sendPageCommand('PAGE_CLEAR_CACHE'));
  qs('gx-save').addEventListener('click', () => saveAll({ validateKey: true }));
  qs('gx-test').addEventListener('click', () => saveAll({ validateKey: true }));
  const autosaveIds = [
    'gx-exclude-keywords',
    'gx-cost-limit',
    'gx-chars-limit',
    'gx-whitelist',
    'gx-translate-color-default',
    'gx-translate-color-rules',
    'gx-site-mode',
    'gx-site-rules',
    'gx-glossary',
    'gx-apikey'
  ];
  autosaveIds.forEach((id) => {
    const el = qs(id);
    if (!el) return;
    el.addEventListener('change', () => saveAll({ validateKey: false }));
  });
  qs('gx-open-options').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
}

init();
