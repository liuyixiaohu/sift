// Floating UI panel: header, scan button, skip-list editors, drag, persisted
// position. Also owns the inline CSS-in-JS for the panel + badge styling and
// the small `el()` DOM-builder helper used here and in the list renderers.

import { state } from "./state.js";
import { saveValue } from "./storage.js";
import { getCompanyName, getJobKey } from "./dom.js";
import { applyBadges, clearBadges, filterJobCards, refilterAll } from "./labels.js";
import { getActiveCard } from "./active.js";
import { getBorderReason } from "./constants.js";
import { autoScanCards } from "./scan.js";
import { showToast } from "./toast.js";
import { addUnique, containsCi } from "../shared/lists.js";

// ==================== DOM-builder helper ====================
export function el(tag, attrs, children) {
  const e = document.createElement(tag);
  if (attrs) {
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === "className") e.className = v;
      else if (k === "textContent") e.textContent = v;
      else if (k.startsWith("on") && k.length > 2 && k[2] === k[2].toUpperCase()) {
        e.addEventListener(k.slice(2).toLowerCase(), v);
      } else {
        e.setAttribute(k, v);
      }
    });
  }
  if (children) {
    (Array.isArray(children) ? children : [children]).forEach((child) => {
      if (typeof child === "string") e.appendChild(document.createTextNode(child));
      else if (child) e.appendChild(child);
    });
  }
  return e;
}

// ==================== Inject CSS ====================
function injectStyles() {
  if (document.getElementById("lj-filter-styles")) return;
  // Load EB Garamond via <link> tag (avoids @import being blocked by CSP).
  if (
    !document.getElementById("lj-font-link") &&
    !document.querySelector('link[href*="EB+Garamond"]')
  ) {
    const link = document.createElement("link");
    link.id = "lj-font-link";
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=EB+Garamond:wght@400;500;600;700&display=swap";
    document.head.appendChild(link);
  }
  const style = document.createElement("style");
  style.id = "lj-filter-styles";
  style.textContent = [
    // Panel (frosted cream)
    "#lj-filter-panel{position:fixed;top:70px;left:20px;z-index:99999;background:rgba(250,247,242,0.82);-webkit-backdrop-filter:blur(16px) saturate(180%);backdrop-filter:blur(16px) saturate(180%);color:#1F2328;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,0.08);border:1px solid #E4DDD2;font-family:'EB Garamond',Garamond,'Times New Roman',serif;font-size:13px;width:clamp(200px,20vw,280px);transition:width 0.2s}",
    "#lj-filter-panel.collapsed{width:auto}",
    "#lj-filter-panel.collapsed .lj-body{display:none}",
    ".lj-header{background:rgba(243,239,231,0.7);padding:10px 14px;border-radius:12px 12px 0 0;display:flex;justify-content:space-between;align-items:center;cursor:grab;user-select:none}",
    ".lj-header:active{cursor:grabbing}",
    "#lj-filter-panel.collapsed .lj-header{border-radius:12px}",
    ".lj-header h3{margin:0;font-size:14px;font-weight:600;color:#1F2328}",
    ".lj-body{padding:12px 14px;max-height:clamp(200px,55vh,70vh);overflow-y:auto}",
    // Scan button
    ".lj-scan-btn{position:relative;overflow:hidden;background:#1F2328;color:#FAF7F2;border:none;border-radius:6px;padding:7px 0;cursor:pointer;font-weight:600;font-size:12px;font-family:'EB Garamond',Garamond,serif;width:100%;margin-top:12px;transition:opacity 0.2s}",
    ".lj-scan-progress{position:absolute;bottom:0;left:0;height:2px;background:rgba(255,255,255,0.4);transition:width 0.3s}",
    ".lj-scan-btn:hover{opacity:0.8}",
    ".lj-scan-btn.scanning{background:#D9797B;color:#fff}",
    ".lj-scan-btn.scan-done{background:#5a8a6e;color:#fff}",
    // Sections
    ".lj-section{margin-bottom:12px;border-top:1px solid #E4DDD2;padding-top:10px}",
    ".lj-section:first-of-type{border-top:none;padding-top:0}",
    ".lj-label{font-size:11px;color:#5A636B;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;font-weight:600}",
    ".lj-label-row{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}",
    ".lj-label-row .lj-label{margin-bottom:0}",
    // Recent item display (replaces full list in floating panel)
    ".lj-recent{display:flex;align-items:center;gap:6px;padding:4px 0;font-size:11px;color:#5A636B}",
    ".lj-recent-hint{font-style:italic;color:#8A939B}",
    ".lj-recent-count{color:#8A939B;flex-shrink:0}",
    ".lj-recent-last{color:#1F2328;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0}",
    ".lj-x{background:none;border:none;color:#D9797B;cursor:pointer;font-size:16px;padding:0 2px;line-height:1;flex-shrink:0}",
    ".lj-x:hover{color:#9a6868}",
    // Input + button
    ".lj-add{display:flex;gap:6px}",
    ".lj-add input{flex:1;background:#fff;border:1px solid #E4DDD2;border-radius:6px;color:#1F2328;padding:6px 10px;font-size:12px;font-family:'EB Garamond',Garamond,serif;outline:none}",
    ".lj-add input:focus{border-color:#5A636B}",
    ".lj-add button{background:#1F2328;color:#FAF7F2;border:none;border-radius:6px;padding:6px 12px;cursor:pointer;font-weight:600;font-size:12px;font-family:'EB Garamond',Garamond,serif;white-space:nowrap}",
    ".lj-add button:hover{opacity:0.8}",
    ".lj-toggle{background:none;border:none;color:#5A636B;cursor:pointer;font-size:18px;padding:0;line-height:1}",
    ".lj-empty{color:#8A939B;font-size:11px;padding:4px 0;font-style:italic}",
    // Quick skip button
    ".lj-quick-skip{margin-top:8px;padding-top:8px;border-top:1px solid #E4DDD2}",
    ".lj-quick-skip-btn{background:#F3EFE7;color:#9a6868;border:1px solid #E4DDD2;border-radius:6px;padding:6px 10px;cursor:pointer;font-size:11px;font-family:'EB Garamond',Garamond,serif;width:100%;text-align:center}",
    ".lj-quick-skip-btn:hover{background:#E4DDD2}",
    // Footer link
    ".lj-feedback{display:block;text-align:center;margin-top:10px;font-size:11px;color:#8A939B;text-decoration:none;letter-spacing:0.3px}",
    ".lj-feedback:hover{color:#5A636B}",
    // Dimmed / hidden card styles
    ".lj-card-dimmed{opacity:0.35 !important;transition:opacity 0.2s}",
    ".lj-card-hidden{display:none !important}",
    ".lj-card-dimmed:hover{opacity:0.7 !important}",
    // Card flagged: ensure positioning context for the badge container.
    // Border color is set inline per-reason in applyBadges (red for negative, green for goodMatch).
    "[data-lj-filtered]{position:relative !important;overflow:visible !important}",
    // Badge container
    ".lj-badges{position:absolute !important;left:0 !important;bottom:4px !important;z-index:10 !important;display:flex !important;flex-direction:column !important;gap:2px !important;pointer-events:none !important}",
    ".lj-badge{font-size:9px !important;font-weight:700 !important;padding:1px 6px !important;border-radius:8px !important;color:#fff !important;white-space:nowrap !important;line-height:1.4 !important;letter-spacing:0.3px !important}",
    // Responsive breakpoints
    "@media(max-width:1024px){#lj-filter-panel{font-size:12.5px}.lj-header h3{font-size:13.5px}}",
    "@media(max-width:768px){#lj-filter-panel{font-size:12px}.lj-header h3{font-size:13px}.lj-body{padding:10px 12px;max-height:clamp(200px,50vh,60vh)}.lj-add button{padding:6px 8px;font-size:11px}}",
    "@media(max-width:600px){#lj-filter-panel{font-size:11.5px}.lj-header h3{font-size:12px}.lj-body{padding:8px 10px;max-height:clamp(180px,45vh,50vh)}}",
  ].join("\n");
  document.head.appendChild(style);
}

// ==================== Panel position clamping ====================
function clampPanelPosition(panel) {
  const rect = panel.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const MARGIN = 10;
  const MIN_VISIBLE = 60;

  let left = rect.left;
  let top = rect.top;

  if (left + MIN_VISIBLE > vw) left = vw - MIN_VISIBLE;
  if (left < MARGIN - rect.width + MIN_VISIBLE) left = MARGIN;
  if (top < MARGIN) top = MARGIN;
  if (top > vh - 40) top = vh - 50;

  panel.style.left = left + "px";
  panel.style.top = top + "px";
  return { left, top };
}

// ==================== UI Panel ====================
export function createUI() {
  if (document.getElementById("lj-filter-panel")) return;
  injectStyles();

  const panel = el("div", { id: "lj-filter-panel" });

  const togBtn = el("button", { className: "lj-toggle", textContent: "−" });
  const header = el("div", { className: "lj-header" }, [el("h3", { textContent: "Sift" }), togBtn]);

  // Drag + click (>4px movement = drag, otherwise = toggle collapse).
  let dragState = null;
  header.addEventListener("mousedown", (e) => {
    if (e.target === togBtn) return;
    const rect = panel.getBoundingClientRect();
    dragState = {
      startX: e.clientX,
      startY: e.clientY,
      origLeft: rect.left,
      origTop: rect.top,
      dragged: false,
    };
    e.preventDefault();
  });
  document.addEventListener("mousemove", (e) => {
    if (!dragState) return;
    const dx = e.clientX - dragState.startX;
    const dy = e.clientY - dragState.startY;
    if (!dragState.dragged && Math.abs(dx) + Math.abs(dy) > 4) dragState.dragged = true;
    if (dragState.dragged) {
      panel.style.left = dragState.origLeft + dx + "px";
      panel.style.top = dragState.origTop + dy + "px";
    }
  });
  document.addEventListener("mouseup", () => {
    if (dragState && dragState.dragged) {
      state.panelPosition = clampPanelPosition(panel);
      saveValue("panelPosition", state.panelPosition);
    } else if (dragState && !dragState.dragged) {
      panel.classList.toggle("collapsed");
      togBtn.textContent = panel.classList.contains("collapsed") ? "+" : "−";
    }
    dragState = null;
  });

  const body = el("div", { className: "lj-body" });

  state.ui.scanBtn = el("button", {
    className: "lj-scan-btn",
    id: "lj-scan-btn",
    textContent: "Scan Jobs",
    onClick: () => {
      if (state.scanning) {
        state.scanAbort = true;
      } else {
        autoScanCards({ renderLists });
      }
    },
  });

  // Batch add (supports comma/newline-separated paste). addUnique mutates the
  // list in place, so successive items in the same paste also dedupe against
  // each other (e.g. "Acme, ACME, acme" → only one entry added).
  function batchAdd(raw, list, storageKey) {
    const items = raw
      .split(/[,\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    let added = 0;
    items.forEach((name) => {
      if (addUnique(list, name)) added++;
    });
    if (added > 0) {
      saveValue(storageKey, list);
      renderLists();
      refilterAll();
      if (added > 1) showToast("Added " + added + " items");
    }
  }

  state.ui.companyRecent = el("div", { className: "lj-recent" });
  const companyInput = el("input", { type: "text", placeholder: "Company name..." });
  const companyAddBtn = el("button", {
    textContent: "Add",
    onClick: () => {
      const raw = companyInput.value.trim();
      if (!raw) return;
      batchAdd(raw, state.skippedCompanies, "skippedCompanies");
      companyInput.value = "";
    },
  });
  companyInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") companyAddBtn.click();
  });

  const skipCurrentBtn = el("button", {
    className: "lj-quick-skip-btn",
    textContent: "Skip Current Company",
    onClick: skipCurrentCompany,
  });

  const companySection = el("div", { className: "lj-section" }, [
    el("span", { className: "lj-label", textContent: "Skipped Companies" }),
    state.ui.companyRecent,
    el("div", { className: "lj-add" }, [companyInput, companyAddBtn]),
    el("div", { className: "lj-quick-skip" }, [skipCurrentBtn]),
  ]);

  state.ui.titleRecent = el("div", { className: "lj-recent" });
  const titleInput = el("input", { type: "text", placeholder: "Keyword..." });
  const titleAddBtn = el("button", {
    textContent: "Add",
    onClick: () => {
      const raw = titleInput.value.trim();
      if (!raw) return;
      batchAdd(raw, state.skippedTitleKeywords, "skippedTitleKeywords");
      titleInput.value = "";
    },
  });
  titleInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") titleAddBtn.click();
  });

  const titleSection = el("div", { className: "lj-section" }, [
    el("span", { className: "lj-label", textContent: "Skipped Title Keywords" }),
    state.ui.titleRecent,
    el("div", { className: "lj-add" }, [titleInput, titleAddBtn]),
  ]);

  const feedbackLink = el("a", {
    className: "lj-feedback",
    textContent: "Shape Sift →",
    href: "https://kunli.co/joblens",
    target: "_blank",
  });

  body.appendChild(companySection);
  body.appendChild(titleSection);
  body.appendChild(state.ui.scanBtn);
  body.appendChild(feedbackLink);
  panel.appendChild(header);
  panel.appendChild(body);
  document.body.appendChild(panel);

  // Restore last drag position (must be in DOM for getBoundingClientRect to work).
  if (state.panelPosition) {
    panel.style.left = state.panelPosition.left + "px";
    panel.style.top = state.panelPosition.top + "px";
    clampPanelPosition(panel);
  }

  // Window resize → re-clamp so panel stays visible on monitor switch.
  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const p = document.getElementById("lj-filter-panel");
      if (!p) return;
      state.panelPosition = clampPanelPosition(p);
      saveValue("panelPosition", state.panelPosition);
    }, 150);
  });

  renderLists();
}

export function skipCurrentCompany() {
  const activeCard = getActiveCard();
  if (!activeCard) {
    showToast("No active job selected");
    return;
  }
  const name = getCompanyName(activeCard);
  if (!name) {
    showToast("Could not detect company name");
    return;
  }
  if (containsCi(state.skippedCompanies, name)) {
    showToast("“" + name + "” already skipped");
    return;
  }
  state.skippedCompanies.push(name);
  saveValue("skippedCompanies", state.skippedCompanies);
  renderLists();
  refilterAll();
  showToast("Skipped: " + name);
}

// ==================== Render Skip Lists ====================
export function renderLists() {
  renderRecent(state.ui.companyRecent, state.skippedCompanies, "company");
  renderRecent(state.ui.titleRecent, state.skippedTitleKeywords, "title");
}

// Show count + most recently added item (last in array) with remove button.
function renderRecent(container, items, type) {
  if (!container) return;
  while (container.firstChild) container.removeChild(container.firstChild);

  if (items.length === 0) {
    container.appendChild(el("span", { className: "lj-recent-hint", textContent: "None yet" }));
    return;
  }

  const last = items[items.length - 1];
  const lastIdx = items.length - 1;
  const countText = items.length + " total";

  const removeBtn = el("button", {
    className: "lj-x",
    textContent: "×",
    title: "Remove “" + last + "”",
    onClick: (e) => {
      e.stopPropagation();
      removeFromList(type, lastIdx);
    },
  });

  container.appendChild(el("span", { className: "lj-recent-count", textContent: countText }));
  container.appendChild(el("span", { className: "lj-recent-last", textContent: "Last: " + last }));
  container.appendChild(removeBtn);
}

function removeFromList(type, index) {
  const list = type === "company" ? state.skippedCompanies : state.skippedTitleKeywords;
  const key = type === "company" ? "skippedCompanies" : "skippedTitleKeywords";
  const reason = type === "company" ? "skippedCompany" : "skippedTitle";
  list.splice(index, 1);
  saveValue(key, list);
  renderLists();

  // Remove this reason from multi-label cards.
  document.querySelectorAll("[data-lj-reasons]").forEach((card) => {
    const reasons = card.dataset.ljReasons.split(",");
    const idx = reasons.indexOf(reason);
    if (idx === -1) return;
    reasons.splice(idx, 1);
    const jobKey = getJobKey(card);
    if (jobKey && state.labeledJobs.has(jobKey)) state.labeledJobs.get(jobKey).delete(reason);
    if (reasons.length === 0) {
      delete card.dataset.ljReasons;
      delete card.dataset.ljFiltered;
      if (jobKey) state.labeledJobs.delete(jobKey);
      clearBadges(card);
    } else {
      card.dataset.ljReasons = reasons.join(",");
      card.dataset.ljFiltered = getBorderReason(reasons);
      applyBadges(card);
    }
    state.processedCards.delete(card);
  });
  filterJobCards();
}
