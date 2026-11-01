import { localizeFoundry } from "./localization.mjs";
import { deliberateApplicationControl } from "./mobile-presentation.mjs";

const SETTINGS_CLASS = "ve-mobile-settings-app";
const SESSION_CLASS = "ve-mobile-settings-session-open";
const SCROLL_OWNER_CLASS = "ve-mobile-settings-scroll-owner";
const SETTINGS_LAYER_PROPERTY = "--ve-mobile-settings-layer";
const SETTINGS_BACKDROP_LAYER_PROPERTY = "--ve-mobile-settings-backdrop-layer";
// Keep native settings above Scene overlays/HUD and the modal band, matching
// --ve-layer-settings in the renderer's shared layer scale.
const SETTINGS_LAYER_BASE = 5200;
const DICE_ACTIVE_CLASS = "ve-mobile-settings-dice-active";
const DICE_LAYER_PROPERTY = "--ve-mobile-settings-dice-layer";
const LINEAGE_WINDOW_MS = 5000;
const PENDING_ROOT_WINDOW_MS = 3000;
const DICE_ACTIVITY_POLL_MS = 50;
const DICE_START_GRACE_MS = 1500;

/**
 * Admit Foundry-owned settings applications through VE Mobile's desktop UI
 * boundary without copying or taking ownership of their form content.
 */
export function createFoundrySettingsCompatibilityGateway({
  getGame = () => globalThis.game,
  getFoundry = () => globalThis.foundry,
  getHooks = () => globalThis.Hooks,
  getDocument = () => globalThis.document,
  getMutationObserver = () => globalThis.MutationObserver,
  readComputedStyle = (element) => getDocument()?.defaultView?.getComputedStyle?.(element)
    ?? globalThis.getComputedStyle?.(element),
  now = () => Date.now(),
  schedule = (callback, delay) => setTimeout(callback, delay),
  cancel = (id) => clearTimeout(id),
  pendingRootWindowMs = PENDING_ROOT_WINDOW_MS
} = {}) {
  let enabled = false;
  let session = null;
  const layerListeners = new Set();
  // Publish the updated shared layer assignments for admitted native applications.
  const publishLayers = () => { for (const listener of layerListeners) listener(); };
  let endTimer = null;
  let diceActivity = null;
  let diceTimer = null;

  // Clear the timer that ends a temporary native-application admission.
  const clearEndTimer = () => {
    if (endTimer === null) return;
    cancel(endTimer);
    endTimer = null;
  };

  // Clear the Dice So Nice activity timeout when its current session ends.
  const clearDiceTimer = () => {
    if (diceTimer === null) return;
    cancel(diceTimer);
    diceTimer = null;
  };

  // Release the Dice So Nice activity claim and restore its host when no roll remains active.
  const releaseDiceActivity = () => {
    clearDiceTimer();
    if (!diceActivity) return;
    restoreDiceHost(diceActivity);
    diceActivity = null;
  };

  // Recompute Dice So Nice’s layer position from the current Foundry and VE surfaces.
  const refreshDiceLayer = () => {
    if (!diceActivity || !session) return;
    const host = currentDiceHost(getGame(), getDocument());
    if (!host) return releaseDiceActivity();
    if (host !== diceActivity.host) {
      restoreDiceHost(diceActivity);
      diceActivity = createDiceActivity(host);
    }
    const highestLayer = Math.max(SETTINGS_LAYER_BASE - 1, ...[...session.apps.values()].map(record => record.layer ?? SETTINGS_LAYER_BASE - 1));
    diceActivity.host.style?.setProperty?.(DICE_LAYER_PROPERTY, String(highestLayer + 1));
  };

  // Check whether Dice So Nice still owns a visible, active roll interaction.
  const checkDiceActivity = () => {
    diceTimer = null;
    if (!diceActivity || !session) return releaseDiceActivity();
    refreshDiceLayer();
    if (!diceActivity) return;
    const rolling = Boolean(getGame()?.dice3d?.box?.rolling);
    if (rolling) diceActivity.seenRolling = true;
    if (diceActivity.seenRolling || now() < diceActivity.graceUntil) {
      if (!rolling && diceActivity.seenRolling) return releaseDiceActivity();
      diceTimer = schedule(checkDiceActivity, DICE_ACTIVITY_POLL_MS);
      return;
    }
    releaseDiceActivity();
  };

  // Register Dice So Nice as temporarily admitted while a native roll is active.
  const activateDiceActivity = () => {
    if (!session) return false;
    const host = currentDiceHost(getGame(), getDocument());
    if (!host) return false;
    if (!diceActivity || diceActivity.host !== host) {
      releaseDiceActivity();
      diceActivity = createDiceActivity(host);
    }
    diceActivity.graceUntil = now() + DICE_START_GRACE_MS;
    refreshDiceLayer();
    clearDiceTimer();
    diceTimer = schedule(checkDiceActivity, DICE_ACTIVITY_POLL_MS);
    return true;
  };

  // End an admission session and release all associated listeners, timers, and style claims.
  const releaseSession = () => {
    clearEndTimer();
    releaseDiceActivity();
    if (!session) return;
    for (const record of session.apps.values()) removeAdmission(record);
    for (const resolve of session.waiters.values()) resolve(false);
    session.apps.clear();
    session.pendingRoots.clear();
    session.waiters.clear();
    restoreStyleProperty(getDocument()?.body?.style, SETTINGS_BACKDROP_LAYER_PROPERTY, session.priorBackdropLayer, session.priorBackdropPriority);
    session = null;
    getDocument()?.body?.classList?.remove?.(SESSION_CLASS);
    publishLayers();
  };

  // Defer closing the temporary session until its admitted application and pending interaction are idle.
  const finishWhenIdle = () => {
    clearEndTimer();
    if (!session || session.apps.size || session.pendingRoots.size) return;
    const delay = Math.max(0, session.lineageUntil - now());
    if (!delay) return releaseSession();
    endTimer = schedule(() => {
      endTimer = null;
      if (session && !session.apps.size && !session.pendingRoots.size && now() >= session.lineageUntil) releaseSession();
    }, delay);
  };

  // Capture the native application and current presentation owner for a bounded admission session.
  const beginSession = (root) => {
    releaseSession();
    const bodyStyle = getDocument()?.body?.style;
    session = {
      apps: new Map(),
      pendingRoots: new Set(root ? [root] : []),
      waiters: new Map(),
      layerSequence: 0,
      lineageUntil: 0,
      priorBackdropLayer: bodyStyle?.getPropertyValue?.(SETTINGS_BACKDROP_LAYER_PROPERTY) ?? "",
      priorBackdropPriority: bodyStyle?.getPropertyPriority?.(SETTINGS_BACKDROP_LAYER_PROPERTY) ?? ""
    };
    bodyStyle?.setProperty?.(SETTINGS_BACKDROP_LAYER_PROPERTY, String(SETTINGS_LAYER_BASE - 1));
    getDocument()?.body?.classList?.add?.(SESSION_CLASS);
    endTimer = schedule(() => {
      endTimer = null;
      if (session && !session.apps.size && session.pendingRoots.size) releaseSession();
    }, pendingRootWindowMs);
    return session;
  };

  // Admit an intentional native application above the mobile renderer and register its cleanup with the owner.
  const admit = (app, suppliedElement) => {
    if (!session || !app) return false;
    const element = applicationElement(app, suppliedElement);
    if (!element?.classList || element.isConnected === false) return false;
    let record = session.apps.get(app);
    if (record?.element !== element) {
      if (record) removeAdmission(record);
      record = createAdmissionRecord(element);
      session.apps.set(app, record);
    }
    raiseAdmission(session, record);
    refreshBackdropLayer(session, getDocument()?.body?.style);
    refreshScrollOwner(record);
    refreshDiceLayer();
    session.pendingRoots.delete(app);
    session.waiters.get(app)?.(true);
    session.waiters.delete(app);
    getDocument()?.body?.classList?.add?.(SESSION_CLASS);
    clearEndTimer();
    app.bringToFront?.();
    publishLayers();
    return true;
  };

  // Classify each rendered Foundry application and update its mobile admission state.
  const onRender = (app, suppliedElement, context, options) => {
    if (!session || !app) return false;
    if (session.apps.has(app) || session.pendingRoots.has(app)) {
      const admitted = admit(app, suppliedElement);
      if (admitted && app === getGame()?.settings?.sheet && options?.isFirstRender) {
        const record = session.apps.get(app);
        record.restoreInitialFocus?.();
        record.restoreInitialFocus = redirectSettingsInitialFocus(record.element);
      }
      return admitted;
    }
    if (registeredSettingsApplication(app, getGame()) || admittedParent(app, session.apps)) {
      return admit(app, suppliedElement);
    }
    if ((now() <= session.lineageUntil)
      && settingsLineageCandidate(app, suppliedElement, getFoundry())) {
      return admit(app, suppliedElement);
    }
    return false;
  };

  // Release an application’s admission when Foundry closes its window.
  const onClose = (app) => {
    if (!session || !app) return;
    const record = session.apps.get(app);
    if (record) removeAdmission(record);
    session.apps.delete(app);
    session.pendingRoots.delete(app);
    session.waiters.get(app)?.(false);
    session.waiters.delete(app);
    refreshBackdropLayer(session, getDocument()?.body?.style);
    refreshDiceLayer();
    finishWhenIdle();
    publishLayers();
  };

  // Extend or release admission based on interaction with the current native application.
  const onInteraction = (event) => {
    if (!session) return;
    const target = event?.target;
    if (diceSoNiceTestRoll(target)) activateDiceActivity();
    if (!interactionMayLaunchApplication(event)) return;
    const source = target?.closest?.(`.${SETTINGS_CLASS}`);
    if (!source) return;
    const entry = [...session.apps.entries()].find(([, record]) => record.element === source);
    if (entry) {
      raiseAdmission(session, entry[1]);
      refreshScrollOwner(entry[1]);
      entry[0]?.bringToFront?.();
    }
    session.lineageUntil = now() + LINEAGE_WINDOW_MS;
    clearEndTimer();
  };

  // Reconcile admitted applications after relevant native DOM roots are inserted or removed.
  const onMutations = (records) => {
    if (!session) return;
    for (const mutation of records) {
      for (const removed of mutation.removedNodes ?? []) {
        for (const [app, tracked] of session.apps) {
          if ((removed === tracked.element) || removed?.contains?.(tracked.element)) {
            removeAdmission(tracked);
            session.apps.delete(app);
            session.waiters.get(app)?.(false);
            session.waiters.delete(app);
          }
        }
      }
      for (const tracked of session.apps.values()) {
        if (mutation.target === tracked.element || tracked.element?.contains?.(mutation.target)) {
          refreshScrollOwner(tracked);
        }
      }
    }
    refreshBackdropLayer(session, getDocument()?.body?.style);
    refreshDiceLayer();
    finishWhenIdle();
  };

  // End stale admission state after pointer cancellation, page hiding, or native interaction teardown.
  const onPointerLifecycle = (event) => {
    if (!session) return;
    const source = event?.target?.closest?.(`.${SETTINGS_CLASS}`);
    if (!source) return;
    const record = [...session.apps.values()].find(candidate => candidate.element === source);
    if (record) refreshScrollOwner(record);
  };

  // Open the requested native configuration surface only after checking its current role and availability.
  const open = async (app, renderOptions) => {
    if (!enabled) throw new Error(localizeFoundry("VEMOBILE.Interface.SettingsCompatibilityGateway.NativeSettingsCompatibilityIsNotActive", "Native settings compatibility is not active."));
    if (!app || typeof app.render !== "function") throw new Error(localizeFoundry("VEMOBILE.Interface.SettingsCompatibilityGateway.ThatNativeSettingsApplicationIsUnavailable", "That native settings application is unavailable."));
    const openingSession = beginSession(app);
    try {
      await Promise.resolve(app.render(renderOptions));
      const admitted = await waitForAdmission(openingSession, app);
      const record = openingSession.apps.get(app);
      if (!admitted || session !== openingSession || !usableAdmission(record?.element, readComputedStyle)) {
        throw new Error(localizeFoundry("VEMOBILE.Interface.SettingsCompatibilityGateway.TheNativeSettingsApplicationDidNotProduceAVisible", "The native settings application did not produce a visible window."));
      }
      return Object.freeze({ ok: true });
    } catch (error) {
      if (session === openingSession) releaseSession();
      throw error;
    }
  };

  // Wait for a candidate application to be registered and admitted before returning its native root.
  const waitForAdmission = (openingSession, app) => {
    if (session !== openingSession) return Promise.resolve(false);
    if (openingSession.apps.has(app)) return Promise.resolve(true);
    return new Promise(resolve => openingSession.waiters.set(app, resolve));
  };

  return Object.freeze({
    get layers() { return [...(session?.apps?.keys() ?? [])].map((_, index) => `settings-app:${index}`); },
    watch(listener) { layerListeners.add(listener); return () => layerListeners.delete(listener); },
    // Return the highest connected settings application admitted by the current compatibility session.
    topmost() {
      if (!enabled || !session) return null;
      const entries = [...session.apps.entries()].filter(([, record]) => record.element?.isConnected !== false);
      const [application, record] = entries.sort((left, right) => (left[1].layer ?? 0) - (right[1].layer ?? 0)).at(-1) ?? [];
      return record ? Object.freeze({ application, element: record.element, layer: record.layer ?? SETTINGS_LAYER_BASE }) : null;
    },
    // Close the top admitted settings application when it exposes Foundry's native close method.
    closeTopmost() {
      const top = this.topmost();
      if (!top || typeof top.application?.close !== "function") return false;
      try { void Promise.resolve(top.application.close()).catch(() => {}); }
      catch { return false; }
      return true;
    },
    // Match an application to the active settings session using registration, parentage, or opener lineage.
    ownsApplication(app, suppliedElement) {
      if (!session || !app) return false;
      return session.apps.has(app) || session.pendingRoots.has(app)
        || registeredSettingsApplication(app, getGame()) || admittedParent(app, session.apps)
        || (now() <= session.lineageUntil && settingsLineageCandidate(app, suppliedElement, getFoundry()));
    },
    // Install native application hooks and pointer tracking under the owning mobile scope.
    enable(scope) {
      if (enabled) return;
      enabled = true;
      const hooks = getHooks();
      const registrations = [
        ["renderApplicationV2", onRender],
        ["closeApplicationV2", onClose],
        ["renderApplication", onRender],
        ["closeApplication", onClose],
        ["diceSoNiceRollStart", activateDiceActivity]
      ].map(([name, listener]) => [name, hooks?.on?.(name, listener)]);
      const document = getDocument();
      scope.listen(document, "click", onInteraction, true);
      scope.listen(document, "submit", onInteraction, true);
      scope.listen(document, "keydown", onInteraction, true);
      for (const type of ["pointerdown", "pointerup", "pointercancel", "lostpointercapture", "touchstart"]) {
        scope.listen(document, type, onPointerLifecycle, { capture: true, passive: true });
      }

      const Observer = getMutationObserver();
      const observer = Observer && document?.body ? new Observer(onMutations) : null;
      observer?.observe(document.body, {
        attributes: true,
        attributeFilter: ["class", "hidden"],
        childList: true,
        subtree: true
      });
      scope.own(() => observer?.disconnect());
      scope.own(() => {
        for (const [name, id] of registrations) if (id !== undefined) hooks?.off?.(name, id);
        enabled = false;
        releaseSession();
        releaseDiceActivity();
      });
    },

    async openFoundrySettings() {
      const sheet = getGame()?.settings?.sheet;
      const result = await open(sheet, { force: true });
      return Object.freeze({ ...result, application: "core.settings" });
    },

    // Provide the localized settings entry-point labels and compatibility guidance.
    snapshot() {
      const game = getGame();
      return Object.freeze({
        title: localized(game, "VEMOBILE.Settings.Native.Title", "Foundry Settings"),
        openFoundryLabel: localized(game, "VEMOBILE.Settings.Native.OpenFoundry", "Open Foundry Settings"),
        openFoundryHint: localized(game, "VEMOBILE.Settings.Native.OpenFoundryHint", "Use Foundry's native settings interface for core, system, and module configuration."),
        compatibilityHint: localized(game, "VEMOBILE.Settings.Native.CompatibilityHint", "Some Foundry and module settings are designed for desktop and may not display correctly on smaller screens. If needed, switch to Desktop mode to access them.")
      });
    },

    // Exposed as plain diagnostic state for deterministic unit tests only.
    state() {
      return Object.freeze({
        enabled,
        active: Boolean(session),
        admitted: session?.apps.size ?? 0,
        pending: session?.pendingRoots.size ?? 0
      });
    }
  });
}

/** Identify a live native Settings application using registered app identity. */
export function registeredSettingsApplication(app, game = globalThis.game) {
  if (!app) return false;
  const canConfigure = Boolean(game?.user?.can?.("SETTINGS_MODIFY"));
  for (const menu of game?.settings?.menus?.values?.() ?? []) {
    if (!menu || (menu.restricted && !canConfigure)) continue;
    if ((menu.key === "core.permissions") && !game?.user?.hasRole?.("GAMEMASTER")) continue;
    if (instanceOf(app, menu.type)) return true;
  }
  return false;
}

/** Match a just-opened settings window to the user interaction that launched it. */
export function settingsLineageCandidate(app, suppliedElement, foundry = globalThis.foundry) {
  if (!app) return false;
  if (documentSheetApplication(app, foundry)) return false;
  if (dialogApplication(app, suppliedElement, foundry)) return true;
  if (instanceOf(app, foundry?.appv1?.api?.FormApplication)) return true;
  const element = applicationElement(app, suppliedElement);
  if (app?.options?.tag === "form" || typeof app?.options?.form?.handler === "function") return true;
  if (element?.matches?.("form") || element?.querySelector?.("form")) return true;
  const signature = [app?.constructor?.name, app?.id, app?.options?.id, ...(app?.options?.classes ?? [])].join(" ");
  return /(?:config|settings|preferences|options)/iu.test(signature);
}

// Resolve the admitted application parent for a child surface or scroll owner.
function admittedParent(app, admitted) {
  return [app?.parent, app?.options?.parent, app?.options?.owner].some(parent => admitted.has(parent));
}

// Identify a document sheet by its live Foundry application capabilities and root.
function documentSheetApplication(app, foundry) {
  const types = [
    foundry?.applications?.api?.DocumentSheetV2,
    foundry?.appv1?.api?.DocumentSheet,
    foundry?.appv1?.api?.ActorSheet,
    foundry?.appv1?.api?.ItemSheet
  ];
  return types.some(type => instanceOf(app, type));
}

// Identify a transient dialog that should remain reachable above the mobile renderer.
function dialogApplication(app, suppliedElement, foundry) {
  if (instanceOf(app, foundry?.applications?.api?.DialogV2)
    || instanceOf(app, foundry?.appv1?.api?.Dialog)) return true;
  const element = applicationElement(app, suppliedElement);
  return Boolean(element?.matches?.("dialog, [role='dialog'], .application.dialog, .app.window-app.dialog"));
}

// Check whether a control action is expected to open a native application.
function interactionMayLaunchApplication(event) {
  return Boolean(deliberateApplicationControl(event));
}

// Resolve the current DOM root of a Foundry application instance.
function applicationElement(app, supplied) {
  for (const candidate of [supplied, app?.element]) {
    if (elementLike(candidate)) return candidate;
    if (elementLike(candidate?.[0])) return candidate[0];
  }
  return null;
}

/**
 * Dice So Nice 5.3.4 creates this host in Dice3D._buildCanvas and stores its
 * jQuery wrapper on game.dice3d.canvas. The DOM fallback only covers a host
 * replacement between the request and the next activity check.
 */
function currentDiceHost(game, document) {
  const configured = applicationElement({ element: game?.dice3d?.canvas });
  if (configured?.id === "dice-box-canvas" && configured.isConnected !== false) return configured;
  const renderer = game?.dice3d?.box?.renderer?.domElement;
  const rendererHost = renderer?.closest?.("#dice-box-canvas") ?? renderer?.parentElement;
  if (rendererHost?.id === "dice-box-canvas" && rendererHost.isConnected !== false) return rendererHost;
  const discovered = document?.querySelector?.("#dice-box-canvas") ?? null;
  return discovered?.isConnected === false ? null : discovered;
}

// Create a scoped activity record for one active Dice So Nice roll.
function createDiceActivity(host) {
  const style = host?.style;
  host?.classList?.add?.(DICE_ACTIVE_CLASS);
  return {
    host,
    seenRolling: false,
    graceUntil: 0,
    priorLayer: style?.getPropertyValue?.(DICE_LAYER_PROPERTY) ?? "",
    priorLayerPriority: style?.getPropertyPriority?.(DICE_LAYER_PROPERTY) ?? ""
  };
}

// Restore Dice So Nice host styles only when the gateway still owns the temporary values.
function restoreDiceHost(activity) {
  const host = activity?.host;
  host?.classList?.remove?.(DICE_ACTIVE_CLASS);
  const style = host?.style;
  if (!style?.setProperty) return;
  if (activity.priorLayer) style.setProperty(DICE_LAYER_PROPERTY, activity.priorLayer, activity.priorLayerPriority);
  else style.removeProperty?.(DICE_LAYER_PROPERTY);
}

// Recognize the Dice So Nice test-roll surface and its temporary ownership requirements.
function diceSoNiceTestRoll(target) {
  const control = target?.closest?.("[data-action='test']");
  const root = control?.closest?.(".dice-so-nice");
  return Boolean(control && root?.classList?.contains?.("ve-mobile-settings-app"));
}

// Check the minimal DOM element surface required by native admission logic.
function elementLike(value) {
  return Boolean(value && (value.nodeType === 1 || value.classList));
}

// Capture the style, parent, and application identity needed to safely restore an admission.
function createAdmissionRecord(element) {
  const style = element.style;
  return {
    element,
    scrollOwner: null,
    priorLayer: style?.getPropertyValue?.(SETTINGS_LAYER_PROPERTY) ?? "",
    priorLayerPriority: style?.getPropertyPriority?.(SETTINGS_LAYER_PROPERTY) ?? ""
  };
}

// Apply the shared native application layer while preserving the original inline style.
function raiseAdmission(activeSession, record) {
  record.element.classList.add(SETTINGS_CLASS);
  const layer = (SETTINGS_LAYER_BASE - 1) + (++activeSession.layerSequence);
  record.element.style?.setProperty?.(SETTINGS_LAYER_PROPERTY, String(layer));
  record.layer = layer;
}

// Reconcile the backdrop layer with the currently admitted application and VE layer stack.
function refreshBackdropLayer(activeSession, style) {
  if (!activeSession || !style?.setProperty) return;
  const lowestApplicationLayer = Math.min(SETTINGS_LAYER_BASE, ...[...activeSession.apps.values()].map(record => record.layer ?? SETTINGS_LAYER_BASE));
  style.setProperty(SETTINGS_BACKDROP_LAYER_PROPERTY, String(lowestApplicationLayer - 1));
}

// Restore one inline property only when it still contains the gateway’s assigned value.
function restoreStyleProperty(style, property, value, priority) {
  if (!style?.setProperty) return;
  if (value) style.setProperty(property, value, priority);
  else style.removeProperty?.(property);
}

// Remove a native application admission and restore only state still owned by this gateway.
function removeAdmission(record) {
  record.restoreInitialFocus?.();
  record.restoreInitialFocus = null;
  record.scrollOwner?.classList?.remove?.(SCROLL_OWNER_CLASS);
  record.scrollOwner = null;
  record.element?.classList?.remove?.(SETTINGS_CLASS);
  const style = record.element?.style;
  if (!style?.setProperty) return;
  if (record.priorLayer) style.setProperty(SETTINGS_LAYER_PROPERTY, record.priorLayer, record.priorLayerPriority);
  else style.removeProperty?.(SETTINGS_LAYER_PROPERTY);
}

/** Foundry 13.351 invokes render hooks before ApplicationV2._postRender's
 * first-render [autofocus]. Redirect that one admission to the window title;
 * later intentional input focus and Desktop rendering retain native behavior. */
export function redirectSettingsInitialFocus(element) {
  const search = element.querySelector?.('input[type="search"][autofocus]');
  const title = element.querySelector?.(".window-title");
  if (!search || !title) return () => {};
  const original = [search.getAttribute("autofocus"), title.getAttribute("autofocus"), title.getAttribute("tabindex")];
  search.removeAttribute("autofocus");
  title.setAttribute("tabindex", "-1");
  title.setAttribute("autofocus", "");
  return () => {
    for (const [node, name, value] of [[search, "autofocus", original[0]], [title, "autofocus", original[1]], [title, "tabindex", original[2]]]) {
      if (value === null) node.removeAttribute(name);
      else node.setAttribute(name, value);
    }
  };
}

/**
 * Resolve the current primary vertical scrollport without retaining references
 * to ApplicationV2 parts which a native application may replace on render.
 */
export function settingsScrollOwner(root) {
  if (!root?.querySelector) return null;
  const content = root.querySelector(":scope > .window-content, :scope > .application-content")
    ?? root.querySelector(".window-content, .application-content");
  if (!content) return null;

  const selectors = root.classList?.contains?.("category-browser")
    ? [
        ".main .categories > .tab.active.scrollable",
        ".main .categories > .tab.active",
        ".main .scrollable"
      ]
    : [
        ":scope > .tab.active.scrollable",
        ":scope > [data-application-part].tab.active",
        ":scope > .scrollable:not(nav)",
        ".tab.active.scrollable",
        ".tab.active"
      ];
  for (const selector of selectors) {
    const candidate = content.querySelector?.(selector);
    if (candidate && candidate.isConnected !== false && !candidate.hidden) return candidate;
  }
  return content;
}

// Reconcile which admitted application currently owns touch scrolling.
function refreshScrollOwner(record) {
  const next = settingsScrollOwner(record.element);
  if (record.scrollOwner === next) return next;
  record.scrollOwner?.classList?.remove?.(SCROLL_OWNER_CLASS);
  record.scrollOwner = next;
  next?.classList?.add?.(SCROLL_OWNER_CLASS);
  return next;
}

// Confirm an admission still refers to a live, attached application root.
function usableAdmission(element, readComputedStyle) {
  if (!element || element.isConnected === false) return false;
  const rect = element.getBoundingClientRect?.();
  if (rect && (!(rect.width > 0) || !(rect.height > 0))) return false;
  const style = readComputedStyle?.(element);
  if (!style) return true;
  return style.display !== "none"
    && style.visibility !== "hidden"
    && Number(style.opacity ?? 1) > 0
    && style.pointerEvents !== "none";
}

// Check an application against a Foundry constructor without assuming the constructor exists.
function instanceOf(value, Type) {
  if (typeof Type !== "function") return false;
  try {
    return value instanceof Type;
  } catch {
    return false;
  }
}

// Resolve a user-facing message with Foundry localization and a readable fallback.
function localized(game, key, fallback) {
  const value = game?.i18n?.localize?.(key);
  return !value || value === key ? fallback : value;
}

export {
  LINEAGE_WINDOW_MS,
  PENDING_ROOT_WINDOW_MS,
  SCROLL_OWNER_CLASS,
  SESSION_CLASS,
  SETTINGS_CLASS,
  SETTINGS_BACKDROP_LAYER_PROPERTY,
  SETTINGS_LAYER_PROPERTY,
  SETTINGS_LAYER_BASE,
  DICE_ACTIVE_CLASS,
  DICE_LAYER_PROPERTY
};
