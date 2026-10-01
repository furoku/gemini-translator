# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [26.0830.1] - 2026-08-30

### Security
- Added a guarded settings layer that validates stored hostnames and neutralizes markup in CSS selector settings.
- Replaced dynamic site-registry HTML construction with DOM node creation.
- Removed tracked `extension/node_modules/` and the stray `extension/Their` file.
- Added focused model-migration and UI-injection tests plus high-severity dependency auditing in CI.

### Changed
- Defaulted new installs and retired-model migrations to `gemini-3.5-flash-lite`.
- Kept supported `gemini-3.1-flash-lite` and `gemini-2.5-flash-lite` selections.
- Removed the shut-down `gemini-3.1-flash-lite-preview` option.
- Rebuilt popup and options pages without remote web fonts.
- Pinned GitHub Actions to immutable commit SHAs and moved CI to Node.js 24.
- Replaced hardcoded README price examples with the official Gemini pricing page as the source of truth.

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
- Added the then-current Gemini 3.1 Flash-Lite preview model.
- Branch protection enabled on main; PR + CI (validate) required for all merges.

### Fixed
- CI now tracks `scripts/validate-manifest.mjs` correctly.
- Selector picking now appends include/exclude selectors instead of overwriting them.

## [26.0304.2206] - 2026-03-04
### Changed
- Updated extension package version and aligned docs.

## [26.0221.1730] - 2026-02-21
### Added
- Mosaic animation during translation.
- Improved text extraction for long posts, emoji, and multiline content.
