# Contributing

Thanks for your interest in contributing to Gemini Translator! This project is a Chrome extension and is developed without a build step.

## Quick Start

1) Clone the repo.
2) Open `chrome://extensions` and enable Developer Mode.
3) Click "Load unpacked" and select the `extension/` folder.
4) Make changes and reload the extension to test.

## Development Notes

- Main code lives in `extension/`.
- UI strings and user-facing messages should remain in Japanese.
- Keep changes minimal and focused; avoid large refactors unless discussed first.

## Manual Testing

There is no automated test suite. Please verify at least:

- Translation works on X.com and toggles back to the original text.
- Popup and options pages render and save settings.
- Errors show a user-friendly Japanese message.

Include your test notes in the PR description.

## Coding Style

- Use 2-space indentation.
- Prefer clear, descriptive names (e.g., `handleExtensionContextInvalidated`).
- Keep settings keys consistent with existing storage keys.

## Commit Messages

We use Conventional Commits. Examples:

- `docs: update README`
- `chore: add CI checks`
- `feat: add glossary limit guard`
- `fix: handle empty response`

## Pull Requests

Please include:

- A short summary and rationale.
- Manual test notes.
- Screenshots for UI changes.

Security issues should follow `SECURITY.md` instead of public issues.
