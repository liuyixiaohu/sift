// Diagnostic-panel helpers — shared between popup and tests.
//
// `relevantCountsFor` decides which counts to render in the popup's "On this
// page" strip, based on (a) the diag payload from the content script and
// (b) the user's current settings. Three severity levels:
//
//   "ok"        — non-zero count, the relevant toggle is ON, this page type
//                 is one where the toggle would normally fire. Renders as a
//                 normal chip.
//
//   "warn"      — ZERO count, the relevant toggle is ON, this page type is
//                 one where the toggle would normally fire, and Sift isn't
//                 paused. Renders with the ⚠ prefix and an amber tint —
//                 the "your selector might have broken" signal.
//
//   "userError" — ZERO count BUT explained by the user's own input (today,
//                 only the Keywords chip uses this — when the user is on
//                 regex mode and one or more keywords don't compile). The
//                 chip points the user at their broken input instead of
//                 falsely blaming LinkedIn's DOM.
//
// We omit chips when the toggle is OFF, or the page type isn't relevant
// (e.g. Hide Polls on a profile page), or Sift is paused (counts are
// advisory in that state).

/**
 * @typedef {Object} DiagPayload
 * @property {string} pageType  "feed" | "profile" | "jobs" | "network" | "other"
 * @property {boolean} paused
 * @property {{promoted:number, suggested:number, recommended:number, nonConnection:number, poll:number, celebration:number, keywordFiltered:number, tooOld:number}} feed
 * @property {{noise:number, analytics:number}} profile
 * @property {{flagged:number}} jobs
 */

/**
 * @typedef {Object} DiagItem
 * @property {string} label
 * @property {number} n
 * @property {"ok" | "warn"} severity
 */

/**
 * @param {DiagPayload} diag
 * @param {Object} settings
 * @returns {DiagItem[]}
 */
export function relevantCountsFor(diag, settings) {
  const items = [];
  const paused = !!diag.paused;

  // Push a chip iff (toggle is on AND page is relevant). Severity depends
  // on whether the count is positive. Paused suppresses warnings (counts
  // wouldn't apply anyway).
  function push(label, n, isToggleOn, isAppropriatePage) {
    if (!isToggleOn || !isAppropriatePage) return;
    if (n > 0) {
      items.push({ label, n, severity: "ok" });
    } else if (!paused) {
      items.push({ label, n: 0, severity: "warn" });
    }
    // paused + zero → omit (no signal worth carrying)
  }

  if (diag.pageType === "feed") {
    push("Ads", diag.feed.promoted, !!settings.hidePromoted, true);
    push("Suggested", diag.feed.suggested, !!settings.hideSuggested, true);
    push("Recommended", diag.feed.recommended, !!settings.hideRecommended, true);
    push("Strangers", diag.feed.nonConnection, !!settings.hideNonConnections, true);
    push("Polls", diag.feed.poll, !!settings.hidePolls, true);
    push("Celebrations", diag.feed.celebration, !!settings.hideCelebrations, true);
    // Keywords gets special handling: if the user is on regex mode and one
    // or more of their keywords doesn't compile, that's why the count is 0
    // — point at the user's input instead of falsely accusing LinkedIn.
    const invalidKw = diag.invalidKeywords || 0;
    if (settings.feedKeywordFilterEnabled) {
      if (diag.feed.keywordFiltered > 0) {
        items.push({ label: "Keywords", n: diag.feed.keywordFiltered, severity: "ok" });
      } else if (invalidKw > 0 && !paused) {
        items.push({ label: "Invalid regex", n: invalidKw, severity: "userError" });
      } else if (!paused) {
        items.push({ label: "Keywords", n: 0, severity: "warn" });
      }
    }
    push("Too old", diag.feed.tooOld, (settings.postAgeLimit || 0) > 0, true);
    // hideProfileSuggestions also covers feed-page sidebar widgets (News etc.)
    push("Sidebar widgets", diag.profile.noise, !!settings.hideProfileSuggestions, true);
  } else if (diag.pageType === "profile") {
    push("Analytics", diag.profile.analytics, !!settings.hideProfileAnalytics, true);
    push("Suggestion widgets", diag.profile.noise, !!settings.hideProfileSuggestions, true);
  } else if (diag.pageType === "jobs") {
    // Jobs uses a multi-label `data-lj-reasons` so we can't cleanly attribute
    // a zero-count back to a specific toggle. Show the aggregate when there
    // is one; no warning logic.
    if (diag.jobs.flagged > 0) {
      items.push({ label: "Flagged jobs", n: diag.jobs.flagged, severity: "ok" });
    }
  } else if (diag.pageType === "network") {
    // Network page only uses hidePromoted (the game-promo CSS rule) but has
    // no marker count for it. Surface the same "noise" count under
    // hideProfileSuggestions as a proxy — same widget-marker mechanism.
    push("Hidden widgets", diag.profile.noise, !!settings.hideProfileSuggestions, true);
  }

  return items;
}
