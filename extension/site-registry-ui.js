(function attachSiteRegistryUi(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.GeminiTranslatorSiteRegistryUi = api;
})(globalThis, function createSiteRegistryUi() {
  function formatSelectorText(value) {
    return String(value || '')
      .split(/[\n,]/g)
      .map((item) => item.trim())
      .filter(Boolean)
      .join('\n');
  }

  function render({ document, root, registry, rules, hostMatches }) {
    if (!root) return;
    root.replaceChildren();
    const list = Array.isArray(registry) ? registry : [];
    if (!list.length) {
      const empty = document.createElement('div');
      empty.className = 'small';
      empty.textContent = '登録サイトはまだありません。';
      root.appendChild(empty);
      return;
    }

    for (const item of list) {
      const rule = Array.isArray(rules)
        ? rules.find((entry) => hostMatches(item.host, entry?.host))
        : null;
      const row = document.createElement('div');
      row.className = 'site-row';

      const header = document.createElement('div');
      header.className = 'site-row-header';

      const host = document.createElement('div');
      host.className = 'site-host';
      host.textContent = item.host;
      header.appendChild(host);

      const actions = document.createElement('div');
      actions.className = 'site-actions';

      const label = document.createElement('label');
      label.className = 'check';
      label.style.margin = '0';
      const toggle = document.createElement('input');
      toggle.type = 'checkbox';
      toggle.dataset.siteToggle = item.host;
      toggle.checked = item.enabled !== false;
      const enabledText = document.createElement('span');
      enabledText.textContent = '有効';
      label.append(toggle, enabledText);

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn-ghost';
      remove.dataset.siteDelete = item.host;
      remove.textContent = '削除';
      actions.append(label, remove);
      header.appendChild(actions);

      const edit = document.createElement('div');
      edit.className = 'site-edit';
      const include = document.createElement('textarea');
      include.dataset.siteInclude = item.host;
      include.placeholder = '翻訳する場所';
      include.rows = 3;
      include.value = formatSelectorText(rule?.include);
      const exclude = document.createElement('textarea');
      exclude.dataset.siteExclude = item.host;
      exclude.placeholder = '翻訳しない場所';
      exclude.rows = 3;
      exclude.value = formatSelectorText(rule?.exclude);
      edit.append(include, exclude);

      row.append(header, edit);
      root.appendChild(row);
    }
  }

  return { formatSelectorText, render };
});
