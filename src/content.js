// Sift jobs page — content script entry.
// Per-page IIFE owns: settings load, init wiring, popup ↔ page sync, route
// detection, observer attachment. All concrete logic lives in src/jobs/*.

import { isSearchPage, state } from "./jobs/state.js";
import { loadSettings } from "./jobs/storage.js";
import { filterJobCards } from "./jobs/labels.js";
import { createUI, renderLists } from "./jobs/panel.js";
import { checkDetailPanel } from "./jobs/active.js";
import {
  attachRouteHandlers,
  bootstrapJobsObserver,
} from "./jobs/observer.js";
import { saveValue } from "./jobs/storage.js";
import { showToast } from "./jobs/toast.js";

if (chrome.runtime?.id && !window.__ljContentLoaded) {
  window.__ljContentLoaded = true;

  const INIT_DELAY_MS = 1500;

  async function init() {
    if (!isSearchPage()) return;
    await loadSettings();
    createUI();
    filterJobCards();
    checkDetailPanel({ renderLists });

    if (!state.hasSeenIntro) {
      showToast("Click Scan Jobs to filter all visible listings");
      state.hasSeenIntro = true;
      saveValue("hasSeenIntro", true);
    }
  }

  if (document.readyState === "complete") {
    setTimeout(init, INIT_DELAY_MS);
  } else {
    window.addEventListener("load", () => setTimeout(init, INIT_DELAY_MS));
  }

  attachRouteHandlers({ init, renderLists });
  bootstrapJobsObserver({ renderLists });

  // ==================== Popup ↔ Page Sync ====================
  // Apply popup setting changes live. Ignore stats/statsAllTime keys to avoid
  // an incrementStat → onChanged → filterJobCards → labelCard → incrementStat loop.
  const SETTING_KEYS = [
    "siftPaused",
    "skippedCompanies",
    "skippedTitleKeywords",
    "sponsorCheckEnabled",
    "unpaidCheckEnabled",
    "autoSkipDetected",
    "dimFiltered",
    "hideFiltered",
  ];
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (!SETTING_KEYS.some((k) => k in changes)) return;

    chrome.storage.local.get(
      {
        siftPaused: false,
        skippedCompanies: [],
        skippedTitleKeywords: [],
        sponsorCheckEnabled: true,
        unpaidCheckEnabled: true,
        autoSkipDetected: false,
        dimFiltered: false,
        hideFiltered: false,
      },
      (data) => {
        const active = !data.siftPaused;
        state.skippedCompanies = data.skippedCompanies;
        state.skippedTitleKeywords = data.skippedTitleKeywords;
        state.sponsorCheckEnabled = data.sponsorCheckEnabled;
        state.unpaidCheckEnabled = data.unpaidCheckEnabled;
        state.autoSkipDetected = data.autoSkipDetected;
        // Pause suppresses the visual filter — cards keep their data-lj-reasons
        // (badges remain) but lj-card-hidden / lj-card-dimmed get cleared on
        // re-filter below. On unpause, processedCards reset lets cards re-apply.
        state.cardsDimmed = active && data.dimFiltered;
        state.cardsHidden = active && data.hideFiltered;
        renderLists();
        // Pause flipped → drop any existing dim/hide classes; filterJobCards
        // will re-apply them on unpause based on the updated state flags.
        if ("siftPaused" in changes) {
          document
            .querySelectorAll(".lj-card-hidden, .lj-card-dimmed")
            .forEach((c) => c.classList.remove("lj-card-hidden", "lj-card-dimmed"));
        }
        // Reset processed-cards so all cards get re-evaluated with new settings.
        state.processedCards = new WeakSet();
        filterJobCards();
      }
    );
  });
}
