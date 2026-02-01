# Repository Guidelines

## Project Structure & Module Organization

This repository is a Chrome extension (Manifest V3). Primary code lives in `extension/`:

- `extension/manifest.json`: MV3 configuration and permissions.
- `extension/background.js`: service worker; handles Gemini API requests.
- `extension/content.js`: DOM scanning, translation queue, UI injection.
- `extension/popup.html` + `extension/popup.js`: toolbar popup UI.
- `extension/options.html` + `extension/options.js`: settings page UI.
- `extension/gemlab-utils.js`: shared utilities (toasts, error handling).
- `extension/icons/`: extension icons.

There is no separate test or build directory; changes are loaded directly into Chrome.

## Build, Test, and Development Commands

There is no build system. Use Chrome’s extension loader for local dev:

1) Open `chrome://extensions` and enable Developer Mode.  
2) Click “Load unpacked” and select `extension/`.

Manual verification is expected after changes (see Testing Guidelines). For quick checks:

- `node scripts/validate-manifest.mjs` (ensures referenced files exist)
- `node --check extension/*.js` (basic syntax smoke test)

## Coding Style & Naming Conventions

- JavaScript is plain (no TypeScript, no bundler).
- Use 2-space indentation and keep UI strings in Japanese.
- Prefer clear, descriptive names (e.g., `handleExtensionContextInvalidated`).
- Keep settings keys consistent with existing storage keys in `CLAUDE.md`.

No automated formatter or linter is configured; keep diffs minimal and readable.

## Testing Guidelines

No automated tests are configured. Manual testing should cover:

- Translation flow on X.com (tweets translate and toggle back).
- Popup and options pages render correctly.
- Error handling shows a user-friendly Japanese message.

When possible, note the target site and scenario in PR descriptions.

## Commit & Pull Request Guidelines

Git history uses Conventional Commits (e.g., `docs: ...`, `chore: ...`).
Follow that format for new commits.

PRs should include:

- A short summary of changes and why.
- Manual test notes (e.g., “Loaded `extension/` and verified translation toggle”).
- Screenshots for UI changes (popup/options/panel).

## Security & Configuration Tips

- Never commit API keys. Keys are entered via the options page and stored in
  Chrome storage.
- Validate changes to permissions in `extension/manifest.json` carefully.
- Supported sites are X.com / Twitter by default; adding other hosts requires user-granted permissions via the options page.
