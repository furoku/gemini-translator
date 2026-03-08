# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]
## [26.0308.1230] - 2026-03-08
### Fixed
- Kept X.com and Twitter translation enabled even when saved site whitelist settings excluded them.

## [26.0308.0939] - 2026-03-08
### Fixed
- Restored X translation behavior in content script.

## [26.0304.2241] - 2026-03-04
### Changed
- Unified panel wording from 「自動翻訳」 to 「翻訳」 for clearer UI labels.
- Improved site setup flow by separating 「登録」 and 「許可」 actions.
- Kept site settings always visible in popup for easier first-time setup.
- Popup UI simplified: hide help card by default, enlarge toggle switch, collapse API key input.
- Renamed button 「登録して許可」 to 「保存」.
- Removed model options: gemini-2.5-flash, gemini-3.0-flash, gemini-3-flash-preview.
- Added model: gemini-3.1-flash-lite-preview (input $0.25 / output $1.50 per 1M tokens).
- Branch protection enabled on main; PR + CI (validate) required for all merges.

### Fixed
- CI now tracks `scripts/validate-manifest.mjs` correctly.
- Selector picking now appends include/exclude selectors instead of overwriting them.
- Corrected Gemini 3.1 Flash-Lite model ID from `gemini-3.1-flash-lite` to `gemini-3.1-flash-lite-preview`.

## [26.0304.2206] - 2026-03-04
### Changed
- Updated extension package version and aligned docs.

## [26.0221.1730] - 2026-02-21
### Added
- Mosaic animation during translation.
- Improved text extraction for long posts, emoji, and multiline content.
