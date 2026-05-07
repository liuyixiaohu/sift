// SPA route detection (History API hooks + URL polling fallback) and the
// debounced MutationObserver that drives filterJobCards / checkDetailPanel /
// refreshBadges.

import { isSearchPage, state } from "./state.js";
import { filterJobCards, refreshBadges } from "./labels.js";
import { checkDetailPanel } from "./active.js";
import { updateScanButton } from "./scan.js";
import { sendBadgeCount } from "../shared/badge.js";

const URL_POLL_INTERVAL_MS = 1000; // belt-and-suspenders fallback for Navigation API
const ROUTE_INIT_DELAY_MS = 2000;
const FILTER_DEBOUNCE_MS = 200;
const DETAIL_DEBOUNCE_MS = 600;
const BADGE_DEBOUNCE_MS = 1000;
const BOOT_POLL_INTERVAL_MS = 500;
const BOOT_POLL_MAX_TICKS = 15;

// Wires SPA navigation handling. `init` and `renderLists` come from the entry
// (content.js) — this module shouldn't import the entry to avoid a cycle.
export function attachRouteHandlers({ init, renderLists }) {
  function handleRouteChange() {
    if (location.href === state.lastUrl) return;
    state.lastUrl = location.href;
    const onSearch = isSearchPage();
    if (onSearch && !state.scanning) {
      // Search page route change → reset state and re-initialize.
      state.processedCards = new WeakSet();
      state.scannedCards = new WeakSet();
      state.labeledJobs.clear();
      state.scanAbort = false;
      state.lastDetailText = "";
      updateScanButton();
      setTimeout(() => {
        if (!document.getElementById("lj-filter-panel")) init();
        else filterJobCards();
        attachJobsObserver({ renderLists });
      }, ROUTE_INIT_DELAY_MS);
    } else if (!onSearch) {
      const panel = document.getElementById("lj-filter-panel");
      if (panel) panel.remove();
      sendBadgeCount(0);
    }
  }

  // Detect SPA navigation via History API + popstate.
  window.addEventListener("popstate", handleRouteChange);
  const origPushState = history.pushState;
  const origReplaceState = history.replaceState;
  history.pushState = function () {
    origPushState.apply(this, arguments);
    handleRouteChange();
  };
  history.replaceState = function () {
    origReplaceState.apply(this, arguments);
    handleRouteChange();
  };
  // Fallback: poll for URL changes (catches Navigation API, link clicks, etc.).
  setInterval(() => {
    if (location.href !== state.lastUrl) handleRouteChange();
  }, URL_POLL_INTERVAL_MS);
}

function onJobsMutation({ renderLists }) {
  if (!isSearchPage()) return;
  // Card filtering (200ms debounce).
  clearTimeout(state.filterTimer);
  state.filterTimer = setTimeout(filterJobCards, FILTER_DEBOUNCE_MS);
  // Detail panel detection (600ms debounce).
  clearTimeout(state.detailTimer);
  state.detailTimer = setTimeout(() => checkDetailPanel({ renderLists }), DETAIL_DEBOUNCE_MS);
  // Badge restoration (1s independent debounce).
  clearTimeout(state.badgeTimer);
  state.badgeTimer = setTimeout(refreshBadges, BADGE_DEBOUNCE_MS);
}

export function attachJobsObserver({ renderLists }) {
  if (state.jobsObserver) state.jobsObserver.disconnect();
  state.jobsObserver = new MutationObserver(() => onJobsMutation({ renderLists }));

  // Narrow target: jobs list container → <main> (never body — causes freeze).
  const container =
    document.querySelector(".jobs-search-results-list") || document.querySelector("main");
  if (!container) return;

  state.jobsObserver.observe(container, { childList: true, subtree: true });

  // If we attached to a narrow container, also watch <main> for the detail
  // panel which lives outside the results list but inside <main>.
  if (container.classList.contains("jobs-search-results-list")) {
    const main = document.querySelector("main");
    if (main && main !== container) {
      state.jobsObserver.observe(main, { childList: true, subtree: true });
    }
  }
}

// Entry-side bootstrap helper. Polls for the jobs container if it isn't ready
// at script start (avoids wide MutationObservers on body which freeze the page).
export function bootstrapJobsObserver({ renderLists }) {
  if (document.querySelector("main") || document.querySelector(".jobs-search-results-list")) {
    attachJobsObserver({ renderLists });
    return;
  }
  let bootTicks = 0;
  const bootPoll = setInterval(() => {
    if (document.querySelector("main") || document.querySelector(".jobs-search-results-list")) {
      clearInterval(bootPoll);
      attachJobsObserver({ renderLists });
    } else if (++bootTicks >= BOOT_POLL_MAX_TICKS) {
      clearInterval(bootPoll);
    }
  }, BOOT_POLL_INTERVAL_MS);
}
