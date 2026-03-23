import { describe, it, expect } from "vitest";

// Poll detection regex — same pattern used in src/feed.js detectContentTypes()
const POLL_VOTE_RE = /^\d+ votes?$/;

describe("Poll detection regex", () => {
  it("matches '0 votes'", () => {
    expect(POLL_VOTE_RE.test("0 votes")).toBe(true);
  });

  it("matches '1 vote' (singular)", () => {
    expect(POLL_VOTE_RE.test("1 vote")).toBe(true);
  });

  it("matches '42 votes'", () => {
    expect(POLL_VOTE_RE.test("42 votes")).toBe(true);
  });

  it("matches '1000 votes'", () => {
    expect(POLL_VOTE_RE.test("1000 votes")).toBe(true);
  });

  it("does not match text with extra content", () => {
    expect(POLL_VOTE_RE.test("42 votes and counting")).toBe(false);
    expect(POLL_VOTE_RE.test("See 42 votes")).toBe(false);
  });

  it("does not match non-vote text", () => {
    expect(POLL_VOTE_RE.test("votes")).toBe(false);
    expect(POLL_VOTE_RE.test("no votes here")).toBe(false);
    expect(POLL_VOTE_RE.test("")).toBe(false);
  });

  it("does not match partial patterns", () => {
    expect(POLL_VOTE_RE.test("42 voted")).toBe(false);
    expect(POLL_VOTE_RE.test("42 voters")).toBe(false);
  });
});

// Celebration detection patterns — same list used in src/feed.js
const CELEBRATION_PATTERNS = [
  "job update", "started a new position", "work anniversary",
  "celebrating", "new role", "promoted to", "birthday",
];

function matchesCelebration(text) {
  const lower = text.toLowerCase();
  return CELEBRATION_PATTERNS.some((p) => lower.includes(p));
}

describe("Celebration detection", () => {
  it("matches job update header", () => {
    expect(matchesCelebration("Wyatt McRoberts' job update")).toBe(true);
    expect(matchesCelebration("Joyce Wu's job update")).toBe(true);
  });

  it("matches new position text", () => {
    expect(matchesCelebration("Wyatt started a new position as Data Engineer")).toBe(true);
  });

  it("matches work anniversary", () => {
    expect(matchesCelebration("Celebrating 5 years at Google!")).toBe(true);
    expect(matchesCelebration("John's work anniversary")).toBe(true);
  });

  it("matches birthday", () => {
    expect(matchesCelebration("Wish Jane a happy birthday")).toBe(true);
  });

  it("does not match regular posts", () => {
    expect(matchesCelebration("I just published an article about AI")).toBe(false);
    expect(matchesCelebration("Looking for a senior engineer")).toBe(false);
    expect(matchesCelebration("Great insights on product management")).toBe(false);
  });
});
