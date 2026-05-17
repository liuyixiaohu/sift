// Sift jobs page — content script entry.
// Per-page IIFE owns: settings load, init wiring, popup ↔ page sync, route
// detection, observer attachment. All concrete logic lives in src/jobs/*.

import { isSearchPage, state } from "./jobs/state.js";
import { loadSettings } from "./jobs/storage.js";
import { clearBadges, filterJobCards } from "./jobs/labels.js";
import { createUI, renderLists } from "./jobs/panel.js";
import { checkDetailPanel } from "./jobs/active.js";
import {
  attachRouteHandlers,
  bootstrapJobsObserver,
} from "./jobs/observer.js";
import { saveValue } from "./jobs/storage.js";
import { showToast } from "./jobs/toast.js";
import { JOBS_PAGE_SETTING_KEYS } from "./shared/setting-keys.js";

if (chrome.runtime?.id && !window.__ljContentLoaded) {
  window.__ljContentLoaded = true;

  const INIT_DELAY_MS = 1500;

  async function init() {
    if (!isSearchPage()) return;
    try {
      await loadSettings();
      createUI();
      filterJobCards();
      checkDetailPanel({ renderLists });

      if (!state.hasSeenIntro) {
        showToast("Click Scan Jobs to filter all visible listings");
        state.hasSeenIntro = true;
        saveValue("hasSeenIntro", true);
      }
    } catch (err) {
      // Without this catch the rejection from chrome.storage.get (or a
      // throw inside createUI / filterJobCards) becomes an unhandled
      // promise rejection. The page then looks like vanilla LinkedIn and
      // the user concludes Sift uninstalled itself. Surface it.
      console.error("[Sift] Jobs init failed:", err);
      try {
        showToast("Sift failed to load on this page — check the console");
      } catch {
        // showToast itself depends on document.body being ready; if even
        // that fails, console.error above is the floor we accept.
      }
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
  // Source of truth: src/shared/setting-keys.js — keeps feed.js and
  // content.js from drifting when a new setting is added.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (!Object.keys(changes).some((k) => JOBS_PAGE_SETTING_KEYS.has(k))) return;

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
        if (chrome.runtime.lastError) {
          console.warn(
            "[Sift] storage.get in onChanged failed:",
            chrome.runtime.lastError.message
          );
          return;
        }
        const active = !data.siftPaused;
        state.siftPaused = !!data.siftPaused;
        state.skippedCompanies = data.skippedCompanies;
        state.skippedTitleKeywords = data.skippedTitleKeywords;
        state.sponsorCheckEnabled = data.sponsorCheckEnabled;
        state.unpaidCheckEnabled = data.unpaidCheckEnabled;
        // Pause gates auto-skip; otherwise the user's skip list keeps
        // growing silently while the popup advertises "All filtering
        // suspended" — that's a quiet liar.
        state.autoSkipDetected = active && data.autoSkipDetected;
        // Pause suppresses the visual filter. labelCard short-circuits on
        // state.siftPaused so new cards stay unmarked; we tear down the
        // existing decoration below so the page reads as vanilla LinkedIn.
        state.cardsDimmed = active && data.dimFiltered;
        state.cardsHidden = active && data.hideFiltered;
        renderLists();
        if ("siftPaused" in changes && state.siftPaused) {
          // Pause just turned ON — strip every Sift-painted artifact so
          // "All filtering suspended" reads true. data-lj-reasons goes too,
          // so unpause re-detects fresh via filterJobCards below.
          document.querySelectorAll("[data-lj-reasons]").forEach((c) => {
            clearBadges(c);
            delete c.dataset.ljReasons;
            delete c.dataset.ljFiltered;
          });
          // labeledJobs is a recovery cache for DOM-replacement events;
          // dropping it forces clean re-population on unpause.
          state.labeledJobs = new Map();
        }
        if ("siftPaused" in changes) {
          // Always clear dim/hide on pause-flip (going either way) —
          // they get re-added by applyBadges on the next labelCard.
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
