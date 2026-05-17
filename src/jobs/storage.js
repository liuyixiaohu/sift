// chrome.storage I/O for jobs page settings + batched stat counters.

import { SIFT_DEFAULTS } from "../shared/defaults.js";
import { state } from "./state.js";

const _defaults = SIFT_DEFAULTS;

export async function loadSettings() {
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
  state.skippedCompanies = data.skippedCompanies;
  state.skippedTitleKeywords = data.skippedTitleKeywords;
  state.sponsorCheckEnabled = data.sponsorCheckEnabled;
  state.unpaidCheckEnabled = data.unpaidCheckEnabled;
  state.autoSkipDetected = data.autoSkipDetected;
  state.hasSeenIntro = data.hasSeenIntro;
  state.panelPosition = data.panelPosition;
  // Pause suppresses the visual filter; cards still get badges (data-lj-reasons)
  // so we don't lose detection state, just the dim/hide treatment.
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
  chrome.storage.local.get({ stats: {}, statsAllTime: {} }, (d) => {
    const today = new Date().toISOString().slice(0, 10);
    if (d.stats.today !== today) d.stats = { today };
    for (const [key, count] of Object.entries(batch)) {
      d.stats[key] = (d.stats[key] || 0) + count;
      d.statsAllTime[key] = (d.statsAllTime[key] || 0) + count;
    }
    chrome.storage.local.set({ stats: d.stats, statsAllTime: d.statsAllTime });
  });
}
