import { describe, it, expect } from "vitest";
import { addUnique, containsCi, removeCi } from "../src/shared/lists.js";

describe("containsCi", () => {
  it("matches case-insensitively", () => {
    expect(containsCi(["Acme", "Initech"], "acme")).toBe(true);
    expect(containsCi(["Acme", "Initech"], "INITECH")).toBe(true);
    expect(containsCi(["Acme"], "Stark")).toBe(false);
  });

  it("returns false for empty / null inputs", () => {
    expect(containsCi([], "Acme")).toBe(false);
    expect(containsCi(null, "Acme")).toBe(false);
    expect(containsCi(undefined, "Acme")).toBe(false);
  });

  it("returns false when item is not a string", () => {
    expect(containsCi(["Acme"], 42)).toBe(false);
    expect(containsCi(["Acme"], null)).toBe(false);
    expect(containsCi(["Acme"], undefined)).toBe(false);
  });

  it("ignores non-string entries inside the list", () => {
    expect(containsCi([null, 42, "Acme"], "acme")).toBe(true);
  });
});

describe("addUnique", () => {
  it("adds a new item and returns true", () => {
    const list = ["Acme"];
    expect(addUnique(list, "Initech")).toBe(true);
    expect(list).toEqual(["Acme", "Initech"]);
  });

  it("rejects a duplicate (case-insensitive) and returns false", () => {
    const list = ["Acme"];
    expect(addUnique(list, "acme")).toBe(false);
    expect(list).toEqual(["Acme"]);
  });

  it("preserves the original casing of the first inserted entry", () => {
    const list = [];
    addUnique(list, "Acme");
    addUnique(list, "ACME");
    addUnique(list, "acme");
    expect(list).toEqual(["Acme"]);
  });

  it("dedupes within a single batch (mutates list as we go)", () => {
    const list = [];
    const inputs = ["Acme", "ACME", "acme", "Initech"];
    let added = 0;
    inputs.forEach((x) => {
      if (addUnique(list, x)) added++;
    });
    expect(added).toBe(2);
    expect(list).toEqual(["Acme", "Initech"]);
  });

  it("works on an initially empty list", () => {
    const list = [];
    expect(addUnique(list, "Acme")).toBe(true);
    expect(list).toEqual(["Acme"]);
  });
});

describe("removeCi", () => {
  it("removes a matching entry and returns 1", () => {
    const list = ["Acme", "Initech"];
    expect(removeCi(list, "acme")).toBe(1);
    expect(list).toEqual(["Initech"]);
  });

  it("returns 0 when nothing matches", () => {
    const list = ["Acme", "Initech"];
    expect(removeCi(list, "Stark")).toBe(0);
    expect(list).toEqual(["Acme", "Initech"]);
  });

  it("removes every duplicate match", () => {
    const list = ["acme", "Acme", "ACME", "Initech"];
    expect(removeCi(list, "Acme")).toBe(3);
    expect(list).toEqual(["Initech"]);
  });

  it("is safe on empty / null lists", () => {
    expect(removeCi([], "Acme")).toBe(0);
    expect(removeCi(null, "Acme")).toBe(0);
  });

  it("ignores non-string entries during the scan", () => {
    const list = [null, "Acme", 42, "acme"];
    expect(removeCi(list, "acme")).toBe(2);
    expect(list).toEqual([null, 42]);
  });
});
