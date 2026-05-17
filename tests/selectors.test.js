// DOM selector smoke tests.
//
// The biggest risk to this extension is LinkedIn silently renaming a class
// or restructuring a widget, causing our `querySelectorAll(...)` calls to
// stop matching. The user sees Sift quietly stop working; we don't find out
// for weeks (cf. PR #38).
//
// This file pins the structural assumptions our markers + selectors depend
// on against captured fixtures of LinkedIn's DOM. When a fixture breaks
// here, that's the signal to:
//   1. Capture fresh HTML from current LinkedIn
//   2. Update the fixture(s) to match
//   3. Decide if our selectors / markers in src/feed.js need a corresponding
//      update — the diff between the old fixture and new one shows what
//      LinkedIn changed
//
// We use `linkedom` rather than jsdom: ~10x smaller dev dependency, and
// these are pure structural tests — no JS execution, no styles.
//
// IMPORTANT: when a test here fails, do NOT auto-update the fixture without
// checking real LinkedIn first. The fixture failing is the early warning;
// blindly updating it defeats the purpose.

import { describe, it, expect } from "vitest";
import { parseHTML } from "linkedom";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadFixture(name) {
  return readFileSync(join(__dirname, "fixtures", name), "utf8");
}

function parseFixture(name) {
  return parseHTML(loadFixture(name)).document;
}

// Re-implement the heading-text walk from src/feed.js#markProfileNoise so
// tests don't have to import from inside the IIFE. Same selector list +
// leaf-only filter — if this drifts from feed.js, the smoke tests stop
// catching real breakage.
function findLeafHeadingWith(document, text, headingSelector = "h1, h2, h3, h4, p") {
  for (const el of document.querySelectorAll(headingSelector)) {
    if (el.children.length > 0) continue;
    if ((el.textContent || "").trim() === text) return el;
  }
  return null;
}

// Re-implement findNoiseWrapper from feed.js — walks heading → closest
// section, else up until parent is ASIDE/MAIN/BODY.
function findNoiseWrapper(headingEl) {
  const section = headingEl.closest("section");
  if (section) return section;
  let walk = headingEl.parentElement;
  while (walk && walk.parentElement) {
    const parent = walk.parentElement;
    if (parent.tagName === "ASIDE" || parent.tagName === "MAIN" || parent.tagName === "BODY") {
      return walk;
    }
    walk = parent;
  }
  return null;
}

describe("Profile page selectors", () => {
  const doc = parseFixture("profile-page.html");

  it("finds Analytics widget heading as h2 leaf", () => {
    // PROFILE_ANALYTICS_HEADINGS marker depends on this.
    const heading = findLeafHeadingWith(doc, "Analytics");
    expect(heading).toBeTruthy();
    expect(heading.tagName).toBe("H2");
  });

  it("finds Suggested for you heading", () => {
    // PROFILE_NOISE_HEADINGS marker depends on this.
    const heading = findLeafHeadingWith(doc, "Suggested for you");
    expect(heading).toBeTruthy();
  });

  it("Analytics heading is wrapped by a <section> (closest walk)", () => {
    const heading = findLeafHeadingWith(doc, "Analytics");
    const wrapper = findNoiseWrapper(heading);
    expect(wrapper).toBeTruthy();
    expect(wrapper.tagName).toBe("SECTION");
  });

  it("/dashboard anchor still exists for URL-based Analytics rule", () => {
    // The legacy CSS rule keys on this; we keep both this + the JS marker
    // as a parallel safety net.
    const links = doc.querySelectorAll('a[href*="/dashboard"]');
    expect(links.length).toBeGreaterThan(0);
  });

  it("/dashboard link lives inside the INNERMOST section (not the outer wrapper)", () => {
    // The :not(:has(section a[href*="/dashboard"])) clause in feed.css
    // restricts the match to the innermost — needed because :has() is
    // transitive (see learning_css_has_is_transitive). If LinkedIn ever
    // moves the dashboard link to the outer section, this test fails and
    // signals we need to revisit the CSS rule.
    const sectionsWithDashboard = [...doc.querySelectorAll("section")].filter((s) =>
      s.querySelector('a[href*="/dashboard"]')
    );
    // Multiple sections contain the link (transitive), but exactly one is
    // innermost. `:scope` is critical: `querySelectorAll("section a")` would
    // wrongly include the link itself (its section ancestor is `s`), but
    // `:scope section a` only matches when the `section` is a STRICT
    // descendant of `s`. Mirrors the spec semantics of :has().
    const innermost = sectionsWithDashboard.filter((s) => {
      const inner = [...s.querySelectorAll(':scope section a[href*="/dashboard"]')];
      return inner.length === 0;
    });
    expect(innermost.length).toBe(1);
  });

  it("ad iframe uses the WCAG-required title='advertisement' attribute", () => {
    // Stablest anchor LinkedIn can't remove without violating accessibility
    // spec — see learning_linkedin_dom_anchors.
    const ads = doc.querySelectorAll('iframe[title="advertisement"]');
    expect(ads.length).toBeGreaterThan(0);
  });

  it("right-rail aside has aria-label (used to scope marker scan)", () => {
    // markProfileNoise() scopes its scan to `aside[aria-label]` containers
    // plus the main element, to avoid hammering the whole document.
    const asides = doc.querySelectorAll("aside[aria-label]");
    expect(asides.length).toBeGreaterThan(0);
  });
});

describe("Feed sidebar selectors", () => {
  const doc = parseFixture("feed-sidebar.html");

  it("LinkedIn News heading is a <p> leaf (NOT h2)", () => {
    // Feed-sidebar widgets use <p> for headings, unlike profile-page widgets
    // which use <h2>. Our scan covers both via the `h1,h2,h3,h4,p` query —
    // dropping <p> from that list would silently miss these.
    const heading = findLeafHeadingWith(doc, "LinkedIn News");
    expect(heading).toBeTruthy();
    expect(heading.tagName).toBe("P");
  });

  it("Today's puzzles uses CURLY apostrophe (U+2019), not ASCII '", () => {
    // LinkedIn uses U+2019 consistently. PROFILE_NOISE_HEADINGS must include
    // exactly this string — substring with ASCII ' would not match.
    const curly = findLeafHeadingWith(doc, "Today’s puzzles");
    expect(curly).toBeTruthy();
    // Sanity: confirm an ASCII-apostrophe version is NOT in the fixture.
    const ascii = findLeafHeadingWith(doc, "Today's puzzles");
    expect(ascii).toBeNull();
  });

  it("News widget has NO surrounding <section> (uses up-walk fallback)", () => {
    // Unlike profile widgets, feed-sidebar widgets are bare divs inside
    // aside. findNoiseWrapper falls back to walking up to the aside.
    const news = findLeafHeadingWith(doc, "LinkedIn News");
    const wrapper = findNoiseWrapper(news);
    expect(wrapper).toBeTruthy();
    expect(wrapper.tagName).not.toBe("SECTION");
    // The wrapper should be a direct child of <aside>
    expect(wrapper.parentElement.tagName).toBe("ASIDE");
  });
});

describe("Feed post type labels", () => {
  it("Promoted post has a leaf with exact text 'Promoted'", () => {
    const doc = parseFixture("feed-post-promoted.html");
    // detectPostLabels walks span/a/p leaves looking for POST_TYPE_LABELS.
    const leaves = [...doc.querySelectorAll("span, a, p")].filter((el) => el.children.length === 0);
    const promoted = leaves.find((el) => (el.textContent || "").trim() === "Promoted");
    expect(promoted).toBeTruthy();
  });

  it("Suggested post has a leaf with exact text 'Suggested'", () => {
    const doc = parseFixture("feed-post-suggested.html");
    const leaves = [...doc.querySelectorAll("span, a, p")].filter((el) => el.children.length === 0);
    const suggested = leaves.find((el) => (el.textContent || "").trim() === "Suggested");
    expect(suggested).toBeTruthy();
  });

  it("feed posts live inside [role='list'] > [data-display-contents]", () => {
    // LinkedIn's 2026 DOM. feed.js#feedPosts queries this primarily and
    // falls back to legacy [role="article"]. If this fixture stops
    // matching the primary, we know to revisit the fallback chain.
    const doc = parseFixture("feed-post-promoted.html");
    const list = doc.querySelector('[role="list"]');
    expect(list).toBeTruthy();
    const posts = list.querySelectorAll(":scope > [data-display-contents]");
    expect(posts.length).toBeGreaterThan(0);
  });

  it("Promoted post has a Follow button (used for non-connection detection)", () => {
    // Posts from companies/strangers expose a "Follow" button. The
    // scanPosts code uses `button[aria-label*="Follow"]` for the
    // non-connection signal.
    const doc = parseFixture("feed-post-promoted.html");
    const followBtn = doc.querySelector('button[aria-label*="Follow"]');
    expect(followBtn).toBeTruthy();
  });
});
