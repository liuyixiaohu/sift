// CSS namespace guard.
//
// feed.css is injected on EVERY https://www.linkedin.com/* page (see
// manifest.json). The hiding rules are gated by `body.lj-*` classes that
// feed.js only sets on feed/profile/network pages — but a CSS rule
// without ANY `lj-` reference is unguarded and leaks onto every page.
//
// Canonical example (the bug this test was built to prevent):
//   feed.css used to contain
//     @media (max-width: 1100px) {
//       main > div > div > div:last-child:nth-child(3) { display: none !important; }
//     }
//   That structural selector has no `lj-` anywhere. At narrow viewports it
//   matched the recommendations-list container on
//   /in/{user}/details/recommendations/, hiding the page's main content.
//   No body class, no toggle, no escape — just dead-code-or-bug ambiguity
//   that bit users.
//
// Rule enforced here: every CSS selector in feed.css must contain the
// substring `lj-` somewhere. That covers:
//   - `body.lj-hide-X [data-lj-X="true"]` (hiding rules, body-gated)
//   - `#lj-mini-badge`, `.lj-unfollow-btn` (Sift-owned UI)
//   - `[role="article"]:hover .lj-unfollow-btn` (mixed — OK because the
//     styled target is Sift-owned)
// And rejects:
//   - `main > div > div > ...` (purely structural — affects LinkedIn DOM
//     without any toggle gate)
//
// When this test fails, do NOT bypass it by adding the offending selector
// to an exception list. Either prefix it with `body.lj-*` so a toggle
// controls it, or remove it.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cssPath = join(__dirname, "..", "feed.css");

function extractSelectors(src) {
  const noComments = src.replace(/\/\*[\s\S]*?\*\//g, "");
  // Match each leaf rule "header { body }" — bodies have no nested braces.
  // @media wrappers are skipped (header starts with @), but their inner
  // rules ARE leaf rules and get caught individually.
  const selectors = [];
  const rule = /([^{}]+)\{[^{}]*\}/g;
  let m;
  while ((m = rule.exec(noComments)) !== null) {
    const header = m[1].trim();
    if (header.startsWith("@")) continue;
    // Skip keyframe steps if @keyframes is ever added (e.g. "0%", "from").
    if (/^(\d+%|from|to)$/.test(header)) continue;
    for (const sel of header.split(",")) {
      const s = sel.trim();
      if (s) selectors.push(s);
    }
  }
  return selectors;
}

describe("feed.css namespace guard", () => {
  it("every selector references Sift's lj- namespace", () => {
    const css = readFileSync(cssPath, "utf8");
    const selectors = extractSelectors(css);
    expect(selectors.length).toBeGreaterThan(0); // sanity: parser found rules
    const leaks = selectors.filter((s) => !s.includes("lj-"));
    expect(
      leaks,
      `Unguarded selectors leak onto every LinkedIn page. Each must contain "lj-" — see tests/css-namespace.test.js header for why.`
    ).toEqual([]);
  });

  it("extractor would catch the recommendations bug if reintroduced", () => {
    // Anti-regression for the test itself: confirm extractSelectors pulls
    // the structural selector out of an @media block so the namespace
    // filter would flag it. Without this assertion, a future refactor of
    // extractSelectors could silently stop seeing @media-nested rules and
    // the guard would degrade to a no-op.
    const bugCss = `
      @media (max-width: 1100px) {
        main > div > div > div:last-child:nth-child(3) { display: none !important; }
      }
    `;
    const selectors = extractSelectors(bugCss);
    expect(selectors).toContain("main > div > div > div:last-child:nth-child(3)");
    expect(selectors.filter((s) => !s.includes("lj-"))).toHaveLength(1);
  });
});
