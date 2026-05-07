import { describe, it, expect } from "vitest";
import { GOOD_MATCH_RE } from "../src/jobs/constants.js";

// Mirrors the production detector's per-paragraph scan: filters strings that
// are too short (e.g. "Show match details" sibling) before testing the regex.
// The full detector lives in src/jobs/dom.js#detailHasGoodMatch and uses real
// DOM querySelectorAll — these tests cover the regex + length-filter logic.
function detectInTexts(texts) {
  for (const t of texts) {
    if (t.length < 30) continue;
    if (GOOD_MATCH_RE.test(t)) return true;
  }
  return false;
}

describe("goodMatch detector", () => {
  // Verified live on real LinkedIn DOM — see PR description.
  it("fires on the HIGH tier message (Blossom example)", () => {
    expect(
      detectInTexts([
        "Your profile and resume match the required qualifications well.",
        "Show match details",
      ])
    ).toBe(true);
  });

  it("does NOT fire on the LOW tier message (Middesk example)", () => {
    expect(
      detectInTexts([
        "Your profile and resume are missing some qualifications, add your experience or try exploring other jobs.",
        "Show match details",
        "Help me update my profile",
      ])
    ).toBe(false);
  });

  it("does NOT fire on a job description that happens to mention 'match' or 'qualifications'", () => {
    expect(
      detectInTexts([
        "We are looking for a candidate with strong qualifications. The role requires you to match deadlines and collaborate well across teams.",
      ])
    ).toBe(false);
  });

  it("does NOT fire when the panel is still loading (only the H2 is present)", () => {
    // Loading skeleton renders the H2 but no <p> with the verdict — production
    // detector only scans <p>, so simulating empty input here.
    expect(detectInTexts([])).toBe(false);
  });

  it("does NOT fire on the short 'Show match details' link alone", () => {
    expect(detectInTexts(["Show match details"])).toBe(false);
  });

  it("is case-insensitive so casing tweaks don't break it", () => {
    expect(detectInTexts(["YOUR PROFILE AND RESUME MATCH THE REQUIRED QUALIFICATIONS WELL."])).toBe(
      true
    );
  });

  it("matches when the phrase appears mid-sentence (defensive)", () => {
    expect(
      detectInTexts([
        "We've reviewed your application; your profile and resume match the required qualifications well, congratulations.",
      ])
    ).toBe(true);
  });
});
