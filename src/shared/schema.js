// Sift storage schema — versioning, import validation, quota awareness.
// Backward-compatible: old exports without `schemaVersion` are treated as v0
// and silently migrated to the current version.

export const SCHEMA_VERSION = 1;

// chrome.storage.local quota (10 MB per extension). The numbers below come
// from the Chrome MV3 docs and are used both for the in-popup usage indicator
// and the import pre-flight check.
export const STORAGE_QUOTA_BYTES = 10 * 1024 * 1024;
// Soft warning threshold (UI turns amber).
export const STORAGE_WARN_FRACTION = 0.8;
// Hard threshold — pre-flight blocks an import that would push total usage past this.
export const STORAGE_BLOCK_FRACTION = 0.95;

// Per-key expected types. Unknown keys are PASSED THROUGH (forward-compatible
// with future versions of Sift that may introduce new settings); only known
// keys with the wrong type get rejected.
//
// Type values:
//   "boolean" / "number" / "string" — typeof match
//   "string[]"                       — Array of strings
//   "object"                         — non-null plain object
const SCHEMA_TYPES = {
  // Schema version itself
  schemaVersion: "number",

  // Feed-page toggles
  hidePromoted: "boolean",
  hideSuggested: "boolean",
  hideRecommended: "boolean",
  hideNonConnections: "boolean",
  hideSidebar: "boolean",
  hidePolls: "boolean",
  hideCelebrations: "boolean",
  feedKeywordFilterEnabled: "boolean",
  hasSeenOnboarding: "boolean",
  postAgeLimit: "number",
  feedKeywords: "string[]",

  // Profile-page toggles
  hideProfileAnalytics: "boolean",

  // Jobs-page toggles + lists
  sponsorCheckEnabled: "boolean",
  unpaidCheckEnabled: "boolean",
  autoSkipDetected: "boolean",
  dimFiltered: "boolean",
  hideFiltered: "boolean",
  skippedCompanies: "string[]",
  skippedTitleKeywords: "string[]",

  // Stats
  stats: "object",
  statsAllTime: "object",
};

function checkType(value, expected) {
  switch (expected) {
    case "boolean":
    case "number":
    case "string":
      return typeof value === expected;
    case "string[]":
      return Array.isArray(value) && value.every((v) => typeof v === "string");
    case "object":
      return value !== null && typeof value === "object" && !Array.isArray(value);
    default:
      return true;
  }
}

/**
 * Validate an imported JSON payload against the known schema.
 *
 * Returns `{ ok: true, data }` on success — `data` is the same object reference
 * (no cloning) so callers can hand it straight to `chrome.storage.local.set`.
 *
 * Returns `{ ok: false, errors }` on failure — `errors` is an array of
 * human-readable strings safe to surface in toasts / dialogs.
 */
export function validateImport(data) {
  const errors = [];

  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, errors: ["Top-level value must be an object."] };
  }

  for (const [key, expected] of Object.entries(SCHEMA_TYPES)) {
    if (!(key in data)) continue; // missing keys are fine — defaults fill in
    if (!checkType(data[key], expected)) {
      errors.push(`"${key}" should be ${humanType(expected)}, got ${humanActual(data[key])}.`);
    }
  }

  // Sanity guards on list sizes — refuse pathological imports outright.
  const MAX_LIST_LEN = 100_000;
  for (const k of ["skippedCompanies", "skippedTitleKeywords", "feedKeywords"]) {
    if (Array.isArray(data[k]) && data[k].length > MAX_LIST_LEN) {
      errors.push(`"${k}" has ${data[k].length} entries (max ${MAX_LIST_LEN}).`);
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, data };
}

function humanType(expected) {
  if (expected === "string[]") return "an array of strings";
  if (expected === "object") return "an object";
  return "a " + expected;
}

function humanActual(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return `an array (length ${value.length})`;
  return typeof value;
}

/**
 * Migrate an imported payload to the current schema version. Idempotent:
 * calling on already-current data is a no-op. Mutates and returns `data`.
 *
 * Old exports (no `schemaVersion` field) are treated as v0 and bumped to v1.
 * Future schema bumps add their own migration step here.
 */
export function migrate(data) {
  const v = typeof data.schemaVersion === "number" ? data.schemaVersion : 0;
  if (v >= SCHEMA_VERSION) return data;

  // v0 → v1: introduce the schemaVersion marker. No data shape changes since
  // v1 is just "the first version that records its version number."
  if (v < 1) {
    data.schemaVersion = 1;
  }

  return data;
}

/**
 * Approximate bytes the given object would occupy in chrome.storage.local.
 * Chrome counts the JSON-serialized length of each key + its value.
 */
export function estimateBytes(data) {
  try {
    return new Blob([JSON.stringify(data)]).size;
  } catch {
    return 0;
  }
}

/** Human-readable size string (e.g. "1.4 MB", "823 KB", "412 B"). */
export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Async helper around chrome.storage.local.getBytesInUse(null). Resolves to
 * the current total usage in bytes. Lives here so popup + background can both
 * import the same helper.
 */
export function getStorageUsage() {
  return new Promise((resolve) => {
    if (!chrome?.storage?.local?.getBytesInUse) {
      resolve(0);
      return;
    }
    chrome.storage.local.getBytesInUse(null, (bytes) => resolve(bytes || 0));
  });
}
