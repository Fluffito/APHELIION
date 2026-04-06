# APHELION

> Filters, blocks, bonks, and absolutely refuses to let cursed content win.

APHELION is a browser extension built to bonk unwanted words, blur suspicious images, and give users a cleaner, funnier, more customizable browsing experience across modern browsers.

## 🌐 Live Website

- **Website:** `https://fluffito.github.io/APHELIION/`

## ✨ Current Bonk Powers

- **Word and phrase filtering** for terms that need to be sent to the shadow realm
- **Custom censor glyphs** such as `✦✦✦`, `****`, `[CENSORED]`, and more
- **Image bonk controls** with `blur`, `hide`, or `replace` modes
- **Custom replacement image upload** through drag-and-drop in the options page
- **Popup blacklist management** for fast emergency bonking
- **Landing website** with feature overview, pricing mockup, and waitlist section

## 🧩 Project Structure

- `manifest.json` — extension manifest
- `content.js` — page scanning, text censoring, and image blocking logic
- `background.js` — storage + messaging logic
- `popup.html` / `popup.js` — popup UI for blacklist control
- `options.html` / `options.js` — extension settings page
- `docs/` — public website for GitHub Pages
- `website/` — local website copy for preview/editing

## 🛠️ Website Deployment

The website is configured for GitHub Pages using the `docs/` folder.

- **GitHub Pages URL:** `https://fluffito.github.io/APHELIION/`
- **Source:** `main` branch → `/docs`

### Stripe on Vercel

- Deploy the serverless webhook at `api/webhooks.js`
- Set the Stripe webhook URL to `https://YOUR-VERCEL-DOMAIN/api/webhooks`
- Subscribe to `checkout.session.completed`
- Add `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` in Vercel environment variables

## 📌 Roadmap

- Bonk sound packs and premium sound options
- Web dashboard and synced settings
- More browser support and release polish
- Easier download/install flow for regular users
- Future Pro plan features

## ⚠️ Status

APHELION is currently in active development, being polished for wider release, and getting steadily more powerful and more ridiculous in the best way.
