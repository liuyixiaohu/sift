import { describe, it, expect } from "vitest";
import { keywordsToRegex, matchesFeedKeyword, validateKeywords } from "../src/shared/matching.js";

describe("keywordsToRegex", () => {
  it("creates a regex matching any keyword", () => {
    const re = keywordsToRegex(["does not sponsor", "no sponsorship"]);
    expect(re.test("We does not sponsor visas")).toBe(true);
    expect(re.test("No sponsorship available")).toBe(true);
    expect(re.test("We offer full benefits")).toBe(false);
  });

  it("is case-insensitive", () => {
    const re = keywordsToRegex(["unpaid"]);
    expect(re.test("UNPAID internship")).toBe(true);
    expect(re.test("Unpaid Position")).toBe(true);
  });

  it("escapes regex special characters", () => {
    const re = keywordsToRegex(["c++ developer", "node.js"]);
    expect(re.test("Looking for c++ developer")).toBe(true);
    expect(re.test("Experience with node.js")).toBe(true);
    // Should not match "nodejs" (dot is literal, not wildcard)
    expect(re.test("Experience with nodexjs")).toBe(false);
  });

  it("handles empty keyword array", () => {
    const re = keywordsToRegex([]);
    // Empty alternation matches empty string
    expect(re.test("anything")).toBe(true);
  });
});

describe("matchesFeedKeyword", () => {
  it("returns matching keyword on substring match", () => {
    expect(matchesFeedKeyword("I am hiring a new intern!", ["hiring"])).toBe("hiring");
  });

  it("is case-insensitive", () => {
    expect(matchesFeedKeyword("Proud to ANNOUNCE my new role", ["announce"])).toBe("announce");
  });

  it("returns first matching keyword", () => {
    const result = matchesFeedKeyword("crypto blockchain web3", ["blockchain", "crypto"]);
    expect(result).toBe("blockchain");
  });

  it("returns null when no keyword matches", () => {
    expect(matchesFeedKeyword("Great article about React", ["vue", "angular"])).toBeNull();
  });

  it("returns null for empty keyword list", () => {
    expect(matchesFeedKeyword("anything", [])).toBeNull();
  });

  it("returns null for null/undefined keyword list", () => {
    expect(matchesFeedKeyword("anything", null)).toBeNull();
    expect(matchesFeedKeyword("anything", undefined)).toBeNull();
  });

  it("skips empty keyword strings", () => {
    expect(matchesFeedKeyword("hello world", ["", "world"])).toBe("world");
  });

  // The default behavior (no `mode` argument) is "substring" — preserves
  // the original API for any caller that hasn't been updated.
  it("defaults to substring mode when no mode is given", () => {
    expect(matchesFeedKeyword("I love training", ["ai"])).toBe("ai");
  });

  describe("mode: wholeWord", () => {
    it("matches whole words", () => {
      expect(matchesFeedKeyword("I work in AI", ["ai"], "wholeWord")).toBe("ai");
      expect(matchesFeedKeyword("It's an AI thing.", ["ai"], "wholeWord")).toBe("ai");
    });

    it("does NOT match inside another word", () => {
      expect(matchesFeedKeyword("She loves training", ["ai"], "wholeWord")).toBeNull();
      expect(matchesFeedKeyword("It rained yesterday", ["ai"], "wholeWord")).toBeNull();
      expect(matchesFeedKeyword("That was a fail", ["ai"], "wholeWord")).toBeNull();
    });

    it("falls back to substring for keywords with no word-char ends", () => {
      // "++" has no word chars on either side — `\b` wouldn't apply, so we
      // fall back to substring matching for that keyword.
      expect(matchesFeedKeyword("score: ++", ["++"], "wholeWord")).toBe("++");
    });

    it("handles keywords starting with a non-word char (e.g. hashtags)", () => {
      // "#ai" starts non-word, ends word → only the trailing `\b` is
      // enforced. Matches "#ai" in normal contexts.
      expect(matchesFeedKeyword("Loving the #ai stuff", ["#ai"], "wholeWord")).toBe("#ai");
      // Trailing `\b` blocks "#aieee" from matching keyword "#ai".
      expect(matchesFeedKeyword("Loving #aieee posts", ["#ai"], "wholeWord")).toBeNull();
    });

    it("handles multi-word keywords", () => {
      expect(
        matchesFeedKeyword("we use machine learning models", ["machine learning"], "wholeWord")
      ).toBe("machine learning");
      expect(
        matchesFeedKeyword("ML and machine-learning differ", ["machine learning"], "wholeWord")
      ).toBeNull();
    });

    it("is case-insensitive", () => {
      expect(matchesFeedKeyword("AI is the future", ["ai"], "wholeWord")).toBe("ai");
    });
  });

  describe("mode: regex", () => {
    it("compiles each keyword as a case-insensitive regex", () => {
      expect(matchesFeedKeyword("hello world", ["w.rld"], "regex")).toBe("w.rld");
      expect(matchesFeedKeyword("count: 42", ["\\d+"], "regex")).toBe("\\d+");
    });

    it("anchors and alternations work", () => {
      expect(matchesFeedKeyword("only this", ["^only"], "regex")).toBe("^only");
      expect(matchesFeedKeyword("hiring now", ["(hiring|firing)"], "regex")).toBe(
        "(hiring|firing)"
      );
    });

    it("silently skips invalid patterns instead of throwing", () => {
      // Unterminated group is invalid; should not throw — falls through to
      // null since no other keyword matches.
      expect(matchesFeedKeyword("anything", ["(unterminated"], "regex")).toBeNull();
    });

    it("invalid keyword doesn't poison the rest of the array", () => {
      // Critical: one bad regex shouldn't disable every later keyword.
      // (Coverage gap surfaced by the test-coverage review agent.)
      expect(
        matchesFeedKeyword("looking for valid match", ["(unterminated", "valid"], "regex")
      ).toBe("valid");
    });
  });
});

describe("validateKeywords", () => {
  it("partitions regex keywords into valid + invalid", () => {
    const { valid, invalid } = validateKeywords(
      ["w.rld", "(unterminated", "\\d+", ")extra-close"],
      "regex"
    );
    expect(valid).toEqual(["w.rld", "\\d+"]);
    expect(invalid).toEqual(["(unterminated", ")extra-close"]);
  });

  it("treats all wholeWord keywords as valid (no compile step)", () => {
    const { valid, invalid } = validateKeywords(["ai", "c++", "#hashtag"], "wholeWord");
    expect(valid).toEqual(["ai", "c++", "#hashtag"]);
    expect(invalid).toEqual([]);
  });

  it("treats all substring keywords as valid", () => {
    const { valid, invalid } = validateKeywords(["(unterminated", "anything"], "substring");
    // Substring mode never compiles — anything goes
    expect(valid).toEqual(["(unterminated", "anything"]);
    expect(invalid).toEqual([]);
  });

  it("filters out empty / whitespace-only / non-string entries", () => {
    const { valid, invalid } = validateKeywords(["", "  ", "real", null, 42], "regex");
    expect(valid).toEqual(["real"]);
    expect(invalid).toEqual([]);
  });

  it("returns empty arrays for non-array input", () => {
    expect(validateKeywords(null, "regex")).toEqual({ valid: [], invalid: [] });
    expect(validateKeywords(undefined, "wholeWord")).toEqual({ valid: [], invalid: [] });
  });
});
