# Privacy Policy

Last verified: 2026-08-30

## Overview

Gemini Translator is a Chrome extension that sends text to the Google Gemini API to perform a translation requested by the user.

## Data handled

- **Google Gemini API key:** Stored in `chrome.storage.local` on the current Chrome profile. Chrome sync storage is not used.
- **Text to translate:** Sent directly from the extension to `generativelanguage.googleapis.com` when translation is enabled for the page.
- **Settings:** Translation direction, model, glossary, exclusions, limits, site registry, CSS selectors, colors, and cache preferences are stored locally.
- **Usage statistics and cache:** Stored locally to enforce the user-configured limits and reduce repeat requests.

## Data sharing

The API key and translation text are sent to Google. Google's current Gemini API terms and privacy documentation govern that processing. No information is sent to a server operated by this project's maintainer. The extension contains no analytics or telemetry SDK.

## Site permissions

X.com and Twitter are supported by the installed content script. Other website origins are requested only after the user registers a site and approves Chrome's permission prompt. Stored hostnames and selector rules are validated before use and before display in the settings UI.

## Retention and deletion

Local data remains until the user resets the relevant settings, clears the extension's storage, or uninstalls the extension. If an API key may have been exposed, revoke it in Google AI Studio and create a replacement.

## Contact

Follow [SECURITY.md](SECURITY.md) for security or privacy reports. Never include an API key, private page text, or raw API response in a public issue.
