// Content Script - X.com Auto Translator (Floating Panel Version)
console.log('[Gemini Trans] Translator & Panel loaded.');

// --- Constants & Config ---
const MIN_TRANSLATION_DELAY_MS = 300;
const MAX_TRANSLATION_DELAY_MS = 1500;
const MAX_BATCH_SIZE = 12;
const MAX_BATCH_CHARS = 4000;
const MAX_PARALLEL_REQUESTS = 2;
const CHARS_PER_TOKEN = 4;
// Only hiragana/katakana (not kanji) to distinguish Japanese from Chinese
const JAPANESE_REGEX = /[ぁ-んァ-ン]/;
const DIR_EN_JA = 'en_to_ja';
const DIR_JA_EN = 'ja_to_en';

// Completion flash only (no loading indicator - translation is fast)
const SHIMMER_STYLE = `
  @keyframes gx-mosaic {
    0% { background-position: 0% 50%; filter: blur(0.9px); }
    100% { background-position: 200% 50%; filter: blur(0.9px); }
  }
  @keyframes gx-reveal {
    0% { opacity: 0; filter: blur(1.2px); transform: translateY(1px); }
    100% { opacity: 1; filter: blur(0); transform: translateY(0); }
  }
  @keyframes gx-scanline {
    0% { background-position: 0% -200%; opacity: 0; }
    10% { opacity: 1; }
    100% { background-position: 0% 200%; opacity: 0; }
  }
  @keyframes gx-focus {
    0% { opacity: 0.6; filter: blur(2px); transform: scale(1.01); }
    100% { opacity: 1; filter: blur(0); transform: scale(1); }
  }
  @keyframes gx-ripple {
    0% { clip-path: inset(0 100% 0 0); filter: blur(1px); }
    100% { clip-path: inset(0 0 0 0); filter: blur(0); }
  }
  @keyframes gx-wave-reveal {
    0% { clip-path: inset(0 0 0 0); opacity: 1; }
    100% { clip-path: inset(0 100% 0 0); opacity: 0.9; }
  }
  .gx-mosaic,
  .gx-mosaic * {
    color: transparent !important;
    -webkit-text-fill-color: transparent;
    background-image:
      radial-gradient(circle, var(--gx-mosaic-color-strong, rgba(29, 155, 240, 1)) 1.1px, transparent 1.2px),
      radial-gradient(circle, var(--gx-mosaic-color-soft, rgba(29, 155, 240, 0.55)) 1.1px, transparent 1.2px);
    background-size: 8px 8px, 8px 8px;
    background-position: 0 0, 4px 4px;
    -webkit-background-clip: text;
    background-clip: text;
    animation: gx-mosaic 0.55s steps(8, end) infinite;
    text-shadow: 0 0 5px var(--gx-mosaic-shadow, rgba(29, 155, 240, 0.45));
  }
  .gx-reveal {
    animation: gx-reveal 220ms ease-out;
  }
  .gx-scanline {
    position: relative;
  }
  .gx-scanline::after {
    content: "";
    position: absolute;
    inset: -4px 0;
    pointer-events: none;
    background-image: linear-gradient(
      180deg,
      rgba(255, 255, 255, 0) 0%,
      rgba(255, 255, 255, 0.55) 50%,
      rgba(255, 255, 255, 0) 100%
    );
    mix-blend-mode: screen;
    animation: gx-scanline 320ms linear;
  }
  .gx-focus {
    animation: gx-focus 240ms ease-out;
  }
  .gx-ripple {
    animation: gx-ripple 280ms ease-out;
  }
  .gx-wave {
    position: relative;
  }
  .gx-wave::after {
    content: attr(data-gx-wave-text);
    position: absolute;
    inset: 0;
    pointer-events: none;
    color: transparent;
    -webkit-text-fill-color: transparent;
    background-image:
      radial-gradient(circle, var(--gx-mosaic-color-strong, rgba(29, 155, 240, 1)) 1.1px, transparent 1.2px),
      radial-gradient(circle, var(--gx-mosaic-color-soft, rgba(29, 155, 240, 0.55)) 1.1px, transparent 1.2px);
    background-size: 8px 8px, 8px 8px;
    background-position: 0 0, 4px 4px;
    -webkit-background-clip: text;
    background-clip: text;
    text-shadow: 0 0 5px var(--gx-mosaic-shadow, rgba(29, 155, 240, 0.45));
    white-space: pre-wrap;
    animation: gx-wave-reveal 320ms ease-out;
  }
`;

const DEFAULT_MODEL = 'gemini-2.0-flash-lite';
const MODEL_MIGRATION_KEY = 'geminiModelMigratedTo25FlashLite';
const MODEL_STATS_DAY_KEY = 'modelStatsDayKey';
const MODEL_STATS_RESET_HOUR_LOCAL = 4;
const PRICING = {
    'gemini-2.5-flash-lite': { input: 0.10, output: 0.40 },
    'gemini-2.0-flash-lite': { input: 0.075, output: 0.30 },
    'gemini-2.0-flash': { input: 0.10, output: 0.40 },
    'gemini-2.5-flash': { input: 0.30, output: 2.50 },
    'gemini-3-flash-preview': { input: 0.30, output: 2.50 },
    'default': { input: 0.10, output: 0.40 }
};
const API_KEY_REGEX = /^AIza[0-9A-Za-z\-_]{35}$/;
const TEST_TIMEOUT_MS = 5000;
const CACHE_LIMIT = 500;
const validateApiKey = (key) => API_KEY_REGEX.test(key);
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

const DEFAULT_PAGE_EXCLUDE_SELECTORS = [
    'header',
    'footer',
    'nav',
    'aside',
    '[role="navigation"]',
    '[role="banner"]',
    '[role="contentinfo"]',
    '[role="complementary"]',
    '[role="dialog"]',
    '.menu',
    '.nav',
    '.navbar',
    '.sidebar',
    '.panel',
    '.drawer',
    '.modal',
    '.overlay',
    '.footer',
    '.header',
    '.breadcrumb',
    '#header',
    '#footer',
    '#nav',
    '#sidebar',
    '#menu',
    '[aria-hidden="true"]',
    '#gemini-x-panel',
    '#gx-toast-container',
    '#gemini-dock'
].join(', ');
const PAGE_CACHE_KEY_PREFIX = 'pageCache:';
const MAX_PAGE_CACHE_ENTRIES = 800;

// State
let translationQueue = [];
let inFlightRequests = 0;
let scheduledTimerId = null;
let isPanelMinimized = false;
let cachedApiKey = '';
const translationCache = new Map();
const originalTextCache = new Map();
const translationByTweetId = new Map();
const expandedRetranslated = new Set();
let triggerOnboarding = null; // populated inside panel logic
let translationDirection = DIR_EN_JA;
let excludedKeywords = [];
let dailyCostLimitUsd = null;
let dailyTotalCharsLimit = null;
let isTranslationCacheEnabled = true;
let isTweetIdCacheEnabled = true;
let glossaryPairs = [];
let siteWhitelist = [];
let siteMode = 'simple';
let siteRules = [];
let translateColorDefault = 'inherit';
let translateColorRules = [];
let isSiteAllowed = false;
let pageTranslationEnabled = false;
const currentHost = String(location.hostname || '').toLowerCase();
const isXHost = false;
const pageCache = new Map();
let pageCacheLoaded = false;
let pageCacheSaveTimer = null;

function getModelStatsDayKey(now = new Date()) {
    const shifted = new Date(now.getTime() - MODEL_STATS_RESET_HOUR_LOCAL * 60 * 60 * 1000);
    const y = shifted.getFullYear();
    const m = String(shifted.getMonth() + 1).padStart(2, '0');
    const d = String(shifted.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function maybeResetModelStatsAt4am() {
    const dayKey = getModelStatsDayKey();
    chrome.storage.local.get([MODEL_STATS_DAY_KEY], (r) => {
        if (r[MODEL_STATS_DAY_KEY] === dayKey) return;
        chrome.storage.local.set({ modelStats: {}, [MODEL_STATS_DAY_KEY]: dayKey });
    });
}

const isKeyError = (msg = '') => {
    const m = msg.toLowerCase();
    return m.includes('api key') || m.includes('permission_denied') || m.includes('invalid api key') || m.includes('request had insufficient authentication');
};
const toastQueue = [];
let extensionContextInvalidated = false;

function humanizeErrorMessage(raw) {
    const msg = String(raw || '');
    const m = msg.toLowerCase();

    if (!msg) return '翻訳に失敗しました。もう一度お試しください。';

    if (m.includes('translation disabled by user')) return '自動翻訳はオフです。必要なら拡張メニューの「再翻訳」を使ってください。';
    if (m.includes('api key is missing')) return 'APIキーが未設定です。設定から入力してください。';
    if (m.includes('invalid translation structure')) return '翻訳結果をうまく読み取れませんでした。もう一度やり直します。';
    if (m.includes('invalid api key') || m.includes('permission_denied') || m.includes('insufficient authentication')) {
        return 'APIキーが正しくないか、権限がありません。設定でキーを確認してください。';
    }
    if (m.includes('403')) return 'APIキーが無効か権限がありません。設定でキーを確認してください。';
    if (m.includes('429')) return '混み合っています。少し待ってから自動で再試行します。';
    if (m.includes('timeout') || m.includes('aborterror')) return '通信がタイムアウトしました。時間をおいて再試行してください。';
    if (m.includes('runtime unavailable') || m.includes('extension context invalidated') || m.includes('context invalidated')) {
        return '拡張機能が更新されました。ページを再読み込みしてください。';
    }
    if (m.includes('no translation in response')) return '翻訳結果を取得できませんでした。もう一度やり直します。';

    // Generic fallback (avoid showing technical details to non-technical users)
    return '翻訳に失敗しました。もう一度お試しください。';
}

function isExtensionContextInvalidatedError(err) {
    const msg = String(err && (err.message || err) || '');
    if (globalThis.GemLab?.isExtensionContextInvalidatedError) return GemLab.isExtensionContextInvalidatedError(msg);
    return msg.includes('Extension context invalidated') || msg.includes('context invalidated') || msg.includes('runtime unavailable');
}

function handleExtensionContextInvalidated() {
    if (extensionContextInvalidated) return;
    extensionContextInvalidated = true;
    try {
        if (scheduledTimerId) {
            clearTimeout(scheduledTimerId);
            scheduledTimerId = null;
        }
    } catch (e) {
        // ignore
    }
    translationQueue.length = 0;
    inFlightRequests = 0;
    showToast('拡張機能が更新されました。ページを再読み込みしてください。', 'error', 10000);
}

function isRuntimeAvailable() {
    return globalThis.GemLab?.isRuntimeAvailable ? GemLab.isRuntimeAvailable() : !!(globalThis.chrome && chrome.runtime && typeof chrome.runtime.sendMessage === 'function');
}

// Panel control hooks (populated after panel init)
const panelControl = {
    togglePanel: null,
    setPanelState: null,
    getPanelState: null
};

function getTweetTextElements(root) {
    const primary = root.querySelectorAll ? root.querySelectorAll('[data-testid="tweetText"]') : [];
    if (primary && primary.length) return Array.from(primary);
    const fallback = root.querySelectorAll ? root.querySelectorAll('div[lang]') : [];
    return Array.from(fallback).filter((el) => el.closest && el.closest('article'));
}

function getStableText(el) {
    // Avoid layout-driven line breaks that `innerText` can introduce (notably inside long URLs).
    const raw = String(el?.textContent ?? '');
    return raw
        .replace(/\u00A0/g, ' ')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n[ \t]+/g, '\n')
        .trim();
}

function maskUrls(text, tokenPrefix) {
    const input = String(text || '');
    const tokens = [];
    let nextId = 0;

    const splitSuffix = (url) => {
        let core = String(url);
        let suffix = '';
        while (core.length > 0) {
            const ch = core[core.length - 1];
            if (/[)\],.!?;:"'、。…]/.test(ch)) {
                suffix = ch + suffix;
                core = core.slice(0, -1);
                continue;
            }
            break;
        }
        return { core, suffix };
    };

    const makeToken = () => `<<${tokenPrefix}_URL_${nextId++}>>`;

    const replaceAll = (src, re) => src.replace(re, (match) => {
        const { core, suffix } = splitSuffix(match);
        if (!core) return match;
        const token = makeToken();
        tokens.push({ token, value: core });
        return token + suffix;
    });

    // Mask scheme URLs first, then schemeless domain/path URLs.
    const masked1 = replaceAll(input, /https?:\/\/[^\s]+/gi);
    const masked2 = replaceAll(masked1, /\b(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s]*)/gi);

    return { maskedText: masked2, tokens };
}

function unmaskUrls(text, tokens) {
    let out = String(text || '');
    (tokens || []).forEach(({ token, value }) => {
        out = out.split(String(token)).join(String(value));
    });
    return out;
}

async function ensureApiKey() {
    if (cachedApiKey) return cachedApiKey;
    try {
        const res = await chrome.storage.local.get(['geminiApiKey']);
        cachedApiKey = (res.geminiApiKey || '').trim();
        return cachedApiKey;
    } catch (e) {
        if (isExtensionContextInvalidatedError(e)) {
            handleExtensionContextInvalidated();
            return '';
        }
        throw e;
    }
}

function getCacheKey(text) {
    return text.trim();
}

function getTweetId(element) {
    const article = element.closest && element.closest('article');
    if (!article) return '';
    const link = article.querySelector('a[href*="/status/"]');
    if (!link) return '';
    const href = link.getAttribute('href') || '';
    const match = href.match(/status\/(\d+)/);
    return match ? match[1] : '';
}

function getTweetAuthorHandle(element) {
    const article = element.closest && element.closest('article');
    if (!article) return '';
    const link = article.querySelector('a[href*="/status/"]');
    const href = (link && link.getAttribute('href')) || '';
    const match = href.match(/^\/([^/]+)\/status\/\d+/);
    return match ? String(match[1]).toLowerCase() : '';
}

function getTweetUrl(element) {
    const article = element.closest && element.closest('article');
    if (!article) return '';
    const link = article.querySelector('a[href*="/status/"]');
    if (!link) return '';
    const href = link.getAttribute('href') || '';
    if (href.startsWith('/')) return 'https://x.com' + href;
    return href;
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

function isHostAllowed(host) {
    if (!siteWhitelist || siteWhitelist.length === 0) {
        return isXSiteHost(host);
    }
    return siteWhitelist.some((entry) => hostMatches(host, entry));
}

function splitSelectors(input) {
    return String(input || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
}

function normalizeSiteRules(raw) {
    const list = Array.isArray(raw) ? raw : [];
    return list
        .map((r) => ({
            host: normalizeHost(r?.host),
            include: String(r?.include || '').trim(),
            exclude: String(r?.exclude || '').trim()
        }))
        .filter((r) => r.host);
}

function normalizeColorName(input) {
    const s = String(input || '').trim().toLowerCase();
    if (s === 'inherit') return 'inherit';
    if (s === 'blue') return 'blue';
    if (s === 'green') return 'green';
    if (s === 'orange') return 'orange';
    return '';
}

function normalizeColorRules(raw) {
    const list = Array.isArray(raw) ? raw : [];
    return list
        .map((r) => ({
            host: normalizeHost(r?.host),
            color: normalizeColorName(r?.color)
        }))
        .filter((r) => r.host && r.color);
}

function getTranslateColorForHost(host) {
    const list = Array.isArray(translateColorRules) ? translateColorRules : [];
    const match = list.find((r) => hostMatches(host, r.host));
    const name = normalizeColorName(match?.color) || normalizeColorName(translateColorDefault) || 'inherit';
    if (name === 'blue') return '#1d9bf0';
    if (name === 'green') return '#00ba7c';
    if (name === 'orange') return '#f59e0b';
    return '';
}

function applyTranslateColor(el) {
    if (!el) return;
    const color = getTranslateColorForHost(currentHost);
    if (!color) {
        el.style.color = '';
    } else {
        el.style.color = color;
    }
}

function parseRgbColor(input) {
    const m = String(input || '').match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([0-9.]+))?\)/i);
    if (!m) return null;
    const r = Number(m[1]);
    const g = Number(m[2]);
    const b = Number(m[3]);
    if (![r, g, b].every((v) => Number.isFinite(v))) return null;
    return { r, g, b };
}

function setMosaicColorVars(el) {
    if (!el || !el.style) return;
    const color = getComputedStyle(el).color;
    const rgb = parseRgbColor(color);
    if (!rgb) return;
    el.style.setProperty('--gx-mosaic-color-strong', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 1)`);
    el.style.setProperty('--gx-mosaic-color-soft', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.55)`);
    el.style.setProperty('--gx-mosaic-shadow', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.45)`);
}

function refreshTranslatedColors() {
    const color = getTranslateColorForHost(currentHost);
    const pageEls = document.querySelectorAll('[data-gx-page-translated]');
    pageEls.forEach((el) => {
        if (!color) el.style.color = '';
        else el.style.color = color;
    });
    const tweetEls = document.querySelectorAll('[data-gemini-translated-text]');
    tweetEls.forEach((el) => {
        if (!color) el.style.color = '';
        else el.style.color = color;
        const links = el.querySelectorAll ? el.querySelectorAll('a') : [];
        links.forEach((a) => {
            if (!color) a.style.color = '';
            else a.style.color = color;
        });
    });
}

function getSiteRuleForHost(host) {
    const list = Array.isArray(siteRules) ? siteRules : [];
    return list.find((r) => hostMatches(host, r.host)) || null;
}

function getPageTranslationConfig() {
    if (!isSiteAllowed) return null;
    if (siteMode === 'advanced') {
        const rule = getSiteRuleForHost(currentHost);
        if (!rule) return null;
        const includeSelectors = splitSelectors(rule.include);
        const excludeSelectors = [DEFAULT_PAGE_EXCLUDE_SELECTORS, rule.exclude].filter(Boolean).join(', ');
        return {
            includeSelectors: includeSelectors.length ? includeSelectors : ['body'],
            excludeSelector: excludeSelectors
        };
    }
    return {
        includeSelectors: ['body'],
        excludeSelector: DEFAULT_PAGE_EXCLUDE_SELECTORS
    };
}

function getPageCacheKey() {
    try {
        const url = new URL(location.href);
        url.hash = '';
        return `${PAGE_CACHE_KEY_PREFIX}${url.toString()}`;
    } catch (e) {
        return `${PAGE_CACHE_KEY_PREFIX}${location.origin}${location.pathname}${location.search || ''}`;
    }
}

function loadPageCache(callback) {
    if (!pageTranslationEnabled) {
        pageCacheLoaded = true;
        if (typeof callback === 'function') callback();
        return;
    }
    const key = getPageCacheKey();
    chrome.storage.local.get([key], (res) => {
        const entry = res[key];
        if (entry && entry.entries && typeof entry.entries === 'object') {
            Object.entries(entry.entries).forEach(([k, v]) => {
                if (!k || typeof v !== 'string') return;
                pageCache.set(k, v);
            });
        }
        pageCacheLoaded = true;
        if (typeof callback === 'function') callback();
    });
}

function scheduleSavePageCache() {
    if (!pageTranslationEnabled) return;
    if (!pageCacheLoaded) return;
    if (pageCacheSaveTimer) return;
    pageCacheSaveTimer = setTimeout(() => {
        pageCacheSaveTimer = null;
        const key = getPageCacheKey();
        const entries = {};
        let count = 0;
        for (const [k, v] of pageCache.entries()) {
            entries[k] = v;
            count += 1;
            if (count >= MAX_PAGE_CACHE_ENTRIES) break;
        }
        chrome.storage.local.set({
            [key]: {
                updatedAt: Date.now(),
                entries
            }
        });
    }, 800);
}

function clearPageCache() {
    if (!pageTranslationEnabled) return;
    pageCache.clear();
    const key = getPageCacheKey();
    chrome.storage.local.remove([key]);
}

function normalizeHandle(input) {
    const s = String(input || '').trim();
    if (!s) return '';
    return s.replace(/^@+/, '').toLowerCase();
}

function shouldExcludeTweet(element, text) {
    const handle = getTweetAuthorHandle(element);
    if (handle && excludedHandles.has(handle)) return true;

    const t = String(text || '').toLowerCase();
    if (!t) return false;
    return excludedKeywords.some((kw) => kw && t.includes(kw));
}

function shouldSkipByContent(text) {
    const s = String(text || '').trim();
    if (!s) return true;
    if (s.length < 8) return true;

    // Skip if it's mostly symbols/mentions/hashtags/URLs
    const stripped = s
        .replace(/https?:\/\/\S+/gi, ' ')
        .replace(/\b(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/\S*)/gi, ' ')
        .replace(/[@#]\w+/g, ' ')
        .replace(/[\s\u00A0]+/g, '');

    if (!stripped) return true;

    // If after removing common tokens the remaining is mostly punctuation, skip.
    const letters = stripped.replace(/[^A-Za-z\u3040-\u30FF\u4E00-\u9FFF]/g, '');
    if (letters.length < 4) return true;

    return false;
}

function revertTweetElement(el) {
    if (!el) return;
    if (el.dataset?.geminiOriginalHtml) {
        el.innerHTML = el.dataset.geminiOriginalHtml;
    }
    if (el.dataset) {
        delete el.dataset.geminiTranslated;
        delete el.dataset.geminiTranslatedOriginal;
        delete el.dataset.geminiTranslatedText;
        delete el.dataset.geminiTranslatedMode;
        delete el.dataset.geminiOriginalHtml;
        delete el.dataset.geminiTranslatedTweetId;
        delete el.dataset.geminiShowMoreExpanded;
        delete el.dataset.geminiTranslating;
        delete el.dataset.gemLabOwner;
    }
    try {
        el.classList?.remove('gx-shimmer');
    } catch (e) {
        // ignore
    }
}

// Expand truncated tweets ("Show more") before translating so we don't lose trailing text
function hasTruncatedContent(element) {
    // Twitter/X adds a small button/link - can be inside OR as a sibling of tweetText
    const showMoreInside = element.querySelector(
        '[data-testid="tweet-text-show-more-link"], [data-testid="show-more-link"], div[role="button"][data-testid$="show-more"]'
    );
    if (showMoreInside) return true;

    // Check for sibling "Show more" button (Twitter sometimes puts it outside tweetText)
    const parent = element.parentElement;
    if (parent) {
        const showMoreSibling = parent.querySelector(
            '[data-testid="tweet-text-show-more-link"], [data-testid="show-more-link"]'
        );
        if (showMoreSibling && showMoreSibling !== element && !element.contains(showMoreSibling)) {
            return true;
        }
    }
    return false;
}

function expandIfTruncated(element) {
    // Disabled: was causing too many tweets to be skipped
    // Translation will work even for truncated tweets
    return false;
}

function queueRetranslation(element, text) {
    return queueRetranslationInternal(element, text, { bypassDedup: false });
}

function queueRetranslationInternal(element, text, { bypassDedup, preserveOriginal = false }) {
    if (!claimTweetElement(element)) return;
    // Language direction check - skip if wrong direction (prevents quote tweet mismatches)
    const hasJapanese = JAPANESE_REGEX.test(text);
    if (translationDirection === DIR_EN_JA && hasJapanese) {
        element.dataset.geminiTranslated = 'skipped';
        return;
    }
    if (translationDirection === DIR_JA_EN && !hasJapanese) {
        element.dataset.geminiTranslated = 'skipped';
        return;
    }
    const tweetId = isTweetIdCacheEnabled ? getTweetId(element) : '';
    if (!bypassDedup && tweetId && expandedRetranslated.has(tweetId)) return;
    if (tweetId) expandedRetranslated.add(tweetId);
    // Only update original text cache if NOT preserving (i.e., first translation)
    if (!preserveOriginal && tweetId && text && isTweetIdCacheEnabled) {
        originalTextCache.set(tweetId, text);
        element.dataset.geminiTranslatedOriginal = text;
    }
    element.dataset.geminiTranslated = 'pending';
    translationQueue.push({ element, text, kind: 'tweet' });
    scheduleProcessing();
}

function pruneCache(map) {
    while (map.size > CACHE_LIMIT) {
        const firstKey = map.keys().next().value;
        if (firstKey !== undefined) map.delete(firstKey);
        else break;
    }
}

// --- Floating Panel UI Construction ---
const PANEL_CLASS_EXPANDED = 'css-175oi2r r-105ug2t r-14lw9ot r-1867qdf r-1upvrn0 r-13awgt0 r-1ce3o0f r-1udh08x r-u8s1d r-13qz1uu';
const PANEL_CLASS_MINIMIZED = 'css-175oi2r r-105ug2t r-1867qdf r-1upvrn0 r-13awgt0 r-1ce3o0f r-1udh08x r-u8s1d r-13qz1uu r-173mn98 r-1e5uvyk r-6026j r-1xsrhxi r-rs99b7 r-12jitg0';
const PANEL_MARGIN = {
    expandedTop: 18,
    expandedRight: 12,
    minimizedTop: 80,
    minimizedBottom: 200,
    minimizedRight: 12
};
const PANEL_Z_INDEX_EXPANDED = 2147483647;
const PANEL_Z_INDEX_MINIMIZED = 2147483000;
const MINIMIZED_LEFT_OFFSET_PX = 0;

// Shared Dock Logic
function ensureDock() {
    let dock = document.getElementById('gemini-dock');
    if (!dock) {
        dock = document.createElement('div');
        dock.id = 'gemini-dock';
        dock.style.cssText = 'position:fixed; right:16px; top:80px; z-index:2147483600; display:flex; flex-direction:column; gap:12px; align-items:flex-end; pointer-events:none;';
        document.body.appendChild(dock);
    }
    return dock;
}

function attachToDock(panel, order = 0) {
    const dock = ensureDock();
    panel.dataset.gemDockOrder = order;
    dock.appendChild(panel);
    Array.from(dock.children)
        .sort((a, b) => (parseInt(a.dataset.gemDockOrder || '0', 10) - parseInt(b.dataset.gemDockOrder || '0', 10)))
        .forEach((el) => dock.appendChild(el));

    // Reset styles first to ensure clean slate
    panel.style.cssText = '';

    // Apply strict styles from standard template
    panel.style.setProperty('position', 'static', 'important');
    panel.style.setProperty('width', '56px', 'important');
    panel.style.setProperty('height', '56px', 'important');
    panel.style.setProperty('min-width', '56px', 'important');
    panel.style.setProperty('margin', '0', 'important');
    panel.style.setProperty('padding', '0', 'important');
    panel.style.setProperty('box-sizing', 'border-box', 'important');
    panel.style.setProperty('display', 'block', 'important');
    panel.style.setProperty('align-self', 'flex-end', 'important');
    panel.style.setProperty('pointer-events', 'auto', 'important');
    panel.style.setProperty('z-index', 'auto', 'important');
    panel.style.setProperty('float', 'none', 'important');
    panel.style.setProperty('clear', 'none', 'important');
    panel.style.setProperty('inset', 'auto', 'important');

    dock.style.pointerEvents = 'none';
}

// Coexistence guard: avoid multiple extensions rewriting the same tweet node.
const GEM_LAB_OWNER_ID = 'translator';
function canMutateTweetElement(el) {
    const owner = el?.dataset?.gemLabOwner;
    return !owner || owner === GEM_LAB_OWNER_ID;
}
function claimTweetElement(el) {
    if (!el?.dataset) return false;
    if (!canMutateTweetElement(el)) return false;
    el.dataset.gemLabOwner = GEM_LAB_OWNER_ID;
    return true;
}

function createPanel() {
    // Cleanup duplicates first
    const existing = document.querySelectorAll('[id^="gemini-x-panel"]');
    existing.forEach(p => p.remove());

    const section = document.createElement('div');
    section.id = 'gemini-x-panel';
    // Base generic classes for container
    section.style.cssText = `
        position: fixed;
        z-index: ${PANEL_Z_INDEX_MINIMIZED};
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    `;
    // Default to minimized position to avoid initial flicker
    section.style.top = `${PANEL_MARGIN.minimizedTop}px`;
    section.style.right = `${PANEL_MARGIN.minimizedRight + MINIMIZED_LEFT_OFFSET_PX}px`;
    section.style.bottom = 'auto';
    section.style.left = 'auto';
    section.style.width = 'auto';

    // Icons
    // 1. Minimized Icon (Gemini "T")
    const geminiIconSvg = `<span aria-hidden="true" style="display: inline-flex; align-items: center; justify-content: center; width: 100%; height: 100%; font-size: 24px; font-weight: 800; line-height: 1; font-family: system-ui, -apple-system, 'Segoe UI', Arial, sans-serif; color: currentColor;">T</span>`;

    // 2. Minimize Icon (match Banana)
    const closeIconSvg = `<svg viewBox="0 0 24 24" aria-hidden="true" style="color: #536471; width: 18px; height: 18px;"><g><path d="M19 13v6h-6v-2h2.586l-3.793-3.793 1.414-1.414L17 15.586V13h2zM11 5v2H8.414l3.793 3.793-1.414 1.414L7 8.414V11H5V5h6z" fill="currentColor"></path></g></svg>`;

		    section.innerHTML = `
	        <style>
                #gx-expanded-view, #gx-minimized-button {
                    --gx-accent: #cfd9de;
                    --gx-green: #2ecc71;
                    --gx-green-soft: #cfead6;
                    --gx-grey-soft: #e6ecf0;
                    --gx-ring: 2px;
                }
	            #gx-expanded-view {
	                transform-origin: top right;
	                transition: opacity 220ms ease, transform 260ms cubic-bezier(0.2, 0.9, 0.2, 1);
	            }
            #gx-minimized-view {
                transform-origin: top right;
                transition: opacity 180ms ease, transform 220ms cubic-bezier(0.2, 0.9, 0.2, 1);
            }
            #gx-minimize-btn:hover { background: rgba(15,20,25,0.10) !important; border-color: #d1d5db !important; }
            #gx-minimize-btn:active { background: rgba(15,20,25,0.14) !important; }
            #gx-settings-toggle:hover { opacity: 0.95; }
            #gx-save:hover { background-color: #272c30 !important; }
            #gx-onboard-save:hover { background-color: #272c30 !important; }
            #gx-save.gx-save--dirty { background-color: #e5e7eb !important; color: #0f1419 !important; border-color: #2ecc71 !important; box-shadow: rgba(46,204,113,0.22) 0 0 0 4px; }
            #gx-save.gx-save--dirty:hover { background-color: #dbe0e6 !important; }
            .gx-hidden {
                opacity: 0;
                transform: scale(0.92);
                pointer-events: none;
            }
            .gx-visible {
                opacity: 1;
                transform: scale(1);
            }
	        </style>
	        <!-- EXPANDED VIEW -->
	        <div id="gx-expanded-view" class="css-175oi2r r-105ug2t r-14lw9ot r-1867qdf r-1upvrn0 r-13awgt0 r-1ce3o0f r-1udh08x r-u8s1d r-13qz1uu gx-hidden" style="width: 300px; max-height: 80vh; display: none; flex-direction: column; box-shadow: rgba(101, 119, 134, 0.2) 0px 0px 15px, rgba(101, 119, 134, 0.15) 0px 0px 3px 1px; border-radius: 16px; background-color: white; position: relative; border: 2px solid var(--gx-accent); overflow: hidden;">
	            <button id="gx-minimize-btn" type="button" aria-label="小さくする" title="小さくする" style="position: absolute; top: 8px; right: 8px; background: rgba(15,20,25,0.06); border: 1px solid #e5e7eb; border-radius: 9999px; width: 34px; height: 34px; display: flex; justify-content: center; align-items: center; cursor: pointer; transition: background 0.2s, border-color 0.2s; z-index: 1; box-shadow: rgba(15, 20, 25, 0.06) 0 1px 0;">
	                 ${closeIconSvg}
	            </button>
            <!-- Onboarding Overlay -->
            <form id="gx-onboard" autocomplete="off" style="display:none; position:absolute; inset:0; background: #ffffff; border-radius:16px; padding:20px 18px 18px 18px; z-index:2; box-shadow: rgba(0,0,0,0.06) 0 8px 30px;">
                <div style="font-weight:800; font-size:16px; margin-bottom:8px; color:#0f1419;">はじめに</div>
                <div style="font-size:13px; color:#536471; line-height:1.5; margin-bottom:14px;">GeminiのAPIキーを入力してモデルを選ぶと自動翻訳が始まります。</div>
                <label style="display:block; font-size:12px; font-weight:700; color:#0f1419; margin-bottom:6px;">API Key</label>
                <input type="text" id="gx-onboard-user" autocomplete="username" placeholder="Username" style="position:absolute; left:-9999px; width:1px; height:1px; opacity:0;">
                <input type="password" id="gx-onboard-key" autocomplete="new-password" placeholder="AI Studio Key" style="width:100%; border:1px solid #cfd9de; border-radius:8px; padding:10px 12px; font-size:14px; margin-bottom:14px; outline:none;">
                <label style="display:block; font-size:12px; font-weight:700; color:#0f1419; margin-bottom:6px;">モデル</label>
                <select id="gx-onboard-model" style="width:100%; border:1px solid #cfd9de; border-radius:8px; padding:10px 12px; font-size:14px; margin-bottom:18px; background:white; appearance:none; -webkit-appearance:none;">
                    <option value="gemini-2.0-flash-lite">Gemini 2.0 Flash-Lite</option>
                    <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
                    <option value="gemini-2.5-flash-lite">Gemini 2.5 Flash-Lite</option>
                    <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                    <option value="gemini-3-flash-preview">Gemini 3 Flash Preview</option>
                </select>
                <button id="gx-onboard-save" type="button" style="width:100%; background-color:#0f1419; color:#ffffff; border:2px solid transparent; padding:12px; border-radius:9999px; font-weight:700; font-size:14px; cursor:pointer; transition: background 0.2s, border-color 0.2s, box-shadow 0.2s;">保存して開始</button>
                <div id="gx-onboard-msg" style="font-size:12px; color:#00ba7c; margin-top:8px; min-height:16px;"></div>
            </form>
            
            <!-- Header -->
	            <div id="gx-header" class="css-175oi2r" style="cursor: move; padding: 12px 16px 8px 16px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #eff3f4; min-height: 50px;">
		                <div style="font-weight: 800; font-size: 15px; color: #0f1419;">Gemini Translator</div>
		            </div>

            
	            <!-- Body -->
	            <div id="gx-body" style="padding: 16px; overflow-y: auto;">
	                
	                <!-- Auto Translate Toggle -->
	                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
	                    <span style="font-size: 14px; font-weight: 700; color: #0f1419;">自動翻訳</span>
	                    <label style="position: relative; display: inline-block; width: 44px; height: 24px;">
	                        <input type="checkbox" id="gx-toggle" checked style="opacity: 0; width: 0; height: 0;">
	                        <span style="position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: rgb(29, 155, 240); transition: .4s; border-radius: 24px;"></span>
	                        <span id="gx-slider-knob" style="position: absolute; content: ''; height: 20px; width: 20px; left: 2px; bottom: 2px; background-color: white; transition: .4s; border-radius: 50%; transform: translateX(20px);"></span>
	                    </label>
	                </div>

                    <!-- Quick Actions -->
                    <div style="display:flex; gap:10px; margin-bottom: 16px;">
                        <button id="gx-translate-once" type="button" style="flex:1; background:#1d9bf0; color:white; border:none; padding:10px 12px; border-radius:9999px; cursor:pointer; font-weight:800; font-size: 13px;">表示中を翻訳</button>
                        <button id="gx-reset" type="button" style="flex:1; background:#f7f9f9; color:#0f1419; border:1px solid #cfd9de; padding:10px 12px; border-radius:9999px; cursor:pointer; font-weight:800; font-size: 13px;">元に戻す</button>
                    </div>

	                <!-- Stats Card -->
	                <div style="background-color: #f7f9f9; padding: 12px 16px; border-radius: 12px; margin-bottom: 20px; border: 1px solid #eff3f4;">
	                    <div style="font-size: 11px; color: #536471; font-weight: 500;">推定コスト (モデル別目安)</div>
	                    <div id="gx-cost" style="font-size: 22px; font-weight: 800; color: #0f1419; margin: 4px 0 8px 0;">$0.0000</div>
                        <div id="gx-total-usage" style="font-size: 11px; color: #536471; margin-bottom: 6px; line-height: 1.35;"></div>
	                    <div style="font-size: 11px; color: #536471; display: flex; justify-content: space-between;">
	                        <span>In: <b id="gx-input-chars" style="color: #0f1419;">0</b></span>
	                        <span>Out: <b id="gx-output-chars" style="color: #0f1419;">0</b></span>
	                    </div>
	                </div>

	                <!-- Settings Section -->
	                <button id="gx-settings-toggle" aria-expanded="false" title="クリックで開閉" style="width: 100%; text-align: left; background: none; border: none; padding: 6px 0; margin-top: 12px; margin-bottom: 8px; cursor: pointer; display: flex; align-items: center; justify-content: space-between; gap: 10px; color: #2ecc71; font-weight: 600; font-size: 13px;">
                        <span style="display:flex; align-items:center; gap:8px;">
	                         <span style="font-size: 16px;">⚙️</span>
                             設定（モデル・キー）
                        </span>
                        <span id="gx-settings-chevron" aria-hidden="true" style="display:inline-flex; align-items:center; justify-content:center; width: 22px; height: 22px; border-radius: 9999px; border: 1px solid rgba(46,204,113,0.35); color:#2ecc71; font-weight: 900; font-size: 12px; line-height: 1; transform: rotate(0deg); transition: transform 160ms ease;">▾</span>
                    </button>
                
	                <div id="gx-settings-content" style="display: none; margin-top: 6px; margin-bottom: 18px;">
                        <!-- Privacy Note -->
                        <div style="margin: 0 0 14px 0; padding: 10px 12px; border: 1px solid #eff3f4; border-radius: 10px; background-color: #ffffff;">
                            <div style="font-size: 11px; font-weight: 800; color: #0f1419; margin-bottom: 4px;">プライバシー</div>
	                            <div style="font-size: 11px; color: #536471; line-height: 1.45;">
	                                翻訳のために、ツイート本文テキストが Google の Gemini API に送信されます。保存はローカル（APIキー/設定/文字数統計）のみです。
	                            </div>
                                <button id="gx-open-options" type="button" style="margin-top:10px; width:100%; background:#f7f9f9; color:#0f1419; border:1px solid #cfd9de; padding:10px 12px; border-radius:9999px; cursor:pointer; font-weight:800; font-size: 13px;">詳細設定を開く</button>
	                        </div>
		                    
		                    <!-- Model Select -->
	                    <div style="margin-bottom: 15px;">
	                        <label style="display: block; font-size: 13px; margin-bottom: 6px; font-weight: 700; color: #0f1419;">モデル</label>
                        <div style="position: relative;">
                            <select id="gx-model" style="width: 100%; appearance: none; -webkit-appearance: none; background-color: white; border: 1px solid #cfd9de; border-radius: 8px; padding: 10px 32px 10px 12px; font-size: 14px; color: #0f1419; font-weight: 500; cursor: pointer;">
                                <option value="gemini-2.0-flash-lite">Gemini 2.0 Flash-Lite</option>
                                <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
                                <option value="gemini-2.5-flash-lite">Gemini 2.5 Flash-Lite</option>
                                <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                                <option value="gemini-3-flash-preview">Gemini 3 Flash Preview</option>
                            </select>
                            <div style="position: absolute; right: 12px; top: 50%; transform: translateY(-50%); pointer-events: none; color: #536471;">
                                <svg viewBox="0 0 24 24" aria-hidden="true" style="width: 16px; height: 16px; fill: currentColor;"><path d="M3.543 8.96l1.414-1.42L12 14.59l7.043-7.05 1.414 1.42L12 17.41 3.543 8.96z"></path></svg>
                            </div>
	                        </div>
	                    </div>

                        <!-- Direction -->
	                        <div style="margin-bottom: 15px;">
	                            <label style="display: block; font-size: 13px; margin-bottom: 6px; font-weight: 700; color: #0f1419;">翻訳方向</label>
	                            <select id="gx-direction" style="width: 100%; appearance: none; -webkit-appearance: none; background-color: white; border: 1px solid #cfd9de; border-radius: 8px; padding: 10px 32px 10px 12px; font-size: 14px; color: #0f1419; font-weight: 500; cursor: pointer;">
	                                <option value="en_to_ja">英/韓/中 → 日本語</option>
	                                <option value="ja_to_en">日本語 → 英語</option>
	                            </select>
	                        </div>

	                    <!-- API Key -->
	                    <form id="gx-key-form" autocomplete="off">
	                        <div style="margin-bottom: 20px;">
	                            <label style="display: block; font-size: 13px; margin-bottom: 6px; font-weight: 700; color: #0f1419;">API Key</label>
	                            <input type="text" id="gx-user" autocomplete="username" placeholder="Username" style="position:absolute; left:-9999px; width:1px; height:1px; opacity:0;">
	                            <input type="password" id="gx-apikey" autocomplete="new-password" placeholder="AI Studio Key" style="width: 100%; border: 1px solid #cfd9de; border-radius: 8px; padding: 10px 12px; font-size: 14px; color: #0f1419; box-sizing: border-box; outline: none; transition: border 0.2s;">
	                        </div>
	                    </form>
		                </div>

                        <button id="gx-save" style="width: 100%; margin-top: 16px; background-color: #0f1419; color: white; border: 2px solid transparent; padding: 12px; border-radius: 9999px; cursor: pointer; font-weight: 700; font-size: 14px; transition: background 0.2s, border-color 0.2s, box-shadow 0.2s;">保存</button>
                        <div id="gx-meta" style="text-align:center; font-size: 11px; color:#536471; margin-top: 8px; line-height: 1.45;">
                            <span id="gx-meta-version">バージョン -</span>
                            <span> / </span>
                            <a id="gx-meta-author" href="https://bit.ly/4shaBYM" target="_blank" rel="noopener noreferrer" style="color:#2ecc71; text-decoration: none; font-weight: 900;">Mojofull</a>
                            <span> が作りました</span>
                        </div>
                        <div id="gx-msg" style="text-align: center; font-size: 12px; margin-top: 8px; min-height: 16px; color: #00ba7c;"></div>
		            </div>
		        </div>

        <!-- MINIMIZED VIEW (Grok Button Style - Square) -->
        <div id="gx-minimized-view" class="gx-visible" style="display: block; cursor: pointer;">
	             <div id="gx-minimized-button" class="css-175oi2r r-105ug2t r-1867qdf r-1upvrn0 r-13awgt0 r-1ce3o0f r-1udh08x r-u8s1d r-13qz1uu r-173mn98 r-1e5uvyk r-6026j r-1xsrhxi r-rs99b7 r-12jitg0" style="width: 56px; height: 56px; border-radius: 12px; color: #0f1419; background-color: #ffffff; opacity: 1; filter: none; backdrop-filter: none; box-shadow: rgba(101, 119, 134, 0.2) 0px 0px 8px, rgba(101, 119, 134, 0.25) 0px 1px 3px 1px; border: var(--gx-ring) solid var(--gx-accent);">
                <button role="button" class="css-175oi2r r-6koalj r-eqz5dr r-16y2uox r-1pi2tsx r-1loqt21 r-o7ynqc r-6416eg r-1ny4l3l" type="button" style="align-items: center; justify-content: center; width: 100%; height: 100%; background: transparent; border: none; padding: 0; cursor: pointer;">
                    <div class="css-175oi2r" style="color: currentColor;">
                        ${geminiIconSvg}
                    </div>
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(section);
    section.style.display = 'none';
    setupPanelLogic(section);
}

// --- Panel Logic ---
function setupPanelLogic(panel) {
    // Elements
    const expandedView = panel.querySelector('#gx-expanded-view');
    const minimizedView = panel.querySelector('#gx-minimized-view');
    const header = panel.querySelector('#gx-header');
    const minimizeBtn = panel.querySelector('#gx-minimize-btn');
    const minimizedButton = panel.querySelector('#gx-minimized-button');
    const toggle = panel.querySelector('#gx-toggle');
    const knob = panel.querySelector('#gx-slider-knob');
    const costEl = panel.querySelector('#gx-cost');
    const totalUsageEl = panel.querySelector('#gx-total-usage');
    const inputCharsEl = panel.querySelector('#gx-input-chars');
    const outputCharsEl = panel.querySelector('#gx-output-chars');
    const translateOnceBtn = panel.querySelector('#gx-translate-once');
    const resetBtn = panel.querySelector('#gx-reset');
    const settingsToggle = panel.querySelector('#gx-settings-toggle');
    const settingsContent = panel.querySelector('#gx-settings-content');
    const settingsChevron = panel.querySelector('#gx-settings-chevron');
    const openOptionsBtn = panel.querySelector('#gx-open-options');
    const modelSelect = panel.querySelector('#gx-model');
    const directionSelect = panel.querySelector('#gx-direction');
    const apiKeyInput = panel.querySelector('#gx-apikey');
    const saveBtn = panel.querySelector('#gx-save');
    const msgEl = panel.querySelector('#gx-msg');
    const metaVersionEl = panel.querySelector('#gx-meta-version');
    const metaAuthorEl = panel.querySelector('#gx-meta-author');
    const onboard = panel.querySelector('#gx-onboard');
    const onboardKey = panel.querySelector('#gx-onboard-key');
    const onboardModel = panel.querySelector('#gx-onboard-model');
    const onboardSave = panel.querySelector('#gx-onboard-save');
    const onboardMsg = panel.querySelector('#gx-onboard-msg');

    // Prevent form submission (Enter key) from navigating/reloading the page.
    const keyForm = panel.querySelector('#gx-key-form');
    onboard?.addEventListener('submit', (e) => e.preventDefault());
    keyForm?.addEventListener('submit', (e) => e.preventDefault());


    // Draggable State
    let expandedPosition = null;
    let savedKeySnapshot = '';
    let savedModelSnapshot = DEFAULT_MODEL;

    // State Logic for Min/Max
    const setPanelFixedPosition = ({ topPx = null, rightPx = '12px', bottomPx = null }) => {
        if (bottomPx !== null) {
            panel.style.setProperty('bottom', bottomPx, 'important');
            panel.style.setProperty('top', 'auto', 'important');
        } else if (topPx !== null) {
            panel.style.setProperty('top', topPx, 'important');
            panel.style.setProperty('bottom', 'auto', 'important');
        }
        panel.style.setProperty('right', rightPx, 'important');
        panel.style.setProperty('left', 'auto', 'important');
    };

    const setPanelState = (isMinimized) => {
        isPanelMinimized = isMinimized;
        if (isMinimized) {
            panel.style.zIndex = PANEL_Z_INDEX_MINIMIZED;
            panel.style.display = 'none';
            expandedView.style.display = 'none';
            expandedView.classList.remove('gx-visible');
            expandedView.classList.add('gx-hidden');
            minimizedView.style.display = 'none';
            minimizedView.classList.remove('gx-visible');
            minimizedView.classList.add('gx-hidden');

        } else {
            // Capture current position while docked (before moving)
            const rect = panel.getBoundingClientRect();
            const currentTop = rect.top;
            const currentRight = window.innerWidth - rect.right;

            if (panel.parentElement && panel.parentElement.id === 'gemini-dock') {
                // Insert placeholder to prevent shift
                const placeholder = document.createElement('div');
                placeholder.id = 'gx-dock-placeholder';
                placeholder.style.cssText = 'width: 56px; height: 56px; margin: 0; padding: 0; display: block; flex-shrink: 0;';

                // Insert placeholder before moving panel
                panel.parentElement.insertBefore(placeholder, panel);

                // Move panel to body
                document.body.appendChild(panel);
            }

            // Clear strict docking styles and restore base panel styles
            panel.style.cssText = '';
            panel.style.cssText = `
                position: fixed;
                z-index: ${PANEL_Z_INDEX_EXPANDED};
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            `;

            // Apply dynamic position (align right shoulders)
            const topPx = (currentTop > 0) ? currentTop : (PANEL_MARGIN.expandedTop + 80);
            const rightPx = (currentRight >= 0) ? currentRight : PANEL_MARGIN.expandedRight;

            setPanelFixedPosition({
                topPx: `${topPx}px`,
                rightPx: `${rightPx}px`
            });
            panel.style.width = '300px';
            panel.style.display = 'block';
            minimizedView.style.display = 'none';
            minimizedView.classList.remove('gx-visible');
            minimizedView.classList.add('gx-hidden');
            expandedView.style.display = 'flex';
            requestAnimationFrame(() => {
                expandedView.classList.remove('gx-hidden');
                expandedView.classList.add('gx-visible');
            });
        }
    };

    // expose for keyboard shortcuts
    panelControl.togglePanel = () => setPanelState(!isPanelMinimized);
    panelControl.setPanelState = setPanelState;
    panelControl.getPanelState = () => isPanelMinimized;

    // Minimize Button Handler
    minimizeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        setPanelState(true);
    });

    // Restore Handler (Clicking the minimized icon)
    minimizedView.addEventListener('click', () => {
        setPanelState(false);
    });

    // Draggable Logic (Only active in Expanded mode for now)
    let isDragging = false;
    let startX, startY, initialLeft, initialTop;

    const handleMouseDown = (e) => {
        if (isPanelMinimized) return; // Disallow dragging icon as it's fixed to top-right
        if (['BUTTON', 'INPUT', 'SELECT', 'LABEL'].includes(e.target.tagName)) return;

        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        const rect = panel.getBoundingClientRect();
        initialLeft = rect.left;
        initialTop = rect.top;

        panel.style.bottom = 'auto';
        panel.style.right = 'auto';
        panel.style.left = `${initialLeft}px`;
        panel.style.top = `${initialTop}px`;
        e.preventDefault();
    };

    header.addEventListener('mousedown', handleMouseDown);

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        panel.style.left = `${initialLeft + dx}px`;
        panel.style.top = `${initialTop + dy}px`;
    });

    document.addEventListener('mouseup', () => { isDragging = false; });

    // Meta (version/author) - Banana style
    try {
        if (chrome?.runtime?.getManifest) {
            const version = chrome.runtime.getManifest().version || '-';
            if (metaVersionEl) metaVersionEl.textContent = `バージョン ${version}`;
            if (metaAuthorEl && metaAuthorEl.tagName === 'A') {
                metaAuthorEl.textContent = 'Mojofull';
                metaAuthorEl.setAttribute('href', 'https://bit.ly/4shaBYM');
            }
        }
    } catch (e) {
        // ignore
    }

    // Toggle Style Update helper
    const updateToggleStyle = (checked) => {
        const slider = toggle.nextElementSibling;
        const accent = checked ? '#2ecc71' : '#cfd9de';
        if (checked) {
            slider.style.backgroundColor = '#2ecc71';
            knob.style.transform = 'translateX(20px)';
        } else {
            slider.style.backgroundColor = '#cfd9de';
            knob.style.transform = 'translateX(2px)';
        }

        // Keep border colors in sync (Banana-style)
        if (expandedView) expandedView.style.setProperty('--gx-accent', accent);
        if (minimizedButton) minimizedButton.style.setProperty('--gx-accent', accent);
        // Minimize button border remains Banana-like (neutral)

        // Minimized icon state (green when auto-translate is ON)
        if (minimizedButton) {
            if (checked) {
                minimizedButton.style.boxShadow = 'rgba(46, 204, 113, 0.25) 0px 0px 8px, rgba(46, 204, 113, 0.18) 0px 1px 3px 1px';
            } else {
                minimizedButton.style.boxShadow = 'rgba(101, 119, 134, 0.2) 0px 0px 8px, rgba(101, 119, 134, 0.25) 0px 1px 3px 1px';
            }
        }
    };

    const updateSaveDirty = () => {
        if (!saveBtn) return;
        const keyNow = (apiKeyInput?.value || '').trim();
        const modelNow = modelSelect?.value || DEFAULT_MODEL;
        const dirty = (keyNow !== (savedKeySnapshot || '')) || (modelNow !== (savedModelSnapshot || DEFAULT_MODEL));
        saveBtn.classList.toggle('gx-save--dirty', dirty);
    };

    // Focus effects for inputs
    const addFocusEffects = (el) => {
        if (!el) return;
        el.addEventListener('focus', () => el.style.border = '1px solid #1d9bf0');
        el.addEventListener('blur', () => el.style.border = '1px solid #cfd9de');
    };
    addFocusEffects(apiKeyInput);
    addFocusEffects(modelSelect);
    addFocusEffects(directionSelect);
    addFocusEffects(onboardKey);
    addFocusEffects(onboardModel);

    // Lightweight toast helper using existing message nodes
    const setMsg = (el, text, ok = true) => {
        el.textContent = text;
        el.style.color = ok ? '#00ba7c' : '#f4212e';
    };

    const testApiKey = async (key, model) => {
        // Use low-cost countTokens endpoint for a quick live check
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
    };

    const humanizeKeyTestError = (err) => {
        const msg = String(err?.message || err || '');
        const m = msg.toLowerCase();
        if (!msg) return '確認に失敗しました。もう一度お試しください。';
        if (m.includes('403')) return 'このAPIキーでは利用できません。キーと権限を確認してください。';
        if (m.includes('429')) return '混み合っています。少し待ってからもう一度お試しください。';
        if (m.includes('timeout') || m.includes('5秒')) return '通信がタイムアウトしました。時間をおいて再試行してください。';
        return '確認に失敗しました。キーを確認して、もう一度お試しください。';
    };



    const showOnboarding = (prefillModel) => {
        // Prefill model choice and keep key empty to encourage fresh input
        onboardModel.value = prefillModel || DEFAULT_MODEL;
        onboardKey.value = '';
        onboardMsg.textContent = '';
        // Force expanded view to ensure visibility
        setPanelState(false);
        expandedView.style.display = 'flex';
        requestAnimationFrame(() => {
            onboard.style.display = 'block';
        });
    };
    triggerOnboarding = showOnboarding;

    const hideOnboarding = () => {
        onboard.style.display = 'none';
    };

    const resetTranslations = () => {
        if (scheduledTimerId) {
            clearTimeout(scheduledTimerId);
            scheduledTimerId = null;
        }
        translationQueue.length = 0;
        translationCache.clear();
        translationByTweetId.clear();
        originalTextCache.clear();
        expandedRetranslated.clear();
        const translatedEls = document.querySelectorAll('[data-testid="tweetText"][data-gemini-translated], div[lang][data-gemini-translated]');
        translatedEls.forEach((el) => {
            if (el.dataset.geminiOriginalHtml) {
                el.innerHTML = el.dataset.geminiOriginalHtml;
            }
            delete el.dataset.geminiTranslated;
            delete el.dataset.geminiTranslatedOriginal;
            delete el.dataset.geminiTranslatedText;
            delete el.dataset.geminiTranslatedMode;
            delete el.dataset.geminiOriginalHtml;
            delete el.dataset.geminiTranslatedTweetId;
            delete el.dataset.gemLabOwner;
        });
        const pageEls = document.querySelectorAll('[data-gx-page-translated]');
        pageEls.forEach((el) => {
            const original = el.dataset.gxOriginalText || el.textContent || '';
            const textNode = document.createTextNode(original);
            el.replaceWith(textNode);
        });
        if (isXHost) {
            scanExistingTweets();
        } else {
            scanPageContent({ force: true });
        }
    };

    // Load State from Storage
    chrome.storage.local.get([
        'isAutoTranslateEnabled',
        'geminiModel',
        'modelStats',
        MODEL_STATS_DAY_KEY,
        'geminiApiKey',
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
    ], (res) => {
        // Toggle
        const isEnabled = res.isAutoTranslateEnabled !== false;
        toggle.checked = isEnabled && !!res.geminiApiKey;
        updateToggleStyle(toggle.checked);

        // Stats (Use modelStats now)
        let currentModel = res.geminiModel || DEFAULT_MODEL;
        if (!res[MODEL_MIGRATION_KEY]) {
            currentModel = DEFAULT_MODEL;
            chrome.storage.local.set({
                geminiModel: DEFAULT_MODEL,
                [MODEL_MIGRATION_KEY]: true
            });
        }
        const dayKey = getModelStatsDayKey();
        let modelStats = res.modelStats || {};
        if (res[MODEL_STATS_DAY_KEY] !== dayKey) {
            modelStats = {};
            chrome.storage.local.set({ modelStats: {}, [MODEL_STATS_DAY_KEY]: dayKey });
        }
        updateStatsUI(modelStats, currentModel);

        // Settings
        modelSelect.value = currentModel;
        directionSelect.value = res.translationDirection || DIR_EN_JA;
        if (res.geminiApiKey) apiKeyInput.value = res.geminiApiKey;
        cachedApiKey = (res.geminiApiKey || '').trim();
        savedKeySnapshot = cachedApiKey;
        savedModelSnapshot = currentModel;
        translationDirection = res.translationDirection || DIR_EN_JA;

        const keywords = (res[SETTINGS_EXCLUDE_KEYWORDS_KEY] || [])
            .map((s) => String(s || '').trim().toLowerCase())
            .filter(Boolean);
        excludedKeywords = keywords;

        dailyCostLimitUsd = typeof res[SETTINGS_DAILY_COST_LIMIT_USD_KEY] === 'number' ? res[SETTINGS_DAILY_COST_LIMIT_USD_KEY] : null;
        dailyTotalCharsLimit = typeof res[SETTINGS_DAILY_TOTAL_CHARS_LIMIT_KEY] === 'number' ? res[SETTINGS_DAILY_TOTAL_CHARS_LIMIT_KEY] : null;

        isTranslationCacheEnabled = res[SETTINGS_CACHE_ENABLED_KEY] !== false;
        if (!isTranslationCacheEnabled) translationCache.clear();

        const gp = Array.isArray(res[SETTINGS_GLOSSARY_KEY]) ? res[SETTINGS_GLOSSARY_KEY] : [];
        glossaryPairs = gp
            .map((p) => ({ from: String(p?.from || '').trim(), to: String(p?.to || '').trim() }))
            .filter((p) => p.from && p.to)
            .slice(0, 30);

        siteWhitelist = Array.isArray(res[SETTINGS_SITE_WHITELIST_KEY])
            ? res[SETTINGS_SITE_WHITELIST_KEY].map(normalizeHost).filter(Boolean)
            : [];
        siteMode = res[SETTINGS_SITE_MODE_KEY] === 'advanced' ? 'advanced' : 'simple';
        siteRules = normalizeSiteRules(res[SETTINGS_SITE_RULES_KEY]);
        translateColorDefault = normalizeColorName(res[SETTINGS_TRANSLATE_COLOR_DEFAULT_KEY]) || 'inherit';
        translateColorRules = normalizeColorRules(res[SETTINGS_TRANSLATE_COLOR_RULES_KEY]);
        isSiteAllowed = isHostAllowed(currentHost);
        pageTranslationEnabled = isSiteAllowed && !!getPageTranslationConfig();

        // Default to minimized on load (top-right, shifted left)
        setPanelState(true);

        updateSaveDirty();

        // If no API key yet, guide user with inline onboarding
        if (!res.geminiApiKey) {
            showOnboarding(currentModel);
        }

        // Initial scan after storage is loaded (ensures toggle state is correct)
        loadPageCache(() => {
        if (toggle.checked && isSiteAllowed) {
            scanPageContent({ force: false });
        }
    });
    });

    // Event Listeners
    toggle.addEventListener('change', (e) => {
        const checked = e.target.checked;
        updateToggleStyle(checked);
        chrome.storage.local.set({ isAutoTranslateEnabled: checked });
        if (checked) {
            scanPageContent({ force: false });
            processQueue();
        } else {
            resetTranslations();
        }
    });

    translateOnceBtn?.addEventListener('click', () => {
        scanPageContent({ force: true });
        processQueue({ force: true });
    });

    resetBtn?.addEventListener('click', () => {
        resetTranslations();
        showToast('元に戻しました', 'success');
    });

    directionSelect?.addEventListener('change', (e) => {
        const dir = e.target.value === DIR_JA_EN ? DIR_JA_EN : DIR_EN_JA;
        translationDirection = dir;
        chrome.storage.local.set({ translationDirection: dir });
        resetTranslations();
        if (toggle.checked) {
            scanPageContent({ force: false });
            processQueue();
        }
    });

    openOptionsBtn?.addEventListener('click', () => {
        if (!isRuntimeAvailable()) {
            showToast('設定ページを開けませんでした。拡張機能を再読み込みしてください。', 'error', 4000);
            return;
        }
        try {
            chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS_PAGE' }, (res) => {
                const lastErr = chrome.runtime.lastError;
                if (lastErr) {
                    showToast('設定ページを開けませんでした。拡張機能を再読み込みしてください。', 'error', 4000);
                    return;
                }
                if (!res?.success) showToast('設定ページを開けませんでした。拡張機能を再読み込みしてください。', 'error', 4000);
            });
        } catch (e) {
            showToast('設定ページを開けませんでした。拡張機能を再読み込みしてください。', 'error', 4000);
        }
    });

    modelSelect.addEventListener('change', (e) => {
        const newModel = e.target.value;
        // Update stats display immediately when model changes
        chrome.storage.local.get(['modelStats'], (r) => {
            updateStatsUI(r.modelStats || {}, newModel);
        });
        updateSaveDirty();
    });

    apiKeyInput?.addEventListener('input', updateSaveDirty);

    const setSettingsExpanded = (expanded) => {
        const next = !!expanded;
        settingsContent.style.display = next ? 'block' : 'none';
        settingsToggle.setAttribute('aria-expanded', next ? 'true' : 'false');
        if (settingsChevron) settingsChevron.style.transform = `rotate(${next ? 180 : 0}deg)`;
    };

    // Ensure initial chevron state matches initial display
    try {
        setSettingsExpanded(settingsContent.style.display !== 'none');
    } catch (e) {
        // ignore
    }

    settingsToggle.addEventListener('click', () => {
        const isHidden = settingsContent.style.display === 'none';
        setSettingsExpanded(isHidden);
    });



    saveBtn.addEventListener('click', () => {
        const key = apiKeyInput.value.trim();
        const model = modelSelect.value;
        if (!validateApiKey(key)) {
            setMsg(msgEl, 'APIキーの形式が正しくありません', false);
            return;
        }
        saveBtn.textContent = '保存中...';
        setMsg(msgEl, 'キー確認中...', true);

        testApiKey(key, model).then(() => {
            chrome.storage.local.set({
                geminiApiKey: key,
                geminiModel: model
            }, () => {
                cachedApiKey = key;
                savedKeySnapshot = key;
                savedModelSnapshot = model;
                updateSaveDirty();
                saveBtn.textContent = '保存';
                setMsg(msgEl, '設定を保存しました', true);
                // Force stats update
                chrome.storage.local.get(['modelStats'], (r) => {
                    updateStatsUI(r.modelStats || {}, model);
                });
                setTimeout(() => { msgEl.textContent = ''; }, 2000);
            });
        }).catch((err) => {
            saveBtn.textContent = '保存';
            setMsg(msgEl, humanizeKeyTestError(err), false);
        });
    });

    onboardSave.addEventListener('click', () => {
        const key = onboardKey.value.trim();
        const model = onboardModel.value;
        if (!key) {
            setMsg(onboardMsg, 'APIキーを入力してください', false);
            return;
        }
        if (!validateApiKey(key)) {
            setMsg(onboardMsg, 'APIキーの形式が正しくありません', false);
            return;
        }
        onboardSave.textContent = '保存中...';
        setMsg(onboardMsg, 'キー確認中...', true);

        testApiKey(key, model).then(() => {
            chrome.storage.local.set({
                geminiApiKey: key,
                geminiModel: model,
                isAutoTranslateEnabled: true
            }, () => {
                cachedApiKey = key;
                apiKeyInput.value = key;
                modelSelect.value = model;
                toggle.checked = true;
                updateToggleStyle(true);
                setMsg(onboardMsg, '設定を保存しました', true);
                setTimeout(() => {
                    onboardSave.textContent = '保存して開始';
                    hideOnboarding();
                    scanExistingTweets();
                    processQueue();
                }, 600);
            });
        }).catch((err) => {
            onboardSave.textContent = '保存して開始';
            setMsg(onboardMsg, humanizeKeyTestError(err), false);
        });
    });

    // Listen for storage changes
    chrome.storage.onChanged.addListener((changes) => {
        if (changes.modelStats) {
            chrome.storage.local.get(['modelStats', 'geminiModel'], (r) => {
                updateStatsUI(r.modelStats || {}, r.geminiModel || DEFAULT_MODEL);
            });
        }
        if (changes.geminiApiKey) {
            cachedApiKey = (changes.geminiApiKey.newValue || '').trim();
            savedKeySnapshot = cachedApiKey;
            updateSaveDirty();
        }
        if (changes.geminiModel) {
            savedModelSnapshot = changes.geminiModel.newValue || DEFAULT_MODEL;
            updateSaveDirty();
        }
        if (changes.isAutoTranslateEnabled && toggle) {
            const enabled = changes.isAutoTranslateEnabled.newValue !== false;
            const canRun = enabled && !!cachedApiKey;
            toggle.checked = canRun;
            updateToggleStyle(canRun);
            if (canRun) {
                scanPageContent({ force: false });
                processQueue();
            }
        }
        if (changes.translationDirection) {
            translationDirection = changes.translationDirection.newValue || DIR_EN_JA;
            if (directionSelect) directionSelect.value = translationDirection;
        }
        if (changes[SETTINGS_EXCLUDE_KEYWORDS_KEY]) {
            const keywords = (changes[SETTINGS_EXCLUDE_KEYWORDS_KEY].newValue || [])
                .map((s) => String(s || '').trim().toLowerCase())
                .filter(Boolean);
            excludedKeywords = keywords;
        }
        if (changes[SETTINGS_DAILY_COST_LIMIT_USD_KEY]) {
            dailyCostLimitUsd = typeof changes[SETTINGS_DAILY_COST_LIMIT_USD_KEY].newValue === 'number' ? changes[SETTINGS_DAILY_COST_LIMIT_USD_KEY].newValue : null;
        }
        if (changes[SETTINGS_DAILY_TOTAL_CHARS_LIMIT_KEY]) {
            dailyTotalCharsLimit = typeof changes[SETTINGS_DAILY_TOTAL_CHARS_LIMIT_KEY].newValue === 'number' ? changes[SETTINGS_DAILY_TOTAL_CHARS_LIMIT_KEY].newValue : null;
        }
        if (changes[SETTINGS_CACHE_ENABLED_KEY]) {
            isTranslationCacheEnabled = changes[SETTINGS_CACHE_ENABLED_KEY].newValue !== false;
            if (!isTranslationCacheEnabled) translationCache.clear();
        }
        if (changes[SETTINGS_GLOSSARY_KEY]) {
            const gp = Array.isArray(changes[SETTINGS_GLOSSARY_KEY].newValue) ? changes[SETTINGS_GLOSSARY_KEY].newValue : [];
            glossaryPairs = gp
                .map((p) => ({ from: String(p?.from || '').trim(), to: String(p?.to || '').trim() }))
                .filter((p) => p.from && p.to)
                .slice(0, 30);
        }
        if (changes[SETTINGS_TRANSLATE_COLOR_DEFAULT_KEY]) {
            translateColorDefault = normalizeColorName(changes[SETTINGS_TRANSLATE_COLOR_DEFAULT_KEY].newValue) || 'inherit';
            refreshTranslatedColors();
        }
        if (changes[SETTINGS_TRANSLATE_COLOR_RULES_KEY]) {
            translateColorRules = normalizeColorRules(changes[SETTINGS_TRANSLATE_COLOR_RULES_KEY].newValue);
            refreshTranslatedColors();
        }

    });

    // Keep daily cost reset (4:00 local) fresh even if no API calls happen.
    setInterval(() => {
        try {
            maybeResetModelStatsAt4am();
        } catch (e) {
            // ignore
        }
    }, 5 * 60 * 1000);

    function updateStatsUI(modelStats, modelId) {
        // Get stats for specific model, default to 0
        const stats = modelStats[modelId] || { input: 0, output: 0 };
        const inChars = stats.input;
        const outChars = stats.output;

        inputCharsEl.textContent = inChars.toLocaleString();
        outputCharsEl.textContent = outChars.toLocaleString();

        const prices = PRICING[modelId] || PRICING['default'];
        const inCost = (inChars / CHARS_PER_TOKEN / 1000000) * prices.input;
        const outCost = (outChars / CHARS_PER_TOKEN / 1000000) * prices.output;

        costEl.textContent = '$' + (inCost + outCost).toFixed(5);

        const totalCost = estimateTotalCostUsd(modelStats);
        const totalChars = sumTotalChars(modelStats);
        const limitParts = [];
        if (typeof dailyCostLimitUsd === 'number' && dailyCostLimitUsd > 0) {
            limitParts.push(`上限 $${dailyCostLimitUsd}`);
        }
        if (typeof dailyTotalCharsLimit === 'number' && dailyTotalCharsLimit > 0) {
            limitParts.push(`上限 ${dailyTotalCharsLimit.toLocaleString()} chars`);
        }
        totalUsageEl.textContent =
            `合計: $${totalCost.toFixed(4)} / ${totalChars.toLocaleString()} chars` +
            (limitParts.length ? `（${limitParts.join(' / ')}）` : '');
    }
}

// --- Translation Logic (Same as before, adapted for Panel) ---

// requestTranslation: Send to background
function requestTranslation(texts, direction, { force = false } = {}) {
    if (!isRuntimeAvailable()) {
        handleExtensionContextInvalidated();
        return Promise.resolve({ error: 'runtime unavailable' });
    }
    return new Promise((resolve) => {
        try {
            chrome.runtime.sendMessage({
                type: 'TRANSLATE_TEXT_BG',
                texts: Array.isArray(texts) ? texts : [],
                direction,
                force,
                glossary: (glossaryPairs || []).slice(0, 30)
            }, (response) => {
                const lastErr = chrome.runtime.lastError;
                if (lastErr) {
                    const msg = lastErr.message || String(lastErr);
                    if (isExtensionContextInvalidatedError(msg)) handleExtensionContextInvalidated();
                    console.warn('[Gemini Trans] Runtime error:', msg);
                    resolve({ error: msg });
                    return;
                }
                if (response && response.success) {
                    resolve({ translation: response.data });
                } else {
                    if (response?.error && isKeyError(response.error) && triggerOnboarding) {
                        triggerOnboarding();
                    }
                    resolve({ error: response?.error || 'Unknown error' });
                }
            });
        } catch (e) {
            if (isExtensionContextInvalidatedError(e)) {
                handleExtensionContextInvalidated();
                resolve({ error: 'Extension context invalidated' });
                return;
            }
            resolve({ error: e.message || String(e) });
        }
    });
}

// Process Queue
function scheduleProcessing() {
    if (extensionContextInvalidated) return;
    if (scheduledTimerId) return;
    if (translationQueue.length === 0) return;
    if (inFlightRequests >= MAX_PARALLEL_REQUESTS) return;

    const queueSize = translationQueue.length;
    const delay = queueSize <= 2
        ? 0
        : Math.max(
            MIN_TRANSLATION_DELAY_MS,
            Math.min(MAX_TRANSLATION_DELAY_MS, MIN_TRANSLATION_DELAY_MS + queueSize * 40)
        );

    scheduledTimerId = setTimeout(() => {
        scheduledTimerId = null;
        processQueue();
    }, delay);
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

async function processQueue({ force = false } = {}) {
    if (extensionContextInvalidated) return;
    if (translationQueue.length === 0) return;
    if (inFlightRequests >= MAX_PARALLEL_REQUESTS) return;
    if (!isSiteAllowed) {
        translationQueue.length = 0;
        return;
    }

    // Check Auto Translate switch from DOM directly (fastest) or storage
    const toggle = document.getElementById('gx-toggle');
    if (!force && toggle && !toggle.checked) {
        // Keep queue but don't process if disabled
        setTimeout(processQueue, MIN_TRANSLATION_DELAY_MS);
        return;
    }
    const apiKey = await ensureApiKey();
    if (!apiKey || !validateApiKey(apiKey)) {
        if (triggerOnboarding) triggerOnboarding();
        showToast('APIキーが未設定か、形式が正しくありません。設定で確認してください。', 'error');
        return;
    }

    const batch = [];
    let totalChars = 0;

    const isVisible = (el) => {
        try {
            const r = el.getBoundingClientRect();
            return r.bottom > 0 && r.top < window.innerHeight;
        } catch (e) {
            return false;
        }
    };

    const tryTakeAt = (idx) => {
        const item = translationQueue[idx];
        if (!item) return false;
        const projected = totalChars + item.text.length;
        if (batch.length > 0 && projected > MAX_BATCH_CHARS) return false;
        totalChars = projected;
        batch.push(item);
        translationQueue.splice(idx, 1);
        return true;
    };

    // Prefer visible tweets first for better perceived latency.
    for (let i = 0; i < translationQueue.length && batch.length < MAX_BATCH_SIZE; ) {
        const item = translationQueue[i];
        if (item?.element && isVisible(item.element)) {
            const ok = tryTakeAt(i);
            if (!ok) break;
            continue;
        }
        i += 1;
    }

    // Fill the rest in queue order.
    while (translationQueue.length > 0 && batch.length < MAX_BATCH_SIZE) {
        const ok = tryTakeAt(0);
        if (!ok) break;
    }

    // Enforce daily limits (best-effort estimation)
    try {
        const snap = await chrome.storage.local.get(['modelStats', MODEL_STATS_DAY_KEY, 'geminiModel']);
        const todayKey = getModelStatsDayKey();
        const stats = (snap[MODEL_STATS_DAY_KEY] === todayKey) ? (snap.modelStats || {}) : {};
        const usedCost = estimateTotalCostUsd(stats);
        const usedChars = sumTotalChars(stats);
        const modelId = snap.geminiModel || DEFAULT_MODEL;

        const projectedCost = usedCost + estimateCostUsdForModelChars(modelId, totalChars, totalChars);
        const projectedChars = usedChars + (totalChars * 2);

        const exceedsCost = typeof dailyCostLimitUsd === 'number' && dailyCostLimitUsd > 0 && projectedCost > dailyCostLimitUsd + 1e-9;
        const exceedsChars = typeof dailyTotalCharsLimit === 'number' && dailyTotalCharsLimit > 0 && projectedChars > dailyTotalCharsLimit;

        if (exceedsCost || exceedsChars) {
            // Put batch back to the front in original order
            for (let i = batch.length - 1; i >= 0; i -= 1) translationQueue.unshift(batch[i]);

            const reason = exceedsCost ? 'コスト上限' : '文字数上限';
            if (!force) {
                if (toggle) {
                    toggle.checked = false;
                    // updateToggleStyle lives inside panel logic; safe to update here via DOM expectation
                    try {
                        const slider = toggle.nextElementSibling;
                        const knob = document.getElementById('gx-slider-knob');
                        if (slider) slider.style.backgroundColor = '#cfd9de';
                        if (knob) knob.style.transform = 'translateX(2px)';
                    } catch (e) {
                        // ignore
                    }
                }
                chrome.storage.local.set({ isAutoTranslateEnabled: false });
                showToast(`${reason}に達したため自動翻訳を停止しました（手動は拡張メニューの「再翻訳」）。`, 'error', 5000);
            } else {
                showToast(`${reason}に達しています。上限を上げるか、明日(4:00以降)に再試行してください。`, 'error', 5000);
            }
            return;
        }
    } catch (e) {
        // ignore limit checks if storage is unavailable
    }

    inFlightRequests += 1;
    const items = batch.slice();
    const elements = items.map((item) => item.element);
    const texts = items.map((item) => item.text);
    const masks = texts.map((t, i) => maskUrls(t, `GX_${i}`));
    const maskedTexts = masks.map((m) => m.maskedText);

    elements.forEach(el => setTranslatingState(el, true));

    try {
        const result = await requestTranslation(maskedTexts, translationDirection, { force });
        if (result.translation) {
            const translations = Array.isArray(result.translation)
                ? result.translation
                : (typeof result.translation === 'string' ? result.translation.split(/\n?---SEPARATOR---\n?/) : []);
            if (translations.length !== elements.length) {
                console.warn('[Gemini Trans] Invalid translation structure. Will retry.', {
                    expected: elements.length,
                    got: translations.length
                });
                showToast('翻訳の途中で形式が崩れました。もう一度やり直します。', 'error', 3500);
                batch.forEach((item) => {
                    item.retry = (item.retry || 0) + 1;
                    if (item.retry <= 2) {
                        translationQueue.unshift(item);
                    } else {
                        item.element.dataset.geminiTranslated = 'failed';
                    }
                });
                setTimeout(processQueue, MIN_TRANSLATION_DELAY_MS);
                return;
            }
            const missing = [];
            items.forEach((item, index) => {
                const translatedText = translations[index];
                if (typeof translatedText === 'string' && translatedText.trim().length > 0) {
                    const unmasked = unmaskUrls(translatedText, masks[index]?.tokens).trim();
                    const finalText = applyGlossaryToText(unmasked);
                    applyTranslationForItem(item, finalText);
                    if (isTranslationCacheEnabled) translationCache.set(getCacheKey(texts[index]), finalText);
                } else {
                    missing.push(index);
                }
            });
            if (missing.length > 0) {
                console.warn('[Gemini Trans] Empty translation segments. Will retry.', { missing });
                showToast('翻訳結果を取得できませんでした。もう一度やり直します。', 'error', 3500);
                missing.forEach((idx) => {
                    const item = batch[idx];
                    if (!item) return;
                    item.retry = (item.retry || 0) + 1;
                    if (item.retry <= 2) {
                        translationQueue.unshift(item);
                    } else {
                        item.element.dataset.geminiTranslated = 'failed';
                    }
                });
                setTimeout(processQueue, MIN_TRANSLATION_DELAY_MS);
                return;
            }
        } else if (result.error) {
            // Check for critical runtime errors
            if (result.error.includes('runtime unavailable') ||
                result.error.includes('Extension context invalidated') ||
                result.error.includes('context invalidated')) {
                showToast('拡張機能が更新されました。ページを再読み込みしてください。', 'error', 10000);
                translationQueue.length = 0; // Clear queue
                inFlightRequests = 0;
                return; // Stop processing
            }

            if (result.error.includes('Translation disabled by user')) {
                // Suppress visual error for this expected case, but stop processing loop
                translationQueue.length = 0;
                inFlightRequests = 0;
                return;
            }

            const is429 = result.error.includes('429');
            if (isKeyError(result.error) && triggerOnboarding) {
                triggerOnboarding();
            }
            console.warn('[Gemini Trans] Translation error:', result.error);
            showToast(humanizeErrorMessage(result.error), 'error', is429 ? 3500 : 2600);
            batch.forEach((item) => {
                item.retry = (item.retry || 0) + 1;
                if (item.retry <= 2) {
                    translationQueue.unshift(item);
                } else {
                    item.element.dataset.geminiTranslated = 'failed';
                }
            });
            const delay = is429 ? 2000 : MIN_TRANSLATION_DELAY_MS;
            setTimeout(processQueue, delay);
            return;
        }
    } catch (e) {
        if (isExtensionContextInvalidatedError(e)) {
            handleExtensionContextInvalidated();
            return;
        }
        console.error('[Gemini Trans] Batch process failed:', e);
        batch.forEach((item) => {
            item.retry = (item.retry || 0) + 1;
            if (item.retry <= 2) {
                translationQueue.unshift(item);
            } else {
                item.element.dataset.geminiTranslated = 'failed';
            }
        });
    } finally {
        elements.forEach(el => setTranslatingState(el, false));
        inFlightRequests = Math.max(0, inFlightRequests - 1);
        scheduleProcessing();
    }
}

function renderTranslation(element) {
    const translated = element.dataset.geminiTranslatedText || '';
    // Simply replace content with translation (no dual blocks needed)
    element.innerHTML = '';
    applyTranslateColor(element);
    element.style.whiteSpace = 'pre-wrap';

    // Convert URLs to clickable links
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    let lastIndex = 0;
    let match;
    while ((match = urlRegex.exec(translated)) !== null) {
        // Add text before the URL
        if (match.index > lastIndex) {
            element.appendChild(document.createTextNode(translated.slice(lastIndex, match.index)));
        }
        // Add the URL as a link
        const link = document.createElement('a');
        link.href = match[1];
        link.textContent = match[1];
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        const color = getTranslateColorForHost(currentHost);
        link.style.color = color || '';
        element.appendChild(link);
        lastIndex = urlRegex.lastIndex;
    }
    // Add remaining text after the last URL
    if (lastIndex < translated.length) {
        element.appendChild(document.createTextNode(translated.slice(lastIndex)));
    }

    flashDone(element);
}

function renderOriginal(element) {
    ensureDualBlocks(element);
    const originalBlock = element.querySelector('.gx-original-block');
    const pill = createPill('翻訳');
    pill.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleMode(element);
    });
    // Keep original markup intact; just ensure pill exists
    const existingPill = originalBlock.querySelector('.gx-pill');
    if (existingPill) existingPill.remove();
    originalBlock.appendChild(pill);
    setDisplayByMode(element, 'original');
}

function toggleMode(element) {
    const mode = element.dataset.geminiTranslatedMode;
    if (mode === 'translation') {
        renderOriginal(element);
    } else {
        renderTranslation(element);
    }
}

function applyTranslation(element, translatedText) {
    if (!claimTweetElement(element)) return;
    const tweetId = isTweetIdCacheEnabled ? getTweetId(element) : '';
    const isFirstTranslation = !element.dataset.geminiTranslatedOriginal;

    // Only capture original text on first translation to avoid corruption
    if (isFirstTranslation) {
        const cachedOriginal = tweetId ? originalTextCache.get(tweetId) : '';
        const originalText = cachedOriginal || getStableText(element);
        element.dataset.geminiTranslatedOriginal = originalText;
        if (!element.dataset.geminiOriginalHtml) {
            element.dataset.geminiOriginalHtml = element.innerHTML;
        }
        if (tweetId && isTweetIdCacheEnabled) {
            originalTextCache.set(tweetId, originalText);
            pruneCache(originalTextCache);
        }
    }

    element.dataset.geminiTranslated = 'true';
    element.dataset.geminiTranslatedText = translatedText;
    element.dataset.geminiTranslatedMode = 'translation';

    if (tweetId && isTweetIdCacheEnabled) {
        element.dataset.geminiTranslatedTweetId = tweetId;
        translationByTweetId.set(tweetId, translatedText);
        pruneCache(translationByTweetId);
    }
    renderTranslation(element);
    pruneCache(translationCache);
}

function applyTranslationForItem(item, translatedText) {
    if (!item) return;
    if (item.kind === 'page') {
        applyPageTranslation(item.element, translatedText);
        const original = item.element?.dataset?.gxOriginalText || '';
        if (original && translatedText) {
            pageCache.set(original, translatedText);
            scheduleSavePageCache();
        }
        return;
    }
    applyTranslation(item.element, translatedText);
}

function setTranslatingState(element, isTranslating) {
    if (isTranslating) {
        element.dataset.geminiTranslating = 'true';
        setMosaicColorVars(element);
        element.classList.add('gx-shimmer');
        element.classList.add('gx-mosaic');
    } else {
        element.dataset.geminiTranslating = 'false';
        element.classList.remove('gx-shimmer');
        element.classList.remove('gx-mosaic');
        element.style.removeProperty('--gx-mosaic-color-strong');
        element.style.removeProperty('--gx-mosaic-color-soft');
        element.style.removeProperty('--gx-mosaic-shadow');
    }
}

function createPill(label) {
    const pill = document.createElement('span');
    pill.textContent = label;
    pill.style.cssText = 'display:inline-flex;align-items:center;padding:2px 6px;margin-left:6px;font-size:11px;font-weight:700;border-radius:10px;border:1px solid #cfd9de;color:#536471;cursor:pointer;user-select:none;';
    pill.addEventListener('mouseenter', () => pill.style.borderColor = '#1d9bf0');
    pill.addEventListener('mouseleave', () => pill.style.borderColor = '#cfd9de');
    pill.className = 'gx-pill';
    return pill;
}

function flashDone(element) {
    if (!element) return;
    element.dataset.gxWaveText = element.textContent || '';
    element.classList.add('gx-wave');
    setTimeout(() => {
        element.classList.remove('gx-wave');
        delete element.dataset.gxWaveText;
    }, 360);
}

function ensureDualBlocks(element) {
    // Keep original markup intact by separating original and translation blocks
    if (!element.dataset.geminiOriginalHtml) {
        element.dataset.geminiOriginalHtml = element.innerHTML;
    }
    const hasOriginalBlock = element.querySelector('.gx-original-block');
    const hasTranslationBlock = element.querySelector('.gx-translation-block');
    if (!hasOriginalBlock) {
        const originalBlock = document.createElement('div');
        originalBlock.className = 'gx-original-block';
        originalBlock.innerHTML = element.dataset.geminiOriginalHtml;
        element.innerHTML = '';
        element.appendChild(originalBlock);
    }
    if (!hasTranslationBlock) {
        const translationBlock = document.createElement('div');
        translationBlock.className = 'gx-translation-block';
        translationBlock.style.color = '#1d9bf0';
        translationBlock.style.whiteSpace = 'pre-wrap';
        element.appendChild(translationBlock);
    }
}

function setDisplayByMode(element, mode) {
    const ob = element.querySelector('.gx-original-block');
    const tb = element.querySelector('.gx-translation-block');
    if (!ob || !tb) return;
    if (mode === 'original') {
        ob.style.display = 'block';
        tb.style.display = 'none';
    } else {
        ob.style.display = 'none';
        tb.style.display = 'block';
    }
    element.dataset.geminiTranslatedMode = mode;
}

function injectShimmerStyleOnce() {
    if (document.getElementById('gx-shimmer-style')) return;
    const style = document.createElement('style');
    style.id = 'gx-shimmer-style';
    style.textContent = SHIMMER_STYLE;
    document.head.appendChild(style);
}

function showToast(message, tone = 'info', duration = 2200) {
    if (globalThis.GemLab?.showToast) {
        GemLab.showToast({ containerId: 'gx-toast-container', message, tone, duration });
        return;
    }
    const containerId = 'gx-toast-container';
    let container = document.getElementById(containerId);
    if (!container) {
        container = document.createElement('div');
        container.id = containerId;
        container.style.cssText = 'position:fixed;top:12px;right:12px;z-index:2147483646;display:flex;flex-direction:column;gap:8px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText = 'padding:10px 12px;border-radius:10px;box-shadow:rgba(0,0,0,0.12) 0 6px 16px; background:' +
        (tone === 'error' ? '#ffe6e6' : tone === 'success' ? '#e6ffed' : '#f7f9f9') +
        '; color:#0f1419; min-width: 200px; font-size: 13px; font-weight: 600;';
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 160ms ease';
        setTimeout(() => toast.remove(), 200);
    }, duration);
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

function applyGlossaryToText(text) {
    let out = String(text || '');
    for (const pair of glossaryPairs || []) {
        if (!pair || !pair.from || !pair.to) continue;
        out = out.split(String(pair.from)).join(String(pair.to));
    }
    return out;
}

function isPageNodeSkippable(node, excludeSelector) {
    const text = String(node?.nodeValue || '').replace(/\u00A0/g, ' ').trim();
    if (!text || text.length < 3) return true;
    if (shouldSkipByContent(text)) return true;
    const lowered = text.toLowerCase();
    if (excludedKeywords && excludedKeywords.some((kw) => kw && lowered.includes(kw))) return true;
    const parent = node.parentElement;
    if (!parent) return true;
    if (parent.closest('#gemini-x-panel, #gx-toast-container, #gemini-dock')) return true;
    if (parent.closest('script, style, noscript, iframe, textarea, input, select, button, code, pre, svg, canvas, option')) return true;
    if (parent.isContentEditable) return true;
    if (excludeSelector) {
        try {
            if (parent.closest(excludeSelector)) return true;
        } catch (e) {
            // ignore invalid selectors
        }
    }
    const hasJapanese = JAPANESE_REGEX.test(text);
    if (translationDirection === DIR_EN_JA && hasJapanese) return true;
    if (translationDirection === DIR_JA_EN && !hasJapanese) return true;
    if (parent.dataset?.gxPageTranslated) return true;
    return false;
}

function isElementInViewport(el, margin = 120) {
    if (!el || !el.getBoundingClientRect) return false;
    const r = el.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const vw = window.innerWidth || document.documentElement.clientWidth;
    return r.bottom >= -margin && r.top <= vh + margin && r.right >= -margin && r.left <= vw + margin;
}

function wrapPageTextNode(node, text) {
    const span = document.createElement('span');
    span.dataset.gxPageTranslated = 'pending';
    span.dataset.gxOriginalText = text;
    span.textContent = text;
    node.parentNode.replaceChild(span, node);
    return span;
}

function applyPageTranslation(element, translatedText) {
    if (!element || !element.dataset) return;
    element.dataset.gxPageTranslated = 'true';
    element.textContent = translatedText;
    applyTranslateColor(element);
    flashDone(element);
}

function queuePageTextNode(node, { force = false } = {}) {
    if (!pageTranslationEnabled) return;
    if (!node || !node.parentNode) return;
    const raw = String(node.nodeValue || '').replace(/\u00A0/g, ' ');
    const text = raw.trim();
    if (!text || text.length < 3) return;
    if (!force && shouldSkipByContent(text)) return;
    if (!force && isPageNodeSkippable(node, getPageTranslationConfig()?.excludeSelector || '')) return;
    const cacheKey = getCacheKey(text);
    const cached = isTranslationCacheEnabled ? translationCache.get(cacheKey) : null;
    const pageCached = pageCacheLoaded ? pageCache.get(text) : null;
    const wrapper = wrapPageTextNode(node, text);
    if (pageCached && !force) {
        applyPageTranslation(wrapper, pageCached);
        return;
    }
    if (cached && isTranslationCacheEnabled) {
        applyPageTranslation(wrapper, cached);
        return;
    }
    translationQueue.push({ element: wrapper, text, kind: 'page' });
    scheduleProcessing();
}

function collectPageTextNodes(root, excludeSelector) {
    if (!root) return [];
    const nodes = [];
    let walker;
    try {
        walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    } catch (e) {
        return nodes;
    }
    let current = walker.nextNode();
    while (current) {
        const parent = current.parentElement;
        if (!isPageNodeSkippable(current, excludeSelector) && isElementInViewport(parent)) {
            nodes.push(current);
        }
        current = walker.nextNode();
    }
    return nodes;
}

function scanPageContent({ root = null, force = false } = {}) {
    const config = getPageTranslationConfig();
    if (!config) return;
    const targets = [];
    if (root && root.nodeType === Node.ELEMENT_NODE) {
        targets.push(root);
    }
    if (!targets.length) {
        config.includeSelectors.forEach((sel) => {
            try {
                const els = document.querySelectorAll(sel);
                els.forEach((el) => targets.push(el));
            } catch (e) {
                // ignore invalid selector
            }
        });
    }
    if (!targets.length) return;
    const excludeSelector = config.excludeSelector;
    targets.forEach((target) => {
        const nodes = collectPageTextNodes(target, excludeSelector);
        nodes.forEach((node) => queuePageTextNode(node, { force }));
    });
}

function enqueuePageScan(node) {
    if (!pageTranslationEnabled) return;
    if (!node) return;
    if (node.nodeType === Node.TEXT_NODE) {
        queuePageTextNode(node);
        return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    scanPageContent({ root: node });
}

function retranslatePageNow() {
    clearPageCache();
    resetTranslations();
    const toggle = document.getElementById('gx-toggle');
    if (toggle && !toggle.checked) return;
    if (isXHost) {
        scanExistingTweets({ force: true });
    } else {
        scanPageContent({ force: true });
    }
    processQueue({ force: true });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || !message.type) return;
    if (message.type === 'PAGE_RETRANSLATE') {
        retranslatePageNow();
        sendResponse?.({ success: true });
        return true;
    }
    if (message.type === 'PAGE_CLEAR_CACHE') {
        clearPageCache();
        sendResponse?.({ success: true });
        return true;
    }
    if (message.type === 'PAGE_SET_AUTO') {
        const toggle = document.getElementById('gx-toggle');
        if (toggle && typeof message.enabled === 'boolean') {
            toggle.checked = message.enabled;
            toggle.dispatchEvent(new Event('change', { bubbles: true }));
        }
        sendResponse?.({ success: true });
        return true;
    }
    if (message.type === 'PAGE_SET_DIRECTION') {
        const dir = message.direction === DIR_JA_EN ? DIR_JA_EN : DIR_EN_JA;
        const directionSelect = document.getElementById('gx-direction');
        if (directionSelect) {
            directionSelect.value = dir;
            directionSelect.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
            translationDirection = dir;
        }
        sendResponse?.({ success: true });
        return true;
    }
    if (message.type === 'PAGE_GET_STATUS') {
        sendResponse?.({
            success: true,
            host: currentHost,
            isSiteAllowed,
            isXHost,
            pageTranslationEnabled,
            siteMode
        });
        return true;
    }
});

function checkAndQueue(element, { force = false } = {}) {
    if (!isSiteAllowed || !isXHost) return;
    const toggle = document.getElementById('gx-toggle');
    if (!force && toggle && !toggle.checked) return;
    if (!canMutateTweetElement(element)) return;

    const tweetId = getTweetId(element);

    // Respect exclusions early (including already-translated tweets)
    const baseText = element.dataset?.geminiTranslatedOriginal || getStableText(element);
    if (baseText && shouldExcludeTweet(element, baseText)) {
        revertTweetElement(element);
        element.dataset.geminiTranslated = 'skipped';
        return;
    }

    // If tweet is truncated, expand first; queue will be retriggered after expansion
    if (expandIfTruncated(element)) return;

    if (tweetId) {
        const cachedTranslation = isTweetIdCacheEnabled ? translationByTweetId.get(tweetId) : null;
        const cachedOriginal = isTweetIdCacheEnabled ? originalTextCache.get(tweetId) : null;
        const currentText = getStableText(element);

        // If previously translated text differs from current visible text (e.g., after "Show more"),
        // retranslate to include the newly revealed portion.
        const needsRetranslate =
            cachedOriginal &&
            currentText &&
            currentText.trim().length > cachedOriginal.trim().length + 1; // minor whitespace tolerance

        if (needsRetranslate) {
            queueRetranslation(element, currentText);
            return;
        }

        // If we have a translation AND the underlying text hasn't changed, reuse it
        if (cachedTranslation && cachedOriginal && currentText === cachedOriginal) {
            // Language direction check before applying cache (prevents quote tweet mismatches)
            const hasJapanese = JAPANESE_REGEX.test(currentText);
            if (translationDirection === DIR_EN_JA && hasJapanese) {
                element.dataset.geminiTranslated = 'skipped';
                return;
            }
            if (translationDirection === DIR_JA_EN && !hasJapanese) {
                element.dataset.geminiTranslated = 'skipped';
                return;
            }
            if (!claimTweetElement(element)) return;
            applyTranslation(element, cachedTranslation);
            return;
        }
    }
    const text = getStableText(element);
    if (!text || text.trim().length < 3) return;
    if (!force && shouldSkipByContent(text)) {
        element.dataset.geminiTranslated = 'skipped';
        return;
    }
    // Exclusions are checked above; keep this as a safety net for mid-DOM changes.
    if (shouldExcludeTweet(element, text)) {
        revertTweetElement(element);
        element.dataset.geminiTranslated = 'skipped';
        return;
    }
    if (tweetId) {
        const cachedOriginal = originalTextCache.get(tweetId);
        if (cachedOriginal && text !== cachedOriginal) {
            queueRetranslation(element, text);
            return;
        }
    }
    if (element.dataset.geminiTranslated) return;
    const hasJapanese = JAPANESE_REGEX.test(text);
    if (translationDirection === DIR_EN_JA && hasJapanese) {
        element.dataset.geminiTranslated = 'skipped';
        return;
    }
    if (translationDirection === DIR_JA_EN && !hasJapanese) {
        element.dataset.geminiTranslated = 'skipped';
        return;
    }
    const cacheKey = getCacheKey(text);
    const cached = isTranslationCacheEnabled ? translationCache.get(cacheKey) : null;
    if (cached && isTranslationCacheEnabled) {
        if (!claimTweetElement(element)) return;
        applyTranslation(element, cached);
        return;
    }
    if (!claimTweetElement(element)) return;
    // Mark as pending before queueing to avoid duplicate enqueues from MutationObserver churn.
    element.dataset.geminiTranslated = 'pending';
    if (tweetId && isTweetIdCacheEnabled) {
        originalTextCache.set(tweetId, text);
        pruneCache(originalTextCache);
        element.dataset.geminiTranslatedOriginal = text;
    }
    translationQueue.push({ element, text, kind: 'tweet' });
    scheduleProcessing();
}

function scanExistingTweets({ force = false } = {}) {
    if (!isSiteAllowed || !isXHost) return;
    getTweetTextElements(document).forEach((el) => checkAndQueue(el, { force }));
}

const observerScanner = globalThis.GemLab?.createBatchedNodeScanner
    ? GemLab.createBatchedNodeScanner({
        skipNode: (node) => !!(node.closest && (node.closest('#gemini-x-panel') || node.closest('#gx-toast-container') || node.closest('#gemini-dock'))),
        processNode: (n) => {
            if (!n || n.nodeType !== Node.ELEMENT_NODE) return;
            if (n.getAttribute && n.getAttribute('data-testid') === 'tweetText') {
                checkAndQueue(n);
                return;
            }
            const tweets = n.querySelectorAll ? n.querySelectorAll('[data-testid="tweetText"]') : [];
            if (tweets.length) tweets.forEach((el) => checkAndQueue(el));
            else getTweetTextElements(n).forEach((el) => checkAndQueue(el));
        }
    })
    : null;

function enqueueObserverScan(node) {
    if (!isSiteAllowed) return;
    enqueuePageScan(node);
}

const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
        if (mutation.type !== 'childList') continue;
        mutation.addedNodes.forEach(enqueueObserverScan);
    }
});

function startObserving() {
    // Check for Felosearch forced translation
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('felosearch_translate') === '1') {
        chrome.storage.local.set({ isAutoTranslateEnabled: true });
    }

    injectShimmerStyleOnce();
    createPanel(); // Init Panel
    const target = document.body;
    if (!target) return;
    observer.observe(target, { childList: true, subtree: true });

    const scheduleViewportScan = globalThis.GemLab?.createRafThrottled
        ? GemLab.createRafThrottled(() => {
            if (pageTranslationEnabled) scanPageContent({ force: false });
        })
        : (() => {
            if (pageTranslationEnabled) scanPageContent({ force: false });
        });
    window.addEventListener('scroll', scheduleViewportScan, { passive: true });
    window.addEventListener('resize', scheduleViewportScan);

    // Initial scan is now triggered in createPanel() after storage is loaded
}

maybeResetModelStatsAt4am();

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startObserving);
} else {
    startObserving();
}
