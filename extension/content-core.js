// Content Script - X.com Auto Translator (Floating Panel Version)

// --- Constants & Config ---
const MIN_TRANSLATION_DELAY_MS = 1000;
const MAX_TRANSLATION_DELAY_MS = 2500;
const OBSERVER_DEBOUNCE_MS = 150;
const SCROLL_SCAN_INTERVAL_MS = 1700;
const SPA_NAVIGATION_DEBOUNCE_MS = 450;
const SPA_NAVIGATION_RETRY_DELAYS_MS = [1700];
const MAX_BATCH_SIZE = 12;
const MAX_BATCH_CHARS = 4000;
const MAX_PARALLEL_REQUESTS = 2;
const CHARS_PER_TOKEN = 4;
// Only hiragana/katakana (not kanji) to distinguish Japanese from Chinese
const JAPANESE_REGEX = /[ぁ-んァ-ン]/;
const DIR_EN_JA = 'en_to_ja';
const DIR_JA_EN = 'ja_to_en';

const SHIMMER_STYLE = `
  @keyframes gx-reveal {
    0% { opacity: 0; filter: blur(4px); transform: translateY(2px); }
    100% { opacity: 1; filter: blur(0); transform: translateY(0); }
  }
  .gx-mosaic,
  .gx-shimmer {
    /* Simple mosaic (blur) effect during translation */
    filter: blur(4px) !important;
    opacity: 0.7 !important;
    transition: filter 0.3s ease, opacity 0.3s ease;
    pointer-events: none; /* Prevent interaction while translating */
  }
  .gx-reveal {
    /* Reveal effect when translation is done */
    animation: gx-reveal 300ms ease-out forwards;
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
    'gemini-3.1-flash-lite-preview': { input: 0.25, output: 1.50 },
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
    '#gemini-dock',
    '#gx-selector-panel',
    '#gx-selector-preview',
    '#gx-selector-overlay'
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
const excludedHandles = new Set();
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
let spaScanEnabled = false;
const currentHost = String(location.hostname || '').toLowerCase();
const isXHost = currentHost === 'x.com'
    || currentHost.endsWith('.x.com')
    || currentHost === 'twitter.com'
    || currentHost.endsWith('.twitter.com');
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
    if (!el) return '';

    // 翻訳の対象外となる要素（ページ翻訳用、二重翻訳ブロック、非表示要素など）
    function isExcluded(node) {
        if (node.nodeType !== Node.ELEMENT_NODE) return false;
        if (node.hasAttribute('data-gx-page-translated') || node.classList.contains('gx-dual-translation')) return true;
        const style = window.getComputedStyle(node);
        if (style.display === 'none' || style.visibility === 'hidden') return true;
        return false;
    }

    let raw = '';

    // DOMツリーを再帰的に走査してテキストを構築する
    function traverse(node) {
        if (node.nodeType === Node.TEXT_NODE) {
            raw += node.nodeValue;
            return;
        }

        if (node.nodeType !== Node.ELEMENT_NODE) return;
        if (isExcluded(node)) return;

        // <br>タグは改行として扱う
        if (node.tagName.toLowerCase() === 'br') {
            raw += '\n';
            return;
        }

        // X.comの絵文字（<img>）などの置換要素は、前後にスペースがないと前後の単語がくっつく原因になるため
        // 代替テキスト（alt）があればそれを取得し、なければ空白を補う
        if (node.tagName.toLowerCase() === 'img') {
            const alt = node.getAttribute('alt');
            if (alt) {
                // alt属性がある場合（例: 絵文字の "🚨"）
                raw += alt;
            } else {
                raw += ' ';
            }
            return;
        }

        // ブロックレベル要素に入る前にはスペースや改行を補う（必要に応じて）
        const style = window.getComputedStyle(node);
        const isBlock = style.display === 'block' || style.display === 'flex' || style.display === 'grid' || node.tagName.toLowerCase() === 'div' || node.tagName.toLowerCase() === 'p';

        if (isBlock && raw.length > 0 && !raw.endsWith('\n') && !raw.endsWith(' ')) {
            raw += '\n';
        }

        for (const child of node.childNodes) {
            traverse(child);
        }

        if (isBlock && raw.length > 0 && !raw.endsWith('\n') && !raw.endsWith(' ')) {
            raw += '\n';
        }
    }

    traverse(el);

    return raw
        .replace(/\u00A0/g, ' ')
        // 連続する改行やスペースを整理
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n[ \t]+/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
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
    if (!element) return '';
    // Let's get the specific tweet ID. On X.com, tweetText elements have siblings/parents that link to status.
    // the safest way is the closest `article` but if it's a quote tweet, there could be multiple links.
    const article = element.closest && element.closest('article');
    if (!article) return '';
    // Avoid picking up quote tweet links. Quote tweets are usually inside a `div[role = "link"]` or a deeper `div`.
    // We want the main article timestamp link.
    const timeEl = article.querySelector('time');
    if (timeEl && timeEl.parentElement && timeEl.parentElement.tagName.toLowerCase() === 'a') {
        const href = timeEl.parentElement.getAttribute('href') || '';
        const match = href.match(/status\/(\d+)/);
        if (match) return match[1];
    }
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

function isHostAllowed(host) {
    if (!siteWhitelist || siteWhitelist.length === 0) return isXHost;
    return siteWhitelist.some((entry) => hostMatches(host, entry));
}

function splitSelectors(input) {
    return String(input || '')
        .split(/[\n,]/g)
        .map((s) => s.trim())
        .filter(Boolean);
}

function normalizeSiteRules(raw) {
    const list = Array.isArray(raw) ? raw : [];
    return list
        .map((r) => ({
            host: normalizeHost(r?.host),
            include: String(r?.include || '').trim(),
            exclude: String(r?.exclude || '').trim(),
            spaScanEnabled: !!r?.spaScanEnabled
        }))
        .filter((r) => r.host);
}

function normalizeColorName(input) {
    const s = String(input || '').trim().toLowerCase();
    if (s === 'inherit' || s === '変更なし') return 'inherit';
    if (s === 'blue' || s === '青') return 'blue';
    if (s === 'green' || s === '緑') return 'green';
    if (s === 'orange' || s === '橙') return 'orange';
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

function refreshSpaScanEnabled(host) {
    const rule = getSiteRuleForHost(host);
    const next = !!rule?.spaScanEnabled;
    if (!next) {
        if (spaNavigationTimer) clearTimeout(spaNavigationTimer);
        spaNavigationRetryTimers.forEach((timer) => clearTimeout(timer));
        spaNavigationRetryTimers = [];
    }
    spaScanEnabled = next;
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

    // Add word boundaries for English letters to prevent substring matches (e.g. "it" blocking "with")
    // If keyword doesn't contain letters (e.g. Japanese or symbols), fallback to includes
    return excludedKeywords.some((kw) => {
        if (!kw) return false;
        const lowerKw = kw.toLowerCase();
        if (/^[a-z0-9]+$/i.test(lowerKw)) {
            const regex = new RegExp(`\\b${lowerKw}\\b`);
            return regex.test(t);
        }
        return t.includes(lowerKw);
    });
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
    // Remove translation block
    const translationBlock = el.querySelector('.gx-dual-translation');
    if (translationBlock) translationBlock.remove();
    // Unwrap original block (move children back to element)
    const originalBlock = el.querySelector('.gx-original-block');
    if (originalBlock) {
        const pill = originalBlock.querySelector('.gx-pill');
        if (pill) pill.remove();
        while (originalBlock.firstChild) {
            el.insertBefore(originalBlock.firstChild, originalBlock);
        }
        originalBlock.remove();
    } else if (el.dataset?.geminiOriginalHtml) {
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
    if (showMoreInside && showMoreInside.offsetParent !== null) return true;

    // Check for sibling "Show more" button (Twitter sometimes puts it outside tweetText)
    const parent = element.parentElement;
    if (parent) {
        const showMoreSibling = parent.querySelector(
            '[data-testid="tweet-text-show-more-link"], [data-testid="show-more-link"]'
        );
        if (showMoreSibling && showMoreSibling !== element && !element.contains(showMoreSibling) && showMoreSibling.offsetParent !== null) {
            return true;
        }
    }
    return false;
}

function expandIfTruncated(element) {
    if (!hasTruncatedContent(element)) {
        // Clear flag if button is legitimately gone (e.g. text already expanded)
        delete element.dataset.geminiShowMoreExpanded;
        return false;
    }

    const showMoreBtn = element.querySelector(
        '[data-testid="tweet-text-show-more-link"], [data-testid="show-more-link"], div[role="button"][data-testid$="show-more"]'
    ) || (element.parentElement && element.parentElement.querySelector(
        '[data-testid="tweet-text-show-more-link"], [data-testid="show-more-link"]'
    ));

    if (showMoreBtn) {
        // Only click if it's visible and we haven't successfully clicked this exact one.
        // X.com might re-render or leave a stale button around for a bit.
        if (element.dataset.geminiShowMoreExpanded === 'true') {
            // We already tried to expand. X.com might be taking a moment to fetch.
            // Wait for MutationObserver to kick in after it finishes.
            return true;
        }

        element.dataset.geminiShowMoreExpanded = 'true';
        try {
            showMoreBtn.click();
            return true;
        } catch (e) {
            // fallback if click fails
            delete element.dataset.geminiShowMoreExpanded;
            return false;
        }
    }
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

