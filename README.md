# Sift

Take back a LinkedIn worth your time.

A Chrome extension that cleans up your LinkedIn feed and supercharges your job search — filter by keywords, hide ads & spam, flag bad job listings, mute or unfollow inline, and pause everything with one switch.

## Features

### Feed (`/feed/`)
- **Pause Sift** — one master switch to temporarily see LinkedIn's raw feed without losing your config
- **Hide Ads** (Promoted posts)
- **Hide Suggested** posts
- **Hide Recommended** posts and LinkedIn Learning promotions
- **Hide Strangers** (non-connection posts)
- **Keyword Filter** — define custom keywords with three match modes:
  - **Whole word** (default for new installs) — `ai` matches `AI engineers` but not `training`. Hashtags (`#ai`) and symbols (`c++`) handled correctly via lookbehind/lookahead.
  - **Substring** (legacy default; existing users migrated here so behavior doesn't change)
  - **Regex** — each keyword is a case-insensitive regex; invalid patterns rejected at add-time
- **Hide Polls** — filter out LinkedIn polls
- **Hide Celebrations** — hide job updates, work anniversaries, birthdays, promotions
- **Hide Old Posts** — hide posts older than 1 day / 3 days / 1 week / 2 weeks / 1 month
- **Hide Upsells** — removes "Try Campaign Manager" and similar promotions
- **Unfollow** — inline button next to "· 1st" on posts and interaction headers ("XXX likes this")
- **Mute Keyword** — right-click any text on LinkedIn → "Mute keyword" to add it to your filter

### Job Search (`/jobs/search-results/`)
- **Reposted** detection (card text + detail panel scan)
- **Applied** detection (leaf node matching, excludes "Applied Materials" etc.)
- **No Sponsor** detection (25+ keyword patterns in job descriptions)
- **Unpaid** detection (volunteer/unpaid keyword scan)
- **Good Match** badge — green pill on jobs LinkedIn Premium rates as a strong fit
- **Skip Company** list (whole-word match, case-insensitive, comma-separated bulk paste)
- **Skip Title Keyword** list (whole-word match — `intern` matches "Software Intern" but not "Internship")
- **Auto-skip Flagged Companies** — automatically add detected No Sponsor / Unpaid companies to your skip list
- **Skip Current Company** with **undo** — clicked the wrong one? 5-second undo button on the toast
- **Auto-Scan** — click-through scan with detail panel fingerprint detection
- **Dim / Hide filtered cards** toggle
- Badge persistence across LinkedIn DOM re-renders

### Profile (`/in/*`)
- **Hide Suggestions & Ads** — removes Suggested-for-you, "People you may know", "You might like", and ad iframes. Also covers the feed page's LinkedIn News / Today's puzzles / right-rail ads via the same toggle.
- **Hide Analytics** — hides the Analytics widget (profile views, impressions, search appearances). Uses both a URL-based selector AND a heading-text fallback so it survives LinkedIn's `/dashboard` → `/analytics` URL rollout.

### My Network (`/mynetwork/*`)
- **Hide Ads** — removes Promoted ads from the sidebar
- **Hide Game Promo** — removes "Need a 30 second break?" game promotions

### Popup
- **Pause master toggle** at the top — single switch to suspend all filtering across feed / profile / network / jobs
- **Diagnostics** — live "On this page" strip shows what Sift is currently filtering on the active LinkedIn tab. Click ↻ to refresh.
- **Smart warnings** — if a filter is ON but Sift matched zero elements on the relevant page, the diagnostic chip flips to ⚠ amber so you can spot a LinkedIn DOM change before it silently breaks your filter. A distinct ⚠ olive chip flags "your own regex is broken" so the panel never falsely accuses LinkedIn.
- **Controls** — toggles grouped by page (Feed / Profile / Jobs) with sub-groups; keyword list editing with match-mode dropdown; skip-list editing with inline add inputs (comma-separated bulk paste) and search
- **Stats** — daily and all-time counters for every filter action
- **Data** — export/import settings as JSON (validated, schema-migrated, quota-checked), monitor storage usage, reset to defaults

## Install

1. Download or clone this repo
2. Open `chrome://extensions/`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** and select the folder
5. Visit LinkedIn — Sift activates automatically on feed, profile, network, and job search pages

## Development

```bash
npm install          # install esbuild, vitest, eslint, prettier, linkedom
npm run build        # bundle src/ → root JS files (IIFE)
npm run watch        # rebuild on file changes
npm test             # run unit tests (167 across logic + DOM-fixture selectors)
npm run lint         # ESLint over src/, tests/, build + pack scripts
npm run format       # apply Prettier
npm run format:check # verify Prettier formatting (CI step)
npm run pack         # build a Chrome Web Store-ready ZIP under dist/
```

Source lives in `src/`, shared modules in `src/shared/`. esbuild bundles each entry point into a self-contained IIFE at the project root for Chrome to load.

Every push and PR runs the same lint / format / test / build sequence in [GitHub Actions](.github/workflows/ci.yml) — including a guard that fails the build if `src/` changes weren't accompanied by a rebuilt bundle.

### Selector smoke tests

`tests/selectors.test.js` + `tests/fixtures/*.html` pin the structural assumptions our markers depend on against captured LinkedIn DOM. When LinkedIn renames a class or restructures a widget, these tests fail with a specific signal instead of users silently losing filtering. Fixtures were calibrated against live LinkedIn DOM via the Claude in Chrome MCP — when re-capturing after a future LinkedIn change, do NOT auto-update the fixture blindly; the failure IS the early-warning signal.

## Design

Cream/rose brand palette with EB Garamond typography. All settings persist across sessions via `chrome.storage.local`.

## Privacy

Sift runs entirely in your browser. No data is collected or sent anywhere. See [privacy.html](privacy.html) for the full policy.

## License

[MIT](LICENSE)

## Feedback

[Shape Sift](https://kunli.co/sift)
