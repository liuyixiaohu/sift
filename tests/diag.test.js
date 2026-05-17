import { describe, it, expect } from "vitest";
import { relevantCountsFor } from "../src/shared/diag.js";

// Shorthand fixtures so each test stays readable.
function feedDiag(over = {}) {
  return {
    pageType: "feed",
    paused: false,
    feed: {
      promoted: 0,
      suggested: 0,
      recommended: 0,
      nonConnection: 0,
      poll: 0,
      celebration: 0,
      keywordFiltered: 0,
      tooOld: 0,
    },
    profile: { noise: 0, analytics: 0 },
    jobs: { flagged: 0 },
    invalidKeywords: 0,
    ...over,
  };
}

function profileDiag(over = {}) {
  return {
    ...feedDiag(over),
    pageType: "profile",
    ...over,
  };
}

const ALL_OFF = {
  hidePromoted: false,
  hideSuggested: false,
  hideRecommended: false,
  hideNonConnections: false,
  hidePolls: false,
  hideCelebrations: false,
  feedKeywordFilterEnabled: false,
  postAgeLimit: 0,
  hideProfileSuggestions: false,
  hideProfileAnalytics: false,
};

const ALL_ON = {
  hidePromoted: true,
  hideSuggested: true,
  hideRecommended: true,
  hideNonConnections: true,
  hidePolls: true,
  hideCelebrations: true,
  feedKeywordFilterEnabled: true,
  postAgeLimit: 7,
  hideProfileSuggestions: true,
  hideProfileAnalytics: true,
};

describe("relevantCountsFor", () => {
  describe("ok severity (positive count + relevant toggle on)", () => {
    it("shows positive feed counts when toggles are on", () => {
      const items = relevantCountsFor(
        feedDiag({ feed: { ...feedDiag().feed, promoted: 3, suggested: 2 } }),
        ALL_ON
      );
      const ads = items.find((i) => i.label === "Ads");
      expect(ads).toEqual({ label: "Ads", n: 3, severity: "ok" });
      const sug = items.find((i) => i.label === "Suggested");
      expect(sug).toEqual({ label: "Suggested", n: 2, severity: "ok" });
    });

    it("shows profile counts on profile page when toggles are on", () => {
      const items = relevantCountsFor(profileDiag({ profile: { noise: 4, analytics: 1 } }), ALL_ON);
      expect(items.find((i) => i.label === "Analytics")).toEqual({
        label: "Analytics",
        n: 1,
        severity: "ok",
      });
      expect(items.find((i) => i.label === "Suggestions & ads")).toEqual({
        label: "Suggestions & ads",
        n: 4,
        severity: "ok",
      });
    });
  });

  describe("warn severity (toggle on, zero matches, page relevant)", () => {
    it("warns when Hide Ads is on but feed has zero promoted matches", () => {
      // The headline use case: user has Hide Ads ON, is on the feed, but
      // Sift saw 0 ads. Likely LinkedIn DOM change.
      const items = relevantCountsFor(feedDiag(), ALL_ON);
      const ads = items.find((i) => i.label === "Ads");
      expect(ads).toEqual({ label: "Ads", n: 0, severity: "warn" });
    });

    it("warns for every relevant feed toggle with zero count", () => {
      const items = relevantCountsFor(feedDiag(), ALL_ON);
      const warnLabels = items.filter((i) => i.severity === "warn").map((i) => i.label);
      expect(warnLabels).toContain("Ads");
      expect(warnLabels).toContain("Suggested");
      expect(warnLabels).toContain("Recommended");
      expect(warnLabels).toContain("Strangers");
      expect(warnLabels).toContain("Polls");
      expect(warnLabels).toContain("Celebrations");
      expect(warnLabels).toContain("Keywords");
      expect(warnLabels).toContain("Too old");
      expect(warnLabels).toContain("Suggestions & ads");
    });

    it("warns for Hide Analytics on a profile page with zero matches", () => {
      const items = relevantCountsFor(profileDiag(), ALL_ON);
      expect(items.find((i) => i.label === "Analytics")).toEqual({
        label: "Analytics",
        n: 0,
        severity: "warn",
      });
    });
  });

  describe("toggle off → chip is omitted (no signal worth carrying)", () => {
    it("omits Ads chip when Hide Ads is off, even with positive count", () => {
      const items = relevantCountsFor(feedDiag({ feed: { ...feedDiag().feed, promoted: 5 } }), {
        ...ALL_OFF,
      });
      expect(items.find((i) => i.label === "Ads")).toBeUndefined();
    });

    it("omits when ALL toggles are off (empty list)", () => {
      const items = relevantCountsFor(feedDiag(), ALL_OFF);
      expect(items).toEqual([]);
    });

    it("omits Too old chip when postAgeLimit is 0 (off)", () => {
      // postAgeLimit uses numeric off-state, not boolean — the helper
      // treats `> 0` as on.
      const items = relevantCountsFor(feedDiag({ feed: { ...feedDiag().feed, tooOld: 3 } }), {
        ...ALL_OFF,
        postAgeLimit: 0,
      });
      expect(items.find((i) => i.label === "Too old")).toBeUndefined();
    });
  });

  describe("page type filtering (no cross-page noise)", () => {
    it("does NOT warn for Hide Polls on a profile page", () => {
      // hidePolls is on, but polls only exist on feed. Don't warn the
      // user about a 0 on a page where the count is expected to be 0.
      const items = relevantCountsFor(profileDiag(), ALL_ON);
      expect(items.find((i) => i.label === "Polls")).toBeUndefined();
    });

    it("does NOT warn for Hide Analytics on a feed page", () => {
      const items = relevantCountsFor(feedDiag(), ALL_ON);
      expect(items.find((i) => i.label === "Analytics")).toBeUndefined();
    });

    it("on jobs page, shows flagged count only when > 0", () => {
      const empty = relevantCountsFor({ ...feedDiag(), pageType: "jobs" }, ALL_ON);
      expect(empty).toEqual([]);
      const present = relevantCountsFor(
        { ...feedDiag(), pageType: "jobs", jobs: { flagged: 7 } },
        ALL_ON
      );
      expect(present).toEqual([{ label: "Flagged jobs", n: 7, severity: "ok" }]);
    });

    it("returns empty for pageType 'other'", () => {
      const items = relevantCountsFor({ ...feedDiag(), pageType: "other" }, ALL_ON);
      expect(items).toEqual([]);
    });
  });

  describe("paused state", () => {
    it("suppresses warnings when paused (counts are advisory)", () => {
      // Toggle is on, count is 0 — would warn — but Sift is paused, so
      // the zero is expected. Don't cry wolf.
      const items = relevantCountsFor({ ...feedDiag(), paused: true }, ALL_ON);
      expect(items.filter((i) => i.severity === "warn").length).toBe(0);
    });

    it("still shows positive counts when paused (informational)", () => {
      // Even paused, Sift scans and counts. Show them so the user can
      // see "this is what's on the page right now."
      const items = relevantCountsFor(
        { ...feedDiag(), paused: true, feed: { ...feedDiag().feed, promoted: 3 } },
        ALL_ON
      );
      expect(items.find((i) => i.label === "Ads")).toEqual({
        label: "Ads",
        n: 3,
        severity: "ok",
      });
    });
  });

  describe("invalid-keyword case (don't blame LinkedIn for user typos)", () => {
    it("renders 'Invalid regex' (userError) when invalidKeywords > 0 and matches = 0", () => {
      // The headline case: user is on regex mode, typed `(unterminated`,
      // every post gets scanned with that keyword silently skipped. Diag
      // panel must NOT show ⚠ "Keywords" warn (which falsely blames
      // LinkedIn) — it must point the user at their broken input.
      const items = relevantCountsFor({ ...feedDiag(), invalidKeywords: 1 }, { ...ALL_ON });
      const kw = items.find((i) => i.label === "Keywords" || i.label === "Invalid regex");
      expect(kw).toEqual({ label: "Invalid regex", n: 1, severity: "userError" });
      // And NO warn-severity Keywords chip should be present
      expect(items.find((i) => i.label === "Keywords")).toBeUndefined();
    });

    it("when keywords are matching, doesn't surface invalid count as userError", () => {
      // Mixed case: some invalid keywords AND some good matches. We
      // prioritize the positive count — the user knows the filter is
      // working; they'll discover the invalid ones via the popup toast.
      const items = relevantCountsFor(
        {
          ...feedDiag(),
          feed: { ...feedDiag().feed, keywordFiltered: 4 },
          invalidKeywords: 1,
        },
        ALL_ON
      );
      expect(items.find((i) => i.label === "Keywords")).toEqual({
        label: "Keywords",
        n: 4,
        severity: "ok",
      });
      expect(items.find((i) => i.label === "Invalid regex")).toBeUndefined();
    });

    it("does NOT surface invalid-regex chip when paused", () => {
      // Same rationale as the paused/warn rule: in paused state, zero
      // counts are expected, don't cry wolf.
      const items = relevantCountsFor({ ...feedDiag(), paused: true, invalidKeywords: 2 }, ALL_ON);
      expect(items.find((i) => i.label === "Invalid regex")).toBeUndefined();
    });

    it("does NOT surface invalid-regex chip when feedKeywordFilterEnabled is off", () => {
      // Toggle off → user explicitly doesn't want the filter. The 2
      // invalid keywords don't matter to them right now.
      const items = relevantCountsFor(
        { ...feedDiag(), invalidKeywords: 2 },
        { ...ALL_ON, feedKeywordFilterEnabled: false }
      );
      expect(items.find((i) => i.label === "Invalid regex")).toBeUndefined();
      expect(items.find((i) => i.label === "Keywords")).toBeUndefined();
    });
  });
});
