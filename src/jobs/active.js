// Active-card orchestration: identify which card the user is viewing,
// click into a card, run detail-panel detectors, dispatch events.

import { BADGE_DISPLAY } from "./constants.js";
import { state } from "./state.js";
import {
  clearCardTextCache,
  detailHasGoodMatch,
  detailHasNoSponsorship,
  detailHasUnpaid,
  detailPanelHasReposted,
  getCardJobId,
  getDetailFingerprint,
  getJobCards,
  getJobTitle,
  getVisibleEl,
} from "./dom.js";
import { autoSkipCompany, labelCard } from "./labels.js";
import { showToast } from "./toast.js";

// ==================== Get Currently Active Card ====================
export function getActiveCard() {
  // New tick — invalidate the per-tick cache before the per-card title scan
  // below so a card whose title just changed isn't matched against stale text.
  clearCardTextCache();
  const cards = getJobCards();
  if (cards.length === 0) return null;

  // Prefer exact match via jobId in URL (supports both link formats).
  const urlMatch = location.href.match(/currentJobId=(\d+)/);
  if (urlMatch) {
    const jobId = urlMatch[1];
    for (const card of cards) {
      if (getCardJobId(card) === jobId) return card;
    }
  }

  // Title-matching fallback:
  //   1. Exact match (identical titles) preferred
  //   2. Among substring matches, pick smallest length-diff (avoids superset mismatch)
  const detailLink = document.querySelector('a[href*="/jobs/view/"]');
  if (detailLink) {
    const detailTitle = detailLink.textContent.trim().toLowerCase();
    if (detailTitle) {
      let exactMatch = null;
      let bestCard = null;
      let bestDiff = Infinity;
      for (const card of cards) {
        const cardTitle = getJobTitle(card).toLowerCase();
        if (!cardTitle) continue;
        if (cardTitle === detailTitle) {
          exactMatch = card;
          break;
        }
        if (detailTitle.includes(cardTitle) || cardTitle.includes(detailTitle)) {
          const diff = Math.abs(cardTitle.length - detailTitle.length);
          if (diff < bestDiff) {
            bestDiff = diff;
            bestCard = card;
          }
        }
      }
      if (exactMatch) return exactMatch;
      if (bestCard) return bestCard;
    }
  }

  return null;
}

// ==================== Click Card (multi-strategy) ====================
// Priority: div[role="button"] > card link > visible child > card itself.
// display:contents elements have no layout box, so direct click() may not work.
export function clickCard(card) {
  if (!card) return;
  const roleBtn = card.querySelector('div[role="button"]');
  const link = card.querySelector("a");
  const visible = getVisibleEl(card);
  const target = roleBtn || link || (visible !== card ? visible : card);
  target.click();
  target.focus();
  target.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Enter",
      code: "Enter",
      keyCode: 13,
      bubbles: true,
      cancelable: true,
    })
  );
  target.dispatchEvent(
    new KeyboardEvent("keyup", {
      key: "Enter",
      code: "Enter",
      keyCode: 13,
      bubbles: true,
      cancelable: true,
    })
  );
}

// ==================== Detail Panel Checks ====================
// Scan path passes card reference directly (100% accurate); passive detection uses getActiveCard().
// `renderLists` is injected so labels.js can poke the panel UI without depending on it.
export function checkDetailForCard(card, { renderLists }) {
  let labeled = false;
  if (detailPanelHasReposted()) {
    labeled = labelCard(card, "reposted") || labeled;
  }
  if (state.sponsorCheckEnabled && detailHasNoSponsorship()) {
    labeled = labelCard(card, "noSponsor") || labeled;
    if (state.autoSkipDetected) autoSkipCompany(card, "noSponsor", { renderLists, showToast });
  }
  if (state.unpaidCheckEnabled && detailHasUnpaid()) {
    labeled = labelCard(card, "unpaid") || labeled;
    if (state.autoSkipDetected) autoSkipCompany(card, "unpaid", { renderLists, showToast });
  }
  if (detailHasGoodMatch()) {
    labeled = labelCard(card, "goodMatch") || labeled;
  }
  return labeled;
}

// Triggered when the user clicks a card — runs the full detection pass on
// fingerprint change, and re-evaluates only goodMatch on stable fingerprints
// (Premium "Assessing your job match" loads asynchronously after click).
export function checkDetailPanel({ renderLists }) {
  const fingerprint = getDetailFingerprint();
  if (!fingerprint) return;

  const activeCard = getActiveCard();
  if (!activeCard) return;

  if (fingerprint !== state.lastDetailText) {
    state.lastDetailText = fingerprint;
    const labeled = checkDetailForCard(activeCard, { renderLists });
    if (labeled && !state.scanning) {
      const reasons = (activeCard.dataset.ljReasons || "").split(",");
      showToast("Flagged: " + reasons.map((r) => BADGE_DISPLAY[r] || r).join(", "));
    }
    return;
  }

  // Same job still selected — re-check only goodMatch (cheap, async-loading).
  const reasons = (activeCard.dataset.ljReasons || "").split(",");
  if (!reasons.includes("goodMatch") && detailHasGoodMatch()) {
    labelCard(activeCard, "goodMatch");
    if (!state.scanning) showToast("Flagged: " + BADGE_DISPLAY.goodMatch);
  }
}
