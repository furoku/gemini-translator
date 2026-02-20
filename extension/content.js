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
    for (let i = 0; i < translationQueue.length && batch.length < MAX_BATCH_SIZE;) {
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
    if (isXHost && parent.closest('[data-testid="tweetText"]')) return true;
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

let selectorPickState = null;

function cssEscapeValue(value) {
    if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(value);
    return String(value || '').replace(/[^a-zA-Z0-9_-]/g, (ch) => `\\${ch}`);
}

function buildSelectorForElement(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return '';
    if (el.id) return `#${cssEscapeValue(el.id)}`;
    const testId = el.getAttribute('data-testid');
    if (testId) return `[data-testid="${cssEscapeValue(testId)}"]`;
    const aria = el.getAttribute('aria-label');
    if (aria) return `[aria-label="${cssEscapeValue(aria)}"]`;
    const path = [];
    let current = el;
    while (current && current.nodeType === Node.ELEMENT_NODE && path.length < 4) {
        let selector = current.tagName.toLowerCase();
        const className = String(current.className || '').split(/\s+/).filter(Boolean)[0];
        if (className) selector += `.${cssEscapeValue(className)}`;
        if (current.parentElement) {
            const siblings = Array.from(current.parentElement.children).filter((c) => c.tagName === current.tagName);
            if (siblings.length > 1) {
                const index = siblings.indexOf(current) + 1;
                selector += `:nth-of-type(${index})`;
            }
        }
        path.unshift(selector);
        const joined = path.join(' > ');
        try {
            if (document.querySelectorAll(joined).length === 1) return joined;
        } catch (e) {
            // ignore
        }
        current = current.parentElement;
    }
    return path.join(' > ');
}

function getSelectorMeta(el, { allowId = true } = {}) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return { selector: '', strength: 0 };
    if (allowId && el.id) return { selector: `#${cssEscapeValue(el.id)}`, strength: 3 };
    const testId = el.getAttribute('data-testid');
    if (testId) return { selector: `${el.tagName.toLowerCase()}[data-testid="${cssEscapeValue(testId)}"]`, strength: 3 };
    const className = String(el.className || '').split(/\s+/).filter(Boolean)[0];
    if (className) return { selector: `${el.tagName.toLowerCase()}.${cssEscapeValue(className)}`, strength: 2 };
    const role = el.getAttribute('role');
    if (role) return { selector: `${el.tagName.toLowerCase()}[role="${cssEscapeValue(role)}"]`, strength: 1 };
    return { selector: el.tagName.toLowerCase(), strength: 0 };
}

function buildLooseSelectorForElement(el, opts) {
    return getSelectorMeta(el, opts).selector;
}

function buildRelativeSelector(from, to) {
    const parts = [];
    let current = from;
    while (current && current !== to && current.nodeType === Node.ELEMENT_NODE && parts.length < 4) {
        const part = buildLooseSelectorForElement(current, { allowId: false });
        parts.unshift(part);
        current = current.parentElement;
    }
    return parts.join(' > ');
}

function findRepeatItem(el) {
    let current = el?.parentElement;
    while (current && current !== document.body) {
        const key = buildLooseSelectorForElement(current, { allowId: false });
        if (!current.parentElement) break;
        const siblings = Array.from(current.parentElement.children || []);
        const matches = siblings.filter((node) => buildLooseSelectorForElement(node, { allowId: false }) === key);
        if (matches.length >= 2) return current;
        current = current.parentElement;
    }
    return null;
}

function getRepeatSelectorInfo(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return null;
    const repeatItem = findRepeatItem(el);
    if (!repeatItem || !repeatItem.parentElement) return null;
    const containerMeta = getSelectorMeta(repeatItem.parentElement);
    if (containerMeta.strength === 0) return null;
    const container = containerMeta.selector;
    const itemSelector = buildLooseSelectorForElement(repeatItem, { allowId: false });
    const relativeSelector = buildRelativeSelector(el, repeatItem);
    if (!itemSelector || !relativeSelector) return null;
    const selector = `${container} ${itemSelector} ${relativeSelector}`;
    let count = 0;
    try {
        count = document.querySelectorAll(selector).length;
    } catch (e) {
        count = 0;
    }
    if (count < 2 || count > 120) return null;
    return { selector, count };
}

function startSelectorPick(mode, sendResponse) {
    if (selectorPickState) {
        sendResponse?.({ success: false, error: 'busy' });
        return;
    }

    const overlay = document.createElement('div');
    overlay.id = 'gx-selector-overlay';
    overlay.style.cssText = [
        'position: fixed',
        'inset: 0',
        'z-index: 2147483646',
        'pointer-events: none'
    ].join(';');

    const panel = document.createElement('div');
    panel.id = 'gx-selector-panel';
    panel.style.cssText = [
        'position: fixed',
        'right: 12px',
        'bottom: 12px',
        'left: auto',
        'top: auto',
        'background: rgba(15, 20, 25, 0.92)',
        'color: #fff',
        'padding: 10px 12px',
        'border-radius: 10px',
        'font-size: 12px',
        'max-width: 260px',
        'line-height: 1.4',
        'pointer-events: auto',
        'z-index: 2147483647',
        'box-shadow: 0 10px 20px rgba(0,0,0,0.25)'
    ].join(';');
    panel.innerHTML = `
      <div style="font-weight:700;margin-bottom:6px;">${mode === 'exclude' ? '翻訳しない場所を選ぶ' : '翻訳する場所を選ぶ'}</div>
      <div id="gx-selector-message" style="opacity:0.85;">クリックすると確定します。複数追加はPickを繰り返してください。</div>
      <div id="gx-selector-preview" style="margin-top:6px;font-size:11px;opacity:0.8;word-break:break-all;white-space:pre-line;"></div>
      <button id="gx-selector-cancel" style="margin-top:8px;border:0;border-radius:8px;padding:6px 10px;font-weight:700;cursor:pointer;">キャンセル</button>
    `;
    const highlighter = document.createElement('div');
    highlighter.style.cssText = [
        'position: fixed',
        'pointer-events: none',
        'border: 2px solid rgba(29,155,240,0.9)',
        'background: rgba(29,155,240,0.08)',
        'border-radius: 6px',
        'z-index: 2147483645'
    ].join(';');
    overlay.appendChild(highlighter);

    document.body.appendChild(overlay);
    document.body.appendChild(panel);

    const previewEl = panel.querySelector('#gx-selector-preview');
    let lastTarget = null;
    let lastRepeatSelector = '';
    let lastRepeatCount = 0;
    const repeatHighlighters = [];
    const formatElementInfo = (el) => {
        const tag = el.tagName ? el.tagName.toLowerCase() : 'element';
        const id = el.id ? `#${el.id}` : '';
        const classes = Array.from(el.classList || []).filter(Boolean).slice(0, 4);
        const classText = classes.length ? `.${classes.join('.')}` : '';
        return `${tag}${id}${classText}`;
    };
    const setPreviewText = (target) => {
        if (!previewEl) return;
        const selector = buildSelectorForElement(target);
        const repeatInfo = getRepeatSelectorInfo(target);
        lastRepeatSelector = repeatInfo?.selector || '';
        lastRepeatCount = repeatInfo?.count || 0;
        const summary = formatElementInfo(target);
        const baseText = `選択中: ${summary}\n${selector}`;
        const repeatText = repeatInfo ? `\n同種: ${repeatInfo.count}件（まとめて選択）` : '';
        const text = `${baseText}${repeatText}`;
        previewEl.textContent = text.length > 200 ? `${text.slice(0, 200)}…` : text;
    };
    const clearRepeatHighlights = () => {
        repeatHighlighters.forEach((el) => el.remove());
        repeatHighlighters.length = 0;
    };

    const renderRepeatHighlights = (selector) => {
        clearRepeatHighlights();
        if (!selector) return;
        let nodes = [];
        try {
            nodes = Array.from(document.querySelectorAll(selector));
        } catch (e) {
            nodes = [];
        }
        const limit = Math.min(nodes.length, 16);
        for (let i = 0; i < limit; i += 1) {
            const node = nodes[i];
            if (!(node instanceof Element)) continue;
            if (overlay.contains(node) || panel.contains(node)) continue;
            const rect = node.getBoundingClientRect();
            if (!rect.width || !rect.height) continue;
            const box = document.createElement('div');
            box.style.cssText = [
                'position: fixed',
                'pointer-events: none',
                'border: 1px dashed rgba(29,155,240,0.7)',
                'background: rgba(29,155,240,0.04)',
                'border-radius: 6px',
                'z-index: 2147483644'
            ].join(';');
            box.style.top = `${Math.max(0, rect.top)}px`;
            box.style.left = `${Math.max(0, rect.left)}px`;
            box.style.width = `${rect.width}px`;
            box.style.height = `${rect.height}px`;
            overlay.appendChild(box);
            repeatHighlighters.push(box);
        }
    };

    const onMove = (e) => {
        const target = e.target;
        if (!target || target === document.body || target === document.documentElement) return;
        if (overlay.contains(target) || panel.contains(target)) return;
        if (!(target instanceof Element)) return;
        if (target === lastTarget) return;
        lastTarget = target;
        const rect = target.getBoundingClientRect();
        highlighter.style.top = `${Math.max(0, rect.top)}px`;
        highlighter.style.left = `${Math.max(0, rect.left)}px`;
        highlighter.style.width = `${rect.width}px`;
        highlighter.style.height = `${rect.height}px`;
        setPreviewText(target);
        renderRepeatHighlights(lastRepeatSelector);
    };

    const appendSelector = (current, selector) => {
        const list = splitSelectors(current);
        if (!list.includes(selector)) list.push(selector);
        return list.join(', ');
    };

    const cleanup = (resp) => {
        document.removeEventListener('mousemove', onMove, true);
        document.removeEventListener('click', onClick, true);
        document.removeEventListener('keydown', onKey, true);
        clearRepeatHighlights();
        overlay.remove();
        panel.remove();
        selectorPickState = null;
        sendResponse?.(resp);
    };

    const onClick = async (e) => {
        if (overlay.contains(e.target) || panel.contains(e.target)) return;
        e.preventDefault();
        e.stopPropagation();
        const target = e.target;
        if (!(target instanceof Element)) {
            cleanup({ success: false });
            return;
        }
        const selector = (lastRepeatSelector && lastRepeatCount >= 2)
            ? lastRepeatSelector
            : buildSelectorForElement(target);
        const normalizedHost = normalizeHost(currentHost);
        const ruleHost = isXHost
            ? (normalizedHost.endsWith('twitter.com') ? 'twitter.com' : 'x.com')
            : normalizedHost;
        // Save directly to storage (popup may be closed when user clicks)
        try {
            const res = await chrome.storage.local.get([SETTINGS_SITE_RULES_KEY]);
            const rules = Array.isArray(res[SETTINGS_SITE_RULES_KEY]) ? res[SETTINGS_SITE_RULES_KEY] : [];
            const existingIdx = rules.findIndex((r) => hostMatches(ruleHost, r?.host));
            const existing = existingIdx >= 0 ? rules[existingIdx] : { host: ruleHost, include: '', exclude: '' };
            if (mode === 'include') {
                existing.include = appendSelector(existing.include, selector);
            } else {
                existing.exclude = appendSelector(existing.exclude, selector);
            }
            if (existingIdx >= 0) {
                rules[existingIdx] = { ...existing, host: ruleHost };
            } else {
                rules.push(existing);
            }
            await chrome.storage.local.set({
                [SETTINGS_SITE_RULES_KEY]: rules,
                [SETTINGS_SITE_MODE_KEY]: 'advanced'
            });
            siteRules = rules;
            showToast(mode === 'include' ? '翻訳エリアを追加しました' : '除外エリアを追加しました', 'success');
        } catch (err) {
            console.error('[Gemini Trans] Failed to save selector:', err);
            showToast('保存に失敗しました', 'error');
        }
        cleanup({ success: true, selector });
    };

    const onKey = (e) => {
        if (e.key === 'Escape') {
            cleanup({ success: false });
        }
    };

    panel.querySelector('#gx-selector-cancel')?.addEventListener('click', () => cleanup({ success: false }));

    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey, true);

    selectorPickState = { mode };
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
    if (message.type === 'PAGE_PICK_SELECTOR') {
        startSelectorPick(message.mode, sendResponse);
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

let observerScanTimer = null;
const observerScanQueue = new Set();

function flushObserverScanQueue() {
    observerScanTimer = null;
    if (!isSiteAllowed) {
        observerScanQueue.clear();
        return;
    }
    observerScanQueue.forEach((node) => enqueuePageScan(node));
    observerScanQueue.clear();
}

function enqueueObserverScan(node) {
    if (!node) return;
    const target = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    if (!target) return;
    observerScanQueue.add(target);
    if (observerScanTimer) return;
    observerScanTimer = setTimeout(flushObserverScanQueue, OBSERVER_DEBOUNCE_MS);
}

const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
        if (mutation.type === 'childList') {
            mutation.addedNodes.forEach(enqueueObserverScan);
            continue;
        }
        if (mutation.type === 'characterData') {
            enqueueObserverScan(mutation.target);
        }
    }
});

let spaNavigationTimer = null;
let spaNavigationRetryTimers = [];
let lastKnownUrl = '';
let spaNavigationPoller = null;

function scheduleSpaNavigationScan() {
    if (!spaScanEnabled || !isSiteAllowed || !pageTranslationEnabled) return;
    if (spaNavigationTimer) clearTimeout(spaNavigationTimer);
    spaNavigationRetryTimers.forEach((timer) => clearTimeout(timer));
    spaNavigationRetryTimers = [];
    spaNavigationTimer = setTimeout(() => {
        spaNavigationTimer = null;
        scanPageContent({ force: false });
        SPA_NAVIGATION_RETRY_DELAYS_MS.forEach((delay) => {
            const timer = setTimeout(() => {
                scanPageContent({ force: false });
            }, delay);
            spaNavigationRetryTimers.push(timer);
        });
    }, SPA_NAVIGATION_DEBOUNCE_MS);
}

function handleSpaNavigationChange() {
    if (window.location.href === lastKnownUrl) return;
    lastKnownUrl = window.location.href;
    scheduleSpaNavigationScan();
}

function installSpaNavigationHooks() {
    lastKnownUrl = window.location.href;
    window.addEventListener('popstate', handleSpaNavigationChange);
    window.addEventListener('hashchange', handleSpaNavigationChange);
    const originalPushState = history.pushState;
    history.pushState = function (...args) {
        const result = originalPushState.apply(this, args);
        handleSpaNavigationChange();
        return result;
    };
    const originalReplaceState = history.replaceState;
    history.replaceState = function (...args) {
        const result = originalReplaceState.apply(this, args);
        handleSpaNavigationChange();
        return result;
    };
    if (spaNavigationPoller) clearInterval(spaNavigationPoller);
    spaNavigationPoller = setInterval(handleSpaNavigationChange, 1800);
}

let scheduleViewportScan = null;
let spaScrollHandler = null;

document.addEventListener('gx-extension-reloaded', () => {
    try {
        if (observer) observer.disconnect();
        if (spaNavigationPoller) clearInterval(spaNavigationPoller);
        if (spaNavigationTimer) clearTimeout(spaNavigationTimer);
        spaNavigationRetryTimers.forEach(t => clearTimeout(t));
        if (observerScanTimer) clearTimeout(observerScanTimer);
        if (scheduleViewportScan) {
            window.removeEventListener('scroll', scheduleViewportScan);
            window.removeEventListener('resize', scheduleViewportScan);
        }
        if (spaScrollHandler) {
            document.removeEventListener('scroll', spaScrollHandler, { capture: true });
        }
    } catch (e) {
        // ignore cleanup errors
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
    observer.observe(target, { childList: true, characterData: true, subtree: true });
    if (!isXHost) {
        installSpaNavigationHooks();
    }

    let lastScrollScan = 0;
    const throttledScan = () => {
        const now = Date.now();
        if (now - lastScrollScan < SCROLL_SCAN_INTERVAL_MS) return;
        lastScrollScan = now;
        if (pageTranslationEnabled) scanPageContent({ force: false });
    };
    scheduleViewportScan = globalThis.GemLab?.createRafThrottled
        ? GemLab.createRafThrottled(throttledScan)
        : throttledScan;
    spaScrollHandler = () => {
        if (!spaScanEnabled) return;
        scheduleViewportScan();
    };
    window.addEventListener('scroll', scheduleViewportScan, { passive: true });
    if (!isXHost) {
        document.addEventListener('scroll', spaScrollHandler, { passive: true, capture: true });
    }
    window.addEventListener('resize', scheduleViewportScan);

    // Initial scan is now triggered in createPanel() after storage is loaded
}

maybeResetModelStatsAt4am();

// Broadcast event to cleanup any heavily-cached old script contexts
document.dispatchEvent(new CustomEvent('gx-extension-reloaded'));

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startObserving);
} else {
    startObserving();
}
