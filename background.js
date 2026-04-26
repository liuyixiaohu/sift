(() => {
  // src/shared/defaults.js
  var SIFT_DEFAULTS = {
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

  // src/background.js
  chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
      id: "sift-mute-keyword",
      title: 'Mute "%s" in feed',
      contexts: ["selection"],
      documentUrlPatterns: ["https://www.linkedin.com/*"]
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
