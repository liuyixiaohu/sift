// Read-only DOM extraction for the jobs page.
// All functions here READ the DOM — none mutate it. (Mutations live in labels.js.)

import { BADGE_DISPLAY, NO_SPONSOR_RE, UNPAID_RE, GOOD_MATCH_RE } from "./constants.js";

// ==================== Card Detection (Core) ====================
// Returns each card's scope element (may be display:contents, contains full text for detection).
// Badge display uses getVisibleEl() to find a visible child element.
export function getJobCards() {
  const dismissBtns = document.querySelectorAll('button[aria-label*="Dismiss"]');
  if (dismissBtns.length < 2) return [];

  const cards = [];
  const seen = new WeakSet();

  dismissBtns.forEach((btn) => {
    let e = btn.parentElement;
    for (let i = 0; i < 12; i++) {
      if (!e || !e.parentElement) break;
      const parentDismissCount = e.parentElement.querySelectorAll(
        'button[aria-label*="Dismiss"]'
      ).length;
      if (parentDismissCount > 1) {
        if (!seen.has(e)) {
          seen.add(e);
          cards.push(e);
        }
        break;
      }
      e = e.parentElement;
    }
  });

  return cards;
}

// Find the card's first visible child element (for badge/border display).
// display:contents elements have no dimensions — find the first descendant with a layout box.
export function getVisibleEl(card) {
  if (getComputedStyle(card).display !== "contents") return card;
  for (const child of card.children) {
    const d = getComputedStyle(child).display;
    if (d !== "contents" && d !== "none") return child;
  }
  // Nested display:contents — go one level deeper.
  for (const child of card.children) {
    for (const gc of child.children) {
      const d = getComputedStyle(gc).display;
      if (d !== "contents" && d !== "none") return gc;
    }
  }
  return card;
}

// Find the LAST visible child — used for badge placement so badges anchor to the
// visual bottom of display:contents cards (where children are laid out independently).
export function getLastVisibleEl(card) {
  if (getComputedStyle(card).display !== "contents") return card;
  const children = [...card.children];
  for (let i = children.length - 1; i >= 0; i--) {
    const d = getComputedStyle(children[i]).display;
    if (d !== "contents" && d !== "none") return children[i];
  }
  return getVisibleEl(card);
}

// ==================== Card Identity ====================
// LinkedIn uses two link formats:
//   1. /jobs/view/12345  (legacy/detail page)
//   2. /jobs/search-results/?currentJobId=12345  (search results page)
export function getCardJobId(card) {
  const links = card.querySelectorAll("a");
  for (const link of links) {
    const viewMatch = link.href.match(/\/jobs\/view\/(\d+)/);
    if (viewMatch) return viewMatch[1];
    try {
      const u = new URL(link.href);
      const id = u.searchParams.get("currentJobId");
      if (id) return id;
    } catch {
      // Malformed URL — silent fallthrough is intentional.
    }
  }
  return null;
}

export function getJobKey(card) {
  const id = getCardJobId(card);
  if (id) return "id:" + id;
  // Fallback: title + company (rare case where card has no link).
  return getJobTitle(card) + "|" + getCompanyName(card);
}

// ==================== Card Title + Company ====================
// Pull the title out of the dismiss button's aria-label ("Dismiss <title> job").
// Most reliable signal in a job card — used as an anchor by both the title and
// company extractors below. Returns "" if not found (non-English locale, format
// change, etc.) so callers can fall back to a heuristic.
export function titleFromDismissButton(card) {
  const btn = card.querySelector('button[aria-label*="Dismiss"]');
  if (!btn) return "";
  const m = (btn.getAttribute("aria-label") || "").match(/^Dismiss\s+(.+?)\s+job$/);
  return m ? m[1] : "";
}

export function getJobTitle(card) {
  const fromDismiss = titleFromDismissButton(card);
  if (fromDismiss) return fromDismiss;
  const lines = getCardTextLines(card);
  return lines[1] || lines[0] || "";
}

// Anchors on the dismiss-button title and returns the line right after it.
// Uses lastIndexOf because LinkedIn renders the title twice in card.innerText
// for Promoted / sponsored listings (a screen-reader span + the visible link),
// so the company is on the line after the *last* title occurrence — not after
// the first. Falls back to a legacy line-index heuristic when the dismiss
// button isn't parseable (e.g. non-English locales).
export function getCompanyName(card) {
  const lines = getCardTextLines(card);
  const title = titleFromDismissButton(card);
  if (title) {
    const idx = lines.lastIndexOf(title);
    if (idx >= 0 && idx + 1 < lines.length) return lines[idx + 1];
  }
  if (lines.length >= 3) {
    if (lines[0].includes("(Verified")) return lines[2] || "";
    return lines[1] || "";
  }
  return lines.length >= 2 ? lines[1] : "";
}

// Filter out injected badge text to avoid interfering with title/company detection.
const BADGE_TEXTS = new Set(Object.values(BADGE_DISPLAY));

// Per-tick memo for getCardTextLines. innerText forces a layout, and a single
// filterJobCards / getActiveCard pass invokes getJobTitle + getCompanyName per
// card (often via getJobKey too) — without this cache that's ~3 innerText reads
// per card per tick. Callers that start a new tick (filterJobCards, refilterAll,
// getActiveCard, refreshBadges, scan loop) call clearCardTextCache() first.
let cardTextLinesCache = new WeakMap();

export function clearCardTextCache() {
  cardTextLinesCache = new WeakMap();
}

export function getCardTextLines(card) {
  if (cardTextLinesCache.has(card)) return cardTextLinesCache.get(card);
  const lines = card.innerText
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && l !== "·" && !BADGE_TEXTS.has(l));
  cardTextLinesCache.set(card, lines);
  return lines;
}

// ==================== Card Text Detectors ====================
export function cardHasRepostedText(card) {
  return card.textContent.toLowerCase().includes("reposted");
}

// Searches leaf DOM elements for textContent === "Applied".
// Avoids innerText which CSS can merge siblings into one line ("Applied · 1 week ago · Easy Apply").
// Also naturally excludes company names like "Applied Materials" (textContent !== "Applied").
export function cardHasAppliedText(card) {
  // LinkedIn renders "Applied" as a leaf <span> or <li> inside job card metadata.
  for (const el of card.querySelectorAll("span, li, time, p")) {
    if (
      el.children.length === 0 &&
      el.textContent.trim() === "Applied" &&
      !el.closest(".lj-badges")
    ) {
      return true;
    }
  }
  return false;
}

// ==================== Detail Panel ====================
export function detailPanelHasReposted() {
  // "Reposted" appears near the top of the detail panel in a <strong> or <span>.
  const detail =
    document.querySelector(".jobs-details") || document.querySelector("article") || document.body;
  const candidates = detail.querySelectorAll("strong, span");
  for (const node of candidates) {
    if (node.children.length > 0) continue;
    const t = node.textContent.trim();
    if (t.length > 0 && t.length < 80 && t.toLowerCase().startsWith("reposted")) {
      if (!node.closest("#lj-filter-panel") && !node.closest(".lj-badges")) return true;
    }
  }
  return false;
}

export function getDetailText() {
  const headings = document.querySelectorAll("h2");
  for (const h of headings) {
    if (h.textContent.includes("About the job")) {
      const wrapper = h.parentElement;
      let text = "";
      let sibling = wrapper?.nextElementSibling;
      let sibCount = 0;
      const MAX_SIBLINGS = 15;
      while (sibling && sibCount < MAX_SIBLINGS) {
        text += " " + sibling.textContent;
        sibling = sibling.nextElementSibling;
        sibCount++;
        if (sibling && sibling.querySelector && sibling.querySelector("h2")) break;
      }
      if (text.length > 0) return text;
    }
  }
  const article = document.querySelector("article");
  return article ? article.textContent : "";
}

export function detailHasNoSponsorship() {
  return NO_SPONSOR_RE.test(getDetailText());
}
export function detailHasUnpaid() {
  return UNPAID_RE.test(getDetailText());
}

// LinkedIn Premium's "Assessing your job match" panel announces the match tier
// in a single leaf <p>. We detect the HIGH tier only — the unique substring is
// "match the required qualifications well". The match panel lives outside
// "About the job" (its own <h2>), so getDetailText() can't see it — we scope a
// small <p> scan to <main>/<article>. Note: the Premium panel loads
// asynchronously (~5–8 s) after click, so checkDetailPanel() must re-evaluate
// goodMatch on later mutations even when the panel fingerprint is stable.
export function detailHasGoodMatch() {
  const ps = document.querySelectorAll("main p, article p");
  for (const p of ps) {
    if (p.children.length > 0) continue;
    const t = p.textContent;
    if (t.length < 30) continue;
    if (GOOD_MATCH_RE.test(t)) return true;
  }
  return false;
}

export function getDetailFingerprint() {
  const titleLink = document.querySelector('a[href*="/jobs/view/"]');
  if (titleLink) {
    const text = titleLink.textContent.trim();
    if (text.length > 3) return text;
  }
  const text = getDetailText();
  return text ? text.trim().substring(0, 200) : "";
}
