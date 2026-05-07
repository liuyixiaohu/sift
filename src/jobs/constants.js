// Sift jobs page — static configuration.
// Pure data + a small pure function (getBorderReason). No DOM, no chrome APIs.

import { keywordsToRegex } from "../shared/matching.js";

// Detail-text keyword lists for the No Sponsor / Unpaid detectors.
export const NO_SPONSOR_KEYWORDS = [
  "does not sponsor",
  "do not sponsor",
  "not sponsor",
  "no sponsorship",
  "unable to sponsor",
  "will not sponsor",
  "cannot sponsor",
  "won't sponsor",
  "can't sponsor",
  "doesn't sponsor",
  "not able to sponsor",
  "without sponsorship",
  "sponsorship is not available",
  "not offer sponsorship",
  "not provide sponsorship",
  "sponsorship not available",
  "not eligible for sponsorship",
  "no visa sponsorship",
  "not offering sponsorship",
  "unable to provide sponsorship",
  "we are unable to sponsor",
  "we do not offer sponsorship",
  "must be authorized to work",
  "must have authorization to work",
  "without the need for sponsorship",
  "without requiring sponsorship",
];
export const NO_SPONSOR_RE = keywordsToRegex(NO_SPONSOR_KEYWORDS);

export const UNPAID_KEYWORDS = [
  "unpaid",
  "unpaid internship",
  "unpaid position",
  "no compensation",
  "without compensation",
  "uncompensated",
  "volunteer position",
  "volunteer opportunity",
  "volunteer role",
  "pro bono",
  "this is a volunteer",
];
export const UNPAID_RE = keywordsToRegex(UNPAID_KEYWORDS);

// LinkedIn Premium "Assessing your job match" — HIGH tier verbiage.
// See learning_verify_dom_before_fix memory + PR #30 for the live-DOM verification.
export const GOOD_MATCH_RE = /match the required qualifications well/i;

// Badge display names (rendered text on each pill).
export const BADGE_DISPLAY = {
  reposted: "Reposted",
  applied: "Applied",
  noSponsor: "No Sponsor",
  skippedCompany: "Skipped Co.",
  skippedTitle: "Skipped Title",
  unpaid: "Unpaid",
  goodMatch: "Good Match",
};

// Per-reason colors. Negative signals share the brand rose; positive signals (goodMatch) use brand green.
export const BADGE_RED = "#D9797B";
export const BADGE_GREEN = "#5a8a6e";
export const BADGE_COLORS = {
  reposted: BADGE_RED,
  applied: BADGE_RED,
  noSponsor: BADGE_RED,
  skippedCompany: BADGE_RED,
  skippedTitle: BADGE_RED,
  unpaid: BADGE_RED,
  goodMatch: BADGE_GREEN,
};

// Hover tooltip text per reason. Empty = no tooltip.
export const BADGE_TOOLTIP = {
  goodMatch: "Job match is high, review match details",
};

// Border color priority — first matching reason determines the card's left-border color.
// goodMatch is at the end so any negative signal still owns the border.
export const BORDER_PRIORITY = [
  "noSponsor",
  "reposted",
  "skippedCompany",
  "skippedTitle",
  "applied",
  "unpaid",
  "goodMatch",
];

export function getBorderReason(reasons) {
  for (const r of BORDER_PRIORITY) {
    if (reasons.includes(r)) return r;
  }
  return reasons[0];
}

// Auto-scan delay between cards (ms). LinkedIn rate-limits parallel detail loads.
export const SCAN_DELAY_MS = 1500;
