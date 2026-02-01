// Shared utilities for X extensions (GemLab).
// Source of truth: tools/templates/gemlab-utils.js
// This file is copied into each extension directory by tools/sync_gemlab_utils.py

(function initGemLabUtils(global) {
  const GemLab = (global.GemLab = global.GemLab || {});

  GemLab.isExtensionContextInvalidatedError = function isExtensionContextInvalidatedError(err) {
    const msg = String((err && (err.message || err)) || '');
    return (
      msg.includes('Extension context invalidated') ||
      msg.includes('context invalidated') ||
      msg.includes('runtime unavailable')
    );
  };

  GemLab.isRuntimeAvailable = function isRuntimeAvailable() {
    return !!(global.chrome && chrome.runtime && typeof chrome.runtime.sendMessage === 'function');
  };

  GemLab.showToast = function showToast({
    containerId,
    message,
    tone = 'info',
    duration = 2200,
    zIndex = 2147483646
  }) {
    const id = String(containerId || 'gemlab-toast-container');
    let container = document.getElementById(id);
    if (!container) {
      container = document.createElement('div');
      container.id = id;
      container.style.cssText =
        `position:fixed;top:12px;right:12px;z-index:${zIndex};display:flex;flex-direction:column;gap:8px;` +
        'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.textContent = String(message || '');
    toast.style.cssText =
      'padding:10px 12px;border-radius:10px;box-shadow:rgba(0,0,0,0.12) 0 6px 16px;' +
      ' background:' +
      (tone === 'error' ? '#ffe6e6' : tone === 'success' ? '#e6ffed' : '#f7f9f9') +
      '; color:#0f1419; min-width: 200px; font-size: 13px; font-weight: 600;';
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 160ms ease';
      setTimeout(() => toast.remove(), 200);
    }, duration);
  };

  GemLab.createRafThrottled = function createRafThrottled(fn) {
    let scheduled = false;
    return function throttled(...args) {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        fn(...args);
      });
    };
  };

  GemLab.createBatchedNodeScanner = function createBatchedNodeScanner({ skipNode, processNode }) {
    const queue = new Set();
    let scheduled = false;

    const enqueue = (node) => {
      if (!node || node.nodeType !== Node.ELEMENT_NODE) return;
      if (typeof skipNode === 'function' && skipNode(node)) return;
      queue.add(node);
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        const nodes = Array.from(queue);
        queue.clear();
        nodes.forEach((n) => {
          try {
            processNode(n);
          } catch (e) {
            // ignore per-node failures
          }
        });
      });
    };

    return { enqueue };
  };
})(globalThis);

