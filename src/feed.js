import { SIFT_DEFAULTS, SIFT_STATS_DEFAULTS } from "./shared/defaults.js";
import { matchesFeedKeyword, parsePostAgeDays } from "./shared/matching.js";

if (chrome.runtime?.id) {
  "use strict";

  // EB Garamond font is loaded once by content.js (both scripts share the page)

  // === Tuning constants ===
  const MIN_FEED_IFRAME_WIDTH = 500;  // px — ignore narrow iframes (ads, widgets)
  const IFRAME_POLL_INTERVAL_MS = 1000;
  const IFRAME_POLL_MAX_TICKS = 20;
  const SIDEBAR_POLL_INTERVAL_MS = 2000;
  const SIDEBAR_POLL_MAX_TICKS = 15;
  const SPA_POLL_INTERVAL_MS = 3000;  // URL fallback poll (primary detection via History API)
  const UNFOLLOW_CHECK_INTERVAL_MS = 500;
  const UNFOLLOW_MAX_CHECKS = 20;
  const UNFOLLOW_COLLAPSE_DELAY_MS = 1200;

  function isFeedPage() {
    const p = location.pathname;
    return p === "/" || p.startsWith("/feed");
  }

  function isProfilePage() {
    return /^\/in\/[^/]+\/?$/.test(location.pathname);
  }

  function isNetworkPage() {
    return location.pathname.startsWith("/mynetwork");
  }

  let initialized = false;

  // LinkedIn SPA navigation may render the feed inside a same-origin iframe.
  // Content scripts only run in the top frame, so we detect the iframe and
  // redirect all DOM queries to the correct document via `feedDoc`.
  let feedDoc = document;

  function updateFeedDoc() {
    for (const iframe of document.querySelectorAll("iframe")) {
      if (iframe.offsetWidth < MIN_FEED_IFRAME_WIDTH) continue;
      try {
        const doc = iframe.contentDocument;
        if (doc && doc.body && doc.querySelector("main")) { feedDoc = doc; return; }
      } catch (e) {}
    }
    feedDoc = document;
  }

  // === Storage ===
  const DEFAULTS = SIFT_DEFAULTS;
  const SETTING_KEYS = new Set(["hidePromoted", "hideSuggested", "hideRecommended", "hideNonConnections", "hideSidebar", "hidePolls", "hideCelebrations", "feedKeywordFilterEnabled", "feedKeywords", "postAgeLimit", "hideProfileAnalytics"]);
  let settings = { ...DEFAULTS };

  function loadSettings(cb) {
    chrome.storage.local.get({ ...DEFAULTS }, (s) => {
      settings = s;
      cb(s);
    });
  }

  // === Scroll nudge: trigger LinkedIn's infinite scroll to fill gaps ===
  // === Filtering logic ===

  const POST_TYPE_LABELS = new Set([
    "Promoted", "Suggested", "Recommended for you",
    "Jobs recommended for you", "Popular course on LinkedIn Learning",
    "You\u2019re a top applicant for these jobs",
  ]);

  // Subset of POST_TYPE_LABELS that map to the "recommended" category
  const RECOMMENDED_LABELS = new Set([
    "Recommended for you", "Jobs recommended for you",
    "Popular course on LinkedIn Learning",
    "You\u2019re a top applicant for these jobs",
  ]);

  function detectPostLabels(article) {
    const found = new Set();
    // LinkedIn renders these labels in span/a/p leaf nodes. Short-circuit once all found.
    for (const el of article.querySelectorAll("span, a, p")) {
      if (el.children.length > 0) continue;
      const t = el.textContent.trim();
      if (POST_TYPE_LABELS.has(t)) {
        found.add(t);
        if (found.size === POST_TYPE_LABELS.size) break;
      }
    }
    return found;
  }

  // === Content type detection (polls, celebrations, etc.) ===
  // Unlike label-based detection, these check for structural/content patterns within articles.
  const POLL_VOTE_RE = /^\d+ votes?$/;
  const CELEBRATION_PATTERNS = [
    "job update", "started a new position", "work anniversary",
    "celebrating", "new role", "promoted to", "birthday",
  ];

  function detectContentTypes(article) {
    const types = new Set();
    // Poll detection
    for (const el of article.querySelectorAll("span, p, div")) {
      if (el.children.length > 0) continue;
      const t = el.textContent.trim();
      if (POLL_VOTE_RE.test(t) || t === "Show results") {
        types.add("poll");
        break;
      }
    }
    // Celebration detection — check full post text for known patterns
    const fullText = article.textContent.toLowerCase();
    if (CELEBRATION_PATTERNS.some((p) => fullText.includes(p))) {
      types.add("celebration");
    }
    return types;
  }

  // === Stats counter (batched to avoid per-post storage I/O) ===
  let pendingStats = {};

  function incrementStat(key) {
    pendingStats[key] = (pendingStats[key] || 0) + 1;
  }

  function flushStats() {
    const batch = pendingStats;
    pendingStats = {};
    if (Object.keys(batch).length === 0) return;
    const statsDefaults = SIFT_STATS_DEFAULTS;
    chrome.storage.local.get(statsDefaults, (data) => {
      const today = new Date().toISOString().slice(0, 10);
      if (data.stats.today !== today) {
        data.stats = { ...SIFT_STATS_DEFAULTS.stats, today };
      }
      for (const [key, count] of Object.entries(batch)) {
        data.stats[key] = (data.stats[key] || 0) + count;
        data.statsAllTime[key] = (data.statsAllTime[key] || 0) + count;
      }
      chrome.storage.local.set(data);
    });
  }

  function feedMain() {
    return feedDoc.querySelector('main[role="main"]') || feedDoc.querySelector("main");
  }

  // LinkedIn 2026 DOM: posts are div[data-display-contents] inside role="list".
  // Falls back to legacy [role="article"] for older layouts.
  function feedPosts(container) {
    const list = container.querySelector('[role="list"]');
    if (list) {
      const posts = list.querySelectorAll(':scope > [data-display-contents]');
      if (posts.length) return posts;
    }
    return container.querySelectorAll('[role="article"]');
  }

  // Scan and tag all posts, then flush stats in a single storage write
  function scanPosts() {
    // Guard against stale feedDoc (iframe removed or replaced)
    if (feedDoc !== document && !feedDoc.defaultView) updateFeedDoc();
    const main = feedMain();
    if (!main) return;
    const articles = feedPosts(main);
    for (const article of articles) {
      if (!article.dataset.ljTypeChecked) {
        article.dataset.ljTypeChecked = "1";
        const labels = detectPostLabels(article);
        if (labels.has("Promoted")) {
          article.dataset.ljPromoted = "true";
          if (settings.hidePromoted) incrementStat("adsHidden");
        }
        if (labels.has("Suggested")) {
          article.dataset.ljSuggested = "true";
          if (settings.hideSuggested) incrementStat("suggestedHidden");
        }
        if ([...labels].some((l) => RECOMMENDED_LABELS.has(l))) {
          article.dataset.ljRecommended = "true";
          if (settings.hideRecommended) incrementStat("recommendedHidden");
        }
        const hasFollow = !!article.querySelector('button[aria-label*="Follow"]');
        // Interaction posts ("X likes this", "X reposted this") appear through
        // network activity — don't treat them as strangers even if author has Follow btn.
        const postText = article.textContent.slice(0, 200).toLowerCase();
        const isInteraction = /likes? this|loves? this|reposted this|commented on|celebrates this|finds? this/.test(postText);
        if (hasFollow && !isInteraction) {
          article.dataset.ljNonConnection = "true";
          if (settings.hideNonConnections) incrementStat("strangersHidden");
        }
      }

      // Content type detection (polls, etc.) — one-time check like type labels
      if (!article.dataset.ljContentChecked) {
        article.dataset.ljContentChecked = "1";
        const contentTypes = detectContentTypes(article);
        if (contentTypes.has("poll")) {
          article.dataset.ljPoll = "true";
          if (settings.hidePolls) incrementStat("pollsHidden");
        }
        if (contentTypes.has("celebration")) {
          article.dataset.ljCelebration = "true";
          if (settings.hideCelebrations) incrementStat("celebrationsHidden");
        }
      }

      // Keyword filter — checked separately because keywords can be added/removed,
      // requiring re-evaluation (unlike immutable type labels above).
      if (settings.feedKeywordFilterEnabled && settings.feedKeywords && settings.feedKeywords.length > 0) {
        if (!article.dataset.ljKeywordChecked) {
          article.dataset.ljKeywordChecked = "1";
          const matched = matchesFeedKeyword(article.textContent, settings.feedKeywords);
          if (matched) {
            article.dataset.ljKeywordFiltered = "true";
            incrementStat("keywordsHidden");
          }
        }
      }

      // Post age filter — parse visible time text (e.g. "2d", "1w")
      if (settings.postAgeLimit > 0 && !article.dataset.ljAgeChecked) {
        article.dataset.ljAgeChecked = "1";
        // Find time text: a short element containing "Xd •", "Xw •", etc.
        let timeText = "";
        for (const el of article.querySelectorAll("p, span")) {
          const t = el.textContent.trim();
          if (/^\d+[hdwmy]\b/.test(t)) { timeText = t.split(/[·•]/)[0].trim(); break; }
        }
        if (timeText) {
          const ageDays = parsePostAgeDays(timeText);
          if (ageDays >= settings.postAgeLimit) {
            article.dataset.ljTooOld = "true";
          }
        }
      }
    }
    flushStats();
  }

  // Clear dataset marks on all articles so they get re-evaluated on next scan.
  function clearPostMarks(...keys) {
    const main = feedMain();
    if (!main) return;
    for (const article of feedPosts(main)) {
      for (const key of keys) delete article.dataset[key];
    }
  }

  // === Unfollow button injection on posts ===

  function makeUnfollowBtn(article) {
    const btn = feedDoc.createElement("button");
    btn.className = "lj-unfollow-btn";
    btn.title = "Unfollow — refresh page to clear remaining posts";
    btn.textContent = "Unfollow";
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      const menuBtn = article.querySelector('button[aria-label*="control menu"]');
      if (menuBtn) {
        menuBtn.click();
        watchForUnfollowConfirmation(article);
      }
    });
    return btn;
  }

  // After user clicks Unfollow from LinkedIn's dropdown menu, LinkedIn shows
  // an inline confirmation card ("You unfollowed X"). Auto-collapse it after
  // a brief moment so it doesn't clutter the feed.
  function watchForUnfollowConfirmation(article) {
    let checks = 0;
    const interval = setInterval(() => {
      if (++checks > UNFOLLOW_MAX_CHECKS || !article.isConnected) { clearInterval(interval); return; }
      // LinkedIn replaces the post content with "You unfollowed ..."
      if (article.textContent.includes("You unfollowed")) {
        clearInterval(interval);
        setTimeout(() => {
          article.style.display = "none";
        }, UNFOLLOW_COLLAPSE_DELAY_MS);
      }
    }, UNFOLLOW_CHECK_INTERVAL_MS);
  }

  function injectUnfollowButtons() {
    const main = feedMain();
    if (!main) return;
    for (const article of feedPosts(main)) {
      if (article.dataset.ljUnfollowAdded) continue;
      article.dataset.ljUnfollowAdded = "1";

      // 1) Author-level: place right after "• 1st"
      let degreeEl = null;
      for (const el of article.querySelectorAll("div")) {
        const t = el.textContent.trim();
        if ((t === "\u2022 1st" || t === "\u00b7 1st") && el.children.length <= 1) {
          degreeEl = el;
          break;
        }
      }
      if (degreeEl) {
        Object.assign(degreeEl.style, { display: "inline-flex", alignItems: "center", gap: "6px" });
        degreeEl.appendChild(makeUnfollowBtn(article));
      }

      // 2) Interaction header: "XXX likes this" / "XXX loves this" / "XXX reposted"
      const interactionRe = /\b(likes? this|loves? this|reposted|celebrates? this|commented on this|finds? this)\b/i;
      for (const p of article.querySelectorAll("p")) {
        const pt = p.textContent.trim();
        if (pt.length > 80 || !interactionRe.test(pt)) continue;
        if (p.querySelector(".lj-unfollow-btn")) break;
        const nameLink = p.querySelector('a[href*="/in/"]');
        if (!nameLink) break;
        const btn = makeUnfollowBtn(article);
        btn.style.marginLeft = "6px";
        p.appendChild(btn);
        break;
      }
    }
  }

  // === Toast notification (with optional undo action) ===
  let toastTimer = null;

  function showToast(msg, onUndo) {
    let toast = feedDoc.getElementById("lj-feed-toast");
    if (!toast) {
      toast = feedDoc.createElement("div");
      toast.id = "lj-feed-toast";
      feedDoc.body.appendChild(toast);
    }
    clearTimeout(toastTimer);
    toast.innerHTML = "";
    toast.appendChild(feedDoc.createTextNode(msg));
    if (onUndo) {
      const btn = feedDoc.createElement("button");
      btn.id = "lj-toast-undo";
      btn.textContent = "Undo";
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        onUndo();
        toast.classList.remove("visible");
      });
      toast.appendChild(btn);
    }
    toast.classList.add("visible");
    toastTimer = setTimeout(() => toast.classList.remove("visible"), onUndo ? 5000 : 1800);
  }

  // === Mini status badge (clickable with breakdown) ===
  function createMiniBadge() {
    if (!isFeedPage()) {
      const existing = feedDoc.getElementById("lj-mini-badge");
      if (existing) existing.remove();
      const tip = feedDoc.getElementById("lj-badge-tip");
      if (tip) tip.remove();
      return;
    }
    if (feedDoc.getElementById("lj-mini-badge")) return;
    const badge = feedDoc.createElement("div");
    badge.id = "lj-mini-badge";
    badge.style.cursor = "pointer";
    feedDoc.body.appendChild(badge);

    // Breakdown tooltip
    const tip = feedDoc.createElement("div");
    tip.id = "lj-badge-tip";
    feedDoc.body.appendChild(tip);

    badge.addEventListener("click", () => {
      tip.classList.toggle("visible");
      if (tip.classList.contains("visible")) updateBreakdown();
    });

    // Close on click outside
    feedDoc.addEventListener("click", (e) => {
      if (!badge.contains(e.target) && !tip.contains(e.target)) {
        tip.classList.remove("visible");
      }
    });

    updateBadgeCount();
  }

  function updateBreakdown() {
    const tip = feedDoc.getElementById("lj-badge-tip");
    if (!tip) return;
    const counts = {
      Ads: feedDoc.querySelectorAll('[data-lj-promoted="true"]').length,
      Suggested: feedDoc.querySelectorAll('[data-lj-suggested="true"]').length,
      Recommended: feedDoc.querySelectorAll('[data-lj-recommended="true"]').length,
      Strangers: feedDoc.querySelectorAll('[data-lj-non-connection="true"]').length,
      Polls: feedDoc.querySelectorAll('[data-lj-poll="true"]').length,
      Celebrations: feedDoc.querySelectorAll('[data-lj-celebration="true"]').length,
      Keywords: feedDoc.querySelectorAll('[data-lj-keyword-filtered="true"]').length,
      "Too Old": feedDoc.querySelectorAll('[data-lj-too-old="true"]').length,
    };
    const lines = Object.entries(counts).filter(([, v]) => v > 0).map(([k, v]) => v + " " + k);
    tip.textContent = lines.length > 0 ? lines.join("\n") : "Nothing filtered yet";
  }

  function updateBadgeCount() {
    const badge = feedDoc.getElementById("lj-mini-badge");
    if (!badge) return;
    const count = feedDoc.querySelectorAll('[data-lj-promoted="true"], [data-lj-suggested="true"], [data-lj-recommended="true"], [data-lj-non-connection="true"], [data-lj-poll="true"], [data-lj-celebration="true"], [data-lj-keyword-filtered="true"], [data-lj-too-old="true"]').length;
    badge.textContent = count > 0 ? "\uD83D\uDD0D " + count + " filtered" : "\uD83D\uDD0D Sift";
    // Also update breakdown if visible
    const tip = feedDoc.getElementById("lj-badge-tip");
    if (tip && tip.classList.contains("visible")) updateBreakdown();
  }

  // === Profile page: apply sidebar + analytics body classes ===
  let profileInitialized = false;

  function applyProfileClasses() {
    document.body.classList.toggle("lj-hide-sidebar", settings.hideSidebar);
    document.body.classList.toggle("lj-hide-profile-analytics", settings.hideProfileAnalytics);
  }

  function bootProfile() {
    if (profileInitialized) return;
    profileInitialized = true;
    loadSettings(() => applyProfileClasses());
  }

  function teardownProfile() {
    if (!profileInitialized) return;
    profileInitialized = false;
    document.body.classList.remove("lj-hide-sidebar", "lj-hide-profile-analytics");
  }

  // === Network page: hide sidebar ad + game promo ===
  let networkInitialized = false;

  function hideNetworkAds() {
    // Hide ad iframe container (Promoted ad in left sidebar)
    const adIframe = document.querySelector('iframe[src="about:blank"]');
    if (adIframe) {
      const adCard = adIframe.parentElement?.parentElement;
      if (adCard && adCard.offsetWidth < 400) adCard.style.display = "none";
    }
    // Game promo is handled by CSS via body class
    document.body.classList.toggle("lj-hide-network-game", settings.hidePromoted);
  }

  function bootNetwork() {
    if (networkInitialized) return;
    networkInitialized = true;
    loadSettings(() => {
      hideNetworkAds();
      // Ad may load late — re-check a few times
      let ticks = 0;
      const interval = setInterval(() => {
        hideNetworkAds();
        if (++ticks >= 10) clearInterval(interval);
      }, 2000);
    });
  }

  function teardownNetwork() {
    if (!networkInitialized) return;
    networkInitialized = false;
    document.body.classList.remove("lj-hide-network-game");
  }

  function applyBodyClasses() {
    feedDoc.body.classList.toggle("lj-hide-promoted", settings.hidePromoted);
    feedDoc.body.classList.toggle("lj-hide-suggested", settings.hideSuggested);
    feedDoc.body.classList.toggle("lj-hide-recommended", settings.hideRecommended);
    feedDoc.body.classList.toggle("lj-hide-non-connections", settings.hideNonConnections);
    feedDoc.body.classList.toggle("lj-hide-sidebar", settings.hideSidebar);
    feedDoc.body.classList.toggle("lj-hide-polls", settings.hidePolls);
    feedDoc.body.classList.toggle("lj-hide-celebrations", settings.hideCelebrations);
    feedDoc.body.classList.toggle("lj-hide-keyword-filtered", settings.feedKeywordFilterEnabled);
    feedDoc.body.classList.toggle("lj-hide-old-posts", settings.postAgeLimit > 0);
  }

  // Only re-scan when actual settings change, not stats writes
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (!Object.keys(changes).some((k) => SETTING_KEYS.has(k))) return;
    // Keyword list changed — clear marks so posts get re-evaluated
    if ("feedKeywords" in changes || "feedKeywordFilterEnabled" in changes) {
      clearPostMarks("ljKeywordChecked", "ljKeywordFiltered");
    }
    if ("postAgeLimit" in changes) {
      clearPostMarks("ljAgeChecked", "ljTooOld");
    }
    loadSettings((s) => {
      if (profileInitialized) applyProfileClasses();
      if (networkInitialized) hideNetworkAds();
      applyBodyClasses();
      if (s.hideSidebar) enforceSidebarHidden();
      else cleanupSidebarOverrides();
      scanPosts();
      updateBadgeCount();
    });
  });

  // === Sidebar enforcement ===
  // CSS body class is the primary mechanism; JS polling is the fallback
  // for async rendering after SPA navigation.
  const SIDEBAR_SELECTORS = [
    'aside[aria-label="LinkedIn News"]',
    '[role="complementary"][aria-label="LinkedIn News"]',
    'footer[aria-label="LinkedIn Footer Content"]',
    '[role="contentinfo"][aria-label="LinkedIn Footer Content"]',
  ];
  const SIDEBAR_SELECTOR_ALL = SIDEBAR_SELECTORS.join(",");
  let sidebarInterval = null;

  function hideSidebarElements() {
    feedDoc.querySelectorAll(SIDEBAR_SELECTOR_ALL).forEach((node) => {
      node.style.display = "none";
    });
  }

  function enforceSidebarHidden() {
    if (sidebarInterval) clearInterval(sidebarInterval);
    hideSidebarElements();
    let ticks = 0;
    sidebarInterval = setInterval(() => {
      hideSidebarElements();
      if (++ticks >= SIDEBAR_POLL_MAX_TICKS) clearInterval(sidebarInterval);
    }, SIDEBAR_POLL_INTERVAL_MS);
  }

  function injectSidebarStyle() {
    if (feedDoc.getElementById("lj-sidebar-style")) return;
    const s = feedDoc.createElement("style");
    s.id = "lj-sidebar-style";
    s.textContent = SIDEBAR_SELECTOR_ALL + "{display:none!important}";
    feedDoc.head.appendChild(s);
  }

  // Remove JS-injected sidebar overrides so the CSS toggle can work
  function cleanupSidebarOverrides() {
    if (sidebarInterval) { clearInterval(sidebarInterval); sidebarInterval = null; }
    const injected = feedDoc.getElementById("lj-sidebar-style");
    if (injected) injected.remove();
    feedDoc.querySelectorAll(SIDEBAR_SELECTOR_ALL).forEach((node) => {
      node.style.removeProperty("display");
    });
  }

  // === Inject feed.css into iframe (extension CSS doesn't load there) ===
  function injectFeedCssIntoIframe() {
    if (feedDoc === document) return;
    if (feedDoc.getElementById("lj-feed-css")) return;
    for (const sheet of document.styleSheets) {
      try {
        if (!sheet.href || !sheet.href.includes("feed.css")) continue;
        const rules = [...sheet.cssRules].map((r) => r.cssText).join("\n");
        const style = feedDoc.createElement("style");
        style.id = "lj-feed-css";
        style.textContent = rules;
        feedDoc.head.appendChild(style);
        return;
      } catch (e) {}
    }
  }

  // MutationObserver was removed in v2.8 — it fires 0 mutations on LinkedIn's
  // 2026 DOM. Continuous interval scanning (startContinuousScan) replaced it.
  // See LEARNINGS §24 for rationale.

  // === Apply features that don't need <main> ===
  function applyShell() {
    updateFeedDoc();
    injectFeedCssIntoIframe();
    applyBodyClasses();
    if (settings.hideSidebar) { injectSidebarStyle(); enforceSidebarHidden(); }
    createMiniBadge();
  }

  // === Apply features that need <main> ===
  function applyFeed() {
    scanPosts();
    injectUnfollowButtons();
    updateBadgeCount();
  }

  // === Re-apply all features (used after iframe detection or SPA navigation) ===
  function reapply() {
    applyShell();
    applyFeed();
  }

  // === Init ===
  let booting = false;

  function boot() {
    if (initialized || booting || !isFeedPage()) return;
    booting = true;

    loadSettings(() => {
      initialized = true;
      booting = false;
      reapply();
      // Continuous scanning for initial load + infinite scroll
      startContinuousScan();
      // Iframe may not be ready yet on initial load — poll for it
      startIframeCheck();
      // One-time onboarding toast for new users
      if (!settings.hasSeenOnboarding) {
        setTimeout(() => {
          showToast("Sift is active \u2014 filtering your feed. Click the Sift icon to customize.");
        }, 1500);
        chrome.storage.local.set({ hasSeenOnboarding: true });
      }
    });
  }

  // === Continuous post scanning ===
  // LinkedIn's 2026 DOM doesn't reliably trigger MutationObserver or scroll
  // events. Use a simple interval that scans for new posts continuously.
  const SCAN_INTERVAL_MS = 1500;
  let scanInterval = null;

  function fullScan() {
    scanPosts();
    injectUnfollowButtons();
    updateBadgeCount();
  }

  function startContinuousScan() {
    if (scanInterval) clearInterval(scanInterval);
    scanInterval = setInterval(fullScan, SCAN_INTERVAL_MS);
  }

  // === Periodic iframe detection ===
  // After SPA navigation, the iframe may take a moment to load content.
  let iframeCheckInterval = null;

  function startIframeCheck() {
    if (iframeCheckInterval) clearInterval(iframeCheckInterval);
    let ticks = 0;
    iframeCheckInterval = setInterval(() => {
      const prevDoc = feedDoc;
      updateFeedDoc();
      if (feedDoc !== prevDoc) {
        reapply();
        clearInterval(iframeCheckInterval);
        return;
      }
      if (++ticks >= IFRAME_POLL_MAX_TICKS) clearInterval(iframeCheckInterval);
    }, IFRAME_POLL_INTERVAL_MS);
  }

  // Boot immediately based on current page
  boot();
  if (isProfilePage()) bootProfile();
  if (isNetworkPage()) bootNetwork();

  // === SPA navigation detection ===
  // Primary: intercept History API (immediate response).
  // Fallback: URL polling at reduced frequency for edge cases.
  let lastUrl = location.href;

  function handleFeedRouteChange() {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    // Profile page handling
    if (isProfilePage()) { bootProfile(); } else { teardownProfile(); }
    // Network page handling
    if (isNetworkPage()) { bootNetwork(); } else { teardownNetwork(); }
    // Feed page handling
    if (isFeedPage()) {
      if (!initialized && !booting) {
        boot();
      } else if (initialized) {
        reapply();
        startIframeCheck();
      }
      // if booting, do nothing — boot() callback will finish init
    } else {
      initialized = false;
      feedDoc = document;
      if (sidebarInterval) clearInterval(sidebarInterval);
      if (iframeCheckInterval) clearInterval(iframeCheckInterval);
      if (scanInterval) {
        clearInterval(scanInterval);
        scanInterval = null;
      }
    }
  }

  // History API interception (same pattern as content.js)
  window.addEventListener("popstate", handleFeedRouteChange);
  const origPushState = history.pushState;
  const origReplaceState = history.replaceState;
  history.pushState = function () {
    origPushState.apply(this, arguments);
    handleFeedRouteChange();
  };
  history.replaceState = function () {
    origReplaceState.apply(this, arguments);
    handleFeedRouteChange();
  };

  // Fallback poll (catches Navigation API, link clicks, etc.)
  setInterval(() => {
    if (location.href !== lastUrl) handleFeedRouteChange();
  }, SPA_POLL_INTERVAL_MS);
}
