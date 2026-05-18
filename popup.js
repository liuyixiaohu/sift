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

  // src/shared/diag.js
  function relevantCountsFor(diag, settings) {
    const items = [];
    const paused = !!diag.paused;
    function push(label, n, isToggleOn, isAppropriatePage) {
      if (!isToggleOn || !isAppropriatePage) return;
      if (n > 0) {
        items.push({ label, n, severity: "ok" });
      } else if (!paused) {
        items.push({ label, n: 0, severity: "warn" });
      }
    }
    if (diag.pageType === "feed") {
      push("Ads", diag.feed.promoted, !!settings.hidePromoted, true);
      push("Suggested", diag.feed.suggested, !!settings.hideSuggested, true);
      push("Recommended", diag.feed.recommended, !!settings.hideRecommended, true);
      push("Strangers", diag.feed.nonConnection, !!settings.hideNonConnections, true);
      push("Polls", diag.feed.poll, !!settings.hidePolls, true);
      push("Celebrations", diag.feed.celebration, !!settings.hideCelebrations, true);
      const invalidKw = diag.invalidKeywords || 0;
      if (settings.feedKeywordFilterEnabled) {
        if (diag.feed.keywordFiltered > 0) {
          items.push({ label: "Keywords", n: diag.feed.keywordFiltered, severity: "ok" });
        } else if (invalidKw > 0 && !paused) {
          items.push({ label: "Invalid regex", n: invalidKw, severity: "userError" });
        } else if (!paused) {
          items.push({ label: "Keywords", n: 0, severity: "warn" });
        }
      }
      push("Too old", diag.feed.tooOld, (settings.postAgeLimit || 0) > 0, true);
      push("Suggestions & ads", diag.profile.noise, !!settings.hideProfileSuggestions, true);
    } else if (diag.pageType === "profile") {
      push("Analytics", diag.profile.analytics, !!settings.hideProfileAnalytics, true);
      push("Suggestions & ads", diag.profile.noise, !!settings.hideProfileSuggestions, true);
    } else if (diag.pageType === "jobs") {
      if (diag.jobs.flagged > 0) {
        items.push({ label: "Flagged jobs", n: diag.jobs.flagged, severity: "ok" });
      }
    } else if (diag.pageType === "network") {
      push("Suggestions & ads", diag.profile.noise, !!settings.hideProfileSuggestions, true);
    }
    return items;
  }

  // src/shared/lists.js
  function containsCi(list, item) {
    if (!list || typeof item !== "string") return false;
    const lower = item.toLowerCase();
    return list.some((x) => typeof x === "string" && x.toLowerCase() === lower);
  }
  function addUnique(list, item) {
    if (containsCi(list, item)) return false;
    list.push(item);
    return true;
  }
  function removeCi(list, item) {
    if (!list || typeof item !== "string") return 0;
    const lower = item.toLowerCase();
    const before = list.length;
    for (let i = list.length - 1; i >= 0; i--) {
      if (typeof list[i] === "string" && list[i].toLowerCase() === lower) {
        list.splice(i, 1);
      }
    }
    return before - list.length;
  }

  // src/shared/matching.js
  var FEED_KEYWORD_MATCH_MODES = ["wholeWord", "substring", "regex"];
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

  // src/shared/schema.js
  var SCHEMA_VERSION = 2;
  var STORAGE_QUOTA_BYTES = 10 * 1024 * 1024;
  var STORAGE_WARN_FRACTION = 0.8;
  var STORAGE_BLOCK_FRACTION = 0.95;
  var SCHEMA_TYPES = {
    // Schema version itself
    schemaVersion: "number",
    // Global master toggle
    siftPaused: "boolean",
    // Feed-page toggles
    hidePromoted: "boolean",
    hideSuggested: "boolean",
    hideRecommended: "boolean",
    hideNonConnections: "boolean",
    hidePolls: "boolean",
    hideCelebrations: "boolean",
    feedKeywordFilterEnabled: "boolean",
    feedKeywordMatchMode: "string",
    hasSeenOnboarding: "boolean",
    postAgeLimit: "number",
    feedKeywords: "string[]",
    // Profile-page toggles
    hideProfileAnalytics: "boolean",
    hideProfileSuggestions: "boolean",
    // Jobs-page toggles + lists
    sponsorCheckEnabled: "boolean",
    unpaidCheckEnabled: "boolean",
    autoSkipDetected: "boolean",
    dimFiltered: "boolean",
    hideFiltered: "boolean",
    skippedCompanies: "string[]",
    skippedTitleKeywords: "string[]",
    // Stats
    stats: "object",
    statsAllTime: "object"
  };
  var SCHEMA_ENUMS = {
    feedKeywordMatchMode: ["wholeWord", "substring", "regex"]
  };
  function checkType(value, expected) {
    switch (expected) {
      case "boolean":
      case "number":
      case "string":
        return typeof value === expected;
      case "string[]":
        return Array.isArray(value) && value.every((v) => typeof v === "string");
      case "object":
        return value !== null && typeof value === "object" && !Array.isArray(value);
      default:
        return true;
    }
  }
  function validateImport(data) {
    const errors = [];
    if (data === null || typeof data !== "object" || Array.isArray(data)) {
      return { ok: false, errors: ["Top-level value must be an object."] };
    }
    for (const [key, expected] of Object.entries(SCHEMA_TYPES)) {
      if (!(key in data)) continue;
      if (!checkType(data[key], expected)) {
        errors.push(`"${key}" should be ${humanType(expected)}, got ${humanActual(data[key])}.`);
        continue;
      }
      const allowed = SCHEMA_ENUMS[key];
      if (allowed && !allowed.includes(data[key])) {
        errors.push(
          `"${key}" should be one of [${allowed.map((v) => `"${v}"`).join(", ")}], got "${data[key]}".`
        );
      }
    }
    const MAX_LIST_LEN = 1e5;
    for (const k of ["skippedCompanies", "skippedTitleKeywords", "feedKeywords"]) {
      if (Array.isArray(data[k]) && data[k].length > MAX_LIST_LEN) {
        errors.push(`"${k}" has ${data[k].length} entries (max ${MAX_LIST_LEN}).`);
      }
    }
    if (errors.length > 0) return { ok: false, errors };
    return { ok: true, data };
  }
  function humanType(expected) {
    if (expected === "string[]") return "an array of strings";
    if (expected === "object") return "an object";
    return "a " + expected;
  }
  function humanActual(value) {
    if (value === null) return "null";
    if (Array.isArray(value)) return `an array (length ${value.length})`;
    return typeof value;
  }
  function migrate(data) {
    const v = typeof data.schemaVersion === "number" ? data.schemaVersion : 0;
    if (v >= SCHEMA_VERSION) return data;
    if (v < 1) {
      data.schemaVersion = 1;
    }
    if (v < 2) {
      if (typeof data.feedKeywordMatchMode !== "string") {
        data.feedKeywordMatchMode = "substring";
      }
      data.schemaVersion = 2;
    }
    return data;
  }
  function estimateBytes(data) {
    try {
      return new Blob([JSON.stringify(data)]).size;
    } catch {
      return Infinity;
    }
  }
  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return "\u2014";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  function getStorageUsage() {
    return new Promise((resolve) => {
      if (!chrome?.storage?.local?.getBytesInUse) {
        resolve(0);
        return;
      }
      chrome.storage.local.getBytesInUse(null, (bytes) => resolve(bytes || 0));
    });
  }

  // src/popup.js
  (function() {
    "use strict";
    const CONTROLS_DEFAULTS = SIFT_DEFAULTS;
    const STATS_DEFAULTS = SIFT_STATS_DEFAULTS;
    const STAT_LABELS = {
      adsHidden: "Ads",
      suggestedHidden: "Suggested",
      recommendedHidden: "Recommended",
      strangersHidden: "Strangers",
      pollsHidden: "Polls",
      celebrationsHidden: "Celebrations",
      jobsFlagged: "Jobs flagged",
      keywordsHidden: "Keywords",
      jobsScanned: "Jobs scanned"
    };
    const tabBtns = document.querySelectorAll(".tab-btn");
    const tabContents = document.querySelectorAll(".tab-content");
    tabBtns.forEach(function(btn) {
      btn.addEventListener("click", function() {
        tabBtns.forEach(function(b) {
          b.classList.remove("active");
        });
        tabContents.forEach(function(c) {
          c.classList.remove("active");
        });
        btn.classList.add("active");
        document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
      });
    });
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
      toastTimer = setTimeout(function() {
        toastEl.classList.remove("visible");
      }, 1800);
    }
    function matchesPhrase(input, phrase) {
      return input.trim().toLowerCase() === phrase;
    }
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
      input.addEventListener("keydown", function(e) {
        if (e.key === "Enter") {
          e.preventDefault();
          if (matchesPhrase(input.value, opts.phrase)) opts.onConfirm();
        } else if (e.key === "Escape") {
          e.preventDefault();
          opts.onCancel();
        }
      });
      cancelBtn.addEventListener("click", function() {
        opts.onCancel();
      });
      confirmBtn.addEventListener("click", function() {
        if (!matchesPhrase(input.value, opts.phrase)) return;
        opts.onConfirm();
      });
      actions.appendChild(cancelBtn);
      actions.appendChild(confirmBtn);
      rowEl.appendChild(caption);
      rowEl.appendChild(input);
      rowEl.appendChild(actions);
      setTimeout(function() {
        input.focus();
      }, 0);
    }
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
      input.addEventListener("change", function() {
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
    const LIST_COLLAPSE_THRESHOLD = 5;
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
      let searchRow = document.createElement("div");
      searchRow.className = "list-search-row";
      let searchInput = document.createElement("input");
      searchInput.type = "text";
      searchInput.placeholder = "Search to find & remove\u2026";
      searchInput.className = "list-search-input";
      searchRow.appendChild(searchInput);
      let listEl = document.createElement("div");
      listEl.className = "list-items";
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
        searchRow.style.display = currentItems.length > LIST_COLLAPSE_THRESHOLD ? "" : "none";
        if (currentItems.length === 0) {
          let empty = document.createElement("div");
          empty.className = "empty-state";
          empty.textContent = "None added yet";
          listEl.appendChild(empty);
          toggleBtn.style.display = "none";
          return;
        }
        let filtered = currentFilter ? currentItems.filter(function(item) {
          return item.toLowerCase().includes(currentFilter);
        }) : currentItems;
        let isCollapsed = !currentFilter && !expanded && filtered.length > LIST_COLLAPSE_THRESHOLD;
        filtered.forEach(function(item, i) {
          let row = document.createElement("div");
          row.className = "list-item";
          if (isCollapsed && i >= LIST_COLLAPSE_THRESHOLD) row.style.display = "none";
          let nameSpan = document.createElement("span");
          nameSpan.textContent = item;
          nameSpan.title = item;
          let removeBtn = document.createElement("button");
          removeBtn.className = "list-item-remove";
          removeBtn.textContent = "\xD7";
          removeBtn.addEventListener("click", function() {
            onRemove(item);
          });
          row.appendChild(nameSpan);
          row.appendChild(removeBtn);
          listEl.appendChild(row);
        });
        if (!currentFilter && currentItems.length > LIST_COLLAPSE_THRESHOLD) {
          toggleBtn.style.display = "";
          toggleBtn.textContent = expanded ? "Show less" : "Show all " + currentItems.length + " items";
        } else {
          toggleBtn.style.display = "none";
        }
      }
      let latestItems = items;
      toggleBtn.addEventListener("click", function() {
        expanded = !expanded;
        renderItems(latestItems);
      });
      searchInput.addEventListener("input", function() {
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
    const DIAG_PAGE_LABELS = {
      feed: "Feed",
      profile: "Profile",
      jobs: "Jobs",
      network: "Network",
      other: "Other"
    };
    function buildDiagnosticPanel(container, initialSettings) {
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
      refreshBtn.textContent = "\u21BB";
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
          none.textContent = diag.paused ? " \xB7 paused" : " \xB7 nothing detected yet";
          body.appendChild(none);
          return;
        }
        const sep = document.createElement("span");
        sep.className = "diag-sep";
        sep.textContent = " \xB7 ";
        body.appendChild(sep);
        items.forEach(function(item, i) {
          const chip = document.createElement("span");
          chip.className = "diag-chip";
          chip.dataset.severity = item.severity;
          if (item.severity === "warn") {
            chip.textContent = "\u26A0 0 " + item.label;
            chip.title = item.label + " filter is ON but Sift saw 0 matches on this page \u2014 LinkedIn DOM may have changed.";
          } else if (item.severity === "userError") {
            chip.textContent = "\u26A0 " + item.n + " " + item.label;
            chip.title = "One or more keywords don't compile as regex. Switch Match Mode or fix the patterns to use the Keywords filter.";
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
        renderMessage("loading", "Loading\u2026");
        chrome.storage.local.get(settingKeyDefaults, function(currentSettings) {
          if (chrome.runtime.lastError) {
            console.warn(
              "[Sift] diag settings read failed:",
              chrome.runtime.lastError.message
            );
            currentSettings = settingKeyDefaults;
          }
          chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
            const tab = tabs && tabs[0];
            if (!tab || !tab.url || !tab.url.includes("linkedin.com")) {
              renderMessage("empty", "Open LinkedIn to see what Sift detects");
              return;
            }
            chrome.tabs.sendMessage(tab.id, { type: "SIFT_DIAG" }, function(diag) {
              const err = chrome.runtime.lastError;
              if (err) {
                const msg = err.message || "";
                if (msg.indexOf("Could not establish connection") !== -1) {
                  renderMessage("error", "Reload the LinkedIn tab to see diagnostics");
                } else {
                  console.warn("[Sift] diag sendMessage error:", msg);
                  renderMessage("error", "Diagnostics unavailable \u2014 check the console");
                }
                return;
              }
              if (!diag) {
                console.warn("[Sift] diag response was empty");
                renderMessage("error", "Diagnostics unavailable \u2014 check the console");
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
    function buildPauseRow(container, paused) {
      const wrap = document.createElement("div");
      wrap.className = "pause-row";
      wrap.dataset.paused = paused ? "true" : "false";
      const label = document.createElement("span");
      label.className = "pause-label";
      label.textContent = paused ? "Sift is paused" : "Sift is active";
      const sub = document.createElement("span");
      sub.className = "pause-sub";
      sub.textContent = paused ? "All filtering suspended." : "Filtering across feed, profile, jobs.";
      const text = document.createElement("div");
      text.className = "pause-text";
      text.appendChild(label);
      text.appendChild(sub);
      const switchLabel = document.createElement("label");
      switchLabel.className = "toggle-switch";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = !paused;
      input.addEventListener("change", function() {
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
    function buildControlsTab(settings) {
      let container = document.getElementById("tab-controls");
      container.innerHTML = "";
      buildPauseRow(container, !!settings.siftPaused);
      buildDiagnosticPanel(container, settings);
      let feedGroup = document.createElement("div");
      feedGroup.className = "section-group";
      let feedTitle = document.createElement("div");
      feedTitle.className = "section-title";
      feedTitle.textContent = "Feed Page";
      feedGroup.appendChild(feedTitle);
      const feedTypes = createSubGroup(feedGroup, "Hide post types");
      const postTypeToggles = [
        ["Ads", "hidePromoted"],
        ["Suggested posts", "hideSuggested"],
        ["Recommended posts", "hideRecommended"],
        ["Strangers (non-1st)", "hideNonConnections"],
        ["Polls", "hidePolls"],
        ["Celebrations", "hideCelebrations"]
      ];
      postTypeToggles.forEach(function(pair) {
        feedTypes.appendChild(
          createToggle(pair[0], settings[pair[1]], function(v) {
            var obj = {};
            obj[pair[1]] = v;
            chrome.storage.local.set(obj);
          })
        );
      });
      const feedRules = createSubGroup(feedGroup, "Filter by rule");
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
        { value: 30, label: "1 month" }
      ].forEach(function(opt) {
        let option = document.createElement("option");
        option.value = opt.value;
        option.textContent = opt.label;
        if (settings.postAgeLimit === opt.value) option.selected = true;
        ageSelect.appendChild(option);
      });
      ageSelect.addEventListener("change", function() {
        chrome.storage.local.set({ postAgeLimit: parseInt(ageSelect.value, 10) });
      });
      ageRow.appendChild(ageLabel);
      ageRow.appendChild(ageSelect);
      feedRules.appendChild(ageRow);
      feedRules.appendChild(
        createToggle("Filter by keywords", settings.feedKeywordFilterEnabled, function(v) {
          chrome.storage.local.set({ feedKeywordFilterEnabled: v });
        })
      );
      const MATCH_MODE_LABELS = {
        wholeWord: "Whole word",
        substring: "Substring",
        regex: "Regex"
      };
      let kwModeRow = document.createElement("div");
      kwModeRow.className = "toggle-row";
      let kwModeLabel = document.createElement("span");
      kwModeLabel.className = "toggle-label";
      kwModeLabel.textContent = "Match mode";
      let kwModeSelect = document.createElement("select");
      kwModeSelect.className = "age-select";
      kwModeSelect.title = "Whole word: matches whole words only (avoids 'ai' matching 'training').\nSubstring: matches any text (legacy default).\nRegex: each keyword is a regex pattern.";
      FEED_KEYWORD_MATCH_MODES.forEach(function(value) {
        let option = document.createElement("option");
        option.value = value;
        option.textContent = MATCH_MODE_LABELS[value] || value;
        if ((settings.feedKeywordMatchMode || "substring") === value) {
          option.selected = true;
        }
        kwModeSelect.appendChild(option);
      });
      kwModeSelect.addEventListener("change", function() {
        chrome.storage.local.set({ feedKeywordMatchMode: kwModeSelect.value });
      });
      kwModeRow.appendChild(kwModeLabel);
      kwModeRow.appendChild(kwModeSelect);
      feedRules.appendChild(kwModeRow);
      let kwAddRow = document.createElement("div");
      kwAddRow.className = "list-search-row";
      let kwInput = document.createElement("input");
      kwInput.type = "text";
      kwInput.placeholder = "Add keywords (comma-separated)\u2026";
      kwInput.className = "list-search-input";
      kwInput.addEventListener("keydown", function(e) {
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
        function(kw) {
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
        const newKws = val.split(",").map(function(s) {
          return s.trim();
        }).filter(Boolean);
        const currentMode = settings.feedKeywordMatchMode || "substring";
        const { valid, invalid } = validateKeywords(newKws, currentMode);
        let added = 0;
        valid.forEach(function(kw) {
          if (addUnique(settings.feedKeywords, kw)) added++;
        });
        if (added > 0) {
          chrome.storage.local.set({ feedKeywords: settings.feedKeywords });
          renderFeedKw(settings.feedKeywords);
        }
        if (invalid.length > 0 && added > 0) {
          showToast(
            added + " added, " + invalid.length + " skipped (invalid regex)"
          );
        } else if (invalid.length > 0) {
          showToast(
            invalid.length === 1 ? "Skipped invalid regex: " + invalid[0] : "Skipped " + invalid.length + " invalid regexes"
          );
        } else if (added > 0) {
          showToast(added + " keyword" + (added > 1 ? "s" : "") + " added");
        }
        kwInput.value = "";
      }
      container.appendChild(feedGroup);
      let profileGroup = document.createElement("div");
      profileGroup.className = "section-group";
      let profileTitle = document.createElement("div");
      profileTitle.className = "section-title";
      profileTitle.textContent = "Profile Page";
      profileGroup.appendChild(profileTitle);
      profileGroup.appendChild(
        createToggle("Hide Analytics widget", settings.hideProfileAnalytics, function(v) {
          chrome.storage.local.set({ hideProfileAnalytics: v });
        })
      );
      profileGroup.appendChild(
        createToggle(
          "Hide suggestions & ads",
          settings.hideProfileSuggestions,
          function(v) {
            chrome.storage.local.set({ hideProfileSuggestions: v });
          }
        )
      );
      container.appendChild(profileGroup);
      let jobsGroup = document.createElement("div");
      jobsGroup.className = "section-group";
      let jobsTitle = document.createElement("div");
      jobsTitle.className = "section-title";
      jobsTitle.textContent = "Jobs Page";
      jobsGroup.appendChild(jobsTitle);
      const jobsDetect = createSubGroup(jobsGroup, "Detect & flag");
      const detectToggles = [
        ["Flag No Sponsor jobs", "sponsorCheckEnabled"],
        ["Flag Unpaid jobs", "unpaidCheckEnabled"],
        ["Auto-skip flagged companies", "autoSkipDetected"]
      ];
      detectToggles.forEach(function(pair) {
        jobsDetect.appendChild(
          createToggle(pair[0], settings[pair[1]], function(v) {
            var obj = {};
            obj[pair[1]] = v;
            chrome.storage.local.set(obj);
          })
        );
      });
      const jobsDisplay = createSubGroup(jobsGroup, "Display flagged cards");
      const displayToggles = [
        ["Dim flagged cards", "dimFiltered"],
        ["Hide flagged cards", "hideFiltered"]
      ];
      displayToggles.forEach(function(pair) {
        jobsDisplay.appendChild(
          createToggle(pair[0], settings[pair[1]], function(v) {
            var obj = {};
            obj[pair[1]] = v;
            chrome.storage.local.set(obj);
          })
        );
      });
      const jobsLists = createSubGroup(jobsGroup, "Skip lists");
      function addToList(rawText, list, storageKey, render, itemNoun) {
        const incoming = rawText.split(/[,\n]+/).map(function(s) {
          return s.trim();
        }).filter(Boolean);
        let added = 0;
        incoming.forEach(function(item) {
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
      let companyAddRow = document.createElement("div");
      companyAddRow.className = "list-search-row";
      let companyAddInput = document.createElement("input");
      companyAddInput.type = "text";
      companyAddInput.placeholder = "Add companies (comma-separated)\u2026";
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
        function(company) {
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
      companyAddInput.addEventListener("keydown", function(e) {
        if (e.key === "Enter") submitCompanyAdd();
      });
      let titleAddRow = document.createElement("div");
      titleAddRow.className = "list-search-row";
      let titleAddInput = document.createElement("input");
      titleAddInput.type = "text";
      titleAddInput.placeholder = "Add title keywords (comma-separated)\u2026";
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
        function(kw) {
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
      titleAddInput.addEventListener("keydown", function(e) {
        if (e.key === "Enter") submitTitleKwAdd();
      });
      container.appendChild(jobsGroup);
    }
    function getTodayString() {
      let d = /* @__PURE__ */ new Date();
      return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    }
    function buildStatsTab(stats, statsAllTime) {
      let container = document.getElementById("tab-stats");
      container.innerHTML = "";
      let today = getTodayString();
      if (stats.today !== today) {
        stats = Object.assign({}, STATS_DEFAULTS.stats, { today });
        chrome.storage.local.set({ stats });
      }
      let todaySection = document.createElement("div");
      todaySection.className = "sub-group";
      let todayTitle = document.createElement("div");
      todayTitle.className = "sub-group-title";
      todayTitle.textContent = "Today";
      todaySection.appendChild(todayTitle);
      let todayList = document.createElement("div");
      todayList.className = "stats-list";
      Object.keys(STAT_LABELS).forEach(function(key) {
        todayList.appendChild(createStatRow(stats[key] || 0, STAT_LABELS[key]));
      });
      todaySection.appendChild(todayList);
      container.appendChild(todaySection);
      let allTimeSection = document.createElement("div");
      allTimeSection.className = "sub-group";
      let allTimeTitle = document.createElement("div");
      allTimeTitle.className = "sub-group-title";
      allTimeTitle.textContent = "All Time";
      allTimeSection.appendChild(allTimeTitle);
      let allTimeList = document.createElement("div");
      allTimeList.className = "stats-list";
      Object.keys(STAT_LABELS).forEach(function(key) {
        allTimeList.appendChild(createStatRow(statsAllTime[key] || 0, STAT_LABELS[key]));
      });
      allTimeSection.appendChild(allTimeList);
      container.appendChild(allTimeSection);
      let resetRow = document.createElement("div");
      resetRow.className = "stats-reset-row";
      resetRow.style.cssText = "text-align:center;margin-top:8px;";
      let resetBtn = document.createElement("button");
      resetBtn.className = "data-btn data-btn-reset";
      resetBtn.textContent = "Reset Stats";
      resetBtn.style.cssText = "font-size:12px;padding:4px 14px;";
      resetBtn.addEventListener("click", function() {
        showTypedConfirm(resetRow, {
          phrase: "reset stats",
          confirmLabel: "Reset Stats",
          onCancel: function() {
            buildStatsTab(stats, statsAllTime);
          },
          onConfirm: function() {
            chrome.storage.local.set(STATS_DEFAULTS, function() {
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
          }
        });
      });
      resetRow.appendChild(resetBtn);
      container.appendChild(resetRow);
    }
    function createStatRow(number, label) {
      let row = document.createElement("div");
      row.className = "stat-row";
      let labelEl = document.createElement("div");
      labelEl.className = "stat-label";
      labelEl.textContent = label;
      let numEl = document.createElement("div");
      numEl.className = "stat-number";
      numEl.textContent = formatNumber(number);
      row.appendChild(labelEl);
      row.appendChild(numEl);
      return row;
    }
    function formatNumber(n) {
      if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
      if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
      return String(n);
    }
    let statsInterval = null;
    function startStatsRefresh() {
      if (statsInterval) clearInterval(statsInterval);
      statsInterval = setInterval(function() {
        chrome.storage.local.get(STATS_DEFAULTS, function(data) {
          const numbers = document.querySelectorAll("#tab-stats .stat-number");
          const keys = Object.keys(STAT_LABELS);
          if (numbers.length === keys.length * 2) {
            const today = getTodayString();
            if (data.stats.today !== today) {
              data.stats = Object.assign({}, STATS_DEFAULTS.stats, { today });
            }
            keys.forEach(function(key, i) {
              numbers[i].textContent = formatNumber(data.stats[key] || 0);
              numbers[keys.length + i].textContent = formatNumber(data.statsAllTime[key] || 0);
            });
          } else {
            buildStatsTab(data.stats, data.statsAllTime);
          }
        });
      }, 2e3);
    }
    function stopStatsRefresh() {
      if (statsInterval) {
        clearInterval(statsInterval);
        statsInterval = null;
      }
    }
    async function refreshStorageUsage(usageEl) {
      if (!usageEl) return;
      const bytes = await getStorageUsage();
      const fraction = bytes / STORAGE_QUOTA_BYTES;
      let level = "ok";
      if (fraction >= STORAGE_BLOCK_FRACTION) level = "block";
      else if (fraction >= STORAGE_WARN_FRACTION) level = "warn";
      usageEl.dataset.level = level;
      usageEl.textContent = "Storage used: " + formatBytes(bytes) + " of " + formatBytes(STORAGE_QUOTA_BYTES) + " (" + Math.round(fraction * 100) + "%)";
    }
    function buildDataTab() {
      let container = document.getElementById("tab-data");
      container.innerHTML = "";
      let section = document.createElement("div");
      section.className = "data-section";
      let usageEl = document.createElement("div");
      usageEl.className = "data-storage-usage";
      usageEl.dataset.level = "ok";
      refreshStorageUsage(usageEl);
      let exportBtn = document.createElement("button");
      exportBtn.className = "data-btn data-btn-export";
      exportBtn.textContent = "Export Backup";
      exportBtn.addEventListener("click", function() {
        chrome.storage.local.get(null, function(data) {
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
      let fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = ".json";
      fileInput.className = "data-file-input";
      let importBtn = document.createElement("button");
      importBtn.className = "data-btn data-btn-import";
      importBtn.textContent = "Import Backup";
      importBtn.addEventListener("click", function() {
        fileInput.click();
      });
      fileInput.addEventListener("change", async function() {
        let file = fileInput.files[0];
        if (!file) return;
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
          console.error("[Sift] Import validation failed:", validation.errors);
          showToast("Import rejected: " + validation.errors[0]);
          return;
        }
        const migrated = migrate(validation.data);
        const importedBytes = estimateBytes(migrated);
        const importKeys = new Set(Object.keys(migrated));
        const allCurrent = await new Promise(
          (r) => chrome.storage.local.get(null, r)
        );
        const untouchedBytes = estimateBytes(
          Object.fromEntries(
            Object.entries(allCurrent).filter(([k]) => !importKeys.has(k))
          )
        );
        const projected = importedBytes + untouchedBytes;
        if (projected > STORAGE_QUOTA_BYTES * STORAGE_BLOCK_FRACTION) {
          showToast(
            "Import would exceed " + Math.round(STORAGE_BLOCK_FRACTION * 100) + "% of storage quota (" + formatBytes(projected) + "). Aborted."
          );
          return;
        }
        chrome.storage.local.set(migrated, function() {
          if (chrome.runtime.lastError) {
            console.error(
              "[Sift] Import write failed:",
              chrome.runtime.lastError.message
            );
            showToast("Import failed: " + chrome.runtime.lastError.message);
            return;
          }
          const warn = projected > STORAGE_QUOTA_BYTES * STORAGE_WARN_FRACTION;
          showToast(
            warn ? "Imported, but storage now " + formatBytes(projected) + " \u2014 close to quota." : "Backup imported successfully"
          );
          refreshStorageUsage(usageEl);
          loadAndBuild();
        });
      });
      let importDesc = document.createElement("div");
      importDesc.className = "data-description";
      importDesc.textContent = "Restore from a previously exported backup. Older backups (no schema version) are auto-migrated.";
      let resetRow = document.createElement("div");
      resetRow.className = "data-reset-row";
      let resetBtn = document.createElement("button");
      resetBtn.className = "data-btn data-btn-reset";
      resetBtn.textContent = "Reset All Data";
      let resetDesc = document.createElement("div");
      resetDesc.className = "data-description";
      resetDesc.textContent = "Clear all settings, lists, and stats";
      resetBtn.addEventListener("click", function() {
        showTypedConfirm(resetRow, {
          phrase: "reset all data",
          confirmLabel: "Reset All Data",
          onCancel: function() {
            loadAndBuild();
          },
          onConfirm: function() {
            chrome.storage.local.clear(function() {
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
          }
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
    function loadAndBuild() {
      let allKeys = Object.assign({}, CONTROLS_DEFAULTS, STATS_DEFAULTS);
      chrome.storage.local.get(allKeys, function(data) {
        buildControlsTab(data);
        buildStatsTab(data.stats, data.statsAllTime);
        buildDataTab();
        startStatsRefresh();
      });
    }
    document.getElementById("popup-version").textContent = "v" + chrome.runtime.getManifest().version;
    loadAndBuild();
    window.addEventListener("unload", stopStatsRefresh);
  })();
})();
