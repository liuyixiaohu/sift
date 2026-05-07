// Auto-scan loop. Click each unevaluated card, wait for the detail panel to
// load, run detection, repeat. Sequential (not parallel) because LinkedIn
// throttles concurrent detail-panel loads.

import { SCAN_DELAY_MS } from "./constants.js";
import { state } from "./state.js";
import { getDetailFingerprint, getJobCards } from "./dom.js";
import { checkDetailForCard, clickCard } from "./active.js";
import { refreshBadges } from "./labels.js";
import { incrementStat } from "./storage.js";
import { showToast } from "./toast.js";

const DETAIL_LOAD_WAIT_MS = 5000;
const POST_LOAD_SETTLE_MS = 500;
const POST_SCAN_REFRESH_MS = 500;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Resolve when the detail-panel fingerprint changes from `oldFingerprint`,
// or after `timeoutMs`. Uses MutationObserver scoped to <main>.
function waitForDetailChange(oldFingerprint, timeoutMs = DETAIL_LOAD_WAIT_MS) {
  return new Promise((resolve) => {
    const detailContainer = document.querySelector("main") || document.body;

    let settled = false;
    function settle() {
      if (settled) return;
      settled = true;
      observer.disconnect();
      clearTimeout(timeout);
      resolve();
    }

    const observer = new MutationObserver(() => {
      const current = getDetailFingerprint();
      if (current && current !== oldFingerprint) settle();
    });

    observer.observe(detailContainer, { childList: true, subtree: true, characterData: true });

    const timeout = setTimeout(settle, timeoutMs);

    // Check once immediately in case the change already happened.
    const current = getDetailFingerprint();
    if (current && current !== oldFingerprint) settle();
  });
}

export async function autoScanCards({ renderLists }) {
  if (state.scanning) {
    state.scanAbort = true;
    return;
  }
  state.scanning = true;
  state.scanAbort = false;

  try {
    const cards = getJobCards();
    const toScan = cards.filter((c) => !state.scannedCards.has(c) && !c.dataset.ljReasons);
    const total = toScan.length;
    updateScanButton("Scanning 0/" + total + "...", 0);

    for (let i = 0; i < toScan.length; i++) {
      if (state.scanAbort) break;
      const card = toScan[i];
      if (card.dataset.ljReasons) continue;

      updateScanButton("Scanning " + (i + 1) + "/" + total + "...", ((i + 1) / total) * 100);

      const oldFp = getDetailFingerprint();
      clickCard(card);

      await waitForDetailChange(oldFp);
      await sleep(POST_LOAD_SETTLE_MS);

      // Detect using card reference directly (bypasses getActiveCard match logic).
      checkDetailForCard(card, { renderLists });
      state.scannedCards.add(card);

      if (i < toScan.length - 1 && !state.scanAbort) {
        await sleep(SCAN_DELAY_MS);
      }
    }
  } catch (err) {
    console.error("[Sift] Scan error:", err);
    showToast("Scan error: " + err.message);
  }

  state.scanning = false;
  state.scanAbort = false;

  // Restore lost badges after scan completes (LinkedIn may re-render cards mid-scan).
  setTimeout(refreshBadges, POST_SCAN_REFRESH_MS);

  const flagged = getJobCards().filter((c) => c.dataset.ljReasons).length;
  showScanDone(flagged);
  let total = 0;
  try {
    total = getJobCards().filter((c) => state.scannedCards.has(c)).length;
  } catch {
    // Defensive — getJobCards rare race during teardown.
  }
  if (total > 0) incrementStat("jobsScanned", total);
}

export function updateScanButton(text, progress) {
  const btn = state.ui.scanBtn;
  if (!btn) return;
  btn.classList.remove("scan-done");
  if (state.scanning && !state.scanAbort) {
    btn.textContent = text || "Stop Scan";
    btn.classList.add("scanning");
    let bar = btn.querySelector(".lj-scan-progress");
    if (!bar) {
      bar = document.createElement("div");
      bar.className = "lj-scan-progress";
      btn.appendChild(bar);
    }
    bar.style.width = (progress || 0) + "%";
  } else {
    btn.textContent = "Scan Jobs";
    btn.classList.remove("scanning");
    const bar = btn.querySelector(".lj-scan-progress");
    if (bar) bar.remove();
  }
}

export function showScanDone(flagged) {
  const btn = state.ui.scanBtn;
  if (!btn) return;
  btn.classList.remove("scanning");
  btn.classList.add("scan-done");
  const bar = btn.querySelector(".lj-scan-progress");
  if (bar) bar.remove();
  btn.textContent =
    flagged === 0 ? "Scan complete — all clear" : "Scan complete — " + flagged + " flagged";
}
