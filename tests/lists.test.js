import { describe, it, expect } from "vitest";
import {
  addUnique,
  containsCi,
  containsWordOf,
  matchesWholeWord,
  removeCi,
} from "../src/shared/lists.js";

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

describe("matchesWholeWord", () => {
  it("matches when needle is a complete word in haystack", () => {
    expect(matchesWholeWord("Software Intern", "intern")).toBe(true);
    expect(matchesWholeWord("Apple Inc", "Apple")).toBe(true);
    expect(matchesWholeWord("Senior Software Engineer", "Senior")).toBe(true);
  });

  it("does NOT match when needle is just a substring of a longer word", () => {
    expect(matchesWholeWord("Software Internship", "intern")).toBe(false);
    expect(matchesWholeWord("Internal Tools", "intern")).toBe(false);
    expect(matchesWholeWord("Pineapple Co", "Apple")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(matchesWholeWord("software ENGINEER", "engineer")).toBe(true);
    expect(matchesWholeWord("APPLE INC", "apple")).toBe(true);
  });

  it("matches at the start, end, and middle of the haystack", () => {
    expect(matchesWholeWord("Intern", "intern")).toBe(true);
    expect(matchesWholeWord("Software Intern", "Intern")).toBe(true);
    expect(matchesWholeWord("Junior Intern Developer", "intern")).toBe(true);
  });

  it("treats punctuation/whitespace as word boundaries", () => {
    expect(matchesWholeWord("(Intern) - Frontend", "intern")).toBe(true);
    expect(matchesWholeWord("Intern, Frontend", "intern")).toBe(true);
    expect(matchesWholeWord("Intern: Frontend", "intern")).toBe(true);
  });

  it("supports multi-word needles", () => {
    expect(matchesWholeWord("Software Engineer Intern", "Engineer Intern")).toBe(true);
    expect(matchesWholeWord("Apple Inc Computer", "Apple Inc")).toBe(true);
    expect(matchesWholeWord("Apple Incomplete", "Apple Inc")).toBe(false);
  });

  it("escapes regex metacharacters in the needle", () => {
    expect(matchesWholeWord("Senior C++ Developer", "C++")).toBe(true);
    // Trailing-special-char needles only require a boundary on the side that
    // has a word character. The trailing `+` is non-word; the boundary check
    // there is naturally satisfied if the next char is whitespace/punct.
    expect(matchesWholeWord("AT&T Mobility", "AT&T")).toBe(true);
  });

  it("rejects empty / non-string inputs", () => {
    expect(matchesWholeWord("", "intern")).toBe(false);
    expect(matchesWholeWord("Software Intern", "")).toBe(false);
    expect(matchesWholeWord(null, "intern")).toBe(false);
    expect(matchesWholeWord("Software Intern", null)).toBe(false);
  });
});

describe("containsWordOf", () => {
  it("returns true when ANY needle in the list appears as a whole word", () => {
    expect(containsWordOf("Software Engineer Intern", ["staff", "intern", "principal"])).toBe(true);
  });

  it("returns false when no needle is a whole-word match", () => {
    expect(containsWordOf("Software Internship", ["intern"])).toBe(false);
    expect(containsWordOf("Pineapple Co", ["Apple"])).toBe(false);
  });

  it("returns false on empty list / empty text", () => {
    expect(containsWordOf("Software Intern", [])).toBe(false);
    expect(containsWordOf("", ["intern"])).toBe(false);
    expect(containsWordOf("Software Intern", null)).toBe(false);
    expect(containsWordOf(null, ["intern"])).toBe(false);
  });

  it("short-circuits on first match (semantically — also fast)", () => {
    // Just verify the result; performance is implementation detail.
    expect(containsWordOf("Software Intern", ["intern", "anything"])).toBe(true);
  });

  it("models the Skipped Companies use case end-to-end", () => {
    const skip = ["Apple", "Acme Corp"];
    expect(containsWordOf("Apple", skip)).toBe(true);
    expect(containsWordOf("Apple Inc", skip)).toBe(true);
    expect(containsWordOf("Apple Computer", skip)).toBe(true);
    expect(containsWordOf("Acme Corp", skip)).toBe(true);
    expect(containsWordOf("Acme Corporation", skip)).toBe(false); // "Corp" alone, not "Acme Corp" as a phrase
    expect(containsWordOf("Pineapple", skip)).toBe(false);
    expect(containsWordOf("Stark Industries", skip)).toBe(false);
  });

  it("models the Skipped Title Keywords use case end-to-end", () => {
    const skip = ["intern", "junior", "principal"];
    expect(containsWordOf("Software Engineer Intern", skip)).toBe(true);
    expect(containsWordOf("Junior Backend Developer", skip)).toBe(true);
    expect(containsWordOf("Principal Product Manager", skip)).toBe(true);
    expect(containsWordOf("Senior Software Engineer", skip)).toBe(false);
    expect(containsWordOf("Internship Coordinator", skip)).toBe(false);
    expect(containsWordOf("Internal Tools Engineer", skip)).toBe(false);
  });
});
