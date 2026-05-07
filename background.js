(() => {
  // src/shared/defaults.js
  var SIFT_DEFAULTS = {
    // Storage schema version — bumped via src/shared/schema.js#migrate when
    // the shape of stored data changes. New installs start at the latest.
    schemaVersion: 1,
    // Feed page
    hidePromoted: true,
    hideSuggested: true,
    hideRecommended: true,
    hideNonConnections: false,
    hideSidebar: true,
    hidePolls: false,
    hideCelebrations: false,
    feedKeywordFilterEnabled: true,
    feedKeywords: [],
    postAgeLimit: 0,
    // 0 = off, days threshold: 1, 3, 7, 14, 30
    hasSeenOnboarding: false,
    // Profile page
    hideProfileAnalytics: true,
    // Jobs page
    sponsorCheckEnabled: true,
    unpaidCheckEnabled: true,
    autoSkipDetected: false,
    dimFiltered: false,
    hideFiltered: false,
    skippedCompanies: [],
    skippedTitleKeywords: []
  };

  // src/shared/schema.js
  var SCHEMA_VERSION = 1;
  var STORAGE_QUOTA_BYTES = 10 * 1024 * 1024;
  function migrate(data) {
    const v = typeof data.schemaVersion === "number" ? data.schemaVersion : 0;
    if (v >= SCHEMA_VERSION) return data;
    if (v < 1) {
      data.schemaVersion = 1;
    }
    return data;
  }

  // src/background.js
  chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
      id: "sift-mute-keyword",
      title: 'Mute "%s" in feed',
      contexts: ["selection"],
      documentUrlPatterns: ["https://www.linkedin.com/*"]
    });
    chrome.storage.local.get(null, (data) => {
      const before = typeof data.schemaVersion === "number" ? data.schemaVersion : 0;
      if (before >= SCHEMA_VERSION) return;
      const migrated = migrate({ ...data });
      chrome.storage.local.set(migrated);
    });
  });
  chrome.contextMenus.onClicked.addListener((info) => {
    if (info.menuItemId !== "sift-mute-keyword") return;
    const keyword = (info.selectionText || "").trim();
    if (!keyword) return;
    chrome.storage.local.get(
      { feedKeywords: SIFT_DEFAULTS.feedKeywords, feedKeywordFilterEnabled: SIFT_DEFAULTS.feedKeywordFilterEnabled },
      (data) => {
        const existing = data.feedKeywords.map((k) => k.toLowerCase());
        if (existing.includes(keyword.toLowerCase())) return;
        data.feedKeywords.push(keyword);
        chrome.storage.local.set({
          feedKeywords: data.feedKeywords,
          feedKeywordFilterEnabled: true
        });
      }
    );
  });
  chrome.runtime.onMessage.addListener(() => {
  });
})();
