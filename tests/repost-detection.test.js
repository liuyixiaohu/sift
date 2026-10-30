import { afterEach, describe, expect, it } from "vitest";
import { parseHTML } from "linkedom";

import { checkDetailForCard, getActiveCard } from "../src/jobs/active.js";
import {
  cardHasRepostedText,
  detailMatchesCard,
  detailPanelHasReposted,
  getDetailJobId,
} from "../src/jobs/dom.js";

function installDom(html, url = "https://www.linkedin.com/jobs/search-results/?currentJobId=222") {
  const { document, window } = parseHTML(html);
  globalThis.document = document;
  globalThis.window = window;
  globalThis.location = new URL(url);
  return document;
}

afterEach(() => {
  delete globalThis.document;
  delete globalThis.window;
  delete globalThis.location;
});

describe("repost detection", () => {
  it("ignores Sift's own injected Reposted badge", () => {
    const doc = installDom(`
      <div id="card">
        <span>Software Engineer</span>
        <div class="lj-badges"><span>Reposted</span></div>
      </div>
    `);
    expect(cardHasRepostedText(doc.querySelector("#card"))).toBe(false);
  });

  it("preserves genuine LinkedIn card repost detection", () => {
    const doc = installDom(`
      <div id="card"><span>Software Engineer</span><span>Reposted 2 days ago</span></div>
    `);
    expect(cardHasRepostedText(doc.querySelector("#card"))).toBe(true);
  });

  it("does not scan the whole page when no detail panel exists", () => {
    installDom(`<main><div class="result-card"><span>Reposted 2 days ago</span></div></main>`);
    expect(detailPanelHasReposted()).toBe(false);
  });

  it("preserves genuine repost detection inside the detail panel", () => {
    installDom(`
      <main><article>
        <a href="https://www.linkedin.com/jobs/view/111">Software Engineer</a>
        <strong>Reposted 3 hours ago</strong>
      </article></main>
    `);
    expect(detailPanelHasReposted()).toBe(true);
  });

  it("uses rendered detail identity instead of the URL's ahead-of-DOM job ID", () => {
    const doc = installDom(`
      <main>
        <div class="jobs-search-results-list">
          <div id="card-111">
            <button aria-label="Dismiss Software Engineer job"></button>
            <a href="https://www.linkedin.com/jobs/view/111">Software Engineer</a>
          </div>
          <div id="card-222">
            <button aria-label="Dismiss Product Manager job"></button>
            <a href="https://www.linkedin.com/jobs/view/222">Product Manager</a>
          </div>
        </div>
        <article>
          <a href="https://www.linkedin.com/jobs/view/111">Software Engineer</a>
          <strong>Reposted 3 hours ago</strong>
        </article>
      </main>
    `);

    expect(getDetailJobId()).toBe("111");
    expect(getActiveCard()).toBe(doc.querySelector("#card-111"));
    expect(detailMatchesCard(doc.querySelector("#card-111"))).toBe(true);
    expect(detailMatchesCard(doc.querySelector("#card-222"))).toBe(false);
  });

  it("does not copy a stale repost flag onto the newly selected card", () => {
    const doc = installDom(`
      <main>
        <div id="card-222">
          <button aria-label="Dismiss Product Manager job"></button>
          <a href="https://www.linkedin.com/jobs/view/222">Product Manager</a>
        </div>
        <article>
          <a href="https://www.linkedin.com/jobs/view/111">Software Engineer</a>
          <strong>Reposted 3 hours ago</strong>
        </article>
      </main>
    `);
    const newlySelectedCard = doc.querySelector("#card-222");

    expect(checkDetailForCard(newlySelectedCard, { renderLists() {} })).toBe(false);
    expect(newlySelectedCard.dataset.ljReasons).toBeUndefined();
  });
});
