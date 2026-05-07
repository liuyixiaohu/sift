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
