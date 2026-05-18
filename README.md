# Sift

Take back a LinkedIn worth your time.

Clean up your LinkedIn feed and supercharge your job search, all in one extension.

## Features

### Feed Cleanup

- Pause everything with one switch when you want to see LinkedIn's raw feed
- Hide ads, suggested posts, and recommended content automatically
- Hide polls, celebration posts, and Premium upsells
- Define custom keywords with three match modes (whole word, substring, or regex)
- Right-click any text and select "Mute keyword" to add it to your filter
- Set a post age limit: hide posts older than 1 day, 3 days, 1 week, 2 weeks, or 1 month
- One-click Unfollow on posts and interaction headers ("XXX likes this")

### Job Search Intelligence

- Auto-detect and flag Reposted, Applied, No Sponsor, and Unpaid listings
- Good Match badge highlights jobs LinkedIn Premium rates as a strong fit
- Skip Company list: batch-add companies you want to avoid (comma-separated paste supported)
- Skip Title Keywords: filter jobs by title patterns
- Auto-skip Flagged Companies: detected No Sponsor and Unpaid companies are automatically added to your skip list
- Undo button on accidental "Skip Current Company" clicks
- Auto-Scan all visible cards with one click
- Dim or completely hide flagged job cards

### Page Cleanup

- Profile page: hide Analytics widget, suggestion widgets, and ads
- Feed sidebar: hide LinkedIn News, Today's puzzles, and right-rail ads
- My Network page: hide promoted content and suggested games

### Diagnostics

- Live "On this page" strip in the popup shows what Sift is filtering right now
- Smart warnings flag when LinkedIn changes something and a filter stops matching, so you're never silently flying blind

### Privacy First

- Runs 100% in your browser. No data collected, no external servers
- All settings stored locally via Chrome storage
- Open source (MIT): https://github.com/liuyixiaohu/sift

### Control Center

- Controls tab: all toggles and filter lists in one place
- Stats tab: daily and all-time counters for every filter action
- Data tab: export and import settings as JSON (with validation), monitor storage usage, reset to defaults

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

### Manual page coverage

`docs/MANUAL-TEST-MATRIX.md` is the smoke test for layout regressions across LinkedIn's full page surface. Run the Tier 1 routes at default and 1024px width before each release; the narrow-viewport column catches the class of bug where an unguarded CSS selector leaks onto a page Sift was never meant to touch.

## Design

Cream and rose brand palette with EB Garamond typography. All settings persist across sessions via `chrome.storage.local`.

## Privacy

Sift runs entirely in your browser. No data is collected or sent anywhere. See [privacy.html](privacy.html) for the full policy.

## License

[MIT](LICENSE)

## Feedback

[Shape Sift](https://kunli.co/sift)
