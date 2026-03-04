# OSS Audit Report (gemini-translator)

- Audit date (JST): 2026-03-04
- Repository: `https://github.com/furoku/gemini-translator`
- Auditor: Codex

## Scope and goal
This report verifies the following completion conditions:
1. Local implementation consistency
2. Public documentation consistency
3. CI quality on `main`
4. GitHub public surface consistency (Releases/Tags/Assets)
5. Distribution consistency
6. Tracking cleanup for non-public artifacts
7. Maintenance operations readiness
8. Auditability (single consolidated report)

## Results summary

| Condition | Status | Evidence |
|---|---|---|
| 1) Local implementation consistency | Pass | `extension/manifest.json` version `26.0304.2241`; README/CLAUDE updated to same current model/version context |
| 2) Public documentation consistency | Pass | `README.md` links to `CHANGELOG.md` and `SUPPORT.md`; `CHANGELOG.md`, `CONTRIBUTING.md`, `SECURITY.md`, `SUPPORT.md` exist and are cross-consistent |
| 3) CI quality on `main` | Pass | Latest CI run for `main` head `2570c93c...` is `success` ([run](https://github.com/furoku/gemini-translator/actions/runs/22673287112)) |
| 4) GitHub Releases/Tags/Assets consistency | Pass | Latest release is `v26.0304.2241` with asset `gemini-translator-v26.0304.2241.zip`; tag points to `2570c93c...` |
| 5) Distribution consistency | Pass | README instructs release zip download and loading extracted `extension/`; latest release asset includes `extension/` root |
| 6) Tracking cleanup | Pass | `.gitignore` contains `.harness/`; `.harness/context.md` removed from Git tracking |
| 7) Maintenance operations readiness | Pass | `.github/CODEOWNERS`, `.github/dependabot.yml`, issue templates, PR template, CI workflow are present |
| 8) Auditability | Pass | This file consolidates rationale, checks, evidence, and residual notes |

## Changes made in this audit cycle

1. Added maintenance/public-operation files:
- `.github/CODEOWNERS`
- `.github/dependabot.yml`
- `CHANGELOG.md`
- `SUPPORT.md`

2. Improved discoverability from README:
- Added links to `CHANGELOG.md` and `SUPPORT.md`

3. Aligned GitHub public release surface with current implementation:
- Created release/tag: `v26.0304.2241`
- Uploaded asset: `gemini-translator-v26.0304.2241.zip`
- Release URL: https://github.com/furoku/gemini-translator/releases/tag/v26.0304.2241

4. Tracking cleanup:
- `.gitignore` includes `.harness/`
- Removed `.harness/context.md` from Git tracking

## Verification details

### Local checks
- `node scripts/validate-manifest.mjs` -> passed
- `node --check extension/background.js` -> passed
- `node --check extension/content.js` -> passed
- `node --check extension/options.js` -> passed
- `node --check extension/popup.js` -> passed
- `node --check extension/gemlab-utils.js` -> passed

### GitHub API checks used
- `GET /repos/furoku/gemini-translator/releases/latest`
- `GET /repos/furoku/gemini-translator/tags`
- `GET /repos/furoku/gemini-translator/actions/runs?branch=main`

## Residual notes / open items
- Historical failed workflow runs remain in history for older commits, but the latest `main` head CI is green.
- `CODEOWNERS` currently uses `@furoku`; update if maintainership changes.

