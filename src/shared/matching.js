// Sift — keyword matching utilities

/**
 * Build a case-insensitive regex from an array of keyword strings.
 * Special regex characters in keywords are escaped.
 */
export function keywordsToRegex(keywords) {
  return new RegExp(
    keywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"),
    "i"
  );
}

/**
 * Check if text contains any of the given keywords (case-insensitive substring match).
 * Returns the first matching keyword, or null if none match.
 */
export function matchesFeedKeyword(text, keywords) {
  if (!keywords || keywords.length === 0) return null;
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
    case "m": return 0;          // minutes
    case "h": return 0;          // hours (< 1 day)
    case "d": return n;
    case "w": return n * 7;
    case "mo": return n * 30;
    case "y": case "yr": return n * 365;
    default: return 0;
  }
}
