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
function findLeafHeadingWith(document, text, headingSelector = "h1, h2, h3, h4, p, span") {
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

// Mirror of src/feed.js#feedPosts' primary 2026-05 filter: posts are the
// [role="list"] direct children that contain a [role="listitem"]. Kept inline
// because feed.js is an IIFE with no exports — same convention as
// findNoiseWrapper above. If this drifts from feed.js the smoke test stops
// catching real breakage.
function feedPostsIn(list) {
  return [...list.children].filter(
    (c) => c.matches('[role="listitem"]') || c.querySelector('[role="listitem"]')
  );
}

describe("Profile page selectors", () => {
  const doc = parseFixture("profile-page.html");

  it("<main> has NO role='main' attribute (feedMain fallback path)", () => {
    // Real LinkedIn DOM dropped role="main" from <main>. feed.js#feedMain
    // queries `main[role="main"]` first, then falls back to plain `main`.
    // The fallback is load-bearing — without it, the whole feature stack
    // never gets a container.
    const mainEl = doc.querySelector("main");
    expect(mainEl).toBeTruthy();
    expect(mainEl.getAttribute("role")).toBeNull();
  });

  it("finds Analytics widget heading as h2 leaf", () => {
    // PROFILE_ANALYTICS_HEADINGS marker depends on this.
    const heading = findLeafHeadingWith(doc, "Analytics");
    expect(heading).toBeTruthy();
    expect(heading.tagName).toBe("H2");
  });

  it("finds Suggested for you heading inside Primary content section", () => {
    // PROFILE_NOISE_HEADINGS marker depends on this. Important: "Suggested
    // for you" lives in `<section aria-label="Primary content">` (the main
    // profile wrapper), NOT in the aside. Don't assume it's in the right rail.
    const heading = findLeafHeadingWith(doc, "Suggested for you");
    expect(heading).toBeTruthy();
    expect(heading.closest('section[aria-label="Primary content"]')).toBeTruthy();
  });

  it("People you may know lives in the inner <aside>, not Primary content", () => {
    // Different from Suggested-for-you. The aside is INSIDE main on the
    // profile page (LinkedIn's actual nesting).
    const heading = findLeafHeadingWith(doc, "People you may know");
    expect(heading).toBeTruthy();
    expect(heading.closest("aside")).toBeTruthy();
    expect(heading.closest("main")).toBeTruthy(); // aside is inside main
  });

  it("Who your viewers also viewed heading is a <span> inside an <h3>", () => {
    // The Premium "Who your viewers also viewed" widget wraps its title in a
    // <span> inside an <h3>, so the <h3> is NOT a leaf — the <span> is. The
    // marker's heading query must include `span` (and findLeafHeadingWith
    // mirrors that) or this widget silently leaks past the suggestions toggle.
    const heading = findLeafHeadingWith(doc, "Who your viewers also viewed");
    expect(heading).toBeTruthy();
    expect(heading.tagName).toBe("SPAN");
    expect(heading.parentElement.tagName).toBe("H3");
    // Resolves to the widget's <section> wrapper, so the marker hides the card.
    expect(findNoiseWrapper(heading).tagName).toBe("SECTION");
  });

  it("Analytics heading is wrapped by a <section> (closest walk)", () => {
    const heading = findLeafHeadingWith(doc, "Analytics");
    const wrapper = findNoiseWrapper(heading);
    expect(wrapper).toBeTruthy();
    expect(wrapper.tagName).toBe("SECTION");
  });

  it("Analytics section has BOTH /dashboard AND /analytics anchors", () => {
    // LinkedIn is mid-rollout from /dashboard to /analytics; the current
    // cohort has both. The CSS rule keys on /dashboard, but the JS-marker
    // heading-text fallback (PR #43) future-proofs against the day
    // LinkedIn drops /dashboard entirely.
    const analyticsSection = findLeafHeadingWith(doc, "Analytics").closest("section");
    expect(analyticsSection.querySelector('a[href*="/dashboard"]')).toBeTruthy();
    expect(analyticsSection.querySelector('a[href*="/analytics"]')).toBeTruthy();
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

  it("right-rail aside uses aria-label='Aside' (LinkedIn's actual label)", () => {
    // Captured from live DOM in 2026-05. Not "Right rail", not "Sidebar" —
    // LinkedIn just calls the right column "Aside". markProfileNoise scopes
    // its scan to `aside[aria-label]` to avoid hammering the whole document.
    const aside = doc.querySelector("aside");
    expect(aside).toBeTruthy();
    expect(aside.getAttribute("aria-label")).toBe("Aside");
  });
});

describe("Feed sidebar selectors", () => {
  const doc = parseFixture("feed-sidebar.html");

  it("right-rail aside uses aria-label='Aside' on feed page too", () => {
    // Captured from live DOM. Both profile and feed use the same "Aside"
    // label for the right rail. (Feed page also has a second aside,
    // aria-label="Sidebar", but the marker widgets live in "Aside".)
    const aside = doc.querySelector('aside[aria-label="Aside"]');
    expect(aside).toBeTruthy();
  });

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
    // Wrapper should be a descendant of <aside> (the up-walk lands on the
    // last div before aside, not necessarily a direct child — real DOM has
    // multiple intermediate divs).
    expect(wrapper.closest("aside")).toBeTruthy();
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

  it("feed posts are [role='list'] direct children containing a [role='listitem']", () => {
    // 2026-05 DOM: LinkedIn dropped [data-display-contents] from post wrappers
    // and moved those into asides/menus. feed.js#feedPosts now identifies posts
    // as [role="list"] direct-child divs that contain a [role="listitem"].
    const doc = parseFixture("feed-post-promoted.html");
    const list = doc.querySelector('[role="list"]');
    expect(list).toBeTruthy();
    const posts = feedPostsIn(list);
    expect(posts.length).toBe(1); // the real post, NOT the composer sibling
    expect(posts[0].querySelector('[role="listitem"]')).toBeTruthy();
    // Wrapper carries data-lazy-mount-id (corroborating signal, not matched on).
    expect(posts[0].hasAttribute("data-lazy-mount-id")).toBe(true);
  });

  it("feedPosts excludes a composer-like sibling with no [role='listitem']", () => {
    // The "Start a post" composer, "Sort by", and the "New posts" pill are also
    // [role="list"] direct children but contain NO [role="listitem"]. Regression
    // guard: a naive `[role="list"] > div` selector would wrongly include them.
    const doc = parseFixture("feed-post-promoted.html");
    const list = doc.querySelector('[role="list"]');
    const composer = [...list.children].find((c) =>
      c.querySelector('button[aria-label="Start a post"]')
    );
    expect(composer).toBeTruthy(); // sibling exists in fixture
    expect(feedPostsIn(list)).not.toContain(composer); // and is excluded
  });

  it("Post wrapper contains a [role='listitem'] several divs deep", () => {
    // Real DOM nests [role="listitem"] inside the outer wrapper with multiple
    // intermediate divs. The "Promoted" label leaf is found by a deep
    // `span,a,p` traversal — no assumption about depth.
    const doc = parseFixture("feed-post-promoted.html");
    const post = feedPostsIn(doc.querySelector('[role="list"]'))[0];
    expect(post.querySelector('[role="listitem"]')).toBeTruthy();
  });

  it("Promoted post has a Follow button (used for non-connection detection)", () => {
    // Posts from companies/strangers expose a "Follow" button. The
    // scanPosts code uses `button[aria-label*="Follow"]` (substring match,
    // not exact) — LinkedIn's real label is "Follow <name>".
    const doc = parseFixture("feed-post-promoted.html");
    const followBtn = doc.querySelector('button[aria-label*="Follow"]');
    expect(followBtn).toBeTruthy();
    // Confirm we're matching "Follow X" via substring, not exactly "Follow"
    expect(followBtn.getAttribute("aria-label").startsWith("Follow")).toBe(true);
  });

  it("Promoted post has a control-menu button (Unfollow injection anchor)", () => {
    // The Unfollow button injected by Sift clicks `button[aria-label*="control menu"]`
    // to open LinkedIn's per-post dropdown. Real label is "Open control menu
    // for this post".
    const doc = parseFixture("feed-post-promoted.html");
    const menuBtn = doc.querySelector('button[aria-label*="control menu"]');
    expect(menuBtn).toBeTruthy();
  });
});
