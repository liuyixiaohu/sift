// Mutable module-level state for the jobs page singleton.
// Wrapped in a single `state` object so other modules can mutate via property
// assignment (`state.scanning = true`) — exported `let` bindings can't be
// reassigned across module boundaries in ES modules.

export const state = {
  // Settings (mirrors keys in src/shared/defaults.js, refreshed from chrome.storage).
  skippedCompanies: [],
  skippedTitleKeywords: [],
  sponsorCheckEnabled: true,
  unpaidCheckEnabled: true,
  autoSkipDetected: false,
  cardsDimmed: false,
  cardsHidden: false,

  // Cards already evaluated by filterJobCards (avoid re-scanning content-stable text).
  processedCards: new WeakSet(),

  // Last detail-panel fingerprint observed by checkDetailPanel (skip duplicate work).
  lastDetailText: "",

  // jobKey → Set<reason>. Survives LinkedIn DOM replacements so badges can be restored.
  labeledJobs: new Map(),

  // Auto-scan state.
  scannedCards: new WeakSet(),
  scanning: false,
  scanAbort: false,

  // UI element references (set by createUI).
  ui: {},
  hasSeenIntro: false,
  panelPosition: null,

  // Stats batching — accumulates increments and flushes in one storage write.
  pendingStats: {},
  flushTimer: null,

  // Route detection.
  lastUrl: typeof location !== "undefined" ? location.href : "",

  // Jobs MutationObserver + debounce timers.
  filterTimer: null,
  detailTimer: null,
  badgeTimer: null,
  jobsObserver: null,
};

// Only activate on jobs search-results pages.
export function isSearchPage() {
  return /\/jobs\/search-results\//.test(location.href);
}
