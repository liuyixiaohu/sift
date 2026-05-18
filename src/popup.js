import { SIFT_DEFAULTS, SIFT_STATS_DEFAULTS } from "./shared/defaults.js";
import { relevantCountsFor } from "./shared/diag.js";
import { addUnique, removeCi } from "./shared/lists.js";
import { FEED_KEYWORD_MATCH_MODES, validateKeywords } from "./shared/matching.js";
import {
  estimateBytes,
  formatBytes,
  getStorageUsage,
  migrate,
  SCHEMA_VERSION,
  STORAGE_BLOCK_FRACTION,
  STORAGE_QUOTA_BYTES,
  STORAGE_WARN_FRACTION,
  validateImport,
} from "./shared/schema.js";

(function () {
  "use strict";

  // === Defaults ===

  const CONTROLS_DEFAULTS = SIFT_DEFAULTS;
  const STATS_DEFAULTS = SIFT_STATS_DEFAULTS;

  const STAT_LABELS = {
    adsHidden: "Ads Hidden",
    suggestedHidden: "Suggested Hidden",
    recommendedHidden: "Recommended Hidden",
    strangersHidden: "Strangers Hidden",
    pollsHidden: "Polls Hidden",
    celebrationsHidden: "Celebrations Hidden",
    jobsFlagged: "Jobs Flagged",
    keywordsHidden: "Keywords Hidden",
    jobsScanned: "Jobs Scanned",
  };

  // === Tab switching ===

  const tabBtns = document.querySelectorAll(".tab-btn");
  const tabContents = document.querySelectorAll(".tab-content");

  tabBtns.forEach(function (btn) {
    btn.addEventListener("click", function () {
      tabBtns.forEach(function (b) { b.classList.remove("active"); });
      tabContents.forEach(function (c) { c.classList.remove("active"); });
      btn.classList.add("active");
      document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
    });
  });

  // === Toast ===

  let toastEl = null;
  let toastTimer = null;

  function showToast(msg) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "toast";
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.remove("visible");
    }, 1800);
  }

  // === Typed confirmation (used to gate destructive actions) ===

  function matchesPhrase(input, phrase) {
    return input.trim().toLowerCase() === phrase;
  }

  // opts: { phrase, confirmLabel, onConfirm, onCancel }
  function showTypedConfirm(rowEl, opts) {
    rowEl.innerHTML = "";
    rowEl.removeAttribute("style");
    rowEl.className = "typed-confirm";

    let caption = document.createElement("div");
    caption.className = "typed-confirm-caption";
    caption.textContent = 'Type "' + opts.phrase + '" to confirm';

    let input = document.createElement("input");
    input.type = "text";
    input.className = "typed-confirm-input";
    input.placeholder = opts.phrase;
    input.autocomplete = "off";
    input.spellcheck = false;

    let actions = document.createElement("div");
    actions.className = "typed-confirm-actions";

    let cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "typed-confirm-cancel";
    cancelBtn.textContent = "Cancel";

    let confirmBtn = document.createElement("button");
    confirmBtn.type = "button";
    confirmBtn.className = "data-btn data-btn-reset typed-confirm-confirm";
    confirmBtn.textContent = opts.confirmLabel;
    confirmBtn.disabled = true;

    function refreshValidity() {
      confirmBtn.disabled = !matchesPhrase(input.value, opts.phrase);
    }

    input.addEventListener("input", refreshValidity);
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        if (matchesPhrase(input.value, opts.phrase)) opts.onConfirm();
      } else if (e.key === "Escape") {
        e.preventDefault();
        opts.onCancel();
      }
    });
    cancelBtn.addEventListener("click", function () { opts.onCancel(); });
    confirmBtn.addEventListener("click", function () {
      if (!matchesPhrase(input.value, opts.phrase)) return;
      opts.onConfirm();
    });

    actions.appendChild(cancelBtn);
    actions.appendChild(confirmBtn);
    rowEl.appendChild(caption);
    rowEl.appendChild(input);
    rowEl.appendChild(actions);

    setTimeout(function () { input.focus(); }, 0);
  }

  // === Helper: create toggle row ===

  function createToggle(label, checked, onChange) {
    let row = document.createElement("div");
    row.className = "toggle-row";

    let span = document.createElement("span");
    span.className = "toggle-label";
    span.textContent = label;

    let switchLabel = document.createElement("label");
    switchLabel.className = "toggle-switch";

    let input = document.createElement("input");
    input.type = "checkbox";
    input.checked = checked;
    input.addEventListener("change", function () {
      onChange(input.checked);
    });

    let slider = document.createElement("span");
    slider.className = "toggle-slider";

    switchLabel.appendChild(input);
    switchLabel.appendChild(slider);
    row.appendChild(span);
    row.appendChild(switchLabel);
    return row;
  }

  // === Helper: create list section ===

  const LIST_COLLAPSE_THRESHOLD = 5;

  // === Helper: create sub-group within a page section ===
  // Lets us cluster related controls inside a Feed / Jobs section without
  // splitting the page section itself. Returns the inner element to append to.
  function createSubGroup(parent, label) {
    const wrap = document.createElement("div");
    wrap.className = "sub-group";
    const heading = document.createElement("div");
    heading.className = "sub-group-title";
    heading.textContent = label;
    wrap.appendChild(heading);
    parent.appendChild(wrap);
    return wrap;
  }

  function createListSection(container, label, items, onRemove) {
    let section = document.createElement("div");
    section.className = "list-section";

    // Header
    let header = document.createElement("div");
    header.className = "list-header";
    let labelEl = document.createElement("span");
    labelEl.className = "list-label";
    labelEl.textContent = label;
    let countEl = document.createElement("span");
    countEl.className = "list-count";
    countEl.textContent = items.length > 0 ? items.length + " items" : "";
    header.appendChild(labelEl);
    header.appendChild(countEl);

    // Search input
    let searchRow = document.createElement("div");
    searchRow.className = "list-search-row";
    let searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.placeholder = "Search to find & remove\u2026";
    searchInput.className = "list-search-input";
    searchRow.appendChild(searchInput);

    // List container
    let listEl = document.createElement("div");
    listEl.className = "list-items";

    // "Show all" toggle — lives outside the scrollable list
    let toggleBtn = document.createElement("button");
    toggleBtn.className = "list-toggle-btn";
    toggleBtn.style.display = "none";

    section.appendChild(header);
    section.appendChild(searchRow);
    section.appendChild(listEl);
    section.appendChild(toggleBtn);
    container.appendChild(section);

    let expanded = false;
    let currentFilter = "";

    function renderItems(currentItems) {
      listEl.innerHTML = "";
      countEl.textContent = currentItems.length > 0 ? currentItems.length + " items" : "";

      // Hide search when list is small
      searchRow.style.display = currentItems.length > LIST_COLLAPSE_THRESHOLD ? "" : "none";

      if (currentItems.length === 0) {
        let empty = document.createElement("div");
        empty.className = "empty-state";
        empty.textContent = "None added yet";
        listEl.appendChild(empty);
        toggleBtn.style.display = "none";
        return;
      }

      let filtered = currentFilter
        ? currentItems.filter(function (item) { return item.toLowerCase().includes(currentFilter); })
        : currentItems;

      let isCollapsed = !currentFilter && !expanded && filtered.length > LIST_COLLAPSE_THRESHOLD;

      filtered.forEach(function (item, i) {
        let row = document.createElement("div");
        row.className = "list-item";
        if (isCollapsed && i >= LIST_COLLAPSE_THRESHOLD) row.style.display = "none";

        let nameSpan = document.createElement("span");
        nameSpan.textContent = item;
        nameSpan.title = item;

        let removeBtn = document.createElement("button");
        removeBtn.className = "list-item-remove";
        removeBtn.textContent = "\u00d7";
        removeBtn.addEventListener("click", function () {
          onRemove(item);
        });

        row.appendChild(nameSpan);
        row.appendChild(removeBtn);
        listEl.appendChild(row);
      });

      // Show/hide toggle button
      if (!currentFilter && currentItems.length > LIST_COLLAPSE_THRESHOLD) {
        toggleBtn.style.display = "";
        toggleBtn.textContent = expanded ? "Show less" : "Show all " + currentItems.length + " items";
      } else {
        toggleBtn.style.display = "none";
      }
    }

    // State for re-render
    let latestItems = items;

    toggleBtn.addEventListener("click", function () {
      expanded = !expanded;
      renderItems(latestItems);
    });

    searchInput.addEventListener("input", function () {
      currentFilter = searchInput.value.trim().toLowerCase();
      expanded = false;
      renderItems(latestItems);
    });

    function render(newItems) {
      latestItems = newItems;
      renderItems(newItems);
    }

    return render;
  }

  // === Diagnostic panel ===
  // Asks the content script "what does Sift see on this LinkedIn tab right now?"
  // and renders the live counts at the top of Controls. Lets users (and us)
  // spot selector breakage in one glance: if Hide Ads is ON but the panel
  // shows "0 Ads" on a feed page, LinkedIn probably renamed an attribute and
  // we should investigate.

  const DIAG_PAGE_LABELS = {
    feed: "Feed",
    profile: "Profile",
    jobs: "Jobs",
    network: "Network",
    other: "Other",
  };

  // `relevantCountsFor` lives in src/shared/diag.js so the warning logic is
  // unit-testable (see tests/diag.test.js). It now returns items with a
  // `severity` field ("ok" or "warn") — "warn" fires when a toggle is ON,
  // the page type is relevant, but Sift sees ZERO matches. That's the
  // "your selector might have broken" signal.

  function buildDiagnosticPanel(container, initialSettings) {
    // The settings closure was a real footgun (S5 from the review): a
    // user toggling Hide Ads off and then clicking the ↻ button still
    // saw a ⚠ warn-severity chip on Ads=0 because relevantCountsFor()
    // read the OLD toggle value from the closure. Fix by re-reading
    // storage inside refresh() — costs one extra round-trip per click,
    // worth it for honesty. We use `initialSettings` only as a key list
    // for the storage.get default object.
    const settingKeyDefaults = initialSettings;

    const wrap = document.createElement("div");
    wrap.className = "diag-panel";
    wrap.dataset.state = "loading";

    const titleRow = document.createElement("div");
    titleRow.className = "diag-title-row";
    const title = document.createElement("span");
    title.className = "diag-title";
    title.textContent = "On this page";
    const refreshBtn = document.createElement("button");
    refreshBtn.className = "diag-refresh";
    refreshBtn.textContent = "↻"; // ↻
    refreshBtn.title = "Refresh";
    titleRow.appendChild(title);
    titleRow.appendChild(refreshBtn);
    wrap.appendChild(titleRow);

    const body = document.createElement("div");
    body.className = "diag-body";
    wrap.appendChild(body);
    container.appendChild(wrap);

    function renderMessage(state, text) {
      wrap.dataset.state = state;
      body.innerHTML = "";
      const msg = document.createElement("span");
      msg.className = "diag-message";
      msg.textContent = text;
      body.appendChild(msg);
    }

    function renderDiag(diag, currentSettings) {
      wrap.dataset.state = "ok";
      wrap.dataset.paused = diag.paused ? "true" : "false";
      body.innerHTML = "";
      const pill = document.createElement("span");
      pill.className = "diag-page";
      pill.textContent = DIAG_PAGE_LABELS[diag.pageType] || diag.pageType;
      body.appendChild(pill);
      const items = relevantCountsFor(diag, currentSettings);
      if (items.length === 0) {
        const none = document.createElement("span");
        none.className = "diag-message";
        none.textContent = diag.paused
          ? " · paused"
          : " · nothing detected yet";
        body.appendChild(none);
        return;
      }
      const sep = document.createElement("span");
      sep.className = "diag-sep";
      sep.textContent = " · ";
      body.appendChild(sep);
      items.forEach(function (item, i) {
        const chip = document.createElement("span");
        chip.className = "diag-chip";
        chip.dataset.severity = item.severity;
        if (item.severity === "warn") {
          chip.textContent = "⚠ 0 " + item.label;
          chip.title =
            item.label +
            " filter is ON but Sift saw 0 matches on this page — LinkedIn DOM may have changed.";
        } else if (item.severity === "userError") {
          // The user's input is the cause, not LinkedIn. Different tooltip
          // so they fix the right thing.
          chip.textContent = "⚠ " + item.n + " " + item.label;
          chip.title =
            "One or more keywords don't compile as regex. Switch Match Mode " +
            "or fix the patterns to use the Keywords filter.";
        } else {
          chip.textContent = item.n + " " + item.label;
        }
        body.appendChild(chip);
        if (i < items.length - 1) {
          const comma = document.createElement("span");
          comma.className = "diag-sep";
          comma.textContent = ", ";
          body.appendChild(comma);
        }
      });
    }

    function refresh() {
      renderMessage("loading", "Loading…");
      // Re-read settings on EVERY refresh so toggle changes since
      // popup-open are reflected. Defaults supplied as the key list +
      // safe fallbacks if storage returns missing keys.
      chrome.storage.local.get(settingKeyDefaults, function (currentSettings) {
        if (chrome.runtime.lastError) {
          // Don't block the diag fetch on a settings read failure —
          // fall back to the initial snapshot and warn in console.
          console.warn(
            "[Sift] diag settings read failed:",
            chrome.runtime.lastError.message
          );
          currentSettings = settingKeyDefaults;
        }
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
          const tab = tabs && tabs[0];
          if (!tab || !tab.url || !tab.url.includes("linkedin.com")) {
            renderMessage("empty", "Open LinkedIn to see what Sift detects");
            return;
          }
          chrome.tabs.sendMessage(tab.id, { type: "SIFT_DIAG" }, function (diag) {
            // Distinguish error modes so the message we show actually maps to
            // the root cause. Three distinct cases:
            //   1. "Could not establish connection" — content script not loaded
            //      on this tab. Reload advice is correct.
            //   2. Any other lastError (e.g. "port closed before response")
            //      — content script likely threw mid-response. Reload won't
            //      help; point the user at the console.
            //   3. Listener returned an `error` field — collectDiagnostics
            //      caught an exception. Same: console-based debugging.
            const err = chrome.runtime.lastError;
            if (err) {
              const msg = err.message || "";
              if (msg.indexOf("Could not establish connection") !== -1) {
                renderMessage("error", "Reload the LinkedIn tab to see diagnostics");
              } else {
                console.warn("[Sift] diag sendMessage error:", msg);
                renderMessage("error", "Diagnostics unavailable — check the console");
              }
              return;
            }
            if (!diag) {
              console.warn("[Sift] diag response was empty");
              renderMessage("error", "Diagnostics unavailable — check the console");
              return;
            }
            if (diag.error) {
              console.warn("[Sift] content-script diag threw:", diag.error);
              renderMessage("error", "Diagnostics error: " + diag.error);
              return;
            }
            renderDiag(diag, currentSettings);
          });
        });
      });
    }

    refreshBtn.addEventListener("click", refresh);
    refresh();
  }

  // === Master pause toggle ===
  // Single switch at the top of Controls that suspends all filtering and
  // hiding across feed, profile, network, and jobs pages. Diagnostic counts
  // keep flowing so the user can still see what Sift WOULD hide if unpaused.
  function buildPauseRow(container, paused) {
    const wrap = document.createElement("div");
    wrap.className = "pause-row";
    wrap.dataset.paused = paused ? "true" : "false";

    const label = document.createElement("span");
    label.className = "pause-label";
    label.textContent = paused ? "Sift is paused" : "Sift is active";

    const sub = document.createElement("span");
    sub.className = "pause-sub";
    sub.textContent = paused
      ? "All filtering suspended."
      : "Filtering across feed, profile, jobs.";

    const text = document.createElement("div");
    text.className = "pause-text";
    text.appendChild(label);
    text.appendChild(sub);

    const switchLabel = document.createElement("label");
    switchLabel.className = "toggle-switch";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = !paused; // ON = active (intuitive direction)
    input.addEventListener("change", function () {
      chrome.storage.local.set({ siftPaused: !input.checked });
    });
    const slider = document.createElement("span");
    slider.className = "toggle-slider";
    switchLabel.appendChild(input);
    switchLabel.appendChild(slider);

    wrap.appendChild(text);
    wrap.appendChild(switchLabel);
    container.appendChild(wrap);
  }

  // === Controls Tab ===

  function buildControlsTab(settings) {
    let container = document.getElementById("tab-controls");
    container.innerHTML = "";

    buildPauseRow(container, !!settings.siftPaused);
    buildDiagnosticPanel(container, settings);

    // --- Feed Controls ---
    let feedGroup = document.createElement("div");
    feedGroup.className = "section-group";
    let feedTitle = document.createElement("div");
    feedTitle.className = "section-title";
    feedTitle.textContent = "Feed Page";
    feedGroup.appendChild(feedTitle);

    // Sub-group: post types (ordered by frequency of use — most-used at top)
    const feedTypes = createSubGroup(feedGroup, "Hide post types");
    const postTypeToggles = [
      ["Ads", "hidePromoted"],
      ["Suggested posts", "hideSuggested"],
      ["Recommended posts", "hideRecommended"],
      ["Strangers (non-1st)", "hideNonConnections"],
      ["Polls", "hidePolls"],
      ["Celebrations", "hideCelebrations"],
    ];
    postTypeToggles.forEach(function (pair) {
      feedTypes.appendChild(
        createToggle(pair[0], settings[pair[1]], function (v) {
          var obj = {};
          obj[pair[1]] = v;
          chrome.storage.local.set(obj);
        })
      );
    });

    // Sub-group: filter by rule (age dropdown + keyword filter)
    const feedRules = createSubGroup(feedGroup, "Filter by rule");

    // Post age filter
    let ageRow = document.createElement("div");
    ageRow.className = "toggle-row";
    let ageLabel = document.createElement("span");
    ageLabel.className = "toggle-label";
    ageLabel.textContent = "Hide posts older than";
    let ageSelect = document.createElement("select");
    ageSelect.className = "age-select";
    [
      { value: 0, label: "Off" },
      { value: 1, label: "1 day" },
      { value: 3, label: "3 days" },
      { value: 7, label: "1 week" },
      { value: 14, label: "2 weeks" },
      { value: 30, label: "1 month" },
    ].forEach(function (opt) {
      let option = document.createElement("option");
      option.value = opt.value;
      option.textContent = opt.label;
      if (settings.postAgeLimit === opt.value) option.selected = true;
      ageSelect.appendChild(option);
    });
    ageSelect.addEventListener("change", function () {
      chrome.storage.local.set({ postAgeLimit: parseInt(ageSelect.value, 10) });
    });
    ageRow.appendChild(ageLabel);
    ageRow.appendChild(ageSelect);
    feedRules.appendChild(ageRow);

    // Feed Keyword Filter
    feedRules.appendChild(
      createToggle("Filter by keywords", settings.feedKeywordFilterEnabled, function (v) {
        chrome.storage.local.set({ feedKeywordFilterEnabled: v });
      })
    );

    // Match mode dropdown — controls how each keyword is compared against
    // post text. "Whole word" is the new default; existing users were
    // migrated to "Substring" by schema v1→v2 to preserve behavior.
    // Values come from FEED_KEYWORD_MATCH_MODES (single source of truth);
    // labels are mapped here since they're UI-only.
    const MATCH_MODE_LABELS = {
      wholeWord: "Whole word",
      substring: "Substring",
      regex: "Regex",
    };
    let kwModeRow = document.createElement("div");
    kwModeRow.className = "toggle-row";
    let kwModeLabel = document.createElement("span");
    kwModeLabel.className = "toggle-label";
    kwModeLabel.textContent = "Match mode";
    let kwModeSelect = document.createElement("select");
    kwModeSelect.className = "age-select";
    kwModeSelect.title =
      "Whole word: matches whole words only (avoids 'ai' matching 'training').\n" +
      "Substring: matches any text (legacy default).\n" +
      "Regex: each keyword is a regex pattern.";
    FEED_KEYWORD_MATCH_MODES.forEach(function (value) {
      let option = document.createElement("option");
      option.value = value;
      option.textContent = MATCH_MODE_LABELS[value] || value;
      if ((settings.feedKeywordMatchMode || "substring") === value) {
        option.selected = true;
      }
      kwModeSelect.appendChild(option);
    });
    kwModeSelect.addEventListener("change", function () {
      chrome.storage.local.set({ feedKeywordMatchMode: kwModeSelect.value });
    });
    kwModeRow.appendChild(kwModeLabel);
    kwModeRow.appendChild(kwModeSelect);
    feedRules.appendChild(kwModeRow);

    // Keyword add input
    let kwAddRow = document.createElement("div");
    kwAddRow.className = "list-search-row";
    let kwInput = document.createElement("input");
    kwInput.type = "text";
    kwInput.placeholder = "Add keywords (comma-separated)\u2026";
    kwInput.className = "list-search-input";
    kwInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") addFeedKeywords();
    });
    let kwAddBtn = document.createElement("button");
    kwAddBtn.className = "list-add-btn";
    kwAddBtn.textContent = "+";
    kwAddBtn.addEventListener("click", addFeedKeywords);
    kwAddRow.appendChild(kwInput);
    kwAddRow.appendChild(kwAddBtn);
    feedRules.appendChild(kwAddRow);

    let renderFeedKw = createListSection(
      feedRules,
      "Feed Keywords",
      settings.feedKeywords || [],
      function (kw) {
        settings.feedKeywords = settings.feedKeywords || [];
        removeCi(settings.feedKeywords, kw);
        chrome.storage.local.set({ feedKeywords: settings.feedKeywords });
        renderFeedKw(settings.feedKeywords);
      }
    );
    renderFeedKw(settings.feedKeywords || []);

    function addFeedKeywords() {
      let val = kwInput.value.trim();
      if (!val) return;
      if (!settings.feedKeywords) settings.feedKeywords = [];
      const newKws = val
        .split(",")
        .map(function (s) {
          return s.trim();
        })
        .filter(Boolean);
      // Validate against the active match mode BEFORE writing storage.
      // In regex mode, an unterminated group or bad escape would otherwise be
      // accepted silently and then the diag panel would falsely accuse
      // LinkedIn DOM of having changed (since 0 posts match a regex that
      // doesn't compile).
      const currentMode = settings.feedKeywordMatchMode || "substring";
      const { valid, invalid } = validateKeywords(newKws, currentMode);
      let added = 0;
      valid.forEach(function (kw) {
        if (addUnique(settings.feedKeywords, kw)) added++;
      });
      if (added > 0) {
        chrome.storage.local.set({ feedKeywords: settings.feedKeywords });
        renderFeedKw(settings.feedKeywords);
      }
      // Surface the result. Mixed cases (some added, some rejected) get a
      // combined toast so the user knows exactly what made it in.
      if (invalid.length > 0 && added > 0) {
        showToast(
          added + " added, " + invalid.length + " skipped (invalid regex)"
        );
      } else if (invalid.length > 0) {
        showToast(
          invalid.length === 1
            ? "Skipped invalid regex: " + invalid[0]
            : "Skipped " + invalid.length + " invalid regexes"
        );
      } else if (added > 0) {
        showToast(added + " keyword" + (added > 1 ? "s" : "") + " added");
      }
      kwInput.value = "";
    }

    container.appendChild(feedGroup);

    // --- Profile Controls ---
    let profileGroup = document.createElement("div");
    profileGroup.className = "section-group";
    let profileTitle = document.createElement("div");
    profileTitle.className = "section-title";
    profileTitle.textContent = "Profile Page";
    profileGroup.appendChild(profileTitle);

    profileGroup.appendChild(
      createToggle("Hide Analytics widget", settings.hideProfileAnalytics, function (v) {
        chrome.storage.local.set({ hideProfileAnalytics: v });
      })
    );

    profileGroup.appendChild(
      createToggle(
        "Hide suggestions & ads",
        settings.hideProfileSuggestions,
        function (v) {
          chrome.storage.local.set({ hideProfileSuggestions: v });
        }
      )
    );

    container.appendChild(profileGroup);

    // --- Jobs Controls ---
    let jobsGroup = document.createElement("div");
    jobsGroup.className = "section-group";
    let jobsTitle = document.createElement("div");
    jobsTitle.className = "section-title";
    jobsTitle.textContent = "Jobs Page";
    jobsGroup.appendChild(jobsTitle);

    // Sub-group: detection (badges added to cards matching these signals)
    const jobsDetect = createSubGroup(jobsGroup, "Detect & flag");
    const detectToggles = [
      ["Flag No Sponsor jobs", "sponsorCheckEnabled"],
      ["Flag Unpaid jobs", "unpaidCheckEnabled"],
      ["Auto-skip flagged companies", "autoSkipDetected"],
    ];
    detectToggles.forEach(function (pair) {
      jobsDetect.appendChild(
        createToggle(pair[0], settings[pair[1]], function (v) {
          var obj = {};
          obj[pair[1]] = v;
          chrome.storage.local.set(obj);
        })
      );
    });

    // Sub-group: how flagged cards display
    const jobsDisplay = createSubGroup(jobsGroup, "Display flagged cards");
    const displayToggles = [
      ["Dim flagged cards", "dimFiltered"],
      ["Hide flagged cards", "hideFiltered"],
    ];
    displayToggles.forEach(function (pair) {
      jobsDisplay.appendChild(
        createToggle(pair[0], settings[pair[1]], function (v) {
          var obj = {};
          obj[pair[1]] = v;
          chrome.storage.local.set(obj);
        })
      );
    });

    // Sub-group: skip lists (user-managed)
    const jobsLists = createSubGroup(jobsGroup, "Skip lists");

    // Helper: comma / newline / both-separated input → bulk add with dedup.
    // Mirrors the jobs-page panel's batchAdd UX so editing from either place
    // feels the same. Returns added count.
    function addToList(rawText, list, storageKey, render, itemNoun) {
      const incoming = rawText
        .split(/[,\n]+/)
        .map(function (s) {
          return s.trim();
        })
        .filter(Boolean);
      let added = 0;
      incoming.forEach(function (item) {
        if (addUnique(list, item)) added++;
      });
      if (added > 0) {
        var obj = {};
        obj[storageKey] = list;
        chrome.storage.local.set(obj);
        render(list);
        showToast(added + " " + itemNoun + (added > 1 ? "s" : "") + " added");
      }
    }

    // Skipped Companies — input row + list
    let companyAddRow = document.createElement("div");
    companyAddRow.className = "list-search-row";
    let companyAddInput = document.createElement("input");
    companyAddInput.type = "text";
    companyAddInput.placeholder = "Add companies (comma-separated)…";
    companyAddInput.className = "list-search-input";
    let companyAddBtn = document.createElement("button");
    companyAddBtn.className = "list-add-btn";
    companyAddBtn.textContent = "+";
    companyAddRow.appendChild(companyAddInput);
    companyAddRow.appendChild(companyAddBtn);
    jobsLists.appendChild(companyAddRow);

    let renderCompanies = createListSection(
      jobsLists,
      "Skipped Companies",
      settings.skippedCompanies,
      function (company) {
        removeCi(settings.skippedCompanies, company);
        chrome.storage.local.set({ skippedCompanies: settings.skippedCompanies });
        renderCompanies(settings.skippedCompanies);
      }
    );
    renderCompanies(settings.skippedCompanies);

    function submitCompanyAdd() {
      const val = companyAddInput.value.trim();
      if (!val) return;
      addToList(val, settings.skippedCompanies, "skippedCompanies", renderCompanies, "company");
      companyAddInput.value = "";
    }
    companyAddBtn.addEventListener("click", submitCompanyAdd);
    companyAddInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") submitCompanyAdd();
    });

    // Skipped Title Keywords — input row + list
    let titleAddRow = document.createElement("div");
    titleAddRow.className = "list-search-row";
    let titleAddInput = document.createElement("input");
    titleAddInput.type = "text";
    titleAddInput.placeholder = "Add title keywords (comma-separated)…";
    titleAddInput.className = "list-search-input";
    let titleAddBtn = document.createElement("button");
    titleAddBtn.className = "list-add-btn";
    titleAddBtn.textContent = "+";
    titleAddRow.appendChild(titleAddInput);
    titleAddRow.appendChild(titleAddBtn);
    jobsLists.appendChild(titleAddRow);

    let renderTitleKw = createListSection(
      jobsLists,
      "Skipped Title Keywords",
      settings.skippedTitleKeywords,
      function (kw) {
        removeCi(settings.skippedTitleKeywords, kw);
        chrome.storage.local.set({ skippedTitleKeywords: settings.skippedTitleKeywords });
        renderTitleKw(settings.skippedTitleKeywords);
      }
    );
    renderTitleKw(settings.skippedTitleKeywords);

    function submitTitleKwAdd() {
      const val = titleAddInput.value.trim();
      if (!val) return;
      addToList(
        val,
        settings.skippedTitleKeywords,
        "skippedTitleKeywords",
        renderTitleKw,
        "keyword"
      );
      titleAddInput.value = "";
    }
    titleAddBtn.addEventListener("click", submitTitleKwAdd);
    titleAddInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") submitTitleKwAdd();
    });

    container.appendChild(jobsGroup);

  }

  // === Stats Tab ===

  function getTodayString() {
    let d = new Date();
    return d.getFullYear() + "-" +
      String(d.getMonth() + 1).padStart(2, "0") + "-" +
      String(d.getDate()).padStart(2, "0");
  }

  function buildStatsTab(stats, statsAllTime) {
    let container = document.getElementById("tab-stats");
    container.innerHTML = "";

    let today = getTodayString();

    // Reset daily stats if date changed
    if (stats.today !== today) {
      stats = Object.assign({}, STATS_DEFAULTS.stats, { today: today });
      chrome.storage.local.set({ stats: stats });
    }

    // Today section
    let todaySection = document.createElement("div");
    todaySection.className = "sub-group";
    let todayTitle = document.createElement("div");
    todayTitle.className = "sub-group-title";
    todayTitle.textContent = "Today";
    todaySection.appendChild(todayTitle);

    let todayGrid = document.createElement("div");
    todayGrid.className = "stats-grid";
    Object.keys(STAT_LABELS).forEach(function (key) {
      todayGrid.appendChild(createStatCard(stats[key] || 0, STAT_LABELS[key]));
    });
    todaySection.appendChild(todayGrid);
    container.appendChild(todaySection);

    // All Time section
    let allTimeSection = document.createElement("div");
    allTimeSection.className = "sub-group";
    let allTimeTitle = document.createElement("div");
    allTimeTitle.className = "sub-group-title";
    allTimeTitle.textContent = "All Time";
    allTimeSection.appendChild(allTimeTitle);

    let allTimeGrid = document.createElement("div");
    allTimeGrid.className = "stats-grid";
    Object.keys(STAT_LABELS).forEach(function (key) {
      allTimeGrid.appendChild(createStatCard(statsAllTime[key] || 0, STAT_LABELS[key]));
    });
    allTimeSection.appendChild(allTimeGrid);
    container.appendChild(allTimeSection);

    // Reset Stats button
    let resetRow = document.createElement("div");
    resetRow.className = "stats-reset-row";
    resetRow.style.cssText = "text-align:center;margin-top:8px;";
    let resetBtn = document.createElement("button");
    resetBtn.className = "data-btn data-btn-reset";
    resetBtn.textContent = "Reset Stats";
    resetBtn.style.cssText = "font-size:12px;padding:4px 14px;";
    resetBtn.addEventListener("click", function () {
      showTypedConfirm(resetRow, {
        phrase: "reset stats",
        confirmLabel: "Reset Stats",
        onCancel: function () {
          buildStatsTab(stats, statsAllTime);
        },
        onConfirm: function () {
          chrome.storage.local.set(STATS_DEFAULTS, function () {
            if (chrome.runtime.lastError) {
              console.error(
                "[Sift] stats reset failed:",
                chrome.runtime.lastError.message
              );
              showToast("Reset failed: " + chrome.runtime.lastError.message);
              return;
            }
            buildStatsTab(STATS_DEFAULTS.stats, STATS_DEFAULTS.statsAllTime);
            showToast("Stats reset");
          });
        },
      });
    });
    resetRow.appendChild(resetBtn);
    container.appendChild(resetRow);
  }

  function createStatCard(number, label) {
    let card = document.createElement("div");
    card.className = "stat-card";
    let numEl = document.createElement("div");
    numEl.className = "stat-number";
    numEl.textContent = formatNumber(number);
    let labelEl = document.createElement("div");
    labelEl.className = "stat-label";
    labelEl.textContent = label;
    card.appendChild(numEl);
    card.appendChild(labelEl);
    return card;
  }

  function formatNumber(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
    if (n >= 1000) return (n / 1000).toFixed(1) + "K";
    return String(n);
  }

  let statsInterval = null;

  function startStatsRefresh() {
    if (statsInterval) clearInterval(statsInterval);
    statsInterval = setInterval(function () {
      chrome.storage.local.get(STATS_DEFAULTS, function (data) {
        // Update stat numbers in-place instead of rebuilding the entire DOM
        const numbers = document.querySelectorAll("#tab-stats .stat-number");
        const keys = Object.keys(STAT_LABELS);
        if (numbers.length === keys.length * 2) {
          const today = getTodayString();
          if (data.stats.today !== today) {
            data.stats = Object.assign({}, STATS_DEFAULTS.stats, { today: today });
          }
          keys.forEach(function (key, i) {
            numbers[i].textContent = formatNumber(data.stats[key] || 0);
            numbers[keys.length + i].textContent = formatNumber(data.statsAllTime[key] || 0);
          });
        } else {
          // DOM structure mismatch — full rebuild as fallback
          buildStatsTab(data.stats, data.statsAllTime);
        }
      });
    }, 2000);
  }

  function stopStatsRefresh() {
    if (statsInterval) {
      clearInterval(statsInterval);
      statsInterval = null;
    }
  }

  // === Data Tab ===

  // Re-render the storage-usage row in place. Called after every successful
  // import/reset so the gauge reflects the new state without a full rebuild.
  async function refreshStorageUsage(usageEl) {
    if (!usageEl) return;
    const bytes = await getStorageUsage();
    const fraction = bytes / STORAGE_QUOTA_BYTES;
    let level = "ok";
    if (fraction >= STORAGE_BLOCK_FRACTION) level = "block";
    else if (fraction >= STORAGE_WARN_FRACTION) level = "warn";
    usageEl.dataset.level = level;
    usageEl.textContent =
      "Storage used: " +
      formatBytes(bytes) +
      " of " +
      formatBytes(STORAGE_QUOTA_BYTES) +
      " (" +
      Math.round(fraction * 100) +
      "%)";
  }

  function buildDataTab() {
    let container = document.getElementById("tab-data");
    container.innerHTML = "";

    let section = document.createElement("div");
    section.className = "data-section";

    // Storage usage indicator (always visible — context for what import will affect).
    let usageEl = document.createElement("div");
    usageEl.className = "data-storage-usage";
    usageEl.dataset.level = "ok";
    refreshStorageUsage(usageEl);

    // Export — adds the current `schemaVersion` if missing so future imports
    // can migrate cleanly. Existing data is otherwise unchanged.
    let exportBtn = document.createElement("button");
    exportBtn.className = "data-btn data-btn-export";
    exportBtn.textContent = "Export Backup";
    exportBtn.addEventListener("click", function () {
      chrome.storage.local.get(null, function (data) {
        if (typeof data.schemaVersion !== "number") data.schemaVersion = SCHEMA_VERSION;
        let json = JSON.stringify(data, null, 2);
        let blob = new Blob([json], { type: "application/json" });
        let url = URL.createObjectURL(blob);
        let a = document.createElement("a");
        a.href = url;
        a.download = "sift-backup-" + getTodayString() + ".json";
        a.click();
        URL.revokeObjectURL(url);
        showToast("Backup exported");
      });
    });

    let exportDesc = document.createElement("div");
    exportDesc.className = "data-description";
    exportDesc.textContent = "Download all settings and stats as JSON";

    // Import — validates payload, migrates schema, pre-flights against quota.
    let fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = ".json";
    fileInput.className = "data-file-input";

    let importBtn = document.createElement("button");
    importBtn.className = "data-btn data-btn-import";
    importBtn.textContent = "Import Backup";
    importBtn.addEventListener("click", function () {
      fileInput.click();
    });

    fileInput.addEventListener("change", async function () {
      let file = fileInput.files[0];
      if (!file) return;

      // Reset the input early so the same file can be re-selected after a fix.
      const fileName = file.name;
      fileInput.value = "";

      let parsed;
      try {
        parsed = JSON.parse(await file.text());
      } catch {
        showToast("Invalid JSON file: " + fileName);
        return;
      }

      const validation = validateImport(parsed);
      if (!validation.ok) {
        // Show the first error — full list goes to console for debugging.
        console.error("[Sift] Import validation failed:", validation.errors);
        showToast("Import rejected: " + validation.errors[0]);
        return;
      }

      const migrated = migrate(validation.data);

      // Pre-flight quota check: refuse imports that would push usage past
      // STORAGE_BLOCK_FRACTION. Note that `set()` overwrites these keys
      // rather than appending, so the relevant comparison is the import
      // size + bytes from any keys we won't be touching.
      const importedBytes = estimateBytes(migrated);
      const importKeys = new Set(Object.keys(migrated));
      const allCurrent = await new Promise((r) =>
        chrome.storage.local.get(null, r)
      );
      const untouchedBytes = estimateBytes(
        Object.fromEntries(
          Object.entries(allCurrent).filter(([k]) => !importKeys.has(k))
        )
      );
      const projected = importedBytes + untouchedBytes;
      if (projected > STORAGE_QUOTA_BYTES * STORAGE_BLOCK_FRACTION) {
        showToast(
          "Import would exceed " +
            Math.round(STORAGE_BLOCK_FRACTION * 100) +
            "% of storage quota (" +
            formatBytes(projected) +
            "). Aborted."
        );
        return;
      }

      chrome.storage.local.set(migrated, function () {
        if (chrome.runtime.lastError) {
          // Without this check, the toast below cheerfully reports
          // "Backup imported successfully" while storage still has the
          // old data. The user reloads and finds nothing changed, files
          // a "import is broken" bug.
          console.error(
            "[Sift] Import write failed:",
            chrome.runtime.lastError.message
          );
          showToast("Import failed: " + chrome.runtime.lastError.message);
          return;
        }
        const warn = projected > STORAGE_QUOTA_BYTES * STORAGE_WARN_FRACTION;
        showToast(
          warn
            ? "Imported, but storage now " + formatBytes(projected) + " — close to quota."
            : "Backup imported successfully"
        );
        refreshStorageUsage(usageEl);
        // Reload the controls tab to reflect new settings.
        loadAndBuild();
      });
    });

    let importDesc = document.createElement("div");
    importDesc.className = "data-description";
    importDesc.textContent =
      "Restore from a previously exported backup. Older backups (no schema version) are auto-migrated.";

    // Reset
    let resetRow = document.createElement("div");
    resetRow.className = "data-reset-row";

    let resetBtn = document.createElement("button");
    resetBtn.className = "data-btn data-btn-reset";
    resetBtn.textContent = "Reset All Data";

    let resetDesc = document.createElement("div");
    resetDesc.className = "data-description";
    resetDesc.textContent = "Clear all settings, lists, and stats";

    resetBtn.addEventListener("click", function () {
      showTypedConfirm(resetRow, {
        phrase: "reset all data",
        confirmLabel: "Reset All Data",
        onCancel: function () { loadAndBuild(); },
        onConfirm: function () {
          chrome.storage.local.clear(function () {
            if (chrome.runtime.lastError) {
              console.error(
                "[Sift] storage.clear failed:",
                chrome.runtime.lastError.message
              );
              showToast("Reset failed: " + chrome.runtime.lastError.message);
              return;
            }
            showToast("All data cleared");
            refreshStorageUsage(usageEl);
            loadAndBuild();
          });
        },
      });
    });

    resetRow.appendChild(resetBtn);
    resetRow.appendChild(resetDesc);

    section.appendChild(usageEl);
    section.appendChild(exportBtn);
    section.appendChild(exportDesc);
    section.appendChild(importBtn);
    section.appendChild(fileInput);
    section.appendChild(importDesc);
    section.appendChild(resetRow);

    container.appendChild(section);
  }

  // === Init ===

  function loadAndBuild() {
    let allKeys = Object.assign({}, CONTROLS_DEFAULTS, STATS_DEFAULTS);
    chrome.storage.local.get(allKeys, function (data) {
      buildControlsTab(data);
      buildStatsTab(data.stats, data.statsAllTime);
      buildDataTab();
      startStatsRefresh();
    });
  }

  // Auto-fill version from manifest
  document.getElementById("popup-version").textContent = "v" + chrome.runtime.getManifest().version;

  loadAndBuild();

  // Stop stats refresh when popup closes
  window.addEventListener("unload", stopStatsRefresh);
})();
