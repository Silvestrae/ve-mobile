import { localizedText } from "./localized-text.mjs";

/** Plain records and one named action; no Foundry state enters this surface. */
export function showDesktopRestorationRecovery({ scope, labels = {}, keys, retry, localize, document = globalThis.document }) {
  const text = (key, fallback) => localizedText(localize, `VEMOBILE.Recovery.${key}`, fallback);
  const titleText = labels.title ?? text("Title", "Graphics settings need recovery");
  const detailText = labels.detail ?? text("Detail", "Some graphics settings could not be restored automatically. Retry recovery to return to your saved settings.");
  const pendingText = labels.pending ?? text("Pending", "Settings awaiting restoration");
  const savedText = labels.saved ?? text("Saved", "No setting keys are listed.");
  const retryText = labels.retry ?? text("Retry", "Retry recovery");
  const workingText = labels.working ?? text("Working", "Restoring settings…");
  const failedText = labels.failed ?? text("Failed", "Recovery could not finish. Try again.");
  const root = document.createElement("section");
  root.className = "ve-desktop-restoration-recovery";
  root.setAttribute("role", "alertdialog");
  root.setAttribute("aria-label", titleText);
  Object.assign(root.style, { position: "fixed", zIndex: "2147483647", inset: "auto 1rem 1rem", padding: "1rem", background: "#20232b", color: "#fff", border: "2px solid #d8ae65", borderRadius: "8px", maxWidth: "38rem" });
  const title = document.createElement("h2"); title.textContent = titleText;
  const detail = document.createElement("p"); detail.textContent = detailText;
  const pending = document.createElement("p"); pending.textContent = `${pendingText}: ${keys.join(", ") || savedText}`;
  const status = document.createElement("p"); status.setAttribute("aria-live", "polite");
  const button = document.createElement("button"); button.type = "button"; button.textContent = retryText;
  scope.listen(button, "click", async () => {
    if (button.disabled) return;
    button.disabled = true; status.textContent = workingText;
    try { await retry(); }
    catch { status.textContent = failedText; }
    finally { button.disabled = false; }
  });
  root.append(title, detail, pending, status, button);
  scope.own(() => root.remove());
  document.body.append(root);
  return root;
}
