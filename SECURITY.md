# Security Policy

## Supported version

Security fixes target the latest source on the default branch and the latest GitHub Release. Locally modified or older copies are not supported.

## Reporting a vulnerability

Open a GitHub issue with a minimal, non-sensitive description and ask for a private reporting channel before sharing reproduction details. Do not post API keys, authorization URLs, private page text, browsing data, screenshots containing personal information, or raw Gemini responses in a public issue.

Please include the affected commit or extension version, Chrome version, expected behavior, observed impact, and whether the issue can expose data or trigger paid API requests.

## Security boundary

Gemini Translator must:

- call only Google's Gemini API for translation;
- store API keys and settings locally rather than in Chrome sync;
- request non-X website access only after an explicit user action;
- validate hostnames and selector settings before use and display;
- avoid developer-operated servers, telemetry, and background data collection unrelated to translation;
- keep daily cost and character limits fail-closed when the stored values are invalid;
- migrate away from shut-down model IDs before API requests are handled.

If an API key may have been exposed, revoke it in Google AI Studio before generating a replacement.
