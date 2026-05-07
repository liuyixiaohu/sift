// Bottom-center transient notification. Self-contained DOM helper — no state,
// no callbacks. Lives in its own module so labels.js / active.js / panel.js
// can all import it without forming a cycle.

const TOAST_ID = "lj-toast";
const TOAST_VISIBLE_MS = 2000;
const TOAST_FADE_MS = 300;

export function showToast(message) {
  const existing = document.getElementById(TOAST_ID);
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.id = TOAST_ID;
  toast.textContent = message;
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
  });
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), TOAST_FADE_MS);
  }, TOAST_VISIBLE_MS);
}
