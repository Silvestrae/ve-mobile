import { localizedText } from "./localized-text.mjs";

const MODES = Object.freeze(["Phone", "Tablet", "Desktop"]);

/** Ask the user to confirm or replace an automatically selected presentation mode.
 * Resolves to the confirmed mode, or null when the owning scope/page is disposed. */
export function showAutoModeConfirmation({ scope, mode, confirm, localize, document = globalThis.document, window = globalThis.window } = {}) {
  if (!scope || typeof confirm !== "function" || !document?.createElement || !document.body) {
    throw new TypeError(localizedText(localize, "VEMOBILE.Interface.AutoModeConfirmation.Unavailable", "Display mode confirmation is unavailable."));
  }
  if (scope.disposed) return Promise.resolve(null);

  // Resolve this dialog's own copy and optional interpolation values.
  const label = (name, fallback, data) => localizedText(localize, `VEMOBILE.Interface.AutoModeConfirmation.${name}`, fallback, data);
  const backdrop = document.createElement("div");
  backdrop.className = "ve-auto-mode-confirmation-backdrop";
  const dialog = document.createElement("dialog");
  dialog.className = "ve-auto-mode-confirmation";
  dialog.setAttribute("aria-labelledby", "ve-auto-mode-confirmation-title");
  dialog.setAttribute("aria-describedby", "ve-auto-mode-confirmation-prompt");
  dialog.setAttribute("aria-modal", "true");

  const title = document.createElement("h2");
  title.id = "ve-auto-mode-confirmation-title";
  title.textContent = label("Title", "VE Mobile: Confirm display mode");
  const prompt = document.createElement("p");
  prompt.id = "ve-auto-mode-confirmation-prompt";
  prompt.textContent = label("Prompt", "Auto-detect selected {mode} as the most appropriate setting for this device. Please confirm or choose an alternative. Your choice will be remembered in this browser.", { mode: label(String(mode).charAt(0).toUpperCase() + String(mode).slice(1), mode) });
  const modeLabel = document.createElement("label");
  modeLabel.className = "ve-auto-mode-confirmation-label";
  modeLabel.textContent = label("Mode", "Display mode");
  const select = document.createElement("select");
  select.className = "ve-auto-mode-confirmation-select";
  select.setAttribute("aria-label", label("Mode", "Display mode"));
  for (const value of MODES) {
    const option = document.createElement("option");
    option.value = value.toLowerCase();
    option.textContent = label(value, value);
    option.selected = value.toLowerCase() === String(mode).toLowerCase();
    select.append(option);
  }
  modeLabel.append(select);

  const status = document.createElement("p");
  status.className = "ve-auto-mode-confirmation-error";
  status.setAttribute("role", "alert");
  status.setAttribute("aria-live", "assertive");
  status.hidden = true;
  const actions = document.createElement("div");
  actions.className = "ve-auto-mode-confirmation-actions";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "ve-auto-mode-confirmation-confirm";
  button.textContent = label("Confirm", "Confirm");
  actions.append(button);
  dialog.append(title, prompt, modeLabel, status, actions);
  backdrop.append(dialog);

  let active = true;
  let pending = false;
  const listenerCleanups = [];
  // Retain each listener's cleanup so finishing the dialog releases even document/window handlers.
  const listen = (target, type, listener, options) => {
    target?.addEventListener?.(type, listener, options);
    listenerCleanups.push(() => target?.removeEventListener?.(type, listener, options));
  };
  // Remove dialog listeners in reverse registration order before its DOM disappears.
  const cleanupListeners = () => {
    for (const cleanup of listenerCleanups.splice(0).reverse()) cleanup();
  };
  let resolveResult;
  const result = new Promise(resolve => { resolveResult = resolve; });
  const previousFocus = document.activeElement;
  const supportsModal = typeof dialog.showModal === "function";

  // Position the dialog inside the visual viewport, including keyboard and browser-bar offsets.
  const updateViewport = () => {
    if (!active) return;
    const viewport = window?.visualViewport;
    const left = viewport?.offsetLeft ?? 0;
    const top = viewport?.offsetTop ?? 0;
    const width = viewport?.width ?? window?.innerWidth ?? document.documentElement?.clientWidth ?? 360;
    const height = viewport?.height ?? window?.innerHeight ?? document.documentElement?.clientHeight ?? 640;
    dialog.style.setProperty("--ve-auto-dialog-left", `${left}px`);
    dialog.style.setProperty("--ve-auto-dialog-width", `${Math.max(0, width)}px`);
    dialog.style.setProperty("--ve-auto-dialog-height", `${Math.max(0, height)}px`);
    const panelHeight = dialog.getBoundingClientRect().height;
    dialog.style.setProperty("--ve-auto-dialog-top", `${top + Math.max(12, (height - panelHeight) / 2)}px`);
  };

  // Close once, restore the previous focus if still valid, and resolve the caller's pending choice.
  const finish = value => {
    if (!active) return;
    active = false;
    cleanupListeners();
    if (dialog.open) dialog.close();
    backdrop.remove();
    if (previousFocus?.isConnected) previousFocus.focus?.({ preventScroll: true });
    resolveResult(value);
  };
  // Keep native Escape dismissal from bypassing the required mode choice.
  const onCancel = event => event.preventDefault();
  // Keep Escape blocked and cycle Tab focus inside the active confirmation.
  const onKeyDown = event => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...dialog.querySelectorAll("button:not(:disabled), select:not(:disabled), input:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex='-1'])")]
      .filter(element => !element.hidden && element.getAttribute("aria-hidden") !== "true");
    if (!focusable.length) { event.preventDefault(); dialog.focus(); return; }
    const first = focusable[0], last = focusable.at(-1);
    if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
      event.preventDefault(); first.focus();
    }
  };
  // Return escaped focus to the dialog while this choice owns interaction.
  const onFocusIn = event => {
    if (active && !dialog.contains(event.target)) button.focus({ preventScroll: true });
  };
  // Save one choice at a time and leave a failed save retryable without closing the dialog.
  const onConfirm = async () => {
    if (!active || pending || scope.disposed) return;
    pending = true;
    button.disabled = true;
    select.disabled = true;
    status.hidden = true;
    status.textContent = "";
    const selectedMode = select.value;
    try {
      await confirm(selectedMode);
      if (active && !scope.disposed) finish(selectedMode);
    } catch (error) {
      if (active && !scope.disposed) {
        status.textContent = error?.message || label("Error", "The display mode could not be saved. Try again.");
        status.hidden = false;
        pending = false;
        button.disabled = false;
        select.disabled = false;
        button.focus({ preventScroll: true });
      }
    }
  };

  listen(button, "click", onConfirm);
  listen(dialog, "cancel", onCancel);
  listen(dialog, "keydown", onKeyDown);
  listen(document, "focusin", onFocusIn, true);
  listen(window?.visualViewport, "resize", updateViewport);
  listen(window?.visualViewport, "scroll", updateViewport);
  listen(window, "resize", updateViewport);
  listen(window, "scroll", updateViewport);
  scope.own(() => {
    if (!active) return;
    active = false;
    cleanupListeners();
    if (dialog.open) dialog.close();
    backdrop.remove();
    if (previousFocus?.isConnected) previousFocus.focus?.({ preventScroll: true });
    resolveResult(null);
  });
  // Page hide is one-shot and is removed by disposal when it has not fired.
  const onPageHide = () => finish(null);
  listen(window, "pagehide", onPageHide, { once: true });

  document.body.append(backdrop);
  updateViewport();
  if (supportsModal) dialog.showModal();
  else dialog.setAttribute("open", "");
  updateViewport();
  select.focus({ preventScroll: true });
  return result;
}
