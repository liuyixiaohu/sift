// Sift — shared default settings (single source of truth)

export const SIFT_DEFAULTS = {
  // Storage schema version — bumped via src/shared/schema.js#migrate when
  // the shape of stored data changes. New installs start at the latest.
  schemaVersion: 2,
  // Feed page
  hidePromoted: true,
  hideSuggested: true,
  hideRecommended: true,
  hideNonConnections: false,
  hidePolls: false,
  hideCelebrations: false,
  feedKeywordFilterEnabled: true,
  // Match mode for feedKeywords: "wholeWord" | "substring" | "regex".
  // New installs get "wholeWord" — see src/shared/matching.js for semantics.
  // Existing v1 users are migrated to "substring" to preserve behavior.
  feedKeywordMatchMode: "wholeWord",
  feedKeywords: [],
  postAgeLimit: 0, // 0 = off, days threshold: 1, 3, 7, 14, 30
  hasSeenOnboarding: false,
  // Profile page
  hideProfileAnalytics: true,
  hideProfileSuggestions: true,
  // Jobs page
  sponsorCheckEnabled: true,
  unpaidCheckEnabled: true,
  autoSkipDetected: false,
  dimFiltered: false,
  hideFiltered: false,
  skippedCompanies: [],
  skippedTitleKeywords: [],
};

export const SIFT_STATS_DEFAULTS = {
  stats: {
    today: "",
    adsHidden: 0,
    suggestedHidden: 0,
    recommendedHidden: 0,
    strangersHidden: 0,
    pollsHidden: 0,
    celebrationsHidden: 0,
    keywordsHidden: 0,
    jobsFlagged: 0,
    jobsScanned: 0,
  },
  statsAllTime: {
    adsHidden: 0,
    suggestedHidden: 0,
    recommendedHidden: 0,
    strangersHidden: 0,
    pollsHidden: 0,
    celebrationsHidden: 0,
    keywordsHidden: 0,
    jobsFlagged: 0,
    jobsScanned: 0,
  },
};
