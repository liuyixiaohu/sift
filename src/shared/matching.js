// Sift — keyword matching utilities

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
 *   "wholeWord"  — default for new installs. Wraps each keyword in `\b`
 *                  boundaries, so "ai" matches "I work in AI." but NOT
 *                  "training", "rain", "fail". Avoids the bulk of false
 *                  positives users hit with substring mode. Edge cases
 *                  (hashtags like "#ai", symbols like "c++") fall through
 *                  to substring for that keyword since `\b` doesn't
 *                  recognize non-word characters as boundaries.
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

// `\b` only marks transitions between word chars [a-zA-Z0-9_] and non-word
// chars. A keyword starting/ending with a non-word char (e.g. "#ai", "c++")
// won't behave intuitively — for those, fall back to substring on a
// per-keyword basis so the user's keyword still does something useful.
function startsWithWordChar(s) {
  return /^\w/.test(s);
}
function endsWithWordChar(s) {
  return /\w$/.test(s);
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

  const lower = text.toLowerCase();

  if (mode === "wholeWord") {
    for (const kw of keywords) {
      if (!kw) continue;
      const prefix = startsWithWordChar(kw) ? "\\b" : "";
      const suffix = endsWithWordChar(kw) ? "\\b" : "";
      // Both ends non-word → no `\b` wrapper would apply, so fall back to
      // case-insensitive substring (current behavior for hashtags etc.).
      if (!prefix && !suffix) {
        if (lower.includes(kw.toLowerCase())) return kw;
        continue;
      }
      try {
        if (new RegExp(prefix + escapeRegex(kw) + suffix, "i").test(text)) return kw;
      } catch {
        if (lower.includes(kw.toLowerCase())) return kw;
      }
    }
    return null;
  }

  // mode === "substring" (legacy default; migration target for v1 users)
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
