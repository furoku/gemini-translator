/* global chrome */

const DEFAULT_MODEL = 'gemini-2.5-flash-lite';
const CHARS_PER_TOKEN = 4;
const PRICING = {
  'gemini-2.5-flash-lite': { input: 0.10, output: 0.40 },
  'gemini-2.0-flash-lite': { input: 0.075, output: 0.30 },
  'gemini-2.0-flash': { input: 0.10, output: 0.40 },
  'gemini-2.5-flash': { input: 0.30, output: 2.50 },
  'gemini-3-flash-preview': { input: 0.30, output: 2.50 },
  'default': { input: 0.10, output: 0.40 }
};
const DIR_EN_JA = 'en_to_ja';
const DIR_JA_EN = 'ja_to_en';
const API_KEY_REGEX = /^AIza[0-9A-Za-z\-_]{35}$/;
const TEST_TIMEOUT_MS = 5000;

const SETTINGS_EXCLUDE_KEYWORDS_KEY = 'excludeKeywords';
const SETTINGS_DAILY_COST_LIMIT_USD_KEY = 'dailyCostLimitUsd';
const SETTINGS_DAILY_TOTAL_CHARS_LIMIT_KEY = 'dailyTotalCharsLimit';
const SETTINGS_GLOSSARY_KEY = 'glossaryPairs';
const SETTINGS_SITE_WHITELIST_KEY = 'siteWhitelist';
const SETTINGS_SITE_REGISTRY_KEY = 'siteRegistry';
const SETTINGS_SITE_MODE_KEY = 'siteMode';
const SETTINGS_SITE_RULES_KEY = 'siteRules';
const SETTINGS_TRANSLATE_COLOR_DEFAULT_KEY = 'translateColorDefault';
const SETTINGS_TRANSLATE_COLOR_RULES_KEY = 'translateColorRules';

const qs = (id) => document.getElementById(id);
const statusEl = () => qs('gx-status');
const permissionEl = () => qs('gx-permission-status');

let cachedWhitelist = [];
let cachedHost = '';
let cachedRegistry = [];

function setStatus(text, tone = 'info') {
  const el = statusEl();
  if (el) {
    el.textContent = text;
    if (tone === 'error') el.style.color = '#f4212e';
    else if (tone === 'success') el.style.color = '#00ba7c';
    else el.style.color = '#536471';
  }
  // Also show toast for user feedback
  showToast(text, tone);
}

function updateAutoStatusText() {
  const autoEl = qs('gx-auto');
  const statusText = document.querySelector('.status-text');
  if (!autoEl || !statusText) return;
  statusText.textContent = autoEl.checked ? '自動翻訳 ON' : '自動翻訳 OFF';
}

function estimateCostUsdForModelChars(modelId, inputChars, outputChars) {
  const prices = PRICING[modelId] || PRICING.default;
  const inCost = (inputChars / CHARS_PER_TOKEN / 1000000) * prices.input;
  const outCost = (outputChars / CHARS_PER_TOKEN / 1000000) * prices.output;
  return inCost + outCost;
}

function estimateTotalCostUsd(modelStats) {
  let total = 0;
  const stats = modelStats || {};
  Object.keys(stats).forEach((modelId) => {
    const s = stats[modelId] || { input: 0, output: 0 };
    total += estimateCostUsdForModelChars(modelId, s.input || 0, s.output || 0);
  });
  return total;
}

function sumTotalChars(modelStats) {
  let total = 0;
  const stats = modelStats || {};
  Object.keys(stats).forEach((modelId) => {
    const s = stats[modelId] || { input: 0, output: 0 };
    total += (s.input || 0) + (s.output || 0);
  });
  return total;
}

function updateUsageStats(modelStats, limits) {
  const costEl = qs('gx-stats-cost');
  const charsEl = qs('gx-stats-chars');
  const limitEl = qs('gx-stats-limit');
  if (!costEl || !charsEl) return;

  const totalCost = estimateTotalCostUsd(modelStats);
  const totalChars = sumTotalChars(modelStats);
  costEl.textContent = `$${totalCost.toFixed(4)}`;
  charsEl.textContent = `${totalChars.toLocaleString()}`;

  const dailyCostLimitUsd = limits?.dailyCostLimitUsd;
  const dailyTotalCharsLimit = limits?.dailyTotalCharsLimit;
  const parts = [];
  if (typeof dailyCostLimitUsd === 'number' && dailyCostLimitUsd > 0) {
    parts.push(`$${dailyCostLimitUsd}`);
  }
  if (typeof dailyTotalCharsLimit === 'number' && dailyTotalCharsLimit > 0) {
    parts.push(`${dailyTotalCharsLimit.toLocaleString()}文字`);
  }
  if (limitEl) {
    limitEl.textContent = parts.length ? `上限 ${parts.join(' / ')}` : '';
  }
}

async function refreshUsageStats() {
  const res = await chrome.storage.local.get([
    'modelStats',
    SETTINGS_DAILY_COST_LIMIT_USD_KEY,
    SETTINGS_DAILY_TOTAL_CHARS_LIMIT_KEY
  ]);
  updateUsageStats(res.modelStats || {}, {
    dailyCostLimitUsd: res[SETTINGS_DAILY_COST_LIMIT_USD_KEY],
    dailyTotalCharsLimit: res[SETTINGS_DAILY_TOTAL_CHARS_LIMIT_KEY]
  });
}

function showToast(text, tone = 'info') {
  const toast = qs('gx-toast');
  if (!toast) return;
  toast.textContent = text;
  toast.className = 'toast';
  if (tone === 'success') toast.classList.add('success');
  if (tone === 'error') toast.classList.add('error');
  // Show
  requestAnimationFrame(() => {
    toast.classList.add('show');
  });
  // Auto hide
  clearTimeout(toast._hideTimer);
  toast._hideTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, 2500);
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


function normalizeSiteRegistry(list = []) {
  const items = Array.isArray(list) ? list : [];
  const out = [];
  items.forEach((entry) => {
    if (!entry) return;
    if (typeof entry === 'string') {
      const host = normalizeHost(entry);
      if (host) out.push({ host, enabled: true });
      return;
    }
    const host = normalizeHost(entry.host);
    if (!host) return;
    out.push({ host, enabled: entry.enabled !== false });
  });
  const seen = new Set();
  return out.filter((item) => {
    if (seen.has(item.host)) return false;
    seen.add(item.host);
    return true;
  });
}

function buildWhitelistFromRegistry(registry) {
  return normalizeSiteRegistry(registry)
    .filter((item) => item.enabled)
    .map((item) => item.host);
}

function hostMatches(host, entry) {
  const h = String(host || '').toLowerCase();
  let e = String(entry || '').toLowerCase();
  if (!h || !e) return false;
  if (e.startsWith('.')) e = e.slice(1);
  if (!e) return false;
  return h === e || h.endsWith(`.${e}`);
}

function isXSiteHost(host) {
  return hostMatches(host, 'x.com') || hostMatches(host, 'twitter.com');
}

function isHostAllowed(host, whitelist) {
  if (!whitelist || whitelist.length === 0) return isXSiteHost(host);
  return whitelist.some((entry) => hostMatches(host, entry));
}

function hostToOriginPatterns(host) {
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

async function requestHostPermissionsIfNeeded(siteWhitelist, prompt) {
  const targets = siteWhitelist.filter((host) => !isXSiteHost(host));
  const origins = uniqueList(targets.flatMap(hostToOriginPatterns));
  if (origins.length === 0) return { granted: true, origins: [] };

  if (!prompt) {
    const grantedOrigins = [];
    for (const origin of origins) {
      // eslint-disable-next-line no-await-in-loop
      const ok = await chrome.permissions.contains({ origins: [origin] });
      if (ok) grantedOrigins.push(origin);
    }
    return { granted: grantedOrigins.length === origins.length, origins: grantedOrigins };
  }

  const granted = await chrome.permissions.request({ origins });
  return { granted, origins };
}

async function updatePermissionStatus(host, whitelist) {
  const el = permissionEl();
  const btn = qs('gx-request-permission');
  if (!el) return;
  if (!host) {
    el.textContent = '権限: -';
    el.style.color = '#536471';
    if (btn) {
      btn.disabled = true;
      btn.textContent = '登録して許可';
    }
    return;
  }
  const registered = normalizeSiteRegistry(cachedRegistry).some((r) => hostMatches(host, r.host));
  if (!isHostAllowed(host, whitelist) && !registered) {
    el.textContent = '許可: 未登録';
    el.style.color = '#f59e0b';
    if (btn) {
      btn.disabled = false;
      btn.textContent = '登録して許可';
    }
    return;
  }
  if (isXSiteHost(host)) {
    el.textContent = '許可: 許可済み（不要）';
    el.style.color = '#64748b';
    if (btn) {
      btn.disabled = true;
      btn.textContent = '許可済み';
    }
    return;
  }
  const origins = uniqueList(hostToOriginPatterns(host));
  let granted = false;
  for (const origin of origins) {
    // eslint-disable-next-line no-await-in-loop
    const ok = await chrome.permissions.contains({ origins: [origin] });
    if (ok) {
      granted = true;
      break;
    }
  }
  if (granted) {
    el.textContent = '許可: 許可済み';
    el.style.color = '#64748b';
    if (btn) {
      btn.disabled = true;
      btn.textContent = '許可済み';
    }
  } else {
    el.textContent = '許可: 未許可（ボタンで許可）';
    el.style.color = '#f4212e';
    if (btn) {
      btn.disabled = false;
      btn.textContent = '登録して許可';
    }
  }
}

function updateRegistryStatus(host, registry) {
  const el = qs('gx-site-registry-status');
  const toggle = qs('gx-site-enabled');
  const help = qs('gx-help-add-site');
  if (!el) return;
  if (!host) {
    el.textContent = '登録状況: -';
    if (toggle) {
      toggle.checked = false;
      toggle.disabled = true;
    }
    if (help) help.style.display = 'none';
    return;
  }
  const item = normalizeSiteRegistry(registry).find((r) => hostMatches(host, r.host));
  if (!item) {
    el.textContent = '登録状況: 未登録';
    if (toggle) {
      toggle.checked = false;
      toggle.disabled = true;
    }
    if (help) help.style.display = '';
  } else if (item.enabled) {
    el.textContent = '登録状況: 登録済み（有効）';
    if (toggle) {
      toggle.checked = true;
      toggle.disabled = false;
    }
    if (help) help.style.display = 'none';
  } else {
    el.textContent = '登録状況: 登録済み（停止中）';
    if (toggle) {
      toggle.checked = false;
      toggle.disabled = false;
    }
    if (help) help.style.display = 'none';
  }
}

function updateSelectorStatus(host, rules) {
  const el = qs('gx-selector-status');
  if (!el) return;
  if (!host) {
    el.textContent = '翻訳する場所: - / 翻訳しない場所: -';
    return;
  }
  const rule = Array.isArray(rules) ? rules.find((r) => hostMatches(host, r?.host)) : null;
  const include = String(rule?.include || '').trim() || '-';
  const exclude = String(rule?.exclude || '').trim() || '-';
  el.textContent = `翻訳する場所: ${include} / 翻訳しない場所: ${exclude}`;
}

async function loadRegistry(res) {
  const registry = normalizeSiteRegistry(res[SETTINGS_SITE_REGISTRY_KEY]);
  const whitelist = Array.isArray(res[SETTINGS_SITE_WHITELIST_KEY]) ? res[SETTINGS_SITE_WHITELIST_KEY] : [];
  if (registry.length === 0 && whitelist.length > 0) {
    const next = normalizeSiteRegistry(whitelist);
    const nextWhitelist = buildWhitelistFromRegistry(next);
    await chrome.storage.local.set({
      [SETTINGS_SITE_REGISTRY_KEY]: next,
      [SETTINGS_SITE_WHITELIST_KEY]: nextWhitelist
    });
    return next;
  }
  return registry;
}

async function persistRegistry(registry) {
  const normalized = normalizeSiteRegistry(registry);
  const whitelist = buildWhitelistFromRegistry(normalized);
  await chrome.storage.local.set({
    [SETTINGS_SITE_REGISTRY_KEY]: normalized,
    [SETTINGS_SITE_WHITELIST_KEY]: whitelist
  });
  cachedRegistry = normalized;
  cachedWhitelist = whitelist;
  chrome.runtime.sendMessage({ type: 'gx-update-content-scripts' }).catch(() => {});
  await updatePermissionStatus(cachedHost, cachedWhitelist);
  updateRegistryStatus(cachedHost, cachedRegistry);
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


function upsertSiteRule(list, host, { include, exclude } = {}) {
  const h = normalizeHost(host);
  if (!h) return list;
  const next = Array.isArray(list) ? [...list] : [];
  const idx = next.findIndex((r) => hostMatches(h, r?.host));
  if (idx >= 0) {
    const current = next[idx] || {};
    next[idx] = {
      host: h,
      include: (include != null) ? include : String(current.include || ''),
      exclude: (exclude != null) ? exclude : String(current.exclude || '')
    };
  } else {
    next.push({
      host: h,
      include: include || '',
      exclude: exclude || ''
    });
  }
  return next;
}

function normalizeColorName(input) {
  const s = String(input || '').trim().toLowerCase();
  if (s === 'inherit' || s === '変更なし') return 'inherit';
  if (s === 'blue' || s === '青') return 'blue';
  if (s === 'green' || s === '緑') return 'green';
  if (s === 'orange' || s === '橙') return 'orange';
  return '';
}

function updateColorChipSelection(color) {
  const chips = document.querySelectorAll('.color-chip');
  chips.forEach((chip) => {
    const chipColor = chip.dataset.color;
    if (chipColor === color) {
      chip.classList.add('selected');
    } else {
      chip.classList.remove('selected');
    }
  });
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

function getSiteRuleForHost(rules, host) {
  const list = Array.isArray(rules) ? rules : [];
  return list.find((r) => hostMatches(host, r?.host)) || null;
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
    SETTINGS_SITE_REGISTRY_KEY,
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
  cachedRegistry = await loadRegistry(res);
  cachedWhitelist = buildWhitelistFromRegistry(cachedRegistry);
  const rules = Array.isArray(res[SETTINGS_SITE_RULES_KEY]) ? res[SETTINGS_SITE_RULES_KEY] : [];
  updateSelectorStatus(cachedHost, rules);
  const rule = getSiteRuleForHost(rules, cachedHost);
  if (qs('gx-include-selector')) qs('gx-include-selector').value = String(rule?.include || '');
  if (qs('gx-exclude-selector')) qs('gx-exclude-selector').value = String(rule?.exclude || '');
  const colorDefault = normalizeColorName(res[SETTINGS_TRANSLATE_COLOR_DEFAULT_KEY]) || 'inherit';
  qs('gx-translate-color-default').value = colorDefault;
  qs('gx-translate-color-rules').value = formatColorRules(res[SETTINGS_TRANSLATE_COLOR_RULES_KEY]);
  updateColorChipSelection(colorDefault);
  setStatus('準備OK', 'info');
  updateAutoStatusText();
  refreshUsageStats();
  await updatePermissionStatus(cachedHost, cachedWhitelist);
  updateRegistryStatus(cachedHost, cachedRegistry);
}

function handleRulesChanged(nextRules) {
  if (!cachedHost) return;
  const rules = Array.isArray(nextRules) ? nextRules : [];
  updateSelectorStatus(cachedHost, rules);
  const rule = getSiteRuleForHost(rules, cachedHost);
  if (qs('gx-include-selector')) qs('gx-include-selector').value = String(rule?.include || '');
  if (qs('gx-exclude-selector')) qs('gx-exclude-selector').value = String(rule?.exclude || '');
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
    [SETTINGS_TRANSLATE_COLOR_DEFAULT_KEY]: translateColorDefault,
    [SETTINGS_TRANSLATE_COLOR_RULES_KEY]: translateColorRules
  });

  const tab = await getActiveTab();
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: 'PAGE_SET_DIRECTION', direction });
  }
  setStatus('保存しました', 'success');
  await updatePermissionStatus(cachedHost, cachedWhitelist);
}

async function saveAutoToggle() {
  const enabled = !!qs('gx-auto').checked;
  await chrome.storage.local.set({ isAutoTranslateEnabled: enabled });
  const tab = await getActiveTab();
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: 'PAGE_SET_AUTO', enabled });
  }
  updateAutoStatusText();
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
      updatePermissionStatus(cachedHost, cachedWhitelist);
      return;
    }
    if (resp?.success) {
      setStatus(type === 'PAGE_CLEAR_CACHE' ? 'キャッシュを消去しました' : '再翻訳を開始しました', 'success');
    } else {
      setStatus('操作に失敗しました', 'error');
    }
  });
}

async function requestPermissionForCurrentHost() {
  if (!cachedHost) {
    setStatus('サイトが特定できません', 'error');
    return;
  }
  if (isXSiteHost(cachedHost)) {
    await registerCurrentSite();
    setStatus('このサイトで翻訳を使えるようにしました', 'success');
    await updatePermissionStatus(cachedHost, cachedWhitelist);
    return;
  }

  const result = await requestHostPermissionsIfNeeded([cachedHost], true);
  if (result.granted) {
    await registerCurrentSite();
    setStatus('このサイトで翻訳を使えるようにしました', 'success');
    const tab = await getActiveTab();
    if (tab?.id) {
      chrome.tabs.reload(tab.id);
    }
  } else {
    setStatus('許可を出せませんでした', 'error');
  }
  await updatePermissionStatus(cachedHost, cachedWhitelist);
  chrome.runtime.sendMessage({ type: 'gx-update-content-scripts' }).catch(() => {});
}

async function registerCurrentSite() {
  if (!cachedHost) {
    setStatus('サイトが特定できません', 'error');
    return;
  }
  const next = normalizeSiteRegistry(cachedRegistry);
  const existing = next.find((r) => hostMatches(cachedHost, r.host));
  if (existing) {
    existing.enabled = true;
  } else {
    next.push({ host: normalizeHost(cachedHost), enabled: true });
  }
  await persistRegistry(next);
  setStatus('このサイトを登録しました', 'success');
}

async function setCurrentSiteEnabled(enabled) {
  if (!cachedHost) {
    setStatus('サイトが特定できません', 'error');
    return;
  }
  const next = normalizeSiteRegistry(cachedRegistry);
  const item = next.find((r) => hostMatches(cachedHost, r.host));
  if (!item) {
    setStatus('先に登録してください', 'error');
    updateRegistryStatus(cachedHost, cachedRegistry);
    return;
  }
  item.enabled = !!enabled;
  await persistRegistry(next);
  setStatus(enabled ? 'このサイトを有効にしました' : 'このサイトを停止しました', 'success');
}

async function pickSelector(mode) {
  const tab = await getActiveTab();
  if (!tab?.id) {
    setStatus('有効なタブが見つかりません', 'error');
    return;
  }
  chrome.tabs.sendMessage(tab.id, { type: 'PAGE_PICK_SELECTOR', mode }, async (resp) => {
    if (chrome.runtime.lastError) {
      setStatus('このページでは選べません。先に登録と許可をしてください。', 'error');
      return;
    }
    if (!resp?.success || !resp.selector) {
      setStatus('選択をキャンセルしました', 'info');
      return;
    }
    const selector = resp.selector;
    const res = await chrome.storage.local.get([
      SETTINGS_SITE_RULES_KEY,
      SETTINGS_SITE_MODE_KEY,
      SETTINGS_SITE_REGISTRY_KEY,
      SETTINGS_SITE_WHITELIST_KEY
    ]);
    const rules = Array.isArray(res[SETTINGS_SITE_RULES_KEY]) ? res[SETTINGS_SITE_RULES_KEY] : [];
    const updated = upsertSiteRule(rules, cachedHost, mode === 'include'
      ? { include: selector }
      : { exclude: selector });
    const registry = normalizeSiteRegistry(res[SETTINGS_SITE_REGISTRY_KEY] || cachedRegistry);
    if (!isXSiteHost(cachedHost)) {
      if (!registry.find((r) => hostMatches(cachedHost, r.host))) {
        registry.push({ host: normalizeHost(cachedHost), enabled: true });
      }
    }
    const whitelist = buildWhitelistFromRegistry(registry);
    await chrome.storage.local.set({
      [SETTINGS_SITE_RULES_KEY]: updated,
      [SETTINGS_SITE_MODE_KEY]: 'advanced',
      [SETTINGS_SITE_REGISTRY_KEY]: registry,
      [SETTINGS_SITE_WHITELIST_KEY]: whitelist
    });
    cachedRegistry = registry;
    cachedWhitelist = whitelist;
    chrome.runtime.sendMessage({ type: 'gx-update-content-scripts' }).catch(() => {});
    setStatus(mode === 'include' ? '翻訳する場所を保存しました' : '翻訳しない場所を保存しました', 'success');
    updateRegistryStatus(cachedHost, cachedRegistry);
    updateSelectorStatus(cachedHost, updated);
    const updatedRule = getSiteRuleForHost(updated, cachedHost);
    if (qs('gx-include-selector')) qs('gx-include-selector').value = String(updatedRule?.include || '');
    if (qs('gx-exclude-selector')) qs('gx-exclude-selector').value = String(updatedRule?.exclude || '');
  });
}

async function saveSelectorsFromInputs() {
  if (!cachedHost) {
    setStatus('サイトが特定できません', 'error');
    return;
  }
  const include = String(qs('gx-include-selector')?.value || '').trim();
  const exclude = String(qs('gx-exclude-selector')?.value || '').trim();
  const res = await chrome.storage.local.get([
    SETTINGS_SITE_RULES_KEY,
    SETTINGS_SITE_REGISTRY_KEY,
    SETTINGS_SITE_WHITELIST_KEY
  ]);
  const rules = Array.isArray(res[SETTINGS_SITE_RULES_KEY]) ? res[SETTINGS_SITE_RULES_KEY] : [];
  const updated = upsertSiteRule(rules, cachedHost, { include, exclude });
  const registry = normalizeSiteRegistry(res[SETTINGS_SITE_REGISTRY_KEY] || cachedRegistry);
  if (!registry.find((r) => hostMatches(cachedHost, r.host))) {
    registry.push({ host: normalizeHost(cachedHost), enabled: true });
  }
  const whitelist = buildWhitelistFromRegistry(registry);
  await chrome.storage.local.set({
    [SETTINGS_SITE_RULES_KEY]: updated,
    [SETTINGS_SITE_MODE_KEY]: 'advanced',
    [SETTINGS_SITE_REGISTRY_KEY]: registry,
    [SETTINGS_SITE_WHITELIST_KEY]: whitelist
  });
  cachedRegistry = registry;
  cachedWhitelist = whitelist;
  chrome.runtime.sendMessage({ type: 'gx-update-content-scripts' }).catch(() => {});
  setStatus('翻訳する場所の設定を保存しました', 'success');
  updateSelectorStatus(cachedHost, updated);
  updateRegistryStatus(cachedHost, cachedRegistry);
}

async function clearSelectorsForCurrentHost() {
  if (!cachedHost) {
    setStatus('サイトが特定できません', 'error');
    return;
  }
  const res = await chrome.storage.local.get([SETTINGS_SITE_RULES_KEY]);
  const rules = Array.isArray(res[SETTINGS_SITE_RULES_KEY]) ? res[SETTINGS_SITE_RULES_KEY] : [];
  const updated = upsertSiteRule(rules, cachedHost, { include: '', exclude: '' });
  await chrome.storage.local.set({ [SETTINGS_SITE_RULES_KEY]: updated });
  if (qs('gx-include-selector')) qs('gx-include-selector').value = '';
  if (qs('gx-exclude-selector')) qs('gx-exclude-selector').value = '';
  setStatus('翻訳する場所の設定を空にしました', 'success');
  updateSelectorStatus(cachedHost, updated);
}

async function refreshSiteStatus() {
  const tab = await getActiveTab();
  if (!tab?.id) return;
  chrome.tabs.sendMessage(tab.id, { type: 'PAGE_GET_STATUS' }, (resp) => {
    if (chrome.runtime.lastError) {
      qs('gx-site-status').textContent = '状態取得できません';
      updatePermissionStatus(cachedHost, cachedWhitelist);
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
      cachedHost = host || '';
      qs('gx-host').textContent = cachedHost || '-';
    } catch (e) {
      qs('gx-host').textContent = '-';
    }
  }

  await loadSettings();
  await refreshSiteStatus();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes[SETTINGS_SITE_RULES_KEY]) {
      handleRulesChanged(changes[SETTINGS_SITE_RULES_KEY].newValue);
    }
    if (changes.modelStats
      || changes[SETTINGS_DAILY_COST_LIMIT_USD_KEY]
      || changes[SETTINGS_DAILY_TOTAL_CHARS_LIMIT_KEY]) {
      refreshUsageStats();
    }
  });

  qs('gx-model').addEventListener('change', () => saveAll({ validateKey: false }));
  qs('gx-direction').addEventListener('change', () => saveAll({ validateKey: false }));
  qs('gx-auto').addEventListener('change', saveAutoToggle);
  qs('gx-retranslate')?.addEventListener('click', () => sendPageCommand('PAGE_RETRANSLATE'));
  qs('gx-clear-cache')?.addEventListener('click', () => sendPageCommand('PAGE_CLEAR_CACHE'));
  qs('gx-save').addEventListener('click', () => saveAll({ validateKey: true }));
  qs('gx-test').addEventListener('click', () => saveAll({ validateKey: true }));
  const autosaveIds = [
    'gx-exclude-keywords',
    'gx-cost-limit',
    'gx-chars-limit',
    'gx-translate-color-default',
    'gx-translate-color-rules',
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

  // Color chip selection
  document.querySelectorAll('.color-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const color = chip.dataset.color;
      qs('gx-translate-color-default').value = color;
      updateColorChipSelection(color);
      saveAll({ validateKey: false });
    });
  });
  qs('gx-request-permission')?.addEventListener('click', requestPermissionForCurrentHost);
  qs('gx-site-enabled')?.addEventListener('change', (e) => {
    setCurrentSiteEnabled(e.target.checked);
  });
  qs('gx-pick-include')?.addEventListener('click', () => pickSelector('include'));
  qs('gx-pick-exclude')?.addEventListener('click', () => pickSelector('exclude'));
  qs('gx-clear-selector')?.addEventListener('click', clearSelectorsForCurrentHost);

  const includeEl = qs('gx-include-selector');
  const excludeEl = qs('gx-exclude-selector');
  let selectorSaveTimer = null;
  const scheduleSave = () => {
    if (selectorSaveTimer) clearTimeout(selectorSaveTimer);
    selectorSaveTimer = setTimeout(() => {
      saveSelectorsFromInputs();
    }, 500);
  };
  includeEl?.addEventListener('input', scheduleSave);
  excludeEl?.addEventListener('input', scheduleSave);
}

init();
