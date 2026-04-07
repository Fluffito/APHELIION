# APHELION Security Review

Last reviewed: April 7, 2026

## Summary
A quick store-safety review of APHELION found **no obvious malicious code patterns** in the extension.

## What was checked
- No `eval()` or `new Function()` usage
- No remote script injection or CDN-loaded JavaScript
- No `chrome.history`, `chrome.cookies`, `chrome.webRequest`, `chrome.debugger`, `chrome.proxy`, or `chrome.downloads` usage
- No advertising tracker code found in the extension source

## Permissions currently used
- `storage` — stores blacklist entries, settings, and license state locally
- `tabs` — refreshes/reloads filtering behavior across open tabs when settings change
- Site access on `https://*/*` and `http://*/*` — required so APHELION can filter words and images on normal web pages

## Network usage
- Stripe checkout links are used for payments on the website
- The Vercel API may be contacted for checkout, success-page lookup, webhook fulfillment, and optional purchase recovery
- Filtering itself runs locally in the browser on visited pages

## Notes for store submission
- Broad website access is expected for a content-filtering extension, but it should be explained clearly in the store listing
- Keep the privacy policy URL public: `https://fluffito.github.io/APHELIION/privacy.html`
- Re-test Free vs paid locks before submission
