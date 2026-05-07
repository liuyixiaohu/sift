// Case-insensitive list helpers.
// Sift stores user-curated lists (skippedCompanies, skippedTitleKeywords,
// feedKeywords) and the same dedupe pattern was hand-rolled in 6+ places
// before this module — `.some(x => x.toLowerCase() === item.toLowerCase())`
// followed by an in-place `.push`. Centralizing makes future bugs (subtle
// case-handling, double-mutation, etc.) impossible to forget at any one site.

/** True if `list` already contains `item` (case-insensitive string compare). */
export function containsCi(list, item) {
  if (!list || typeof item !== "string") return false;
  const lower = item.toLowerCase();
  return list.some((x) => typeof x === "string" && x.toLowerCase() === lower);
}

/**
 * Push `item` to `list` if not already present (case-insensitive). Mutates the
 * list in place. Returns `true` if the item was added, `false` if it was a
 * duplicate. Successive calls in a loop dedupe against earlier additions in
 * the same loop because the list mutates as we go.
 */
export function addUnique(list, item) {
  if (containsCi(list, item)) return false;
  list.push(item);
  return true;
}

/**
 * Remove every entry that matches `item` (case-insensitive) from `list` in
 * place. Returns the number removed. Matches multiple if the list happens to
 * contain duplicates with different casing.
 */
export function removeCi(list, item) {
  if (!list || typeof item !== "string") return 0;
  const lower = item.toLowerCase();
  const before = list.length;
  for (let i = list.length - 1; i >= 0; i--) {
    if (typeof list[i] === "string" && list[i].toLowerCase() === lower) {
      list.splice(i, 1);
    }
  }
  return before - list.length;
}

// Escape regex metacharacters in a literal needle so it can be safely embedded
// in a `new RegExp(...)` pattern. Standalone so tests can reuse it if needed.
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * True if `needle` appears as a whole word in `haystack` (case-insensitive).
 *
 *   matchesWholeWord("Software Intern", "intern")     === true
 *   matchesWholeWord("Software Internship", "intern") === false
 *   matchesWholeWord("Apple Inc", "Apple")            === true
 *   matchesWholeWord("Pineapple Co", "Apple")         === false
 *
 * Multi-word needles are matched as a single unit ("Apple Inc" must appear
 * as the literal phrase). Needles may also start or end with non-word chars
 * — "C++" matches "Senior C++ Developer" — because we use lookbehind /
 * lookahead assertions instead of `\b` (which only fires at \w↔\W
 * transitions and so misses "C++" followed by whitespace).
 *
 * Note: \w uses ASCII word characters. Sift is English-LinkedIn only by
 * design (see project memory), so this is fine.
 */
export function matchesWholeWord(haystack, needle) {
  if (typeof haystack !== "string" || typeof needle !== "string") return false;
  if (haystack.length === 0 || needle.length === 0) return false;
  // (?<!\w) = not preceded by a word char (string start or non-word).
  // (?!\w)  = not followed by a word char (string end or non-word).
  return new RegExp(`(?<!\\w)${escapeRegex(needle)}(?!\\w)`, "i").test(haystack);
}

/**
 * True if any string in `list` appears as a whole word in `text`
 * (case-insensitive). Returns false on empty inputs. See matchesWholeWord
 * for boundary semantics.
 */
export function containsWordOf(text, list) {
  if (!list || list.length === 0) return false;
  if (typeof text !== "string" || text.length === 0) return false;
  return list.some((item) => matchesWholeWord(text, item));
}
