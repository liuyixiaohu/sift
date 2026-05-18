# Changelog

## v3.1

A hotfix on top of v3. One user-visible bug fix, plus the regression-prevention scaffolding so the same class of bug fails CI next time.

### Fixed
- **Profile recommendations details page no longer renders blank.** `feed.css` carried an `@media (max-width: 1100px)` block whose structural selector `main > div > div > div:last-child:nth-child(3)` had no `body.lj-*` guard. Because the stylesheet is injected on every linkedin.com page (the manifest match is broad), at narrow viewports the rule fired regardless of any toggle and hit the recommendations list container on `/in/{user}/details/recommendations/`. The original author had flagged the block as "kept as a no-op until verified" — this release finishes that verification by deleting it. LinkedIn DOM cohorts that didn't match the selector were unaffected; cohorts that did saw a blank details page.

### Internal
- **CSS namespace guard test.** `tests/css-namespace.test.js` statically asserts every selector in `feed.css` contains the `lj-` substring, so a future unguarded structural selector fails CI before it leaks onto LinkedIn pages Sift was never meant to touch. Includes a meta-assertion that the extractor itself would still flag the recommendations bug if reintroduced — guards the guard.
- **Manual page coverage matrix.** `docs/MANUAL-TEST-MATRIX.md` enumerates 25 LinkedIn routes across three tiers with a 1024px narrow-viewport pass for the layout-regression class. Run the Tier 1 routes at default and narrow widths before each release.

## v3

Stats tab redesign and a developer-hygiene fix to keep popup bundles from going stale.

### Changed
- **Stats tab is one grid, not two sections.** The previous layout repeated nine metric labels across separate "Today" and "All Time" sub-groups, forcing the eye to scan two columns to compare a single metric's daily and lifetime values. The new layout has one row per metric showing both side by side: `Ads  12 · 8.4k`. Today is bold in the accent color; all-time is muted gray; today=0 fades to beige so a wall of inactive metrics doesn't drown out the ones that actually moved today. Vertical space roughly halves; the today-vs-cumulative comparison is now one eye movement.

### New
- **Typed reset confirmation.** Both `Reset Stats` and `Reset All Data` no longer use the native `confirm()` dialog. Clicking either button replaces it in place with an inline strip: caption, text input, Cancel, Confirm. Confirm stays disabled until the typed input matches the button label (`reset stats` / `reset all data`); matching is case-insensitive with surrounding whitespace trimmed. `Enter` confirms, `Esc` cancels. The native one-click confirm gate was a single accidental click from clearing all stats; the typed phrase forces a deliberate pause.

### Internal
- **`formatNumber` spec tightened.** Lowercase `k`, no decimal at 10k+ (`14k` not `14.0K`), clean transition to `M` at 999500 — the old function emitted `1000.0K` in that band. Right-column width is now predictable across all magnitudes (`1.0k–9.9k`, `10k–999k`, `1.0M–9.9M`, `10M+`). Non-numeric / negative / `Infinity` inputs clamp to `"0"`.
- **Pre-commit hook auto-rebuilds bundles when `src/` is staged** (#57). Husky installs the hook via the `prepare` script on `npm install`. Closes a footgun where commits to `src/` could silently ship stale root bundles — caught only by code review screenshots several iterations into a PR.
- **In-place stats refresh keys cells by `data-stat-key` + `data-stat-period`** instead of positional `querySelectorAll` indexing. Same fast-path / full-rebuild fallback shape, less fragile to DOM changes.

## v2.18

A correctness pass driven by an independent code-review round. Five merged PRs (#48 to #52). User-visible changes are small. Under the hood the diagnostic panel is now trustworthy, and Pause actually means "all filtering suspended."

### New
- **Smart diagnostic warnings.** The popup's "On this page" strip now shows an amber ⚠ chip when a filter toggle is ON but Sift matched zero elements on the relevant page type. That is the early signal that LinkedIn changed a class. Without it, the recovery loop relied on user bug reports filed weeks after the fact.
- **Invalid-regex chip (distinct from the "DOM changed" warn).** When the user is on regex match mode and one of their keywords doesn't compile, the panel renders `⚠ N Invalid regex` in olive instead of falsely accusing LinkedIn. Bad regex is also rejected at popup add-time with a specific toast.

### Fixed
- **Pause now actually pauses everything.** Previously the master toggle suspended dim/hide on jobs cards but left badges, colored borders, the `jobsFlagged` stats counter, and `autoSkipDetected` running. So paused users' skip lists silently kept growing. Pause now short-circuits `labelCard`, strips existing badges, and ignores auto-skip until unpaused.
- **Diagnostic panel uses fresh settings on each refresh.** Toggling Hide Ads off then clicking ↻ previously still showed a warn chip because the panel cached the old toggle state at popup-open time. The ↻ button now re-reads storage every click.
- **Jobs init failures surface to the user.** If `chrome.storage.local.get` rejects during boot, the jobs page no longer silently falls back to vanilla LinkedIn. A toast says "Sift failed to load on this page. Check the console."
- **`chrome.storage.local.set` failures no longer report success.** Import, Reset Stats, and Reset All Data callbacks now check `chrome.runtime.lastError` and surface the actual error to the user instead of cheerfully claiming success while storage stayed unchanged.
- **Stats no longer lose increments on transient storage errors.** `flushStats` re-queues the in-flight batch back into `pendingStats` if the chrome.storage write fails, instead of zeroing them silently.
- **`hideProfileSuggestions` works inside LinkedIn's iframe-mode cohort.** `markProfileNoise` now scopes its scan to `feedDoc` (the iframe document where applicable) instead of the top-frame `document`. Previously the body class went on the iframe body but the markers landed in the top frame, so nothing matched.
- **Schema validation rejects invalid `feedKeywordMatchMode` values on import.** `"REGEX"`, `"fuzzy"`, and `""` no longer slip past validation (they used to silently degrade to substring at runtime).
- **`wholeWord` mode delegates to the existing `matchesWholeWord` helper.** The old bespoke `\b`-with-substring-fallback path would have wrongly matched `"abc++d"` against the keyword `"++"` (the fallback dropped the boundary check). The new path uses `(?<!\w)…(?!\w)` lookbehind/lookahead, correct for both alphanumeric and symbol keywords.
- **`chrome.runtime.lastError` no longer collapses every diagnostic-fetch failure to "Reload the LinkedIn tab."** Three distinct user-facing messages map to three distinct root causes (no content script → reload; sendMessage error → console; content-script threw → diag.error).
- **Undo on Skip Current Company surfaces failures instead of lying.** If the undo callback throws (e.g. memory pop succeeded but the storage write rejected), the toast now re-toasts "Undo failed. Your skip list may be out of sync." instead of silently dismissing.

### Internal
- **`tests/fixtures/*.html` calibrated against real LinkedIn DOM** (captured via browser MCP in 2026-05). Previously the fixtures were structural approximations of what `feed.js` expected. Now they reflect what LinkedIn actually serves. The same selector tests still pass, but a future LinkedIn change will fail a specific test instead of going unnoticed.
- **`collectDiagnostics` wrapped in try/catch.** Stale iframe documents could throw on `querySelectorAll`. Previously this left the popup stuck on "Loading…" and the user concluded the extension was broken. Now the listener responds with `{error: ...}` and the popup renders a specific error.
- **Schema bumped to enforce enum constraints (new `SCHEMA_ENUMS` map).** Import validation now checks `feedKeywordMatchMode` against the allowed set instead of trusting the type-check alone.
- **`estimateBytes` returns `Infinity` on JSON serialization failure** (was `0`). Pre-flight quota check now correctly refuses an unmeasurable import instead of letting it pass with a 0-byte estimate.
- **`SETTING_KEYS` moved to `src/shared/setting-keys.js`.** Was duplicated across `feed.js` and `content.js` as independently-drifting lists. Now a single file with two clearly-named exports.
- **`markProfileNoise` skips `<main>` on feed pages.** Feed `<main>` has hundreds of `<p>` leaves per post. The widgets we need to mark live in the right-rail aside. Conditional scope shortens the hot-path scan tick.
- **107 → 167 tests** across the whole batch (#43 to #52). New coverage includes smart-warning severity classification, invalid-regex paths, schema enum validation, real-DOM selector smoke tests, `validateKeywords` edge cases, and `estimateBytes` fail-safe.

---

## v2.17

A polish and resilience batch. Four merged PRs (#43 to #46).

### New
- **Diagnostic panel in the popup.** Compact "On this page" strip at the top of the Controls tab showing what Sift currently detects on the active LinkedIn tab. Live counts of ads, suggested, recommended, keywords, profile widgets, and flagged jobs. Catches silent selector breakage in one glance: if Hide Ads is on but the panel reads "Feed · nothing detected yet" on a feed page, something has likely broken.
- **Pause Sift master toggle.** Single switch at the top of Controls that suspends all filtering across feed, profile, network, and jobs. Lets you temporarily see LinkedIn's full feed without nuking your config. Scanning continues so the diagnostic panel keeps showing reference counts. The mini-badge on LinkedIn goes muted with "Sift paused".
- **Keyword match modes.** Three modes for `feedKeywords` matching:
  - **Whole word** (default for new installs). `\b`-bounded match. `ai` matches `AI engineers` but not `training` / `rain` / `fail`. Hashtags (`#ai`) and symbol keywords (`c++`) fall back to substring per-keyword so user intent isn't lost.
  - **Substring** (legacy default). Existing users are migrated to this so behavior doesn't silently change.
  - **Regex** for power users. Each keyword is a case-insensitive regex. Invalid patterns are skipped silently.
- **Undo on Skip Current Company.** The job-page toast now offers an Undo button when you skip a company. One click pops the just-added entry. Toast lingers 5s instead of 2s when an undo is available.
- **Add inputs for skip lists in the popup.** Parity with the jobs-page panel. Comma or newline-separated bulk paste, dedup against existing items. Editing skip lists no longer requires the jobs page to be open.

### Fixed / hardened
- **Analytics widget hide now has a heading-text fallback.** The CSS rule keys on `a[href*="/dashboard"]`, but LinkedIn is mid-rollout to `/analytics` URLs (different cohorts see different DOM). When the rollout completes, the URL-based rule silently degrades to a no-op. A new heading-text marker (matches `<h2>Analytics</h2>` and tags the wrapper with `data-lj-profile-analytics`) keeps the toggle working. Both rules can match the same widget. `display: none` is idempotent.

### Internal
- **DOM selector smoke tests** (`tests/selectors.test.js`, `tests/fixtures/*.html`). First round of structural tests asserting our marker walks and selectors hold against captured LinkedIn DOM fixtures. When LinkedIn renames a class or restructures a widget, these tests fail with a specific signal instead of users silently losing filtering. Uses `linkedom` (devDep only, about 10x smaller than jsdom). 134 tests now (was 107).
- **Schema bumped 1 → 2.** Migration pins existing users to `feedKeywordMatchMode: "substring"` so they don't see surprise behavior changes. New installs land on `wholeWord`.

---

## v2.14

### Fixed
- **Profile page no longer hides the entire main column.** LinkedIn's 2026 profile DOM nests the Analytics section inside the outer profile `<section>`; the old `:has()` selector matched transitively and hid both. The rule now constrains to the innermost matching section so only the Analytics widget is hidden.

### Internal
- `npm run pack` — new script that produces a Chrome Web Store-ready ZIP under `dist/sift-vX.Y.zip` containing only what the manifest references at runtime (no `src/`, no tests, no docs). Validates manifest + package.json version drift before zipping.

---

## v2.13

Released to the Chrome Web Store before the profile-content-hidden fix had merged. See v2.14 for the actual fix — users on v2.13 with **Hide Analytics** enabled on `/in/*` pages would have seen the entire profile column disappear.

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
