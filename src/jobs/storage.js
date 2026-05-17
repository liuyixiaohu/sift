// chrome.storage I/O for jobs page settings + batched stat counters.

import { SIFT_DEFAULTS } from "../shared/defaults.js";
import { state } from "./state.js";

const _defaults = SIFT_DEFAULTS;

export async function loadSettings() {
  // chrome.storage.local.get can reject in rare cases (corrupted storage,
  // quota issues mid-Chrome-update). Let the caller decide whether to
  // toast or fall back to defaults — we just don't want an unhandled
  // promise rejection silently turning Sift into a no-op on the jobs page
  // (which would look like "extension uninstalled" to the user).
  const data = await chrome.storage.local.get({
    siftPaused: _defaults.siftPaused ?? false,
    skippedCompanies: _defaults.skippedCompanies || [],
    skippedTitleKeywords: _defaults.skippedTitleKeywords || [],
    sponsorCheckEnabled: _defaults.sponsorCheckEnabled ?? true,
    unpaidCheckEnabled: _defaults.unpaidCheckEnabled ?? true,
    autoSkipDetected: _defaults.autoSkipDetected ?? false,
    hasSeenIntro: false,
    panelPosition: null,
    dimFiltered: _defaults.dimFiltered ?? false,
    hideFiltered: _defaults.hideFiltered ?? false,
  });
  const active = !data.siftPaused;
  state.siftPaused = !!data.siftPaused;
  state.skippedCompanies = data.skippedCompanies;
  state.skippedTitleKeywords = data.skippedTitleKeywords;
  state.sponsorCheckEnabled = data.sponsorCheckEnabled;
  state.unpaidCheckEnabled = data.unpaidCheckEnabled;
  // Pause gates auto-skip too — otherwise the popup row "All filtering
  // suspended" silently lies and the user's skip list keeps growing.
  state.autoSkipDetected = active && data.autoSkipDetected;
  state.hasSeenIntro = data.hasSeenIntro;
  state.panelPosition = data.panelPosition;
  // Pause suppresses the visual filter; labelCard short-circuits entirely
  // when state.siftPaused is true so no badges + no border + no
  // dim/hide. That's the honest pause semantic.
  state.cardsDimmed = active && data.dimFiltered;
  state.cardsHidden = active && data.hideFiltered;
}

export function saveValue(key, value) {
  chrome.storage.local.set({ [key]: value });
}

// Accumulate stat increments and flush in a single storage write — avoids
// per-card I/O during scans.
export function incrementStat(key, amount = 1) {
  state.pendingStats[key] = (state.pendingStats[key] || 0) + amount;
  if (!state.flushTimer) {
    state.flushTimer = setTimeout(flushStats, 500);
  }
}

function flushStats() {
  state.flushTimer = null;
  const batch = state.pendingStats;
  state.pendingStats = {};
  if (Object.keys(batch).length === 0) return;

  // Helper: re-merge `batch` back into pendingStats on failure. Without
  // this, transient storage errors silently lose every increment in the
  // batch — stats undercount in a way that's invisible until users
  // notice "Jobs Scanned" is way lower than reality.
  const reschedule = (reason) => {
    console.warn("[Sift] flushStats failed (" + reason + "); re-queueing batch");
    for (const [key, count] of Object.entries(batch)) {
      state.pendingStats[key] = (state.pendingStats[key] || 0) + count;
    }
  };

  chrome.storage.local.get({ stats: {}, statsAllTime: {} }, (d) => {
    if (chrome.runtime.lastError) {
      reschedule("storage.get: " + chrome.runtime.lastError.message);
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    if (d.stats.today !== today) d.stats = { today };
    for (const [key, count] of Object.entries(batch)) {
      d.stats[key] = (d.stats[key] || 0) + count;
      d.statsAllTime[key] = (d.statsAllTime[key] || 0) + count;
    }
    chrome.storage.local.set({ stats: d.stats, statsAllTime: d.statsAllTime }, () => {
      if (chrome.runtime.lastError) {
        reschedule("storage.set: " + chrome.runtime.lastError.message);
      }
    });
  });
}
