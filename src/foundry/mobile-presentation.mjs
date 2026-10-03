import { localizeFoundry } from "./localization.mjs";
const RESOLUTION_MESSAGE_KEYS = new Set([
  "ERROR.RESOLUTION.Screen",
  "ERROR.RESOLUTION.Scale",
  "ERROR.RESOLUTION.Window"
]);
const APPLICATION_LINEAGE_MS = 1000;
const NATIVE_APPLICATION_LAYER = 5100;
const NATIVE_APPLICATION_LAYER_PROPERTY = "--ve-mobile-native-app-layer";
const APPLICATION_CONTROL_SELECTOR = [
  "button",
  "[role='button']",
  "[role='menuitem']",
  "[role='tab']",
  "[data-action]",
  "a[href]",
  "input[type='button']",
  "input[type='submit']",
  "input[type='reset']",
  "input[type='file']",
  "summary"
].join(", ");
const APPLICATION_ORIGIN_SELECTOR = [
  ".ve-mobile-app",
  ".ve-mobile-bootstrap",
  ".ve-mobile-dialog",
  ".ve-mobile-transient-app",
  ".ve-mobile-module-overlay-visible",
  "#hud.ve-mobile-native-hud-host",
  "#context-menu"
].join(", ");

/**
 * Isolate the mobile renderer from desktop applications while retaining
 * ordinary Foundry notifications. Foundry's minimum-resolution warning is
 * irrelevant here because this renderer is deliberately designed for a
 * narrow viewport.
 */
export function enableMobilePresentation(scope, { isPersistentOverlay = () => false, isSettingsApplication = () => false, isActorEditor = () => false, now = () => Date.now(), trace = () => {} } = {}) {
  suppressFutureResolutionWarnings(scope);
  const applications = enableMobileApplications(scope, { isPersistentOverlay, isSettingsApplication, isActorEditor, now, trace });

  const removeResolutionWarnings = () => {
    for (const notification of document.querySelectorAll("#notifications .notification")) {
      if (!isResolutionWarning(notification.textContent)) continue;
      const close = notification.querySelector(".close, [data-action='close']");
      if (close instanceof HTMLElement) close.click();
      else notification.remove();
    }
  };

  const notifications = document.getElementById("notifications");
  const observer = notifications ? new MutationObserver(removeResolutionWarnings) : null;
  observer?.observe(notifications, { childList: true, subtree: true });
  scope.own(() => observer?.disconnect());
  removeResolutionWarnings();
  return applications;
}

/** Own presentation only on VE-rendered roots; native windows keep their CSS. */
export function enableVeStyleAuthority(scope, {
  document = globalThis.document,
  enabled: initialEnabled = true,
  trace = () => {}
} = {}) {
  let enabled = Boolean(initialEnabled);
  const roots = () => [...(document?.querySelectorAll?.(".ve-mobile-app") ?? [])];
  const reconcile = () => {
    const activeRoots = roots();
    for (const root of activeRoots) {
      if (enabled) root.setAttribute("data-ve-style-authority", "");
      else root.removeAttribute("data-ve-style-authority");
    }
    trace({ enabled, authorityRoots: enabled ? activeRoots.length : 0, mode: "scoped-css", exceptionalSuppression: false });
  };
  scope.own(() => {
    enabled = false;
    reconcile();
  });
  reconcile();
  return Object.freeze({
    setEnabled(value) {
      enabled = Boolean(value);
      reconcile();
    },
    snapshot() {
      return Object.freeze({ enabled, authorityRoots: roots().filter((root) => root.hasAttribute("data-ve-style-authority")).length,
        mode: "scoped-css", exceptionalSuppression: false });
    }
  });
}

export function enableMobileApplications(scope, {
  isPersistentOverlay = () => false,
  isSettingsApplication = () => false,
  isActorEditor = () => false,
  now = () => Date.now(),
  trace = () => {},
  document = globalThis.document,
  browser = globalThis.window,
  getExistingApplications = () => [
    ...Object.values(globalThis.ui?.windows ?? {}),
    ...registryValues(globalThis.foundry?.applications?.instances)
  ],
  MutationObserverType = globalThis.MutationObserver,
  schedule = (callback, delay) => setTimeout(callback, delay),
  cancel = (id) => clearTimeout(id)
} = {}) {
  const admissions = createMobileApplicationAdmissions(document?.body);
  const pendingApplications = new Map();
  const existingApplications = new Set(getExistingApplications().filter(application => applicationElement(application)?.isConnected !== false && applicationElement(application)));
  const baselineElements = new WeakSet();
  for (const application of existingApplications) {
    const element = applicationElement(application);
    if (element) baselineElements.add(element);
  }
  for (const element of document?.querySelectorAll?.(".application, .app.window-app, dialog, [role='dialog']") ?? []) baselineElements.add(element);
  const lineage = createUserInteractionLineage({ now, trace, schedule, cancel });
  const beginLineage = (event) => lineage.begin(event);
  const admit = (application, rendered, { preExisting = false } = {}) => {
    const element = applicationElement(application, rendered);
    const key = application ?? element;
    if (application && (!element || element.isConnected === false)) pendingApplications.set(application, rendered);
    else if (application) pendingApplications.delete(application);
    const retained = admissions.has(key);
    const correlation = retained ? null : lineage.match(application, element);
    const baseline = preExisting || existingApplications.has(application) || baselineElements.has(element);
    const classification = classifyMobileApplication(element, application, {
      preExisting: baseline,
      retained,
      activeBaseline: baseline && (element?.matches?.("form, [role='dialog']") || element?.querySelector?.("form"))
        && element?.contains?.(document?.activeElement) && document?.activeElement !== document?.body,
      isPersistentOverlay,
      isSettingsApplication,
      isActorEditor
    });
    if (!classification.admitted) {
      admissions.release(key, element);
      traceApplication(trace, "suppressed", application, element, correlation, classification, now(), document?.body, baseline);
      return;
    }
    if (!admissions.admit(key, element, classification.modal, correlation, application)) {
      traceApplication(trace, "suppressed", application, element, correlation, { reason: "disconnected application root", modal: false }, now(), document?.body, baseline);
      return;
    }
    if (correlation) lineage.claim(application, element);
    traceApplication(trace, "admitted", application, element, correlation, classification, now(), document?.body, baseline);
  };
  const release = (application, rendered) => {
    const element = applicationElement(application, rendered);
    pendingApplications.delete(application);
    admissions.release(application ?? element, element);
    traceApplication(trace, "disposed", application, element, null, { reason: "application close", modal: false }, now(), document?.body);
  };
  scope.listen(document, "pointerdown", beginLineage, { capture: true, passive: true });
  scope.listen(document, "click", beginLineage, { capture: true, passive: true });
  scope.listen(document, "keydown", beginLineage, { capture: true });
  scope.hook?.("renderApplication", admit);
  scope.hook?.("renderApplicationV2", admit);
  scope.hook?.("closeApplication", release);
  scope.hook?.("closeApplicationV2", release);
  for (const application of existingApplications) admit(application, null, { preExisting: true });
  for (const element of mobileDialogElements(document.body)) {
    if (!admissions.hasElement(element) && !element.closest?.(".ve-mobile-admitted-app, .ve-mobile-settings-app")) admit(null, element, { preExisting: baselineElements.has(element) });
  }
  // Foundry's registries can retain an already-closed Application while a
  // presentation switch is starting. Enforce the backdrop invariant before
  // the new VE root becomes interactive rather than waiting for another DOM
  // mutation to trigger observer cleanup.
  admissions.reconcile();

  let pruneQueued = false;
  const observer = MutationObserverType && document?.body ? new MutationObserverType((mutations) => {
    // A lifecycle-owned root wins over the DOM-only dialog fallback when both
    // become connected in the same mutation delivery.
    for (const [application, rendered] of pendingApplications) {
      if (applicationElement(application, rendered)?.isConnected === true) admit(application, rendered);
    }
    for (const mutation of mutations) for (const node of mutation.addedNodes ?? []) {
      for (const element of mobileDialogElements(node)) {
        if (!admissions.hasElement(element) && !element.closest?.(".ve-mobile-admitted-app, .ve-mobile-settings-app")) admit(null, element);
      }
    }
    if (pruneQueued || !admissions.size) return;
    pruneQueued = true;
    queueMicrotask(() => {
      pruneQueued = false;
      const removed = admissions.reconcile();
      if (removed) trace({ type: "application-admission-pruned", removed });
    });
  }) : null;
  observer?.observe(document.body, { childList: true, subtree: true });
  scope.own(() => observer?.disconnect?.());
  scope.listen(document, "pointerdown", (event) => {
    const top = event?.target?.closest?.(".ve-mobile-admitted-app");
    if (top) admissions.raise(top);
  }, { capture: true, passive: true });

  const visualViewport = browser?.visualViewport;
  const previousViewportHeight = document.body.style.getPropertyValue("--ve-mobile-viewport-height");
  const previousViewportPriority = document.body.style.getPropertyPriority("--ve-mobile-viewport-height");
  const updateViewport = () => {
    const height = visualViewport?.height ?? browser?.innerHeight ?? 0;
    document.body.style.setProperty("--ve-mobile-viewport-height", `${Math.round(height)}px`);
  };
  updateViewport();
  scope.listen(visualViewport, "resize", updateViewport, { passive: true });
  scope.listen(visualViewport, "scroll", updateViewport, { passive: true });
  scope.listen(browser, "resize", updateViewport, { passive: true });

  scope.own(() => {
    lineage.dispose();
    pendingApplications.clear();
    admissions.clear();
    if (previousViewportHeight) {
      document.body.style.setProperty("--ve-mobile-viewport-height", previousViewportHeight, previousViewportPriority);
    } else document.body.style.removeProperty("--ve-mobile-viewport-height");
  });
  return Object.freeze({ admissions, lineage });
}

/** Track admission by Application identity so a rerendered or already-closed
 * Application cannot leave a disconnected modal root holding the backdrop. */
export function createMobileApplicationAdmissions(body) {
  const records = new Map();
  const closing = new Set();
  const listeners = new Set();
  const publish = () => { for (const listener of listeners) listener(); };
  const clearClasses = (element, record) => {
    element?.classList?.remove?.("ve-mobile-admitted-app", "ve-mobile-dialog", "ve-mobile-transient-app");
    if (!element?.style || !record) return;
    if (record.priorLayer) element.style.setProperty(NATIVE_APPLICATION_LAYER_PROPERTY, record.priorLayer, record.priorLayerPriority);
    else element.style.removeProperty(NATIVE_APPLICATION_LAYER_PROPERTY);
  };
  const refreshLayers = () => {
    let index = 0;
    for (const record of records.values()) record.element?.style?.setProperty?.(NATIVE_APPLICATION_LAYER_PROPERTY, String(NATIVE_APPLICATION_LAYER + index++));
    publish();
  };
  const reconcileBackdrop = (forceLayers = false) => {
    let removed = false;
    for (const [key, record] of records) {
      if (record.element?.isConnected !== false) continue;
      clearClasses(record.element, record);
      records.delete(key);
      closing.delete(key);
      removed = true;
    }
    if (removed || forceLayers) refreshLayers();
    body?.classList?.toggle?.("ve-mobile-dialog-open", [...records.values()].some((record) => record.modal));
  };
  return Object.freeze({
    get size() { return records.size; },
    watch(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    get layers() { return [...records.values()].map((_, index) => `native-app:${index}`); },
    has: (key) => records.has(key),
    hasElement: (element) => [...records.values()].some((record) => record.element === element),
    topmost() {
      this.reconcile();
      const entries = [...records.entries()];
      const [key, record] = entries.at(-1) ?? [];
      return record ? Object.freeze({ key, application: record.application, element: record.element }) : null;
    },
    closeTopmost() {
      const top = this.topmost();
      if (!top || closing.has(top.key)) return false;
      closing.add(top.key);
      try {
        if (typeof top.application?.close === "function") {
          void Promise.resolve(top.application.close()).catch(() => closing.delete(top.key));
        } else {
          const control = top.element?.querySelector?.("[data-action='close'], .window-header button.close, .window-header .header-control.close, button[aria-label='Close']");
          if (control?.click) control.click();
          else {
            const EventClass = top.element?.ownerDocument?.defaultView?.Event ?? globalThis.Event;
            top.element?.dispatchEvent?.(typeof EventClass === "function" ? new EventClass("ve-close") : { type: "ve-close" });
          }
        }
      } catch {
        closing.delete(top.key);
        return false;
      }
      return true;
    },
    raise(element) {
      const entry = [...records].find(([, record]) => record.element === element);
      if (!entry) return false;
      records.delete(entry[0]);
      records.set(entry[0], entry[1]);
      refreshLayers();
      return true;
    },
    admit(key, element, modal, lineage = null, application = null) {
      if (!key || !element?.classList) return false;
      if (element.isConnected === false) {
        clearClasses(element, records.get(key));
        records.delete(key);
        closing.delete(key);
        reconcileBackdrop(true);
        return false;
      }
      const previous = records.get(key);
      if (previous?.element !== element) clearClasses(previous?.element, previous);
      const style = element.style;
      const priorLayer = previous?.element === element ? previous.priorLayer : style?.getPropertyValue?.(NATIVE_APPLICATION_LAYER_PROPERTY) ?? "";
      const priorLayerPriority = previous?.element === element ? previous.priorLayerPriority : style?.getPropertyPriority?.(NATIVE_APPLICATION_LAYER_PROPERTY) ?? "";
      records.delete(key);
      element.classList.add("ve-mobile-admitted-app");
      element.classList.remove("ve-mobile-dialog", "ve-mobile-transient-app");
      element.classList.add(modal ? "ve-mobile-dialog" : "ve-mobile-transient-app");
      records.set(key, Object.freeze({ element, application, modal: Boolean(modal), lineage, priorLayer, priorLayerPriority }));
      reconcileBackdrop(true);
      return true;
    },
    release(key, element = null) {
      const previous = records.get(key);
      clearClasses(previous?.element, previous);
      if (element !== previous?.element) clearClasses(element);
      records.delete(key);
      closing.delete(key);
      reconcileBackdrop(true);
    },
    reconcile() {
      const before = records.size;
      reconcileBackdrop();
      return before - records.size;
    },
    clear() {
      for (const record of records.values()) clearClasses(record.element, record);
      records.clear();
      closing.clear();
      body?.classList?.remove?.("ve-mobile-dialog-open");
      publish();
    }
  });
}

export function mobileDialogElements(root) {
  if (!root?.matches || !root?.querySelectorAll) return [];
  const selector = [
    "dialog",
    "[role='dialog']",
    ".application.dialog",
    ".app.window-app.dialog",
    ".application.activity-choice",
    ".application.activity-usage",
    ".application.roll-configuration",
    ".application.midi-targeting",
    "#midi-qol-targetConfirmation"
  ].join(", ");
  const elements = root.matches(selector) ? [root] : [];
  elements.push(...root.querySelectorAll(selector));
  return elements;
}

/** New lifecycle-known windows are admitted unless a concrete desktop owner replaces them. */
export function classifyMobileApplication(element, application = null, { preExisting = false, retained = false, activeBaseline = false, isPersistentOverlay = () => false, isSettingsApplication = () => false, isActorEditor = () => false } = {}) {
  if (!element?.matches || element.closest?.(".ve-mobile-app, .ve-mobile-bootstrap")) return Object.freeze({ admitted: false, modal: false, reason: "VE-owned" });
  if (element.isConnected === false) return Object.freeze({ admitted: false, modal: false, reason: localizeFoundry("VEMOBILE.Interface.MobilePresentation.DisconnectedApplicationRoot", "disconnected application root") });
  if (isSettingsApplication(application, element) || element.matches(".ve-mobile-settings-app")) return Object.freeze({ admitted: false, modal: false, reason: localizeFoundry("VEMOBILE.Interface.MobilePresentation.NativeSettingsSessionOwnsApplication", "native Settings session owns application") });
  if (element.matches("#interface, #sidebar, #hud, #players, #scene-controls, #scene-navigation, #hotbar, .ve-mobile-module-overlay-visible, .ve-mobile-module-overlay-host")) {
    return Object.freeze({ admitted: false, modal: false, reason: localizeFoundry("VEMOBILE.Interface.MobilePresentation.PersistentShellOrOverlay", "persistent shell or overlay") });
  }
  const modal = element.matches("dialog, [role='dialog'], .dialog, .activity-choice, .activity-usage, .roll-configuration, .midi-targeting, #midi-qol-targetConfirmation")
    || application?.options?.modal === true;
  // A persistent overlay may render a child surface through its own
  // Application lifecycle. Admitting that child as a native window would
  // stretch it across the viewport and make its transparent area eat taps.
  if (!modal && (isPersistentOverlay(element, application) || hasPersistentOverlayAncestor(element, isPersistentOverlay))) {
    return Object.freeze({ admitted: false, modal: false, reason: localizeFoundry("VEMOBILE.Interface.MobilePresentation.PersistentSceneOverlay", "persistent Scene overlay") });
  }
  if (actorSheetApplication(application) && !isActorEditor(application)) return Object.freeze({ admitted: false, modal: false, reason: localizeFoundry("VEMOBILE.Interface.MobilePresentation.ActorSheetReplacedByCharacter", "Actor sheet replaced by Character") });
  if (desktopSidebarApplication(application, element)) return Object.freeze({ admitted: false, modal: false, reason: localizeFoundry("VEMOBILE.Interface.MobilePresentation.DesktopSidebarWorkspaceReplacedByVENavigation", "desktop sidebar workspace replaced by VE navigation") });
  if (preExisting && !retained && !modal && !activeBaseline) return Object.freeze({ admitted: false, modal: false, reason: localizeFoundry("VEMOBILE.Interface.MobilePresentation.MobileActivationBaselineWorkspace", "mobile activation baseline workspace") });
  if (!application && !modal) return Object.freeze({ admitted: false, modal: false, reason: localizeFoundry("VEMOBILE.Interface.MobilePresentation.NoApplicationLifecycle", "no application lifecycle") });
  return Object.freeze({ admitted: true, modal, reason: modal ? localizeFoundry("VEMOBILE.Interface.MobilePresentation.NativeModalApplication", "native modal application") : activeBaseline ? localizeFoundry("VEMOBILE.Interface.MobilePresentation.ActiveBaselineWorkflow", "active baseline workflow") : preExisting ? localizeFoundry("VEMOBILE.Interface.MobilePresentation.RetainedApplicationLifecycle", "retained application lifecycle") : localizeFoundry("VEMOBILE.Interface.MobilePresentation.NewNativeApplicationLifecycle", "new native application lifecycle") });
}

function hasPersistentOverlayAncestor(element, isPersistentOverlay) {
  for (let parent = element?.parentElement; parent; parent = parent.parentElement) {
    // Foundry's body and desktop shell also contain module identity classes
    // (including scene-navigation classes). They are hosts, never the owning
    // overlay of an application rendered beneath them.
    if (parent.matches?.("body, html, #interface, #board, #hud, #sidebar, #scene-controls, #scene-navigation, #hotbar")) break;
    if (isPersistentOverlay(parent)) return true;
  }
  return false;
}

function actorSheetApplication(application) {
  if (!application) return false;
  // Ownership/configuration forms can also own an Actor document. Only the
  // native sheet hierarchy identifies the persistent presentation VE replaces.
  const types = [globalThis.foundry?.applications?.sheets?.ActorSheetV2, globalThis.foundry?.appv1?.sheets?.ActorSheet];
  return types.some(type => typeof type === "function" && application instanceof type);
}

function desktopSidebarApplication(application, element) {
  // Collection directories remain persistent desktop workspaces. A framed,
  // separately rendered sidebar popout is an intentional native interaction
  // (for example, a filtered Chat view), even when it inherits SidebarTab.
  // The caller still enforces lifecycle ownership and activation-baseline rules.
  if (element.matches(".directory, .directory-popout")) return true;
  if (application && element.matches(".sidebar-popout") && element.querySelector?.(".window-header")) return false;
  const types = [globalThis.foundry?.applications?.sidebar?.SidebarTab, globalThis.foundry?.appv1?.sidebar?.SidebarTab];
  return element.matches(".sidebar-tab, .sidebar-popout, .directory-popout")
    || types.some(type => typeof type === "function" && application instanceof type);
}

/** Capture optional interaction provenance for support diagnostics. Admission
 * never depends on this short-lived correlation. */
export function interactionStartsApplicationLineage(event) {
  return Boolean(applicationInteractionOrigin(event));
}

/** A shared, conservative definition of activation which can create native UI. */
export function deliberateApplicationControl(event) {
  const target = event?.target;
  if (!target?.closest) return null;
  if (event.isTrusted === false) return null;
  if (event.type === "pointerdown" && (event.button != null && event.button !== 0 || event.isPrimary === false)) return null;
  if (event.type === "click" && event.button != null && event.button !== 0) return null;
  if (event.type === "keydown" && !["Enter", " "].includes(event.key)) return null;
  if (!["pointerdown", "click", "keydown", "submit"].includes(event.type)) return null;
  if (target.closest("[data-action='close'], .header-button.close, .window-header .close")) return null;
  const control = event.type === "submit" ? target.closest("form") : target.closest(APPLICATION_CONTROL_SELECTOR);
  if (!control || control.disabled === true || control.getAttribute?.("aria-disabled") === "true") return null;
  return control;
}

export function applicationInteractionOrigin(event) {
  const control = deliberateApplicationControl(event);
  if (!control) return null;
  // Native Settings has its own explicit session and child-window owner. Do
  // not let the generic policy apply a second, competing admission class.
  if (event.target.closest(".ve-mobile-settings-app")) return null;
  const root = event.target.closest(APPLICATION_ORIGIN_SELECTOR);
  if (!root) return null;
  return Object.freeze({ root, control, source: interactionSource(root), controlName: interactionControlName(control) });
}

/** Correlate at most one render with a deliberate control for diagnostics.
 * Later asynchronous renders remain eligible for generic admission. */
export function createUserInteractionLineage({
  now = () => Date.now(),
  durationMs = APPLICATION_LINEAGE_MS,
  schedule = (callback, delay) => setTimeout(callback, delay),
  cancel = (id) => clearTimeout(id),
  trace = () => {}
} = {}) {
  let generation = 0;
  let active = null;
  let timer = null;
  let lastClaim = null;
  let claimTimer = null;
  const clearTimer = () => {
    if (timer === null) return;
    cancel(timer);
    timer = null;
  };
  const clearClaim = () => {
    if (claimTimer !== null) cancel(claimTimer);
    claimTimer = null;
    lastClaim = null;
  };
  const expire = (reason) => {
    if (!active) return;
    trace({ type: "user-interaction-lineage", result: reason, generation: active.generation, source: active.source, control: active.controlName });
    active = null;
    clearTimer();
  };
  const snapshot = (record) => record ? Object.freeze({
    generation: record.generation,
    source: record.source,
    control: record.controlName,
    startedAt: record.startedAt,
    expiresAt: record.expiresAt
  }) : null;
  return Object.freeze({
    begin(event) {
      const origin = applicationInteractionOrigin(event);
      if (!origin) return null;
      const time = now();
      if (!active && event.type === "click" && lastClaim?.control === origin.control && lastClaim.root === origin.root) return null;
      if (active && active.control === origin.control && active.root === origin.root && time <= active.expiresAt) {
        return snapshot(active);
      }
      expire("superseded");
      active = {
        generation: ++generation,
        source: origin.source,
        controlName: origin.controlName,
        control: origin.control,
        root: origin.root,
        startedAt: time,
        expiresAt: time + durationMs
      };
      trace({ type: "user-interaction-lineage", result: "started", generation, source: active.source, control: active.controlName });
      clearTimer();
      const expected = active;
      timer = schedule(() => {
        timer = null;
        if (active === expected) expire("expired");
      }, durationMs);
      return snapshot(active);
    },
    match() {
      if (!active) return null;
      if (now() > active.expiresAt) {
        expire("expired");
        return null;
      }
      return snapshot(active);
    },
    claim(application, element) {
      if (!active) return null;
      const matched = snapshot(active);
      clearClaim();
      lastClaim = { control: active.control, root: active.root };
      const expectedClaim = lastClaim;
      claimTimer = schedule(() => {
        claimTimer = null;
        if (lastClaim === expectedClaim) lastClaim = null;
      }, Math.min(500, durationMs));
      trace({
        type: "user-interaction-lineage",
        result: "correlated",
        generation: active.generation,
        source: active.source,
        control: active.controlName,
        application: applicationIdentity(application, element)
      });
      active = null;
      clearTimer();
      return matched;
    },
    dispose() { expire("disposed"); clearClaim(); },
    state() { return Object.freeze({ generation, active: Boolean(active), lineage: snapshot(active) }); }
  });
}

export function applicationIdentity(application, element = applicationElement(application)) {
  const parent = application?.parent ?? application?.options?.parent ?? null;
  return Object.freeze({
    class: String(application?.constructor?.name ?? "DOMApplication").slice(0, 80),
    appId: String(application?.appId ?? application?.id ?? application?.options?.id ?? element?.dataset?.appid ?? element?.id ?? "unknown").slice(0, 120),
    rootId: String(element?.id ?? "").slice(0, 120),
    parentAppId: parent ? String(parent.appId ?? parent.id ?? parent.options?.id ?? "unknown").slice(0, 120) : null
  });
}

function traceApplication(trace, result, application, element, lineage, classification, timestamp, body, baseline = false) {
  trace({
    type: "application-render",
    ...applicationIdentity(application, element),
    owner: String(application?.constructor?.metadata?.module ?? element?.dataset?.moduleId ?? "unknown").slice(0, 80),
    baseline,
    renderedAt: timestamp,
    mode: body?.dataset?.veMobileFormFactor ?? (body?.classList?.contains?.("ve-mobile-split-screen") ? "tablet-split" : "mobile"),
    lineage: lineage?.generation ?? null,
    classification: classification?.reason ?? "unknown",
    result: String(result).toUpperCase()
  });
}

function interactionSource(root) {
  if (root?.matches?.("#hud.ve-mobile-native-hud-host")) return "native HUD";
  if (root?.matches?.(".ve-mobile-module-overlay-visible")) return "admitted Scene overlay";
  if (root?.matches?.(".ve-mobile-transient-app, .ve-mobile-dialog")) return "admitted transient application";
  if (root?.matches?.("#context-menu")) return "admitted native control";
  if (root?.matches?.(".ve-mobile-bootstrap")) return "VE bootstrap";
  return "VE Mobile";
}

function interactionControlName(control) {
  return String(control?.dataset?.action
    ?? control?.getAttribute?.("aria-label")
    ?? control?.getAttribute?.("data-tooltip")
    ?? control?.name
    ?? control?.id
    ?? control?.tagName
    ?? "control").slice(0, 120);
}

function applicationElement(application, rendered) {
  const candidates = [rendered, rendered?.[0], application?.element, application?.element?.[0]];
  return candidates.find(candidate => candidate?.nodeType === 1 && candidate.isConnected !== false)
    ?? candidates.find(candidate => candidate?.nodeType === 1) ?? null;
}

function registryValues(registry) {
  if (!registry) return [];
  if (typeof registry.values === "function") return [...registry.values()];
  return Object.values(registry);
}

function suppressFutureResolutionWarnings(scope) {
  const notifications = globalThis.ui?.notifications;
  if (!notifications || typeof notifications.error !== "function") return;

  const original = notifications.error;
  const filteredError = function (message, options) {
    if (RESOLUTION_MESSAGE_KEYS.has(message)) return null;
    return original.call(this, message, options);
  };

  notifications.error = filteredError;
  scope.own(() => {
    if (notifications.error === filteredError) notifications.error = original;
  });
}

function isResolutionWarning(text) {
  const normalized = normalize(text);
  if (!normalized) return false;

  for (const key of RESOLUTION_MESSAGE_KEYS) {
    const template = globalThis.game?.i18n?.localize?.(key);
    if (!template || template === key) continue;
    if (templatePattern(template).test(normalized)) return true;
  }
  return false;
}

function templatePattern(template) {
  const parts = normalize(template).split(/\{[^}]+\}/u).map(escapePattern);
  return new RegExp(`^${parts.join(".*?")}$`, "u");
}

function normalize(value) {
  return String(value ?? "").replace(/\s+/gu, " ").trim();
}

function escapePattern(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
