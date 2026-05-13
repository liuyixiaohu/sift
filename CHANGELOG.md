# Changelog

## v2.13

### Fixed
- **Profile page no longer hides the entire main column.** LinkedIn's 2026 profile DOM nests the Analytics section inside the outer profile `<section>`; the old `:has()` selector matched transitively and hid both. The rule now constrains to the innermost matching section so only the Analytics widget is hidden.

### Internal
- `npm run pack` — new script that produces a Chrome Web Store-ready ZIP under `dist/sift-vX.Y.zip` containing only what the manifest references at runtime (no `src/`, no tests, no docs). Bumps validate manifest + package.json version drift before zipping.

---

## v2.11

(Released to the Chrome Web Store as a single bundle; v2.12 was skipped to align with the v2.13 bug-fix release.)

### New
- **Good Match badge** — green pill on jobs where LinkedIn Premium's "Assessing your job match" panel rates your profile a strong fit. Stacks beneath any red flag badges (No Sponsor / Reposted / etc.) without overriding the border color.
- **Auto-skip Flagged Companies** toggle — when on, jobs detected as No Sponsor or Unpaid automatically add the company to your Skipped list and re-filter the rest of the page. Default off.
- **Storage usage indicator** in the Data tab — shows current `chrome.storage.local` usage (e.g. "1.2 MB of 10 MB / 12 %"). Color-coded amber at ≥ 80 %, red at ≥ 95 %.

### Changed
- **Skipped Companies and Skipped Title Keywords now use whole-word matching.**
  - `Apple` matches `"Apple"`, `"Apple Inc"`, `"Apple Computer"` — but no longer fails on `"Apple Inc"` and no longer wrongly matches `"Pineapple"`.
  - `intern` matches `"Software Intern"` but no longer wrongly matches `"Internship"` or `"Internal Tools"`.
  - Implementation uses `(?<!\w)...(?!\w)` lookbehind / lookahead so needles like `C++` or `AT&T` still match correctly.
- **Removed the Shift+J keyboard shortcut** (feed pause/resume) and Ctrl/Cmd+Shift+S (jobs panel collapse) — both were undiscoverable and rarely used.
- **Import Backup is now validated.** Malformed JSON or wrong-type fields are rejected with a specific error message; old exports without `schemaVersion` are silently migrated. A pre-flight quota check refuses imports that would push storage past 95 %.

### Fixed
- **Skip Current Company saving the job title on Promoted / sponsored cards.** LinkedIn renders the title twice in `card.innerText` for sponsored listings; the old line-index heuristic returned the duplicate title. Now anchored on the dismiss-button title via `lastIndexOf`.

### Internal
- `src/content.js` (1295 lines, 11 concerns in one file) split into 10 themed modules under `src/jobs/`. Same code, located coherently. Tests now import directly from source instead of duplicating logic.
- Storage schema versioned (`SCHEMA_VERSION = 1`); old exports treated as v0 and silently migrated.
- GitHub Actions CI runs `lint → format:check → test → build → bundled-output-up-to-date` guard on every PR.
- ESLint + Prettier added with permissive defaults that pass the existing codebase clean.
- `getCardTextLines` memoized per-tick (was ~75 `innerText` reads per filter pass with 25 cards visible).
- Dead `src/shared/badge.js` no-op stub + 5 caller sites removed.
- 5 hand-rolled case-insensitive list-dedupe sites consolidated into `src/shared/lists.js` helpers.
- Test count: 43 → 107.

---

## v2.10

### Fixed
- Mini status badge no longer shows on the Jobs page (was overlapping the in-page Sift panel).
- Scan button correctly resets to default state on SPA navigation between job searches.

---

## v2.9

### New
- **Right-click "Mute keyword"** context menu — select any text on LinkedIn → right-click → adds the selection to your Feed Keywords filter and enables filtering. Reintroduces a v1.x feature.
- **Unfollow button on interaction headers** — appears inline next to "XXX likes this / reposted / commented on this" so you can mute the original poster without scrolling to find the article.

### Changed
- Feed scanning replaced the unreliable scroll-listener with a continuous 1.5 s `setInterval` — LinkedIn's 2026 scroll events don't fire reliably on either `window` or `<main>`. Posts are tagged idempotently so repeat scans are cheap no-ops.
- DRY / KISS refactor pass across `feed.js`, `popup.js`, `content.js` (~270 lines removed).
- Unfollow button placement: now next to the post's `...` menu, only shown on 1st-degree connections.

### Fixed
- Feed filtering for LinkedIn's 2026 DOM restructure (PR #23). Several selectors broke when LinkedIn replaced their feed layout — re-anchored detection.

---

## v2.7

### New
- **Hide Celebrations filter** — job updates, work anniversaries, birthdays, new-role announcements.
- "Top applicant" job cards now hidden alongside Recommended (was a gap).

### Removed
- Extension-icon badge count. In-page mini badges already show the count; the chrome.action badge added clutter without value.

---

## v2.6

### New
- **Post age filter** — hide posts older than 1 day / 3 days / 1 week / 2 weeks / 1 month (configurable in the popup).
- Hide Campaign Manager upsell card on feed.

---

## v2.5

### New
- **Profile-page filtering**: Hide Sidebar (ads, "People you may know", "More profiles for you") and Hide Analytics (profile views, post impressions, search appearances).
- **My Network page**: Hide promoted sidebar ads and the "Need a 30 second break?" game promo.

---

## v2.4

### New
- **Poll filter** — hide LinkedIn polls in the feed.
- First-time user onboarding hint on Jobs page.

---

## v2.3

### New
- **Feed keyword filter** — define custom keywords; matching posts are hidden.
- **Icon Badge** — extension icon shows total filtered count.
- Automated test suite (vitest).
- MIT license file added.

### Internal
- Migrated to ES Modules + esbuild bundling (each entry point → self-contained IIFE).

---

## v2.2

### Fixed
- SPA navigation: Sift now re-activates after in-app navigation without requiring a manual refresh.

### Internal
- Code-quality refactor pass across all files.

---

## v2.1

### Changed
- Chrome Web Store description shortened.
- `.gitignore` introduced; stale release zips removed from the repo.

---

## v2.0

### Removed
- **Mute by keyword** — removed in favor of Unfollow (simpler, more effective)
- **Mute by person** — replaced by one-click Unfollow button
- **Force Recent** sort toggle
- **Context menu** ("Mute keyword" right-click option)

### New
- **Unfollow button** on feed posts — appears on hover, opens LinkedIn's `...` menu to unfollow
  - On interaction posts ("X reposted this"), placed inline after header text
  - On direct posts, placed next to author name
- **Auto-hide unfollow confirmation** — LinkedIn's "You unfollowed X" card collapses automatically
- **Keyboard shortcut** — Shift+J to pause/resume all feed filters

### Changed
- Popup section titles renamed: "Feed Page" / "Jobs Page"
- `contextMenus` permission removed (no longer needed)
- Description updated for Chrome Web Store v2.0

---

## v1.4

### New: Extension Popup Control Center
- Centralized popup with 3 tabs: Controls, Stats, Data
- **Controls tab**: All toggles grouped by page (Feed / Jobs / Profile), skip lists — full editing
- **Stats tab**: Real-time counters (ads hidden, jobs flagged, etc.) with Today + All Time views
- **Data tab**: Export all settings as JSON backup, import to restore, reset to defaults
- Settings sync via `chrome.storage.onChanged` — changes in popup apply to pages instantly, no reload needed

### Architecture Change
- Page floating panels replaced with **mini status badges** (bottom-right corner)
- Feed badge: shows "🔍 N filtered" count
- Jobs badge: shows "🔍 N flagged" count with inline Scan button
- Profile badge: shows "🔍 Sidebar hidden" status

---

## v1.3

### UX
- Smooth collapse animation for filtered feed posts (replaces instant `display:none` removal)
- Scroll nudge after filtering to trigger LinkedIn's infinite scroll and fill visual gaps
- Draggable panels on feed and profile pages (position persists via chrome.storage.local)

### Performance
- MutationObserver in content.js narrowed from `document.body` to `.jobs-search-results-list` / `<main>`
- SPA route detection replaced with History API interception (zero DOM overhead)
- `waitForDetailChange()` polling replaced with MutationObserver (300ms interval → event-driven)
- `detailPanelHasReposted()` selector scoped to detail panel with narrower element targets
- `getDetailText()` sibling traversal capped at 15 iterations
- `refreshBadges()` reduced from 3 calls to 2 (0s + 2s)
- `filterJobCards()` early-exit when no new cards to process

---

## v1.2

### Feed Page
- Control panel with toggle switches: Hide Ads, Suggested, Recommended, Strangers, Hide Sidebar
- Hide LinkedIn Learning promotions ("Popular course on LinkedIn Learning")
- Hide non-connection (stranger) posts from feed
- Hide LinkedIn News sidebar and footer
- Persistent settings via chrome.storage.local

### Profile Page
- Hide right sidebar on `/in/*` pages (ads, "People you may know", "More profiles for you", etc.)
- Separate frosted-glass control panel with Hide Sidebar toggle

### Performance
- Single-pass DOM scanning (5x → 1x traversal per post for label detection)
- MutationObserver narrowed from document.body to `<main>` element
- Font loading moved from JS runtime to CSS @import (loads at document_start)
- Targeted selectors in cardHasAppliedText() instead of querySelectorAll("*")

---

## v1.1

### Bug Fixes
- Fixed floating panel becoming invisible when switching from external monitor to MacBook screen
- Panel position is now clamped to viewport on restore, after drag, and on window resize

### Improvements
- Responsive panel layout: width and font size adapt to screen size using `clamp()` and multi-breakpoint media queries
- Panel body max-height scales with viewport for better usability on smaller screens

### Cleanup
- Removed Tampermonkey userscript (`joblens.user.js`) — project is now Chrome Extension only

---

## v1.0

Initial public release.

### Detection
- Reposted detection (card text + detail panel scan)
- Applied detection (card text leaf node matching)
- No Sponsor detection (detail panel keyword scan, toggle, default on)
- Unpaid detection (detail panel keyword scan, toggle, default on)
- Skipped Company list (exact match, case-insensitive)
- Skipped Title Keyword list (substring match)

### Auto-Scan
- Click-through scan with detail panel fingerprint change detection
- Scan path passes card reference directly (bypasses getActiveCard)
- Badge persistence via labeledJobs Map (survives LinkedIn DOM replacement)
- refreshBadges() recovers lost badges on re-render

### UI
- Frosted glass panel (cream/rose brand palette, EB Garamond font)
- Draggable panel (header drag, click to collapse)
- Multi-badge support (vertical badge stack, border priority)
- Dim filtered cards mode (opacity 0.35, hover 0.7)
- Copy/import for skip lists (comma-separated, batch paste)
- List collapse: 5+ items show expand/collapse toggle
- "Skip Current Company" quick action button

### Technical
- jobId extraction supports both `/jobs/view/` and `?currentJobId=` URL formats
- Title matching: exact match preferred, then closest length difference
- clickCard fallback chain for `display:contents` cards
- Trusted Types compatibility
- Single MutationObserver (DOM changes + SPA route detection)
