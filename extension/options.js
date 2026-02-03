/* global chrome */

const DEFAULT_MODEL = 'gemini-2.5-flash-lite';
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
const SETTINGS_SITE_REGISTRY_KEY = 'siteRegistry';
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
  if (!el) return;
  el.textContent = String(text || '');
  el.classList.remove('msg-ok', 'msg-ng');
  if (ok === true) el.classList.add('msg-ok');
  if (ok === false) el.classList.add('msg-ng');
}

function showToast(text, tone = 'info') {
  const toast = qs('gx-toast');
  if (!toast) return;
  toast.textContent = text;
  toast.className = 'toast';
  if (tone === 'success') toast.classList.add('success');
  if (tone === 'error') toast.classList.add('error');
  requestAnimationFrame(() => {
    toast.classList.add('show');
  });
  clearTimeout(toast._hideTimer);
  toast._hideTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, 2000);
}

function parseLineList(input) {
  return String(input || '')
    .split(/\r?\n|,/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseNewlineList(input) {
  return String(input || '')
    .split(/\r?\n/g)
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

function isXSiteHost(host) {
  const h = normalizeHost(host);
  return h === 'x.com' || h.endsWith('.x.com') || h === 'twitter.com' || h.endsWith('.twitter.com');
}

function hostMatches(host, entry) {
  const h = String(host || '').toLowerCase();
  let e = String(entry || '').toLowerCase();
  if (!h || !e) return false;
  if (e.startsWith('.')) e = e.slice(1);
  if (!e) return false;
  return h === e || h.endsWith(`.${e}`);
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

function renderSiteRegistry(registry) {
  const root = qs('gx-site-registry');
  if (!root) return;
  const list = normalizeSiteRegistry(registry);
  if (!list.length) {
    root.innerHTML = '<div class="small">登録サイトはまだありません。</div>';
    return;
  }
  root.innerHTML = '';
  list.forEach((item) => {
    const rule = Array.isArray(siteRulesCache)
      ? siteRulesCache.find((r) => hostMatches(item.host, r?.host))
      : null;
    const includeValue = String(rule?.include || '');
    const excludeValue = String(rule?.exclude || '');
    const row = document.createElement('div');
    row.className = 'site-row';
    row.innerHTML = `
      <div class="site-row-header">
        <div class="site-host">${item.host}</div>
        <div class="site-actions">
          <label class="check" style="margin: 0;">
            <input type="checkbox" data-site-toggle="${item.host}" ${item.enabled ? 'checked' : ''} />
            <span>有効</span>
          </label>
          <button class="btn-ghost" data-site-delete="${item.host}">削除</button>
        </div>
      </div>
      <div class="site-edit">
        <input type="text" data-site-include="${item.host}" placeholder="翻訳する場所" value="${includeValue}" />
        <input type="text" data-site-exclude="${item.host}" placeholder="翻訳しない場所" value="${excludeValue}" />
      </div>
    `;
    root.appendChild(row);
  });
}

async function persistSiteRegistry(nextRegistry, { removeHost = '' } = {}) {
  const registry = normalizeSiteRegistry(nextRegistry);
  const whitelist = buildWhitelistFromRegistry(registry);
  const payload = {
    [SETTINGS_SITE_REGISTRY_KEY]: registry,
    [SETTINGS_SITE_WHITELIST_KEY]: whitelist
  };
  if (removeHost) {
    const res = await chrome.storage.local.get([SETTINGS_SITE_RULES_KEY]);
    const rules = Array.isArray(res[SETTINGS_SITE_RULES_KEY]) ? res[SETTINGS_SITE_RULES_KEY] : [];
    const nextRules = rules.filter((r) => !hostMatches(removeHost, r?.host));
    payload[SETTINGS_SITE_RULES_KEY] = nextRules;
  }
  await chrome.storage.local.set(payload);
  siteRegistryCache = registry;
  renderSiteRegistry(siteRegistryCache);
  chrome.runtime.sendMessage({ type: 'gx-update-content-scripts' }).catch(() => {});
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

async function updatePermissionStatus(siteWhitelist) {
  const el = qs('gx-permission-status');
  if (!el) return;
  const targets = siteWhitelist.filter((host) => !isXSiteHost(host));
  const origins = uniqueList(targets.flatMap(hostToOriginPatterns));
  if (origins.length === 0) {
    el.textContent = '権限: OK（X/Tのみ）';
    el.style.color = '#00ba7c';
    return;
  }
  let grantedCount = 0;
  for (const origin of origins) {
    // eslint-disable-next-line no-await-in-loop
    const ok = await chrome.permissions.contains({ origins: [origin] });
    if (ok) grantedCount += 1;
  }
  if (grantedCount === origins.length) {
    el.textContent = '権限: OK';
    el.style.color = '#00ba7c';
  } else {
    el.textContent = `権限: 未許可（${origins.length - grantedCount}件）`;
    el.style.color = '#f4212e';
  }
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
  if (s === 'inherit' || s === '変更なし') return 'inherit';
  if (s === 'blue' || s === '青') return 'blue';
  if (s === 'green' || s === '緑') return 'green';
  if (s === 'orange' || s === '橙') return 'orange';
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

let siteRegistryCache = [];
let siteRulesCache = [];

function setSelectValue(id, value) {
  const el = qs(id);
  if (!el) return;
  el.value = value;
}

function addLineUnique(id, line, normalize) {
  const el = qs(id);
  if (!el) return;
  const lines = parseNewlineList(el.value);
  const token = normalize ? normalize(line) : String(line || '').trim();
  if (!token) return;
  const exists = lines.some((l) => {
    const current = normalize ? normalize(l) : String(l || '').trim();
    return current === token;
  });
  if (!exists) lines.push(line);
  el.value = lines.join('\n');
}

function upsertSiteRuleLine(id, line) {
  const el = qs(id);
  if (!el) return;
  const parts = String(line || '').split('|').map((s) => s.trim());
  const host = normalizeHost(parts[0]);
  if (!host) return;
  const lines = parseNewlineList(el.value);
  let replaced = false;
  const next = lines.map((current) => {
    const currentHost = normalizeHost(String(current || '').split('|')[0] || '');
    if (currentHost && currentHost === host) {
      replaced = true;
      return line;
    }
    return current;
  }).filter(Boolean);
  if (!replaced) next.push(line);
  el.value = next.join('\n');
}

function toggleHidden(id) {
  const el = qs(id);
  if (!el) return;
  el.classList.toggle('is-hidden');
}

function updateChipActive(group, values) {
  const chips = document.querySelectorAll(`[data-chip-group="${group}"] [data-whitelist-add]`);
  chips.forEach((chip) => {
    const value = normalizeHost(chip.getAttribute('data-whitelist-add'));
    const active = values.includes(value);
    chip.classList.toggle('active', active);
  });
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
    SETTINGS_SITE_REGISTRY_KEY,
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

  const registry = normalizeSiteRegistry(res[SETTINGS_SITE_REGISTRY_KEY]);
  siteRulesCache = Array.isArray(res[SETTINGS_SITE_RULES_KEY]) ? res[SETTINGS_SITE_RULES_KEY] : [];
  if (!registry.length && Array.isArray(res[SETTINGS_SITE_WHITELIST_KEY]) && res[SETTINGS_SITE_WHITELIST_KEY].length > 0) {
    siteRegistryCache = normalizeSiteRegistry(res[SETTINGS_SITE_WHITELIST_KEY]);
    const migratedWhitelist = buildWhitelistFromRegistry(siteRegistryCache);
    await chrome.storage.local.set({
      [SETTINGS_SITE_REGISTRY_KEY]: siteRegistryCache,
      [SETTINGS_SITE_WHITELIST_KEY]: migratedWhitelist
    });
  } else {
    siteRegistryCache = registry;
  }
  renderSiteRegistry(siteRegistryCache);
  const whitelist = buildWhitelistFromRegistry(siteRegistryCache);
  await updatePermissionStatus(whitelist.map(normalizeHost).filter(Boolean));
  const colorDefault = normalizeColorName(res[SETTINGS_TRANSLATE_COLOR_DEFAULT_KEY]) || 'inherit';
  qs('gx-translate-color-default').value = colorDefault;
  qs('gx-translate-color-rules').value = formatColorRules(res[SETTINGS_TRANSLATE_COLOR_RULES_KEY]);

  // Update color chip visual selection
  document.querySelectorAll('[data-select-target="gx-translate-color-default"]').forEach((chip) => {
    chip.classList.toggle('selected', chip.getAttribute('data-select-value') === colorDefault);
  });
}

async function save({ validateKey = true } = {}) {
  const model = qs('gx-model').value || DEFAULT_MODEL;
  const direction = qs('gx-direction').value === DIR_JA_EN ? DIR_JA_EN : DIR_EN_JA;
  const apiKey = (qs('gx-apikey').value || '').trim();

  if (apiKey && !API_KEY_REGEX.test(apiKey)) {
    showToast('APIキーの形式が正しくありません', 'error');
    return;
  }
  if (validateKey && apiKey) {
    try {
      showToast('キー確認中...', 'info');
      await testApiKey(apiKey, model);
    } catch (e) {
      showToast(humanizeKeyTestError(e), 'error');
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
  const translateColorDefault = normalizeColorName(qs('gx-translate-color-default').value) || 'inherit';
  const translateColorRules = parseColorRules(qs('gx-translate-color-rules').value);
  const siteWhitelist = buildWhitelistFromRegistry(siteRegistryCache);

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
    [SETTINGS_TRANSLATE_COLOR_DEFAULT_KEY]: translateColorDefault,
    [SETTINGS_TRANSLATE_COLOR_RULES_KEY]: translateColorRules,
    [MODEL_MIGRATION_KEY]: true
  });

  showToast('保存しました', 'success');

  await updatePermissionStatus(siteWhitelist);
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
  qs('gx-test').addEventListener('click', async () => {
    const key = (qs('gx-apikey').value || '').trim();
    const model = qs('gx-model').value || DEFAULT_MODEL;
    if (!key) {
      showToast('APIキーを入力してください', 'error');
      return;
    }
    if (!API_KEY_REGEX.test(key)) {
      showToast('APIキーの形式が正しくありません', 'error');
      return;
    }
    try {
      showToast('キー確認中...', 'info');
      await testApiKey(key, model);
      showToast('キーは有効です', 'success');
    } catch (e) {
      showToast(`キー確認失敗: ${e.message || String(e)}`, 'error');
    }
  });

  // Autosave on change (best-effort, without key validation to avoid noisy network)
  const autosaveIds = [
    'gx-apikey',
    'gx-model',
    'gx-direction',
    'gx-cost-limit',
    'gx-chars-limit',
    'gx-exclude-keywords',
    'gx-glossary',
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

  qs('gx-insert-color-example')?.addEventListener('click', () => {
    insertExample('gx-translate-color-rules', 'x.com | 青\ntwitter.com | 緑');
  });

  const registryRoot = qs('gx-site-registry');
  if (registryRoot) {
    registryRoot.addEventListener('change', async (e) => {
      const target = e.target;
      if (!(target instanceof HTMLInputElement)) return;
      const host = target.getAttribute('data-site-toggle');
      if (!host) return;
      const next = normalizeSiteRegistry(siteRegistryCache).map((item) => {
        if (hostMatches(host, item.host)) {
          return { host: item.host, enabled: target.checked };
        }
        return item;
      });
      await persistSiteRegistry(next);
    });
    registryRoot.addEventListener('click', async (e) => {
      const btn = e.target;
      if (!(btn instanceof HTMLElement)) return;
      const host = btn.getAttribute('data-site-delete');
      if (!host) return;
      const next = normalizeSiteRegistry(siteRegistryCache).filter((item) => !hostMatches(host, item.host));
      await persistSiteRegistry(next, { removeHost: host });
    });
    // Auto-save site rules on input change
    registryRoot.addEventListener('change', async (e) => {
      const input = e.target;
      if (!(input instanceof HTMLInputElement)) return;
      const host = input.getAttribute('data-site-include') || input.getAttribute('data-site-exclude');
      if (!host) return;
      const includeEl = registryRoot.querySelector(`[data-site-include="${host}"]`);
      const excludeEl = registryRoot.querySelector(`[data-site-exclude="${host}"]`);
      const include = String(includeEl?.value || '').trim();
      const exclude = String(excludeEl?.value || '').trim();
      const res = await chrome.storage.local.get([SETTINGS_SITE_RULES_KEY]);
      const rules = Array.isArray(res[SETTINGS_SITE_RULES_KEY]) ? res[SETTINGS_SITE_RULES_KEY] : [];
      const nextRules = rules.filter((r) => !hostMatches(host, r?.host));
      nextRules.push({ host: normalizeHost(host), include, exclude });
      await chrome.storage.local.set({
        [SETTINGS_SITE_RULES_KEY]: nextRules,
        [SETTINGS_SITE_MODE_KEY]: 'advanced'
      });
      siteRulesCache = nextRules;
      showToast('保存しました', 'success');
    });
  }

  document.querySelectorAll('[data-toggle-target]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-toggle-target');
      if (target) toggleHidden(target);
    });
  });

  document.querySelectorAll('[data-select-target][data-select-value]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const target = btn.getAttribute('data-select-target');
      const value = btn.getAttribute('data-select-value');
      if (!target || value == null) return;
      setSelectValue(target, value);
      // Update visual selection state for color chips
      document.querySelectorAll(`[data-select-target="${target}"]`).forEach((chip) => {
        chip.classList.toggle('selected', chip.getAttribute('data-select-value') === value);
      });
      await save({ validateKey: false });
      showToast('保存しました', 'success');
    });
  });

  document.querySelectorAll('[data-step-target]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-step-target');
      if (!target) return;
      
      // Toggle content sections (supports both data-step and id)
      document.querySelectorAll('.step, .step-section').forEach((el) => {
        const id = el.id || el.getAttribute('data-step');
        el.classList.toggle('active', id === target);
      });
      
      // Toggle tab buttons
      document.querySelectorAll('[data-step-target]').forEach((tab) => {
        tab.classList.toggle('active', tab.getAttribute('data-step-target') === target);
      });
      
      // Scroll to top when switching tabs
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
}

(async function main() {
  bind();
  await load();
})();
