// Card labeling: badges, border colors, filter logic, auto-skip side-effect.

import {
  BADGE_DISPLAY,
  BADGE_COLORS,
  BADGE_RED,
  BADGE_TOOLTIP,
  getBorderReason,
} from "./constants.js";
import { state } from "./state.js";
import {
  cardHasAppliedText,
  cardHasRepostedText,
  clearCardTextCache,
  getCompanyName,
  getJobCards,
  getJobKey,
  getJobTitle,
  getLastVisibleEl,
  getVisibleEl,
} from "./dom.js";
import { incrementStat, saveValue } from "./storage.js";
import { addUnique, containsCi } from "../shared/lists.js";

// ==================== Skip-list checks ====================
export function isSkippedCompany(card) {
  const name = getCompanyName(card);
  if (!name) return false;
  return containsCi(state.skippedCompanies, name);
}

export function isSkippedTitle(card) {
  if (state.skippedTitleKeywords.length === 0) return false;
  const title = getJobTitle(card).toLowerCase();
  if (!title) return false;
  return state.skippedTitleKeywords.some((kw) => title.includes(kw.toLowerCase()));
}

// ==================== Label / badge rendering ====================
export function labelCard(card, reason) {
  const existing = card.dataset.ljReasons ? card.dataset.ljReasons.split(",") : [];
  if (existing.includes(reason)) return false;

  existing.push(reason);
  card.dataset.ljReasons = existing.join(",");
  card.dataset.ljFiltered = getBorderReason(existing);

  // Store in memory so badges can be restored after LinkedIn replaces the DOM.
  const key = getJobKey(card);
  if (key) {
    if (!state.labeledJobs.has(key)) state.labeledJobs.set(key, new Set());
    state.labeledJobs.get(key).add(reason);
  }

  applyBadges(card);
  incrementStat("jobsFlagged");
  return true;
}

export function clearBadges(card) {
  const target = getVisibleEl(card);
  const badgeTarget = getLastVisibleEl(card);
  card.querySelectorAll(".lj-badges").forEach((b) => b.remove());
  for (const el of [target, badgeTarget]) {
    if (el !== card) {
      el.querySelectorAll(".lj-badges").forEach((b) => b.remove());
      el.style.borderLeft = "";
      el.style.position = "";
      el.style.overflow = "";
    }
  }
}

// Badges and borders are inserted into the visible child (getVisibleEl) to
// avoid display:contents invisibility. Multiple badges stack vertically.
export function applyBadges(card) {
  const reasons = card.dataset.ljReasons ? card.dataset.ljReasons.split(",") : [];
  if (reasons.length === 0) return;

  const target = getVisibleEl(card);
  const badgeTarget = getLastVisibleEl(card);

  // Already has correct badges → skip (cheap idempotency guard).
  const existing = badgeTarget.querySelector(".lj-badges");
  if (existing && existing.dataset.r === card.dataset.ljReasons) return;

  clearBadges(card);

  // Border color follows the highest-priority reason (negative wins over goodMatch).
  const borderReason = getBorderReason(reasons);
  const borderColor = BADGE_COLORS[borderReason] || BADGE_RED;

  target.style.position = "relative";
  target.style.overflow = "visible";
  target.style.borderLeft = "3px solid " + borderColor;

  if (badgeTarget !== target) {
    badgeTarget.style.position = "relative";
    badgeTarget.style.overflow = "visible";
    badgeTarget.style.borderLeft = "3px solid " + borderColor;
  }

  const container = document.createElement("div");
  container.className = "lj-badges";
  container.dataset.r = card.dataset.ljReasons;

  reasons.forEach((reason) => {
    const badge = document.createElement("span");
    badge.className = "lj-badge";
    badge.textContent = BADGE_DISPLAY[reason] || reason;
    badge.style.background = BADGE_COLORS[reason] || BADGE_RED;
    const tip = BADGE_TOOLTIP[reason];
    if (tip) badge.title = tip;
    container.appendChild(badge);
  });

  badgeTarget.appendChild(container);

  // Auto-dim or hide newly labeled cards.
  if (state.cardsHidden) target.classList.add("lj-card-hidden");
  else if (state.cardsDimmed) target.classList.add("lj-card-dimmed");
}

// Restore badges that LinkedIn DOM-replaced.
export function refreshBadges() {
  // Reset per-tick text cache: getJobKey below calls getJobTitle/getCompanyName,
  // and we want those to reflect any DOM replacement that triggered this pass.
  clearCardTextCache();
  // 1. data attribute present but badge DOM missing → re-insert.
  document.querySelectorAll("[data-lj-reasons]").forEach((card) => {
    const badgeTarget = getLastVisibleEl(card);
    const existing = badgeTarget.querySelector(".lj-badges");
    if (!existing || existing.dataset.r !== card.dataset.ljReasons) {
      applyBadges(card);
    }
  });

  // 2. data attribute also lost (DOM element fully replaced) → restore from memory.
  if (state.labeledJobs.size > 0) {
    getJobCards().forEach((card) => {
      if (card.dataset.ljReasons) return;
      const key = getJobKey(card);
      const reasons = state.labeledJobs.get(key);
      if (!reasons || reasons.size === 0) return;
      const arr = [...reasons];
      card.dataset.ljReasons = arr.join(",");
      card.dataset.ljFiltered = getBorderReason(arr);
      applyBadges(card);
      state.processedCards.add(card); // prevent filterJobCards from re-labeling
    });
  }
}

// ==================== Filtering passes ====================
export function filterJobCards() {
  // Reset the per-tick getCardTextLines cache so any DOM changes since the
  // last pass are picked up; cache hits within this tick avoid repeat innerText reads.
  clearCardTextCache();
  const cards = getJobCards();
  cards.forEach((card) => {
    // These checks bypass processedCards — text may render late or settings may change.
    if (!card.dataset.ljReasons?.includes("applied") && cardHasAppliedText(card)) {
      labelCard(card, "applied");
    }
    if (!card.dataset.ljReasons?.includes("skippedCompany") && isSkippedCompany(card)) {
      labelCard(card, "skippedCompany");
    }
    if (!card.dataset.ljReasons?.includes("skippedTitle") && isSkippedTitle(card)) {
      labelCard(card, "skippedTitle");
    }

    if (state.processedCards.has(card)) return;
    state.processedCards.add(card);

    if (cardHasRepostedText(card)) labelCard(card, "reposted");
  });
}

export function refilterAll() {
  clearCardTextCache();
  const cards = getJobCards();
  cards.forEach((card) => {
    if (isSkippedCompany(card)) labelCard(card, "skippedCompany");
    if (isSkippedTitle(card)) labelCard(card, "skippedTitle");
  });
}

// Auto-add a company to skippedCompanies (on detection of noSponsor / unpaid
// when the toggle is on). De-dupes case-insensitively, persists, re-filters,
// and toasts. The renderLists/showToast callers come from panel.js and are
// passed in to break the dom→labels→panel cycle.
export function autoSkipCompany(card, triggerReason, { renderLists, showToast }) {
  const name = getCompanyName(card);
  if (!name) return;
  if (!addUnique(state.skippedCompanies, name)) return;
  saveValue("skippedCompanies", state.skippedCompanies);
  renderLists();
  refilterAll();
  showToast("Auto-skipped: " + name + " (" + (BADGE_DISPLAY[triggerReason] || triggerReason) + ")");
}
