// Sift — shared default settings (loaded before feed.js and content.js)
// Single source of truth for all default values.
window.__siftDefaults = {
  // Feed page
  hidePromoted: true,
  hideSuggested: true,
  hideRecommended: true,
  hideNonConnections: false,
  hideSidebar: true,
  // Jobs page
  sponsorCheckEnabled: true,
  unpaidCheckEnabled: true,
  dimFiltered: false,
  hideFiltered: false,
  skippedCompanies: [],
  skippedTitleKeywords: [],
};

window.__siftStatsDefaults = {
  stats: {
    today: "",
    adsHidden: 0,
    suggestedHidden: 0,
    recommendedHidden: 0,
    strangersHidden: 0,
    jobsFlagged: 0,
    jobsScanned: 0,
  },
  statsAllTime: {
    adsHidden: 0,
    suggestedHidden: 0,
    recommendedHidden: 0,
    strangersHidden: 0,
    jobsFlagged: 0,
    jobsScanned: 0,
  },
};
