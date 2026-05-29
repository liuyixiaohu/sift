(() => {
  // src/shared/defaults.js
  var SIFT_DEFAULTS = {
    // Storage schema version — bumped via src/shared/schema.js#migrate when
    // the shape of stored data changes. New installs start at the latest.
    schemaVersion: 2,
    // Global master toggle. When true, all filtering / hiding / dimming is
    // suspended across feed, profile, network, and jobs pages. Diagnostic
    // counts still flow so the user can see what Sift WOULD hide if unpaused.
    siftPaused: false,
    // Feed page
    hidePromoted: true,
    hideSuggested: true,
    hideRecommended: true,
    hideNonConnections: false,
    hidePolls: false,
    hideCelebrations: false,
    feedKeywordFilterEnabled: true,
    // Match mode for feedKeywords: "wholeWord" | "substring" | "regex".
    // New installs get "wholeWord" — see src/shared/matching.js for semantics.
    // Existing v1 users are migrated to "substring" to preserve behavior.
    feedKeywordMatchMode: "wholeWord",
    feedKeywords: [],
    postAgeLimit: 0,
    // 0 = off, days threshold: 1, 3, 7, 14, 30
    hasSeenOnboarding: false,
    // Profile page
    hideProfileAnalytics: true,
    hideProfileSuggestions: true,
    // Jobs page
    sponsorCheckEnabled: true,
    unpaidCheckEnabled: true,
    autoSkipDetected: false,
    dimFiltered: false,
    hideFiltered: false,
    skippedCompanies: [],
    skippedTitleKeywords: []
  };
  var SIFT_STATS_DEFAULTS = {
    stats: {
      today: "",
      adsHidden: 0,
      suggestedHidden: 0,
      recommendedHidden: 0,
      strangersHidden: 0,
      pollsHidden: 0,
      celebrationsHidden: 0,
      keywordsHidden: 0,
      jobsFlagged: 0,
      jobsScanned: 0
    },
    statsAllTime: {
      adsHidden: 0,
      suggestedHidden: 0,
      recommendedHidden: 0,
      strangersHidden: 0,
      pollsHidden: 0,
      celebrationsHidden: 0,
      keywordsHidden: 0,
      jobsFlagged: 0,
      jobsScanned: 0
    }
  };

  // src/shared/lists.js
  function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  function matchesWholeWord(haystack, needle) {
    if (typeof haystack !== "string" || typeof needle !== "string") return false;
    if (haystack.length === 0 || needle.length === 0) return false;
    return new RegExp(`(?<!\\w)${escapeRegex(needle)}(?!\\w)`, "i").test(haystack);
  }

  // src/shared/matching.js
  function validateKeywords(keywords, mode) {
    const out = { valid: [], invalid: [] };
    if (!Array.isArray(keywords)) return out;
    for (const kw of keywords) {
      if (typeof kw !== "string") continue;
      if (kw.trim() === "") continue;
      if (mode === "regex") {
        try {
          new RegExp(kw, "i");
          out.valid.push(kw);
        } catch {
          out.invalid.push(kw);
        }
      } else {
        out.valid.push(kw);
      }
    }
    return out;
  }
  function matchesFeedKeyword(text, keywords, mode = "substring") {
    if (!keywords || keywords.length === 0) return null;
    if (mode === "regex") {
      for (const kw of keywords) {
        if (!kw) continue;
        try {
          if (new RegExp(kw, "i").test(text)) return kw;
        } catch {
        }
      }
      return null;
    }
    if (mode === "wholeWord") {
      for (const kw of keywords) {
        if (kw && matchesWholeWord(text, kw)) return kw;
      }
      return null;
    }
    const lower = text.toLowerCase();
    for (const kw of keywords) {
      if (kw && lower.includes(kw.toLowerCase())) return kw;
    }
    return null;
  }
  function parsePostAgeDays(timeText) {
    const m = timeText.match(/^(\d+)\s*(m|h|d|w|mo|y|yr)$/);
    if (!m) return 0;
    const n = parseInt(m[1], 10);
    switch (m[2]) {
      case "m":
        return 0;
      // minutes
      case "h":
        return 0;
      // hours (< 1 day)
      case "d":
        return n;
      case "w":
        return n * 7;
      case "mo":
        return n * 30;
      case "y":
      case "yr":
        return n * 365;
      default:
        return 0;
    }
  }

  // src/shared/setting-keys.js
  var FEED_PAGE_SETTING_KEYS = /* @__PURE__ */ new Set([
    "siftPaused",
    "hidePromoted",
    "hideSuggested",
    "hideRecommended",
    "hideNonConnections",
    "hidePolls",
    "hideCelebrations",
    "feedKeywordFilterEnabled",
    "feedKeywordMatchMode",
    "feedKeywords",
    "postAgeLimit",
    "hideProfileAnalytics",
    "hideProfileSuggestions"
  ]);

  // src/feed.js
  if (chrome.runtime?.id) {
    let isFeedPage = function() {
      const p = location.pathname;
      return p === "/" || p.startsWith("/feed");
    }, isProfilePage = function() {
      return /^\/in\/[^/]+\/?$/.test(location.pathname);
    }, isNetworkPage = function() {
      return location.pathname.startsWith("/mynetwork");
    }, updateFeedDoc = function() {
      for (const iframe of document.querySelectorAll("iframe")) {
        if (iframe.offsetWidth < MIN_FEED_IFRAME_WIDTH) continue;
        try {
          const doc = iframe.contentDocument;
          if (doc && doc.body && doc.querySelector("main")) {
            feedDoc = doc;
            return;
          }
        } catch (e) {
        }
      }
      feedDoc = document;
    }, loadSettings = function(cb) {
      chrome.storage.local.get({ ...DEFAULTS }, (s) => {
        settings = s;
        cb(s);
      });
    }, detectPostLabels = function(article) {
      const found = /* @__PURE__ */ new Set();
      for (const el of article.querySelectorAll("span, a, p")) {
        if (el.children.length > 0) continue;
        const t = el.textContent.trim();
        if (POST_TYPE_LABELS.has(t)) {
          found.add(t);
          if (found.size === POST_TYPE_LABELS.size) break;
        }
      }
      return found;
    }, detectContentTypes = function(article) {
      const types = /* @__PURE__ */ new Set();
      for (const el of article.querySelectorAll("span, p, div")) {
        if (el.children.length > 0) continue;
        const t = el.textContent.trim();
        if (POLL_VOTE_RE.test(t) || t === "Show results") {
          types.add("poll");
          break;
        }
      }
      const fullText = article.textContent.toLowerCase();
      if (CELEBRATION_PATTERNS.some((p) => fullText.includes(p))) {
        types.add("celebration");
      }
      return types;
    }, incrementStat = function(key) {
      pendingStats[key] = (pendingStats[key] || 0) + 1;
    }, flushStats = function() {
      const batch = pendingStats;
      pendingStats = {};
      if (Object.keys(batch).length === 0) return;
      const statsDefaults = SIFT_STATS_DEFAULTS;
      chrome.storage.local.get(statsDefaults, (data) => {
        const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
        if (data.stats.today !== today) {
          data.stats = { ...SIFT_STATS_DEFAULTS.stats, today };
        }
        for (const [key, count] of Object.entries(batch)) {
          data.stats[key] = (data.stats[key] || 0) + count;
          data.statsAllTime[key] = (data.statsAllTime[key] || 0) + count;
        }
        chrome.storage.local.set(data);
      });
    }, feedMain = function() {
      return feedDoc.querySelector('main[role="main"]') || feedDoc.querySelector("main");
    }, feedPosts = function(container) {
      const list = container.querySelector('[role="list"]');
      if (list) {
        const posts = [...list.children].filter(
          (c) => c.matches('[role="listitem"]') || c.querySelector('[role="listitem"]')
        );
        if (posts.length) return posts;
        const legacy = [...list.querySelectorAll(":scope > [data-display-contents]")];
        if (legacy.length) return legacy;
      }
      return [...container.querySelectorAll('[role="article"]')];
    }, scanPosts = function() {
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
          const postText = article.textContent.slice(0, 200).toLowerCase();
          const isInteraction = /likes? this|loves? this|reposted this|commented on|celebrates this|finds? this/.test(postText);
          if (hasFollow && !isInteraction) {
            article.dataset.ljNonConnection = "true";
            if (settings.hideNonConnections) incrementStat("strangersHidden");
          }
        }
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
        if (settings.feedKeywordFilterEnabled && settings.feedKeywords && settings.feedKeywords.length > 0) {
          if (!article.dataset.ljKeywordChecked) {
            article.dataset.ljKeywordChecked = "1";
            const matched = matchesFeedKeyword(
              article.textContent,
              settings.feedKeywords,
              settings.feedKeywordMatchMode || "substring"
            );
            if (matched) {
              article.dataset.ljKeywordFiltered = "true";
              incrementStat("keywordsHidden");
            }
          }
        }
        if (settings.postAgeLimit > 0 && !article.dataset.ljAgeChecked) {
          article.dataset.ljAgeChecked = "1";
          let timeText = "";
          for (const el of article.querySelectorAll("p, span")) {
            const t = el.textContent.trim();
            if (/^\d+[hdwmy]\b/.test(t)) {
              timeText = t.split(/[·•]/)[0].trim();
              break;
            }
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
      markProfileNoise();
    }, clearPostMarks = function(...keys) {
      const main = feedMain();
      if (!main) return;
      for (const article of feedPosts(main)) {
        for (const key of keys) delete article.dataset[key];
      }
    }, makeUnfollowBtn = function(article) {
      const btn = feedDoc.createElement("button");
      btn.className = "lj-unfollow-btn";
      btn.title = "Unfollow \u2014 refresh page to clear remaining posts";
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
    }, watchForUnfollowConfirmation = function(article) {
      let checks = 0;
      const interval = setInterval(() => {
        if (++checks > UNFOLLOW_MAX_CHECKS || !article.isConnected) {
          clearInterval(interval);
          return;
        }
        if (article.textContent.includes("You unfollowed")) {
          clearInterval(interval);
          setTimeout(() => {
            article.style.display = "none";
          }, UNFOLLOW_COLLAPSE_DELAY_MS);
        }
      }, UNFOLLOW_CHECK_INTERVAL_MS);
    }, injectUnfollowButtons = function() {
      const main = feedMain();
      if (!main) return;
      for (const article of feedPosts(main)) {
        if (article.dataset.ljUnfollowAdded) continue;
        article.dataset.ljUnfollowAdded = "1";
        let degreeEl = null;
        for (const el of article.querySelectorAll("div")) {
          const t = el.textContent.trim();
          if ((t === "\u2022 1st" || t === "\xB7 1st") && el.children.length <= 1) {
            degreeEl = el;
            break;
          }
        }
        if (degreeEl) {
          Object.assign(degreeEl.style, { display: "inline-flex", alignItems: "center", gap: "6px" });
          degreeEl.appendChild(makeUnfollowBtn(article));
        }
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
    }, showToast = function(msg, onUndo) {
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
      toastTimer = setTimeout(() => toast.classList.remove("visible"), onUndo ? 5e3 : 1800);
    }, createMiniBadge = function() {
      if (!isFeedPage()) {
        const existing = feedDoc.getElementById("lj-mini-badge");
        if (existing) existing.remove();
        const tip2 = feedDoc.getElementById("lj-badge-tip");
        if (tip2) tip2.remove();
        return;
      }
      if (feedDoc.getElementById("lj-mini-badge")) return;
      const badge = feedDoc.createElement("div");
      badge.id = "lj-mini-badge";
      badge.style.cursor = "pointer";
      feedDoc.body.appendChild(badge);
      const tip = feedDoc.createElement("div");
      tip.id = "lj-badge-tip";
      feedDoc.body.appendChild(tip);
      badge.addEventListener("click", () => {
        tip.classList.toggle("visible");
        if (tip.classList.contains("visible")) updateBreakdown();
      });
      feedDoc.addEventListener("click", (e) => {
        if (!badge.contains(e.target) && !tip.contains(e.target)) {
          tip.classList.remove("visible");
        }
      });
      updateBadgeCount();
    }, updateBreakdown = function() {
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
        "Too Old": feedDoc.querySelectorAll('[data-lj-too-old="true"]').length
      };
      const lines = Object.entries(counts).filter(([, v]) => v > 0).map(([k, v]) => v + " " + k);
      tip.textContent = lines.length > 0 ? lines.join("\n") : "Nothing filtered yet";
    }, updateBadgeCount = function() {
      const badge = feedDoc.getElementById("lj-mini-badge");
      if (!badge) return;
      if (settings.siftPaused) {
        badge.dataset.paused = "true";
        badge.textContent = "\u{1F50D} Sift paused";
      } else {
        delete badge.dataset.paused;
        const count = feedDoc.querySelectorAll(
          '[data-lj-promoted="true"], [data-lj-suggested="true"], [data-lj-recommended="true"], [data-lj-non-connection="true"], [data-lj-poll="true"], [data-lj-celebration="true"], [data-lj-keyword-filtered="true"], [data-lj-too-old="true"]'
        ).length;
        badge.textContent = count > 0 ? "\u{1F50D} " + count + " filtered" : "\u{1F50D} Sift";
      }
      const tip = feedDoc.getElementById("lj-badge-tip");
      if (tip && tip.classList.contains("visible")) updateBreakdown();
    }, findNoiseWrapper = function(headingEl) {
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
    }, markProfileNoise = function() {
      const root = feedDoc || document;
      const scopes = isProfilePage() ? [...root.querySelectorAll("aside[aria-label]"), root.querySelector("main")].filter(
        Boolean
      ) : [...root.querySelectorAll("aside[aria-label]")];
      for (const scope of scopes) {
        scope.querySelectorAll("h1, h2, h3, h4, p, span").forEach((el) => {
          if (el.children.length > 0) return;
          const text = (el.textContent || "").trim();
          if (PROFILE_NOISE_HEADINGS.has(text)) {
            const wrapper = findNoiseWrapper(el);
            if (wrapper && !wrapper.dataset.ljProfileNoise) {
              wrapper.dataset.ljProfileNoise = "true";
            }
          }
          if (PROFILE_ANALYTICS_HEADINGS.has(text)) {
            const wrapper = findNoiseWrapper(el);
            if (wrapper && !wrapper.dataset.ljProfileAnalytics) {
              wrapper.dataset.ljProfileAnalytics = "true";
            }
          }
        });
      }
      root.querySelectorAll('iframe[title="advertisement"]').forEach((iframe) => {
        const wrapper = iframe.parentElement;
        if (wrapper && !wrapper.dataset.ljProfileNoise) {
          wrapper.dataset.ljProfileNoise = "true";
        }
      });
    }, applyProfileClasses = function() {
      const active = !settings.siftPaused;
      document.body.classList.toggle("lj-sift-paused", settings.siftPaused);
      document.body.classList.toggle(
        "lj-hide-profile-analytics",
        active && settings.hideProfileAnalytics
      );
      document.body.classList.toggle(
        "lj-hide-profile-suggestions",
        active && settings.hideProfileSuggestions
      );
      markProfileNoise();
    }, bootProfile = function() {
      if (profileInitialized) return;
      profileInitialized = true;
      loadSettings(() => {
        applyProfileClasses();
        if (profileScanInterval) clearInterval(profileScanInterval);
        profileScanInterval = setInterval(markProfileNoise, PROFILE_SCAN_INTERVAL_MS);
      });
    }, teardownProfile = function() {
      if (!profileInitialized) return;
      profileInitialized = false;
      document.body.classList.remove(
        "lj-hide-profile-analytics",
        "lj-hide-profile-suggestions"
      );
      if (profileScanInterval) {
        clearInterval(profileScanInterval);
        profileScanInterval = null;
      }
    }, hideNetworkAds = function() {
      const active = !settings.siftPaused;
      if (active) {
        const adIframe = document.querySelector('iframe[src="about:blank"]');
        if (adIframe) {
          const adCard = adIframe.parentElement?.parentElement;
          if (adCard && adCard.offsetWidth < 400) adCard.style.display = "none";
        }
      }
      document.body.classList.toggle("lj-sift-paused", settings.siftPaused);
      document.body.classList.toggle("lj-hide-network-game", active && settings.hidePromoted);
    }, bootNetwork = function() {
      if (networkInitialized) return;
      networkInitialized = true;
      loadSettings(() => {
        hideNetworkAds();
        let ticks = 0;
        const interval = setInterval(() => {
          hideNetworkAds();
          if (++ticks >= 10) clearInterval(interval);
        }, 2e3);
      });
    }, teardownNetwork = function() {
      if (!networkInitialized) return;
      networkInitialized = false;
      document.body.classList.remove("lj-hide-network-game");
    }, applyBodyClasses = function() {
      const active = !settings.siftPaused;
      feedDoc.body.classList.toggle("lj-sift-paused", settings.siftPaused);
      feedDoc.body.classList.toggle("lj-hide-promoted", active && settings.hidePromoted);
      feedDoc.body.classList.toggle("lj-hide-suggested", active && settings.hideSuggested);
      feedDoc.body.classList.toggle("lj-hide-recommended", active && settings.hideRecommended);
      feedDoc.body.classList.toggle(
        "lj-hide-non-connections",
        active && settings.hideNonConnections
      );
      feedDoc.body.classList.toggle("lj-hide-polls", active && settings.hidePolls);
      feedDoc.body.classList.toggle("lj-hide-celebrations", active && settings.hideCelebrations);
      feedDoc.body.classList.toggle(
        "lj-hide-keyword-filtered",
        active && settings.feedKeywordFilterEnabled
      );
      feedDoc.body.classList.toggle("lj-hide-old-posts", active && settings.postAgeLimit > 0);
      feedDoc.body.classList.toggle(
        "lj-hide-profile-suggestions",
        active && settings.hideProfileSuggestions
      );
    }, detectPageType = function() {
      if (isFeedPage()) return "feed";
      if (isProfilePage()) return "profile";
      if (isNetworkPage()) return "network";
      if (location.pathname.startsWith("/jobs")) return "jobs";
      return "other";
    }, collectDiagnostics = function() {
      const feedQ = (sel) => feedDoc.querySelectorAll(sel).length;
      const topQ = (sel) => document.querySelectorAll(sel).length;
      const keywordMode = settings.feedKeywordMatchMode || "substring";
      const { invalid: invalidKws } = validateKeywords(
        settings.feedKeywords || [],
        keywordMode
      );
      return {
        url: location.href,
        pageType: detectPageType(),
        paused: !!settings.siftPaused,
        feed: {
          promoted: feedQ('[data-lj-promoted="true"]'),
          suggested: feedQ('[data-lj-suggested="true"]'),
          recommended: feedQ('[data-lj-recommended="true"]'),
          nonConnection: feedQ('[data-lj-non-connection="true"]'),
          poll: feedQ('[data-lj-poll="true"]'),
          celebration: feedQ('[data-lj-celebration="true"]'),
          keywordFiltered: feedQ('[data-lj-keyword-filtered="true"]'),
          tooOld: feedQ('[data-lj-too-old="true"]')
        },
        profile: {
          noise: topQ('[data-lj-profile-noise="true"]'),
          analytics: topQ('[data-lj-profile-analytics="true"]')
        },
        jobs: {
          flagged: topQ("[data-lj-reasons]")
        },
        // > 0 means the user's regex keywords are unusable. The popup uses
        // this to suppress the false "DOM may have changed" warning and
        // instead point the user at their broken input.
        invalidKeywords: invalidKws.length
      };
    }, injectFeedCssIntoIframe = function() {
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
        } catch (e) {
        }
      }
    }, applyShell = function() {
      updateFeedDoc();
      injectFeedCssIntoIframe();
      applyBodyClasses();
      createMiniBadge();
    }, applyFeed = function() {
      scanPosts();
      injectUnfollowButtons();
      updateBadgeCount();
    }, reapply = function() {
      applyShell();
      applyFeed();
    }, boot = function() {
      if (initialized || booting || !isFeedPage()) return;
      booting = true;
      loadSettings(() => {
        initialized = true;
        booting = false;
        reapply();
        startContinuousScan();
        startIframeCheck();
        if (!settings.hasSeenOnboarding) {
          setTimeout(() => {
            showToast("Sift is active \u2014 filtering your feed. Click the Sift icon to customize.");
          }, 1500);
          chrome.storage.local.set({ hasSeenOnboarding: true });
        }
      });
    }, fullScan = function() {
      scanPosts();
      injectUnfollowButtons();
      updateBadgeCount();
    }, startContinuousScan = function() {
      if (scanInterval) clearInterval(scanInterval);
      scanInterval = setInterval(fullScan, SCAN_INTERVAL_MS);
    }, startIframeCheck = function() {
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
    }, handleFeedRouteChange = function() {
      if (location.href === lastUrl) return;
      lastUrl = location.href;
      if (isProfilePage()) {
        bootProfile();
      } else {
        teardownProfile();
      }
      if (isNetworkPage()) {
        bootNetwork();
      } else {
        teardownNetwork();
      }
      if (isFeedPage()) {
        if (!initialized && !booting) {
          boot();
        } else if (initialized) {
          reapply();
          startIframeCheck();
        }
      } else {
        initialized = false;
        feedDoc = document;
        if (iframeCheckInterval) clearInterval(iframeCheckInterval);
        if (scanInterval) {
          clearInterval(scanInterval);
          scanInterval = null;
        }
      }
    };
    "use strict";
    const MIN_FEED_IFRAME_WIDTH = 500;
    const IFRAME_POLL_INTERVAL_MS = 1e3;
    const IFRAME_POLL_MAX_TICKS = 20;
    const SPA_POLL_INTERVAL_MS = 3e3;
    const UNFOLLOW_CHECK_INTERVAL_MS = 500;
    const UNFOLLOW_MAX_CHECKS = 20;
    const UNFOLLOW_COLLAPSE_DELAY_MS = 1200;
    let initialized = false;
    let feedDoc = document;
    const DEFAULTS = SIFT_DEFAULTS;
    const SETTING_KEYS = FEED_PAGE_SETTING_KEYS;
    let settings = { ...DEFAULTS };
    const POST_TYPE_LABELS = /* @__PURE__ */ new Set([
      "Promoted",
      "Suggested",
      "Recommended for you",
      "Jobs recommended for you",
      "Popular course on LinkedIn Learning",
      "You\u2019re a top applicant for these jobs"
    ]);
    const RECOMMENDED_LABELS = /* @__PURE__ */ new Set([
      "Recommended for you",
      "Jobs recommended for you",
      "Popular course on LinkedIn Learning",
      "You\u2019re a top applicant for these jobs"
    ]);
    const POLL_VOTE_RE = /^\d+ votes?$/;
    const CELEBRATION_PATTERNS = [
      "job update",
      "started a new position",
      "work anniversary",
      "celebrating",
      "new role",
      "promoted to",
      "birthday"
    ];
    let pendingStats = {};
    let toastTimer = null;
    let profileInitialized = false;
    const PROFILE_SCAN_INTERVAL_MS = 1500;
    let profileScanInterval = null;
    const PROFILE_NOISE_HEADINGS = /* @__PURE__ */ new Set([
      // Profile page
      "Suggested for you",
      // middle column (skills prompt, etc.)
      "Who your viewers also viewed",
      // Premium right-column widget
      "People you may know",
      // right column
      "You might like",
      // right column
      // Feed page (right sidebar widgets)
      "LinkedIn News",
      "Today\u2019s puzzles"
      // curly apostrophe — LinkedIn uses it consistently
    ]);
    const PROFILE_ANALYTICS_HEADINGS = /* @__PURE__ */ new Set(["Analytics"]);
    let networkInitialized = false;
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg?.type !== "SIFT_DIAG") return false;
      try {
        sendResponse(collectDiagnostics());
      } catch (err) {
        console.warn("[Sift] collectDiagnostics threw:", err);
        sendResponse({ error: err?.message || String(err) });
      }
      return false;
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (!Object.keys(changes).some((k) => SETTING_KEYS.has(k))) return;
      if ("feedKeywords" in changes || "feedKeywordFilterEnabled" in changes || "feedKeywordMatchMode" in changes) {
        clearPostMarks("ljKeywordChecked", "ljKeywordFiltered");
      }
      if ("postAgeLimit" in changes) {
        clearPostMarks("ljAgeChecked", "ljTooOld");
      }
      loadSettings(() => {
        if (profileInitialized) applyProfileClasses();
        if (networkInitialized) hideNetworkAds();
        applyBodyClasses();
        scanPosts();
        updateBadgeCount();
      });
    });
    let booting = false;
    const SCAN_INTERVAL_MS = 1500;
    let scanInterval = null;
    let iframeCheckInterval = null;
    boot();
    if (isProfilePage()) bootProfile();
    if (isNetworkPage()) bootNetwork();
    let lastUrl = location.href;
    window.addEventListener("popstate", handleFeedRouteChange);
    const origPushState = history.pushState;
    const origReplaceState = history.replaceState;
    history.pushState = function() {
      origPushState.apply(this, arguments);
      handleFeedRouteChange();
    };
    history.replaceState = function() {
      origReplaceState.apply(this, arguments);
      handleFeedRouteChange();
    };
    setInterval(() => {
      if (location.href !== lastUrl) handleFeedRouteChange();
    }, SPA_POLL_INTERVAL_MS);
  }
})();
