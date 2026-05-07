import { describe, it, expect } from "vitest";
import {
  estimateBytes,
  formatBytes,
  migrate,
  SCHEMA_VERSION,
  validateImport,
} from "../src/shared/schema.js";

describe("validateImport", () => {
  it("accepts a fully-typed payload (current schema)", () => {
    const data = {
      schemaVersion: 1,
      hidePromoted: true,
      skippedCompanies: ["Acme", "Initech"],
      skippedTitleKeywords: ["intern"],
      feedKeywords: [],
      stats: { today: "2026-04-01", adsHidden: 5 },
      statsAllTime: { adsHidden: 10 },
    };
    const result = validateImport(data);
    expect(result.ok).toBe(true);
    expect(result.data).toBe(data);
  });

  it("accepts a legacy payload without schemaVersion (backward compat)", () => {
    // What an export from before this PR looked like.
    const legacy = {
      hidePromoted: true,
      hideSuggested: true,
      skippedCompanies: ["Acme"],
      stats: { today: "2025-12-01" },
      statsAllTime: {},
    };
    const result = validateImport(legacy);
    expect(result.ok).toBe(true);
  });

  it("accepts payloads with unknown keys (forward-compatible)", () => {
    // A future Sift version might add new settings; we shouldn't reject them.
    const future = {
      schemaVersion: 1,
      newFutureToggle: true,
      anotherNewThing: { foo: "bar" },
    };
    const result = validateImport(future);
    expect(result.ok).toBe(true);
  });

  it("rejects null", () => {
    expect(validateImport(null).ok).toBe(false);
  });

  it("rejects arrays at the top level", () => {
    expect(validateImport([1, 2, 3]).ok).toBe(false);
  });

  it("rejects strings at the top level", () => {
    expect(validateImport("hello").ok).toBe(false);
  });

  it("reports a wrong-type boolean field", () => {
    const result = validateImport({ hidePromoted: "yes" });
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatch(/hidePromoted/);
    expect(result.errors[0]).toMatch(/boolean/);
  });

  it("reports skippedCompanies that isn't a string array", () => {
    const result = validateImport({ skippedCompanies: [1, 2, "Acme"] });
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatch(/skippedCompanies/);
    expect(result.errors[0]).toMatch(/array of strings/);
  });

  it("reports stats that isn't an object", () => {
    const result = validateImport({ stats: 42 });
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatch(/stats/);
    expect(result.errors[0]).toMatch(/object/);
  });

  it("rejects pathologically large list payloads", () => {
    const oversized = {
      skippedCompanies: Array.from({ length: 100_001 }, (_, i) => "Company " + i),
    };
    const result = validateImport(oversized);
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatch(/skippedCompanies/);
    expect(result.errors[0]).toMatch(/100000/);
  });

  it("collects multiple errors when several fields are wrong", () => {
    const broken = {
      hidePromoted: "yes",
      skippedCompanies: 5,
      stats: "nope",
    };
    const result = validateImport(broken);
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBe(3);
  });
});

describe("migrate", () => {
  it("adds schemaVersion to legacy payloads (v0 → current)", () => {
    const legacy = { hidePromoted: true };
    const migrated = migrate(legacy);
    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
    expect(migrated.hidePromoted).toBe(true);
  });

  it("is a no-op when already at current version", () => {
    const data = { schemaVersion: SCHEMA_VERSION, hidePromoted: true };
    const before = JSON.stringify(data);
    const migrated = migrate(data);
    expect(JSON.stringify(migrated)).toBe(before);
  });

  it("is idempotent — calling twice yields the same result", () => {
    const legacy = { hidePromoted: true };
    const once = migrate({ ...legacy });
    const twice = migrate(migrate({ ...legacy }));
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
  });

  it("doesn't downgrade a future-versioned payload", () => {
    // If a user imports an export from a future Sift version, leave the
    // version marker alone — destructive downgrade would be worse than
    // running with stale code.
    const future = { schemaVersion: SCHEMA_VERSION + 99, hidePromoted: true };
    const migrated = migrate(future);
    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION + 99);
  });
});

describe("estimateBytes / formatBytes", () => {
  it("estimates JSON-serialized byte count", () => {
    expect(estimateBytes({})).toBeGreaterThan(0);
    expect(estimateBytes({ a: "x" })).toBeLessThan(estimateBytes({ a: "x".repeat(100) }));
  });

  it("formats bytes into human-readable units", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(1024 * 1024)).toBe("1.00 MB");
    expect(formatBytes(2.5 * 1024 * 1024)).toBe("2.50 MB");
  });

  it("handles weird inputs gracefully", () => {
    expect(formatBytes(-1)).toBe("—");
    expect(formatBytes(NaN)).toBe("—");
    expect(formatBytes(Infinity)).toBe("—");
  });
});
