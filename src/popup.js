import { SIFT_DEFAULTS, SIFT_STATS_DEFAULTS } from "./shared/defaults.js";
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

  // === Controls Tab ===

  function buildControlsTab(settings) {
    let container = document.getElementById("tab-controls");
    container.innerHTML = "";

    // --- Feed Controls ---
    let feedGroup = document.createElement("div");
    feedGroup.className = "section-group";
    let feedTitle = document.createElement("div");
    feedTitle.className = "section-title";
    feedTitle.textContent = "Feed Page";
    feedGroup.appendChild(feedTitle);

    // Feed toggles — each maps a display label to a storage key
    var feedToggles = [
      ["Hide Ads", "hidePromoted"],
      ["Hide Suggested", "hideSuggested"],
      ["Hide Recommended", "hideRecommended"],
      ["Hide Strangers", "hideNonConnections"],
      ["Hide Sidebar", "hideSidebar"],
      ["Hide Polls", "hidePolls"],
      ["Hide Celebrations", "hideCelebrations"],
    ];
    feedToggles.forEach(function (pair) {
      feedGroup.appendChild(createToggle(pair[0], settings[pair[1]], function (v) {
        var obj = {};
        obj[pair[1]] = v;
        chrome.storage.local.set(obj);
      }));
    });

    // Post age filter
    let ageRow = document.createElement("div");
    ageRow.className = "toggle-row";
    let ageLabel = document.createElement("span");
    ageLabel.className = "toggle-label";
    ageLabel.textContent = "Hide Old Posts";
    let ageSelect = document.createElement("select");
    ageSelect.className = "age-select";
    [
      { value: 0, label: "Off" },
      { value: 1, label: "> 1 day" },
      { value: 3, label: "> 3 days" },
      { value: 7, label: "> 1 week" },
      { value: 14, label: "> 2 weeks" },
      { value: 30, label: "> 1 month" },
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
    feedGroup.appendChild(ageRow);

    // Feed Keyword Filter
    feedGroup.appendChild(createToggle("Hide by Keywords", settings.feedKeywordFilterEnabled, function (v) {
      chrome.storage.local.set({ feedKeywordFilterEnabled: v });
    }));

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
    kwAddBtn.className = "list-item-remove";
    kwAddBtn.textContent = "+";
    kwAddBtn.style.cssText = "font-size:16px;cursor:pointer;background:none;border:none;color:#D9797B;font-weight:bold;";
    kwAddBtn.addEventListener("click", addFeedKeywords);
    kwAddRow.appendChild(kwInput);
    kwAddRow.appendChild(kwAddBtn);
    feedGroup.appendChild(kwAddRow);

    let renderFeedKw = createListSection(feedGroup, "Feed Keywords", settings.feedKeywords || [], function (kw) {
      settings.feedKeywords = (settings.feedKeywords || []).filter(function (k) {
        return k.toLowerCase() !== kw.toLowerCase();
      });
      chrome.storage.local.set({ feedKeywords: settings.feedKeywords });
      renderFeedKw(settings.feedKeywords);
    });
    renderFeedKw(settings.feedKeywords || []);

    function addFeedKeywords() {
      let val = kwInput.value.trim();
      if (!val) return;
      let newKws = val.split(",").map(function (s) { return s.trim(); }).filter(Boolean);
      let existing = (settings.feedKeywords || []).map(function (k) { return k.toLowerCase(); });
      let added = [];
      newKws.forEach(function (kw) {
        if (!existing.includes(kw.toLowerCase())) {
          existing.push(kw.toLowerCase());
          added.push(kw);
        }
      });
      if (added.length > 0) {
        settings.feedKeywords = (settings.feedKeywords || []).concat(added);
        chrome.storage.local.set({ feedKeywords: settings.feedKeywords });
        renderFeedKw(settings.feedKeywords);
        showToast(added.length + " keyword" + (added.length > 1 ? "s" : "") + " added");
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

    profileGroup.appendChild(createToggle("Hide Analytics", settings.hideProfileAnalytics, function (v) {
      chrome.storage.local.set({ hideProfileAnalytics: v });
    }));

    container.appendChild(profileGroup);

    // --- Jobs Controls ---
    let jobsGroup = document.createElement("div");
    jobsGroup.className = "section-group";
    let jobsTitle = document.createElement("div");
    jobsTitle.className = "section-title";
    jobsTitle.textContent = "Jobs Page";
    jobsGroup.appendChild(jobsTitle);

    var jobsToggles = [
      ["Detect No Sponsor", "sponsorCheckEnabled"],
      ["Detect Unpaid", "unpaidCheckEnabled"],
      ["Auto-skip Flagged Companies", "autoSkipDetected"],
      ["Dim Filtered Cards", "dimFiltered"],
      ["Hide Filtered Cards", "hideFiltered"],
    ];
    jobsToggles.forEach(function (pair) {
      jobsGroup.appendChild(createToggle(pair[0], settings[pair[1]], function (v) {
        var obj = {};
        obj[pair[1]] = v;
        chrome.storage.local.set(obj);
      }));
    });

    // Skipped Companies list
    let renderCompanies = createListSection(jobsGroup, "Skipped Companies", settings.skippedCompanies, function (company) {
      settings.skippedCompanies = settings.skippedCompanies.filter(function (c) {
        return c.toLowerCase() !== company.toLowerCase();
      });
      chrome.storage.local.set({ skippedCompanies: settings.skippedCompanies });
      renderCompanies(settings.skippedCompanies);
    });
    renderCompanies(settings.skippedCompanies);

    // Skipped Title Keywords list
    let renderTitleKw = createListSection(jobsGroup, "Skipped Title Keywords", settings.skippedTitleKeywords, function (kw) {
      settings.skippedTitleKeywords = settings.skippedTitleKeywords.filter(function (k) {
        return k.toLowerCase() !== kw.toLowerCase();
      });
      chrome.storage.local.set({ skippedTitleKeywords: settings.skippedTitleKeywords });
      renderTitleKw(settings.skippedTitleKeywords);
    });
    renderTitleKw(settings.skippedTitleKeywords);

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
    todaySection.className = "stats-section";
    let todayTitle = document.createElement("div");
    todayTitle.className = "stats-section-title";
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
    allTimeSection.className = "stats-section";
    let allTimeTitle = document.createElement("div");
    allTimeTitle.className = "stats-section-title";
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
    resetRow.style.cssText = "text-align:center;margin-top:12px;";
    let resetBtn = document.createElement("button");
    resetBtn.className = "data-btn data-btn-reset";
    resetBtn.textContent = "Reset Stats";
    resetBtn.style.cssText = "font-size:12px;padding:4px 14px;";
    resetBtn.addEventListener("click", function () {
      if (!confirm("Reset all stats to zero?")) return;
      chrome.storage.local.set(STATS_DEFAULTS, function () {
        buildStatsTab(STATS_DEFAULTS.stats, STATS_DEFAULTS.statsAllTime);
        showToast("Stats reset");
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
      const currentBytes = await getStorageUsage();
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
        const warn = projected > STORAGE_QUOTA_BYTES * STORAGE_WARN_FRACTION;
        showToast(
          warn
            ? "Imported, but storage now " + formatBytes(projected) + " — close to quota."
            : "Backup imported successfully"
        );
        refreshStorageUsage(usageEl);
        // Reload the controls tab to reflect new settings.
        loadAndBuild();
        void currentBytes; // currentBytes captured for telemetry — kept to make intent clear.
      });
    });

    let importDesc = document.createElement("div");
    importDesc.className = "data-description";
    importDesc.textContent =
      "Restore from a previously exported backup. Older backups (no schema version) are auto-migrated.";

    // Reset
    let resetBtn = document.createElement("button");
    resetBtn.className = "data-btn data-btn-reset";
    resetBtn.textContent = "Reset All Data";
    resetBtn.addEventListener("click", function () {
      if (
        confirm(
          "Are you sure you want to reset all Sift settings and stats? This cannot be undone."
        )
      ) {
        chrome.storage.local.clear(function () {
          showToast("All data cleared");
          refreshStorageUsage(usageEl);
          loadAndBuild();
        });
      }
    });

    let resetDesc = document.createElement("div");
    resetDesc.className = "data-description";
    resetDesc.textContent = "Clear all settings, lists, and stats";

    section.appendChild(usageEl);
    section.appendChild(exportBtn);
    section.appendChild(exportDesc);
    section.appendChild(importBtn);
    section.appendChild(fileInput);
    section.appendChild(importDesc);
    section.appendChild(resetBtn);
    section.appendChild(resetDesc);

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
