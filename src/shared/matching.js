// Sift — keyword matching utilities

import { matchesWholeWord } from "./lists.js";

/**
 * Build a case-insensitive regex from an array of keyword strings.
 * Special regex characters in keywords are escaped.
 */
export function keywordsToRegex(keywords) {
  return new RegExp(keywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "i");
}

/**
 * Match modes for feed keyword filtering.
 *
 *   "wholeWord"  — default for new installs. Delegates per keyword to
 *                  `matchesWholeWord` (in lists.js) which uses
 *                  `(?<!\w)…(?!\w)` lookbehind/lookahead — correctly
 *                  handles non-word edges (hashtags like "#ai", symbols
 *                  like "c++"). "ai" matches "I work in AI." but NOT
 *                  "training" / "rain" / "fail" / "abc++d".
 *
 *   "substring"  — original behavior. Case-insensitive substring match.
 *                  Preserved as the migration target for users on
 *                  schemaVersion 1 (see schema.js#migrate) so we don't
 *                  silently change behavior under them.
 *
 *   "regex"      — each keyword is compiled as a case-insensitive regex.
 *                  Invalid patterns are skipped silently (don't break the
 *                  feed scan). For power users who want full control.
 */
export const FEED_KEYWORD_MATCH_MODES = ["wholeWord", "substring", "regex"];

/**
 * Partition a keyword list into `valid` and `invalid` for the given mode.
 *
 * Only `regex` mode has invalid forms (unterminated groups, bad escapes,
 * etc.); `wholeWord` and `substring` accept any string. Empty / whitespace-
 * only keywords are excluded from both lists (treated as "not present").
 *
 * Used by the popup to gate user input at add-time AND by the content
 * script to flag the user-error case to the diagnostic panel — so the
 * panel can stop blaming LinkedIn for a malformed regex the user typed.
 *
 * @param {string[]} keywords
 * @param {"wholeWord" | "substring" | "regex"} mode
 * @returns {{valid: string[], invalid: string[]}}
 */
export function validateKeywords(keywords, mode) {
  const out = { valid: [], invalid: [] };
  if (!Array.isArray(keywords)) return out;
  for (const kw of keywords) {
    if (typeof kw !== "string") continue;
    if (kw.trim() === "") continue;
    if (mode === "regex") {
      try {
        new RegExp(kw, "i");
        out.valid.push(kw);
      } catch {
        out.invalid.push(kw);
      }
    } else {
      out.valid.push(kw);
    }
  }
  return out;
}

/**
 * Check if text contains any of the given keywords. Returns the first matching
 * keyword, or null if none match.
 *
 * @param {string} text
 * @param {string[]} keywords
 * @param {"wholeWord" | "substring" | "regex"} [mode="substring"]
 */
export function matchesFeedKeyword(text, keywords, mode = "substring") {
  if (!keywords || keywords.length === 0) return null;

  if (mode === "regex") {
    for (const kw of keywords) {
      if (!kw) continue;
      try {
        if (new RegExp(kw, "i").test(text)) return kw;
      } catch {
        // Invalid pattern — skip rather than break the whole scan.
      }
    }
    return null;
  }

  if (mode === "wholeWord") {
    for (const kw of keywords) {
      if (kw && matchesWholeWord(text, kw)) return kw;
    }
    return null;
  }

  // mode === "substring" (legacy default; migration target for v1 users)
  const lower = text.toLowerCase();
  for (const kw of keywords) {
    if (kw && lower.includes(kw.toLowerCase())) return kw;
  }
  return null;
}

/**
 * Parse a LinkedIn visible time string (e.g. "2d", "1w", "3mo") into approximate days.
 * Returns 0 for unrecognized formats (treated as "just now").
 */
export function parsePostAgeDays(timeText) {
  const m = timeText.match(/^(\d+)\s*(m|h|d|w|mo|y|yr)$/);
  if (!m) return 0;
  const n = parseInt(m[1], 10);
  switch (m[2]) {
    case "m":
      return 0; // minutes
    case "h":
      return 0; // hours (< 1 day)
    case "d":
      return n;
    case "w":
      return n * 7;
    case "mo":
      return n * 30;
    case "y":
    case "yr":
      return n * 365;
    default:
      return 0;
  }
}
