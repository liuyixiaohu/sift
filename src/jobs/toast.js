// Bottom-center transient notification. Self-contained DOM helper — no state,
// no callbacks. Lives in its own module so labels.js / active.js / panel.js
// can all import it without forming a cycle.

const TOAST_ID = "lj-toast";
const TOAST_VISIBLE_MS = 2000;
const TOAST_UNDO_VISIBLE_MS = 5000; // give the user time to react
const TOAST_FADE_MS = 300;

/**
 * Show a transient toast.
 *
 * @param {string} message
 * @param {{ undo?: () => void }} [options]
 *   `undo` — when provided, renders an inline "Undo" button. Clicking it
 *   invokes the callback and dismisses the toast immediately. The toast
 *   lingers longer (TOAST_UNDO_VISIBLE_MS) so the user has time to react.
 */
export function showToast(message, options = {}) {
  const existing = document.getElementById(TOAST_ID);
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.id = TOAST_ID;
  Object.assign(toast.style, {
    position: "fixed",
    bottom: "30px",
    left: "50%",
    transform: "translateX(-50%)",
    background: "#1F2328",
    color: "#FAF7F2",
    padding: "10px 24px",
    borderRadius: "8px",
    fontFamily: "'EB Garamond',Garamond,serif",
    fontSize: "14px",
    fontWeight: "600",
    zIndex: "99999",
    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
    transition: "opacity 0.3s",
    display: "flex",
    alignItems: "center",
    gap: "12px",
  });

  const messageEl = document.createElement("span");
  messageEl.textContent = message;
  toast.appendChild(messageEl);

  let timer;
  const dismiss = () => {
    clearTimeout(timer);
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), TOAST_FADE_MS);
  };

  if (typeof options.undo === "function") {
    const undoBtn = document.createElement("button");
    undoBtn.textContent = "Undo";
    Object.assign(undoBtn.style, {
      background: "none",
      border: "1px solid rgba(250, 247, 242, 0.5)",
      color: "#FAF7F2",
      cursor: "pointer",
      fontFamily: "'EB Garamond',Garamond,serif",
      fontSize: "13px",
      fontWeight: "600",
      padding: "2px 10px",
      borderRadius: "4px",
    });
    undoBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      // Catch (don't just try/finally) so a thrown undo callback gets
      // surfaced to the user rather than silently dismissing the toast.
      // The most realistic failure: the undo mutates an array in memory
      // then saves to storage, and the storage write rejects — leaving
      // memory and disk out of sync. Tell the user instead of pretending
      // the undo worked.
      try {
        options.undo();
        dismiss();
      } catch (err) {
        console.error("[Sift] Toast undo callback threw:", err);
        dismiss();
        // Re-toast with a more honest message. setTimeout breaks the
        // sync chain so the dismissed toast finishes fading first.
        setTimeout(() => {
          showToast("Undo failed — your skip list may be out of sync");
        }, 0);
      }
    });
    toast.appendChild(undoBtn);
  }

  document.body.appendChild(toast);
  const visibleMs = typeof options.undo === "function" ? TOAST_UNDO_VISIBLE_MS : TOAST_VISIBLE_MS;
  timer = setTimeout(dismiss, visibleMs);
}
