import { describe, it, expect } from "vitest";

// Pure-logic replica of getCompanyName from src/content.js.
// Inputs:
//   lines:         result of getCardTextLines(card) — innerText, split on "\n",
//                  trimmed, with "·" and Sift's own badge texts filtered out.
//   dismissTitle:  result of titleFromDismissButton(card). "" when the dismiss
//                  button's aria-label doesn't match the "Dismiss <title> job"
//                  pattern (e.g. non-English locales).
function getCompanyName(lines, dismissTitle) {
  if (dismissTitle) {
    const idx = lines.lastIndexOf(dismissTitle);
    if (idx >= 0 && idx + 1 < lines.length) return lines[idx + 1];
  }
  if (lines.length >= 3) {
    if (lines[0].includes("(Verified")) return lines[2] || "";
    return lines[1] || "";
  }
  return lines.length >= 2 ? lines[1] : "";
}

describe("getCompanyName — anchored on dismiss-button title", () => {
  // Each scenario below is taken from real LinkedIn DOM, verified live via
  // the browser MCP on a Software Engineer search. See the diagnostic in
  // CHANGELOG / commit message of the bug-fix PR for the raw output.

  it("plain card: title once at line 0, company at line 1", () => {
    // Yuzu / Rilla / Acceler8 / Middesk / Stealth Startup / Grow Therapy all match this shape.
    expect(getCompanyName(
      ["Product Engineer", "Yuzu", "New York, NY (On-site)", "$140K/yr - $260K/yr"],
      "Product Engineer"
    )).toBe("Yuzu");
  });

  it("Promoted card: LinkedIn renders the title twice; company is at line 2", () => {
    // Reproduces the user-reported bug. lastIndexOf skips past the duplicate
    // title; without it we'd return "Software Engineer (All Levels)".
    expect(getCompanyName(
      [
        "Software Engineer (All Levels)",
        "Software Engineer (All Levels)",
        "Blossom",
        "New York, NY (On-site)",
      ],
      "Software Engineer (All Levels)"
    )).toBe("Blossom");
  });

  it("Verified card: line 0 is '<title> (Verified job)', line 1 is title, line 2 is company", () => {
    expect(getCompanyName(
      [
        "Software Engineer - All Levels (Verified job)",
        "Software Engineer - All Levels",
        "GlossGenius",
        "New York, NY",
      ],
      "Software Engineer - All Levels"
    )).toBe("GlossGenius");
  });

  it("title containing parentheses isn't confused with the (Verified) suffix", () => {
    expect(getCompanyName(
      [
        "Software Engineer - Full Stack (New York)",
        "Software Engineer - Full Stack (New York)",
        "Edra",
        "New York, NY (On-site)",
      ],
      "Software Engineer - Full Stack (New York)"
    )).toBe("Edra");
  });

  it("title with bracketed job code is anchored correctly", () => {
    expect(getCompanyName(
      [
        "Software Engineer, Platform [33021]",
        "Stealth Startup",
        "New York, NY (On-site)",
      ],
      "Software Engineer, Platform [33021]"
    )).toBe("Stealth Startup");
  });

  // Fallback path — when dismiss-button parsing fails (locale, format change, etc.)
  describe("fallback heuristic (no dismiss title)", () => {
    it("uses the (Verified prefix path on the legacy verified shape", () => {
      expect(getCompanyName(
        ["(Verified) Acme Corp", "Senior Engineer", "Acme Corp", "SF"],
        ""
      )).toBe("Acme Corp");
    });

    it("returns lines[1] for plain cards", () => {
      expect(getCompanyName(
        ["Senior Engineer", "Acme Corp", "SF"],
        ""
      )).toBe("Acme Corp");
    });

    it("returns lines[1] when only two lines are present", () => {
      expect(getCompanyName(["Senior Engineer", "Acme Corp"], "")).toBe("Acme Corp");
    });

    it("returns empty string when nothing matches", () => {
      expect(getCompanyName([], "")).toBe("");
      expect(getCompanyName(["only one line"], "")).toBe("");
    });
  });

  // Edge cases for the lastIndexOf anchor logic.
  describe("anchor edge cases", () => {
    it("returns empty when title is the very last line (no company line after it)", () => {
      expect(getCompanyName(["Senior Engineer"], "Senior Engineer")).toBe("");
    });

    it("falls through to the heuristic when title isn't found in lines", () => {
      // Simulates a future LinkedIn change where dismiss aria-label diverges
      // from what's rendered in the card. Heuristic still returns lines[1].
      expect(getCompanyName(
        ["Different Title", "Acme Corp", "SF"],
        "Senior Engineer"
      )).toBe("Acme Corp");
    });
  });
});
