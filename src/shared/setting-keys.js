// Single source of truth for "which storage keys does each content script
// care about" — the lists used by storage.onChanged listeners to decide
// whether a change is worth re-applying.
//
// Before consolidation, each content script (feed.js, content.js) maintained
// its own local SETTING_KEYS that drifted independently. Adding a new
// setting required updating both files in lockstep — easy to miss.
//
// These sets are intentionally DIFFERENT (the two pages care about different
// settings) — siftPaused is the only key both listen to since the master
// toggle affects everything.

export const FEED_PAGE_SETTING_KEYS = new Set([
  "siftPaused",
  "hidePromoted",
  "hideSuggested",
  "hideRecommended",
  "hideNonConnections",
  "hidePolls",
  "hideCelebrations",
  "feedKeywordFilterEnabled",
  "feedKeywordMatchMode",
  "feedKeywords",
  "postAgeLimit",
  "hideProfileAnalytics",
  "hideProfileSuggestions",
]);

export const JOBS_PAGE_SETTING_KEYS = new Set([
  "siftPaused",
  "skippedCompanies",
  "skippedTitleKeywords",
  "sponsorCheckEnabled",
  "unpaidCheckEnabled",
  "autoSkipDetected",
  "dimFiltered",
  "hideFiltered",
]);
