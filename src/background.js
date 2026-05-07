// Sift — background service worker

import { SIFT_DEFAULTS } from "./shared/defaults.js";
import { migrate, SCHEMA_VERSION } from "./shared/schema.js";

// === Context menu: "Mute keyword" ===

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "sift-mute-keyword",
    title: 'Mute "%s" in feed',
    contexts: ["selection"],
    documentUrlPatterns: ["https://www.linkedin.com/*"],
  });

  // Stamp / migrate the schema version on install + on every update so old
  // installs don't have to wait for the popup to open before their stored
  // data is brought up to the current schema. Idempotent.
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
      if (existing.includes(keyword.toLowerCase())) return; // already muted
      data.feedKeywords.push(keyword);
      // Auto-enable keyword filtering if user is muting a keyword
      chrome.storage.local.set({
        feedKeywords: data.feedKeywords,
        feedKeywordFilterEnabled: true,
      });
    }
  );
});

// === Extension icon badge ===
// Badge was disabled in favor of in-page mini-badge.
// Keeping the message listener as a no-op so content scripts don't error.

chrome.runtime.onMessage.addListener(() => {});
