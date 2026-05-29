# LinkedIn Page Test Matrix

Manual smoke test for Sift across LinkedIn's page surface. Catches the class of bug where a CSS selector or content script leaks onto a page it was never meant to touch.

## How to run

**Setup**: Sift enabled, all default toggles on (or your daily config), one logged-in LinkedIn account, Chrome.

**Quick pass** (~5 minutes, before every release):
- Browser at default ~1440px width.
- Walk Tier 1 + Tier 2 routes below.
- For each, eyeball the page and check DevTools console for `[Sift]` errors.

**Narrow pass** (~5 minutes, quarterly or after any `feed.css` change):
- Resize browser to **1024px width** (DevTools device toolbar, "Responsive", 1024×800).
- Re-walk Tier 1 only (this is where the recommendations bug was).

**Columns**:
- **Booted**: which Sift handler initializes on this URL (`feed` / `profile` / `network` / `jobs` / `none`). "none" means the content script is loaded but no body classes are toggled.
- **Layout**: ✓ if LinkedIn's own content renders fully; ✗ if anything is missing or misplaced.
- **Console**: ✓ if no `[Sift]` errors or warnings; ✗ otherwise.
- **Badge**: expected presence of the floating Sift badge — ✓ where it should appear (feed only), ✗ where it shouldn't.
- **Active**: ✓ if Sift's hiding/filtering visibly works where it's supposed to.
- **@1024**: narrow viewport check — ✓ if no regression at 1024px.

---

## Tier 1 — Run every release

These are the routes most users hit daily, and the ones where Sift actively modifies the DOM.

| URL example | Booted | Layout | Console | Badge | Active | @1024 | Notes |
|---|---|---|---|---|---|---|---|
| `/feed/` | feed | | | ✓ expect | | | |
| `/in/kun-l/` | profile | | | ✗ expect | | | |
| `/in/kun-l/details/experience/` | none | | | ✗ expect | | | |
| `/in/kun-l/details/education/` | none | | | ✗ expect | | | |
| `/in/kun-l/details/skills/` | none | | | ✗ expect | | | |
| `/in/kun-l/details/recommendations/?detailScreenTabIndex=0` | none | | | ✗ expect | | | Received recs |
| `/in/kun-l/details/recommendations/?detailScreenTabIndex=2` | none | | | ✗ expect | | | **Given** recs — was blank before fix |
| `/in/kun-l/details/certifications/` | none | | | ✗ expect | | | |
| `/in/kun-l/details/projects/` | none | | | ✗ expect | | | |
| `/in/kun-l/details/featured/` | none | | | ✗ expect | | | |
| `/in/kun-l/recent-activity/all/` | none | | | ✗ expect | | | Activity lives outside `/details/`
| `/mynetwork/` | network | | | ✗ expect | | | |
| `/jobs/search-results/?keywords=engineer` | jobs | | | ✗ expect | | | `/jobs/search/` doesn't trigger `isSearchPage()`

---

## Tier 2 — Run quarterly

Less-frequent routes, but Sift's CSS file is still injected. Catches global-selector leaks.

| URL example | Booted | Layout | Console | Badge | Active | @1024 | Notes |
|---|---|---|---|---|---|---|---|
| `/feed/update/urn:li:activity:XXX/` | feed | | | ✓ expect | | | Single-post permalink |
| `/in/kun-l/details/courses/` | none | | | ✗ expect | | | |
| `/in/kun-l/details/honors/` | none | | | ✗ expect | | | |
| `/in/kun-l/details/languages/` | none | | | ✗ expect | | | |
| `/in/kun-l/details/organizations/` | none | | | ✗ expect | | | |
| `/in/kun-l/details/volunteering-experiences/` | none | | | ✗ expect | | | |
| `/in/kun-l/details/publications/` | none | | | ✗ expect | | | |
| `/in/kun-l/details/interests/` | none | | | ✗ expect | | | |
| `/mynetwork/invitation-manager/` | network | | | ✗ expect | | | |
| `/jobs/view/{id}/` | jobs | | | ✗ expect | | | Single job |
| `/jobs/collections/recommended/` | jobs | | | ✗ expect | | | |
| `/search/results/people/?keywords=X` | none | | | ✗ expect | | | |
| `/search/results/content/?keywords=X` | none | | | ✗ expect | | | |
| `/search/results/companies/?keywords=X` | none | | | ✗ expect | | | |
| `/search/results/jobs/?keywords=X` | none | | | ✗ expect | | | |
| `/search/results/posts/?keywords=X` | none | | | ✗ expect | | | |
| `/company/{slug}/` | none | | | ✗ expect | | | |
| `/company/{slug}/people/` | none | | | ✗ expect | | | |

---

## Tier 3 — Sanity check (annual or after major refactor)

Routes Sift never intentionally touches. Only failure mode here is a global-selector leak.

| URL example | Booted | Layout | Console | Badge | Active | @1024 | Notes |
|---|---|---|---|---|---|---|---|
| `/school/{slug}/` | none | | | ✗ expect | | n/a | n/a in Active col |
| `/groups/{id}/` | none | | | ✗ expect | | n/a | |
| `/events/{id}/` | none | | | ✗ expect | | n/a | |
| `/learning/` | none | | | ✗ expect | | n/a | |
| `/messaging/` | none | | | ✗ expect | | n/a | |
| `/notifications/` | none | | | ✗ expect | | n/a | |
| `/pulse/{slug}` | none | | | ✗ expect | | n/a | Article reader |
| `/mypreferences/d/` | none | | | ✗ expect | | n/a | Settings |

---

## Findings log

When a run finds a bug, log it here with the URL, what was wrong, and the resolution. This is the institutional memory the matrix builds over time.

| Date | URL | Symptom | Root cause | Fix |
|---|---|---|---|---|
| 2026-05-18 | `/in/{user}/details/recommendations/?detailScreenTabIndex=2` | Recommendations list blank at narrow viewport | Unguarded `@media (max-width: 1100px)` structural selector in `feed.css` | Deleted the entire `@media` block |
| 2026-05-29 | `/feed/` | Promoted/Suggested posts leak through; nothing hidden | LinkedIn dropped `data-display-contents` from post wrappers (moved it into asides/menus) and removed `[role="article"]`, so `feedPosts()` matched 0 posts and nothing got tagged | `feedPosts()` now selects `[role="list"]` direct children containing a `[role="listitem"]`; legacy `[data-display-contents]` / `[role="article"]` kept as fallbacks |
| 2026-05-29 | `/in/{user}/` | Analytics + suggestion widgets ("Who your viewers also viewed", "People you may know", etc.) intermittently leak past the toggles | NOT a `/dashboard`→`/analytics` rename (that was a lazy-load misread — the `/dashboard` link and "Analytics" heading are both still present once hydrated). Real causes: (1) LinkedIn hydrates these widgets well after the old 6s retry window, so the finite retry schedule missed late loads; (2) the Premium "Who your viewers also viewed" title is `<h3><span>…</span></h3>`, missed by the `h1-h4,p` heading query | `markProfileNoise` re-marks on a persistent interval (`PROFILE_SCAN_INTERVAL_MS`, cleared on teardown) and its heading query now includes `span` |

