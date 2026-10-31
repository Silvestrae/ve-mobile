import { experienceEditor, hitPointEditor } from "../../value-editors.mjs";
import { ACTOR_COMMANDS as C } from "../../../../kernel/command-names.mjs";
import { icon, node } from "../../../../ui/dom.mjs";
import { localizedText } from "../../../../ui/localized-text.mjs";

const capability = kind => kind === "xp" ? "editExperience" : kind === "hero" ? "resources" : "editHitPoints";
export const headerPointResource = actor => actor?.pf2e?.resources?.find(resource => resource.id === "mythic-points" && resource.max > 0)
  ?? actor?.pf2e?.resources?.find(resource => resource.id === "heroPoints");
const heroResource = headerPointResource;
const allowed = (actor, kind) => actor?.capabilities?.[capability(kind)] === true &&
  (kind === "hero" ? Boolean(heroResource(actor)) : kind === "xp" ? Boolean(actor.pf2e?.details?.experience) : Boolean(actor.hp));

/** Retain local drafts through snapshot updates; authority is rechecked on submit. */
export function syncHeaderEditor(shell, resultsDeferred) {
  const modal = shell.headerModal;
  if (modal && (resultsDeferred || shell.actor?.sourceUuid !== modal.sourceUuid || !allowed(shell.actor, modal.kind))) modal.close(false);
}

export function openHeaderEditor(shell, kind, ownerScope, overlayHost) {
  if (ownerScope.disposed || !allowed(shell.actor, kind) || shell.headerModal) return;
  const actor = shell.actor;
  const scope = ownerScope.child("pf2e-header-editor");
  const focus = shell.screen.ownerDocument?.activeElement;
  const modal = shell.headerModal = { kind, sourceUuid: actor.sourceUuid, pending: false };
  let layer;
  modal.close = (restoreFocus = true) => {
    scope.dispose();
    if (restoreFocus && !ownerScope.disposed && focus?.isConnected) focus.focus?.({ preventScroll: true });
  };
  scope.own(() => { layer?.remove(); if (shell.headerModal === modal) shell.headerModal = null; });
  const close = () => { if (!modal.pending) modal.close(); };
  const commands = Object.create(shell.commands, {
    silentValueEditorStatus: { value: true },
    closeHitPointEditor: { value: close },
    closeExperienceEditor: { value: close }
  });
  Object.defineProperty(commands, "execute", { value: async (name, payload) => {
    if (scope.disposed || shell.actor?.sourceUuid !== actor.sourceUuid || !allowed(shell.actor, kind)) {
      throw new Error(localizedText(shell.commands.localize, "VEMOBILE.PF2E.Unavailable", "This PF2e action is unavailable."));
    }
    if (modal.pending) return;
    modal.pending = true;
    const originalValue = name === C.ADD_EXPERIENCE ? actor.pf2e.details.experience.value
      : payload.operation === "set-hp" ? actor.hp.value : payload.operation === "set-temp" ? actor.hp.temp : undefined;
    try {
      return await shell.commands.execute(name, { ...payload, actorSourceUuid: actor.sourceUuid,
        ...(originalValue === undefined ? {} : { originalValue }) });
    } finally { modal.pending = false; }
  } });
  const record = { ...actor, header: { ...actor.header, experience: actor.pf2e?.details?.experience } };
  layer = kind === "hero" ? heroEditor(actor, commands, scope, close)
    : kind === "xp" ? experienceEditor(record, true, commands, scope)
    : hitPointEditor(record, kind, commands, scope);
  if (!layer) { modal.close(false); return; }
  layer.classList.add("ve-pf2e-header-editor-layer");
  const visualViewport = shell.screen.ownerDocument?.defaultView?.visualViewport;
  const window = shell.screen.ownerDocument?.defaultView;
  const fitViewport = () => {
    const viewport = visualViewport;
    layer.style.inset = "auto";
    layer.style.top = `${viewport?.offsetTop ?? 0}px`;
    layer.style.left = `${viewport?.offsetLeft ?? 0}px`;
    layer.style.width = `${viewport?.width ?? window?.innerWidth ?? 0}px`;
    layer.style.height = `${viewport?.height ?? window?.innerHeight ?? 0}px`;
  };
  fitViewport();
  if (visualViewport) {
    scope.listen(visualViewport, "resize", fitViewport);
    scope.listen(visualViewport, "scroll", fitViewport);
  }
  if (window) scope.listen(window, "resize", fitViewport);
  (shell.screen.closest?.(".ve-mobile-app") ?? overlayHost ?? shell.screen).append(layer);
  scope.listen(layer, "click", event => { if (event.target === layer) close(); });
  scope.listen(layer, "keydown", event => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); }
    if (event.key !== "Tab") return;
    const controls = [...layer.querySelectorAll("button:not(:disabled),input:not(:disabled)")];
    const first = controls[0], last = controls.at(-1), current = layer.ownerDocument?.activeElement;
    if (event.shiftKey && current === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && current === last) { event.preventDefault(); first?.focus(); }
  });
  layer.querySelector?.("input,button")?.focus?.({ preventScroll: true });
}

function heroEditor(actor, commands, scope, close) {
  const resource = heroResource(actor);
  const title = resource.label;
  const originalValue = resource.value;
  const maximum = Math.min(3, Math.max(0, resource.max));
  let value = Math.min(maximum, Math.max(0, originalValue)), pending = false;
  const t = (key, fallback) => localizedText(commands.localize, key, fallback);
  const stars = node("strong", { className: "ve-pf2e-hero-editor-stars", attrs: { role: "img" } });
  const status = node("p", { className: "ve-hp-editor-status", attrs: { role: "status", "aria-live": "polite" } });
  const decrease = node("button", { className: "ve-hp-editor-step", attrs: { type: "button", "aria-label": t("VEMOBILE.Character.Presenter.DecreaseAmount", "Decrease amount") }, children: [icon("fa-minus")], on: { click: () => change(-1) } }, scope);
  const increase = node("button", { className: "ve-hp-editor-step", attrs: { type: "button", "aria-label": t("VEMOBILE.Character.Presenter.IncreaseAmount", "Increase amount") }, children: [icon("fa-plus")], on: { click: () => change(1) } }, scope);
  const cancel = node("button", { attrs: { type: "button" }, text: t("VEMOBILE.Interface.Presenter.Cancel", "Cancel"), on: { click: close } }, scope);
  const confirm = node("button", { className: "ve-hp-editor-submit", attrs: { type: "submit" }, text: t("VEMOBILE.Character.Presenter.Confirm", "Confirm") });
  const dismiss = node("button", { className: "ve-hp-editor-close", attrs: { type: "button", "aria-label": t("VEMOBILE.Controls.Close", "Close") }, children: [icon("fa-xmark")], on: { click: close } }, scope);
  const form = node("form", { className: "ve-hp-editor ve-xp-editor ve-pf2e-hero-editor", attrs: { role: "dialog", "aria-modal": "true", "aria-label": title }, children: [
    node("header", { children: [node("span", { className: "ve-hp-editor-heading-icon", children: [icon("fa-star")] }), node("div", { children: [node("small", { text: actor.name }), node("h2", { text: title })] }), dismiss] }),
    node("div", { className: "ve-pf2e-hero-editor-stepper", children: [decrease, stars, increase] }), status,
    node("div", { className: "ve-pf2e-hero-editor-actions", children: [cancel, confirm] })
  ], on: { submit: async event => {
    event.preventDefault();
    if (pending) return;
    pending = true;
    form.setAttribute("aria-busy", "true");
    status.textContent = "";
    refresh();
    try {
      await commands.execute(C.SET_PF2E_RESOURCE, { resource: resource.id, value, originalValue, originalMax: resource.max });
      if (!scope.disposed) close();
    } catch (error) {
      if (!scope.disposed) { status.classList.add("is-error"); status.textContent = error.message; }
    } finally {
      if (!scope.disposed) { pending = false; form.removeAttribute("aria-busy"); refresh(); }
    }
  } } }, scope);
  function change(delta) { if (!pending) { value = Math.max(0, Math.min(maximum, value + delta)); refresh(); } }
  function refresh() {
    stars.textContent = Array.from({ length: 3 }, (_, i) => i < value ? "★" : "☆").join("");
    stars.setAttribute("aria-label", `${value} / 3`);
    decrease.disabled = pending || value <= 0;
    increase.disabled = pending || value >= maximum;
    cancel.disabled = confirm.disabled = dismiss.disabled = pending;
  }
  refresh();
  return node("div", { className: "ve-hp-editor-layer", children: [form] });
}
