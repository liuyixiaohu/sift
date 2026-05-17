# Sift

Take back a LinkedIn worth your time.

A Chrome extension that cleans up the LinkedIn feed and improves the job search. Filter posts by keywords, hide ads and spam, flag bad job listings, mute or unfollow inline, and pause everything with one switch.

## Features

### Feed (`/feed/`)
- **Pause Sift**: master switch to temporarily see LinkedIn's raw feed without losing your config.
- **Hide Ads** (Promoted posts).
- **Hide Suggested** posts.
- **Hide Recommended** posts and LinkedIn Learning promotions.
- **Hide Strangers** (non-connection posts).
- **Keyword Filter** with three match modes:
  - **Whole word** (default for new installs). `ai` matches `AI engineers` but not `training`. Hashtags (`#ai`) and symbols (`c++`) work via lookbehind/lookahead.
  - **Substring** (legacy default). Existing users are migrated here so behavior doesn't change.
  - **Regex**. Each keyword is a case-insensitive regex. Invalid patterns are rejected at add-time.
- **Hide Polls**.
- **Hide Celebrations** (job updates, work anniversaries, birthdays, promotions).
- **Hide Old Posts** (older than 1 day, 3 days, 1 week, 2 weeks, or 1 month).
- **Hide Upsells** ("Try Campaign Manager" and similar promotions).
- **Unfollow** inline next to "· 1st" on posts and on interaction headers ("XXX likes this").
- **Mute Keyword** via right-click. Select any text on LinkedIn, then "Mute keyword" to add it to your filter.

### Job Search (`/jobs/search-results/`)
- **Reposted** detection (card text and detail panel scan).
- **Applied** detection (leaf node matching, excludes "Applied Materials" etc.).
- **No Sponsor** detection (25+ keyword patterns in job descriptions).
- **Unpaid** detection (volunteer / unpaid keyword scan).
- **Good Match** badge. Green pill on jobs LinkedIn Premium rates as a strong fit.
- **Skip Company** list. Whole-word match, case-insensitive, with comma-separated bulk paste.
- **Skip Title Keyword** list. Whole-word match. `intern` matches "Software Intern" but not "Internship".
- **Auto-skip Flagged Companies**. Automatically adds detected No Sponsor and Unpaid companies to your skip list.
- **Skip Current Company** with **undo**. Clicked the wrong one? Five-second undo button on the toast.
- **Auto-Scan**. Click-through scan with detail panel fingerprint detection.
- **Dim or Hide** filtered cards.
- Badge persistence across LinkedIn DOM re-renders.

### Profile (`/in/*`)
- **Hide Suggestions and Ads**. Removes "Suggested for you", "People you may know", "You might like", and ad iframes. The same toggle also covers the feed page's LinkedIn News, Today's puzzles, and right-rail ads.
- **Hide Analytics**. Hides the Analytics widget (profile views, impressions, search appearances). Uses both a URL-based selector and a heading-text fallback so it survives LinkedIn's `/dashboard` to `/analytics` URL rollout.

### My Network (`/mynetwork/*`)
- **Hide Ads**. Removes Promoted ads from the sidebar.
- **Hide Game Promo**. Removes "Need a 30 second break?" game promotions.

### Popup
- **Pause master toggle** at the top. Single switch to suspend all filtering across feed, profile, network, and jobs.
- **Diagnostics**. A live "On this page" strip shows what Sift is filtering on the active LinkedIn tab. Click ↻ to refresh.
- **Smart warnings**. If a filter is on but Sift matched zero elements on the relevant page, the diagnostic chip flips to amber so you can spot a LinkedIn DOM change early. A distinct olive chip flags "your own regex is broken" so the panel never falsely accuses LinkedIn.
- **Controls**. Toggles grouped by page (Feed, Profile, Jobs) with sub-groups. Keyword list editing with a match-mode dropdown. Skip-list editing with inline add inputs (comma-separated bulk paste) and search.
- **Stats**. Daily and all-time counters for every filter action.
- **Data**. Export and import settings as JSON (validated, schema-migrated, quota-checked), monitor storage usage, reset to defaults.

## Install

1. Download or clone this repo.
2. Open `chrome://extensions/`.
3. Enable **Developer mode** (top right).
4. Click **Load unpacked** and select the folder.
5. Visit LinkedIn. Sift activates automatically on feed, profile, network, and job search pages.

## Development

```bash
npm install          # install esbuild, vitest, eslint, prettier, linkedom
npm run build        # bundle src/ → root JS files (IIFE)
npm run watch        # rebuild on file changes
npm test             # run unit tests (167 across logic and DOM-fixture selectors)
npm run lint         # ESLint over src/, tests/, build and pack scripts
npm run format       # apply Prettier
npm run format:check # verify Prettier formatting (CI step)
npm run pack         # build a Chrome Web Store-ready ZIP under dist/
```

Source lives in `src/`, shared modules in `src/shared/`. esbuild bundles each entry point into a self-contained IIFE at the project root for Chrome to load.

Every push and PR runs the same lint / format / test / build sequence in [GitHub Actions](.github/workflows/ci.yml), including a guard that fails the build if `src/` changes weren't accompanied by a rebuilt bundle.

### Selector smoke tests

`tests/selectors.test.js` and `tests/fixtures/*.html` pin the structural assumptions our markers depend on against captured LinkedIn DOM. When LinkedIn renames a class or restructures a widget, these tests fail with a specific signal instead of users silently losing filtering. Fixtures were calibrated against live LinkedIn DOM via the Claude in Chrome MCP. When re-capturing after a future LinkedIn change, do NOT auto-update the fixture blindly. The failure IS the early-warning signal.

## Design

Cream and rose brand palette with EB Garamond typography. All settings persist across sessions via `chrome.storage.local`.

## Privacy

Sift runs entirely in your browser. No data is collected or sent anywhere. See [privacy.html](privacy.html) for the full policy.

## License

[MIT](LICENSE)

## Feedback

[Shape Sift](https://kunli.co/sift)
