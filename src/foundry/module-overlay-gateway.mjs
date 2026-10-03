import { localizeFoundry } from "./localization.mjs";
import { KEYS, MODULE_ID } from "./preferences.mjs";
import { enableModuleOverlayTouch } from "../ui/module-overlay-touch.mjs";

const VISIBLE_CLASS = "ve-mobile-module-overlay-visible";
const HOST_CLASS = "ve-mobile-module-overlay-host";
const MAX_SCAN_ELEMENTS = 768;
const MAX_SCAN_DEPTH = 8;
const MAX_SCAN_LOG_ENTRIES = 128;
const MAX_OWNERSHIP_DESCENDANTS = 64;
const CORE_ROOT_IDS = new Set([
  "board", "interface", "notifications", "tooltip", "context-menu", "pause", "players", "sidebar", "menu", "hud",
  "scene-controls", "scene-navigation", "hotbar", "camera-views", "ui-left", "ui-right", "ui-left-column-1",
  "ui-left-column-2", "ui-right-column-1", "ui-right-column-2"
]);
const OVERLAY_WORDS = /(?:^|[-_\s])(overlay|widget|toolbar|bar|dock|docked|panel|calendar|weather|party|token|canvas|hud|video|player)(?:$|[-_\s])/iu;
const SCAN_ROOT_IDS = Object.freeze(["interface", "ui-left", "ui-right", "ui-left-column-1", "ui-left-column-2", "ui-right-column-1", "ui-right-column-2", "hud"]);
const MODULE_OVERLAY_ADAPTERS = Object.freeze({
  "foundryvtt-simple-calendar": Object.freeze([
    Object.freeze({ rootId: "fsc-if", overlayName: "Calendar", evidence: "verified persistent FormApplication root", catalogWhenAbsent: true })
  ]),
  "monks-tokenbar": Object.freeze([
    Object.freeze({ rootId: "tokenbar", overlayName: "Token Bar", evidence: "verified non-dismissible ApplicationV2 root", catalogWhenAbsent: true })
  ]),
  "your-turn": Object.freeze([
    Object.freeze({ rootId: "yourTurnContainer", overlayName: "Turn Banner", evidence: "verified combat-turn body overlay root", catalogWhenAbsent: true })
  ]),
  "combat-tracker-dock": Object.freeze([
    Object.freeze({ rootId: "combat-dock", overlayName: "Combat Carousel", evidence: "verified encounter-scoped ApplicationV2 dock root", catalogWhenAbsent: true })
  ]),
  "dfreds-effects-panel": Object.freeze([
    // DFreds computes an absolute left coordinate from the desktop sidebar.
    // Its mobile presentation must instead retain its intended right edge.
    Object.freeze({ rootId: "effects-panel", overlayName: "Effects Panel", evidence: "verified selected-token frameless ApplicationV2 root", catalogWhenAbsent: true, sceneEdge: "right" })
  ])
});

/** User-initiated discovery and exact reconciliation of known module overlays. */
export function createModuleOverlayGateway({
  getGame = () => globalThis.game,
  getDocument = () => globalThis.document,
  getFoundry = () => globalThis.foundry,
  getUi = () => globalThis.ui,
  enableTouch = enableModuleOverlayTouch,
  diagnostics = null,
  performanceObserver = null
} = {}) {
  let owner = null;
  let context = Object.freeze({ route: "characters", splitScreen: false, templatePlacement: false, sceneChooserOpen: false, reconnecting: false });
  const adapters = new Map();
  const markedRoots = new Set();
  const markedHosts = new Set();
  const lastSceneRuntime = new Map();
  let lastScanDiagnostics = Object.freeze([]);
  let lastContextKey = "";
  let lastReconcileKey = "";
  let lastVisible = Object.freeze([]);

  const clearPresentation = () => {
    for (const adapter of adapters.values()) adapter.scope.dispose();
    adapters.clear();
    for (const element of markedRoots) element?.classList?.remove?.(VISIBLE_CLASS);
    for (const element of markedHosts) element?.classList?.remove?.(HOST_CLASS);
    markedRoots.clear();
    markedHosts.clear();
    lastContextKey = "";
    lastReconcileKey = "";
    lastVisible = Object.freeze([]);
  };

  const readCatalog = () => normalizeCatalog(readSetting(getGame(), KEYS.MODULE_OVERLAY_CATALOG));
  const readVisibility = () => normalizeVisibility(readSetting(getGame(), KEYS.MODULE_OVERLAY_VISIBILITY));
  const readOrder = () => normalizeOrder(readSetting(getGame(), KEYS.MODULE_OVERLAY_ORDER));
  const readScale = () => normalizeScaleRecord(readSetting(getGame(), KEYS.MODULE_OVERLAY_SCALE));
  const orderedEntries = () => orderOverlayEntries(readCatalog().entries, readOrder());
  const isPersistentRoot = (root, application = null) => {
    const rootId = stableRootId(root);
    const formWorkflow = root?.matches?.("form") || root?.querySelector?.("form")?.matches?.("form");
    const applicationIdentity = [application?.id, application?.options?.id,
      ...(Array.isArray(application?.options?.classes) ? application.options.classes : [])].filter(Boolean).join(" ");
    if (isSceneTabSurface(root) || SCENE_TAB_IDENTITY.test(applicationIdentity)
      || ((isCarolingianSurface(root) || /(?:^|[-_\s])crlngn[-_]/iu.test(applicationIdentity)) && !formWorkflow)) return true;
    const game = getGame();
    const document = getDocument();
    if (rootId && game?.modules) {
      for (const module of registryValues(game.modules)) {
        if (module?.active && adapterFor(module, rootId)) return true;
      }
      const entry = readCatalog().entries.find((candidate) => candidate.rootId === rootId);
      const module = entry ? game.modules.get?.(entry.moduleId) : null;
      if (entry && module?.active && safeKnownRoot(root, module, document, entry)) return true;
    }
    // A just-created persistent Application may render before the catalog has
    // had an opportunity to discover it. Preserve the same structural boundary
    // used by discovery without treating an ordinary framed form as an overlay.
    const frameLess = application?.options?.window?.frame === false
      || application?.options?.window?.positioned === false
      || application?.options?.popOut === false;
    const identity = `${root?.id ?? ""} ${typeof root?.className === "string" ? root.className : ""}`;
    return Boolean((frameLess && !formWorkflow)
      || (OVERLAY_WORDS.test(identity) && (explicitOverlayStructure(root) || application?.nonDismissible === true)));
  };

  const reconcile = (nextContext = context, { force = false } = {}) => {
    performanceObserver?.increment?.("overlay.reconcile.requested");
    context = Object.freeze({ ...context, ...nextContext });
    const contextKey = JSON.stringify(context);
    if (!force && contextKey === lastContextKey) {
      performanceObserver?.increment?.("overlay.reconcile.deduplicated");
      return Object.freeze({ visible: lastVisible });
    }
    const sceneVisible = context.route === "scene" || context.splitScreen === true;
    const mayShow = sceneVisible && !context.templatePlacement && !context.reconnecting;
    const game = getGame();
    const document = getDocument();
    const visibility = readVisibility();
    const scales = readScale();
    const entries = orderedEntries();
    const reconcileKey = JSON.stringify({ context, visibility, scales, entries: entries.map((entry) => entry.id) });
    if (!force && reconcileKey === lastReconcileKey) {
      lastContextKey = contextKey;
      performanceObserver?.increment?.("overlay.reconcile.deduplicated");
      return Object.freeze({ visible: lastVisible });
    }
    performanceObserver?.increment?.("overlay.reconcile.applied");
    const desired = new Map();
    for (const entry of entries) {
      document?.getElementById?.(entry.rootId)?.classList?.remove?.("ve-mobile-transient-app");
    }
    if (mayShow) {
      for (const entry of entries) {
        if (!visibility[entry.id]) continue;
        const module = game?.modules?.get?.(entry.moduleId);
        if (!module?.active) continue;
        const root = document?.getElementById?.(entry.rootId);
        if (!root || root.isConnected === false || !safeKnownRoot(root, module, document, entry)) continue;
        desired.set(root, entry);
      }
    }

    for (const [root, adapter] of [...adapters]) {
      if (desired.has(root)) continue;
      adapter.scope.dispose();
      adapters.delete(root);
    }
    for (const element of markedRoots) element?.classList?.remove?.(VISIBLE_CLASS);
    for (const element of markedHosts) element?.classList?.remove?.(HOST_CLASS);
    markedRoots.clear();
    markedHosts.clear();

    let overlayOrder = 0;
    for (const [root, entry] of desired) {
      root.classList.remove("ve-mobile-transient-app");
      root.classList.add(VISIBLE_CLASS);
      markedRoots.add(root);
      for (const host of overlayHosts(root, document)) {
        host.classList.add(HOST_CLASS);
        markedHosts.add(host);
      }
      if (!adapters.has(root) && owner) {
        const adapterScope = owner.child(`module-overlay:${entry.id}`);
        const definition = adapterFor(game.modules?.get?.(entry.moduleId), entry.rootId);
        const dragStrategy = classifyOverlayInteraction(root);
        const application = applicationForElement(root, getFoundry(), getUi());
        const moveWindow = dragStrategy === "pointer-root"
          ? createApplicationWindowMover(application, root) ?? createPositionedElementMover(root)
          : null;
        const controller = enableTouch(root, adapterScope, {
          dragStrategy,
          moveWindow,
          trace: dragStrategy !== "mouse-target"
            ? (event) => diagnostics?.record?.("debug", `Overlay touch ${entry.id} | ${formatTouchTrace(event)}`)
            : undefined
        });
        const presentation = createSceneBoundPresentation(root, definition, adapterScope, application);
        adapters.set(root, { scope: adapterScope, controller, presentation });
        watchRootRemoval(root, adapterScope, () => reconcile(context, { force: true }));
      }
      adapters.get(root)?.presentation?.update?.(context.viewport, 127 - overlayOrder++, scales[entry.id] ?? 100);
    }
    if (mayShow) {
      for (const entry of entries) {
        if (!visibility[entry.id] || !game?.modules?.get?.(entry.moduleId)?.active) continue;
        lastSceneRuntime.set(entry.id, Object.freeze({
          ...inspectOverlayRuntime(entry, document, adapters, context.viewport, "scene")
        }));
      }
    }
    lastReconcileKey = reconcileKey;
    lastContextKey = contextKey;
    lastVisible = Object.freeze([...desired.values()].map((entry) => entry.id));
    return Object.freeze({ visible: lastVisible });
  };

  return Object.freeze({
    enable(scope) {
      if (owner === scope) return;
      owner = scope;
      const refreshKnown = () => reconcile(context, { force: true });
      const refreshKnownAfterHook = () => queueMicrotask(() => {
        if (owner === scope && !scope.disposed) refreshKnown();
      });
      scope.hook?.("renderApplication", refreshKnown);
      scope.hook?.("renderApplicationV2", refreshKnown);
      scope.hook?.("closeApplication", refreshKnown);
      scope.hook?.("closeApplicationV2", refreshKnown);
      scope.hook?.("canvasReady", refreshKnown);
      scope.hook?.("createCombat", refreshKnownAfterHook);
      scope.hook?.("updateCombat", refreshKnownAfterHook);
      scope.hook?.("deleteCombat", refreshKnownAfterHook);
      scope.own(() => {
        if (owner !== scope) return;
        clearPresentation();
        owner = null;
      });
    },

    snapshot() {
      const catalog = readCatalog();
      const visibility = readVisibility();
      const scales = readScale();
      const activeModules = getGame()?.modules;
      return Object.freeze({
        scanned: catalog.scanned,
        entries: Object.freeze(orderOverlayEntries(catalog.entries, readOrder()).map((entry) => Object.freeze({
          ...entry,
          available: Boolean(activeModules?.get?.(entry.moduleId)?.active),
          visible: Boolean(visibility[entry.id]),
          scale: scales[entry.id] ?? 100
        })))
      });
    },

    async scan() {
      const game = getGame();
      if (!game?.settings?.set) throw new Error(localizeFoundry("VEMOBILE.Interface.ModuleOverlayGateway.FoundryClientSettingsAreUnavailable", "Foundry client settings are unavailable."));
      const discovery = inspectModuleOverlays({
        document: getDocument(),
        modules: game.modules,
        foundry: getFoundry(),
        ui: getUi()
      });
      const entries = discovery.entries;
      lastScanDiagnostics = discovery.diagnostics;
      for (const candidate of discovery.diagnostics.slice(0, MAX_SCAN_LOG_ENTRIES)) {
        diagnostics?.record?.("debug", formatScanDiagnostic(candidate));
      }
      diagnostics?.record?.("debug", `Module Overlay Scan | candidates=${discovery.diagnostics.length} accepted=${entries.length}${discovery.diagnostics.length > MAX_SCAN_LOG_ENTRIES ? ` logged=${MAX_SCAN_LOG_ENTRIES}` : ""}`);
      await game.settings.set(MODULE_ID, KEYS.MODULE_OVERLAY_CATALOG, { scanned: true, entries });
      await game.settings.set(MODULE_ID, KEYS.MODULE_OVERLAY_ORDER, orderOverlayEntries(entries, readOrder()).map((entry) => entry.id));
      reconcile(context, { force: true });
      return this.snapshot();
    },

    scanDiagnostics: () => lastScanDiagnostics,
    isPersistentRoot,

    diagnosticSnapshot() {
      const document = getDocument();
      const game = getGame();
      const visibility = readVisibility();
      return Object.freeze(readCatalog().entries
        .filter((entry) => visibility[entry.id] && game?.modules?.get?.(entry.moduleId)?.active)
        .map((entry) => lastSceneRuntime.get(entry.id) ?? Object.freeze({
          ...inspectOverlayRuntime(entry, document, adapters, context.viewport, "current")
        })));
    },

    async setVisible(id, visible) {
      const game = getGame();
      const catalog = readCatalog();
      const entry = catalog.entries.find((candidate) => candidate.id === id);
      if (!entry) throw new Error(localizeFoundry("VEMOBILE.Interface.ModuleOverlayGateway.ThatModuleOverlayIsNoLongerInTheDiscovered", "That module overlay is no longer in the discovered catalog."));
      if (visible && !game?.modules?.get?.(entry.moduleId)?.active) throw new Error(localizeFoundry("VEMOBILE.Interface.ModuleOverlayGateway.ThatModuleIsNotActiveInThisWorld", "That module is not active in this world."));
      const next = { ...readVisibility() };
      if (visible) next[id] = true;
      else delete next[id];
      await game.settings.set(MODULE_ID, KEYS.MODULE_OVERLAY_VISIBILITY, next);
      reconcile(context, { force: true });
      return Object.freeze({ ok: true, id, visible: Boolean(next[id]) });
    },

    async setOrder(ids) {
      const game = getGame();
      const catalogIds = readCatalog().entries.map((entry) => entry.id);
      const requested = normalizeOrder(ids);
      if (requested.length !== catalogIds.length || catalogIds.some((id) => !requested.includes(id))) {
        throw new Error(localizeFoundry("VEMOBILE.Interface.ModuleOverlayGateway.TheModuleOverlayListChangedRefreshSettingsAndTry", "The module overlay list changed. Refresh Settings and try again."));
      }
      await game.settings.set(MODULE_ID, KEYS.MODULE_OVERLAY_ORDER, requested);
      reconcile(context, { force: true });
      return this.snapshot();
    },

    async setScale(id, scale) {
      const game = getGame();
      if (!readCatalog().entries.some((entry) => entry.id === id)) {
        throw new Error(localizeFoundry("VEMOBILE.Interface.ModuleOverlayGateway.ThatModuleOverlayIsNoLongerInTheDiscovered", "That module overlay is no longer in the discovered catalog."));
      }
      const value = normalizeOverlayScale(scale);
      const next = { ...readScale() };
      if (value === 100) delete next[id];
      else next[id] = value;
      await game.settings.set(MODULE_ID, KEYS.MODULE_OVERLAY_SCALE, next);
      reconcile(context, { force: true });
      return this.snapshot();
    },

    reconcile,
    cancelInteractions() {
      for (const adapter of adapters.values()) adapter.scope.dispose();
      adapters.clear();
    },
    clear: clearPresentation
  });
}

export function discoverModuleOverlays(options = {}) {
  return inspectModuleOverlays(options).entries;
}

/** Detailed output is retained for deterministic development diagnostics only. */
export function inspectModuleOverlays({ document, modules, foundry, ui } = {}) {
  if (!document?.body) return Object.freeze({ entries: Object.freeze([]), diagnostics: Object.freeze([]) });
  const activeModules = [...registryValues(modules)].filter((module) => module?.active && module.id && module.id !== MODULE_ID && !isBlockedOverlayModule(module));
  if (!activeModules.length) return Object.freeze({ entries: Object.freeze([]), diagnostics: Object.freeze([]) });
  const appOwnership = applicationOwnership(activeModules, foundry, ui);
  const candidates = boundedCandidates(document, appOwnership);
  const found = new Map();
  const diagnostics = [];
  const note = (element, outcome, reason, extra = {}) => diagnostics.push(Object.freeze({
    rootId: stableRootId(element) || "(unstable root)", outcome, reason, ...extra
  }));

  for (const element of candidates) {
    const rootId = stableRootId(element);
    if (!rootId) {
      note(element, "rejected", "root has no stable ID");
      continue;
    }
    if (isSceneTabSurface(element)) {
      note(element, "rejected", "Scene tabs are replaced by VE navigation");
      continue;
    }
    const claimedCoreAdapter = activeModules.some((module) => Boolean(adapterFor(module, rootId)));
    if (CORE_ROOT_IDS.has(rootId) && !claimedCoreAdapter) {
      note(element, "rejected", "core Foundry root");
      continue;
    }
    if (excludedElement(element)) {
      note(element, "rejected", "VE-owned or non-overlay infrastructure root");
      continue;
    }
    if (element?.isConnected === false || (!document.body.contains?.(element) && element !== document.body)) {
      note(element, "rejected", "application root is not connected to the current document");
      continue;
    }
    const application = appOwnership.get(element);
    const ownership = application?.ownership ?? identifyModuleOwnership(element, activeModules);
    if (ownership.status === "ambiguous") {
      note(element, "ambiguous", ownership.reason, { moduleIds: Object.freeze(ownership.modules.map((module) => module.id)) });
      continue;
    }
    if (ownership.status !== "owned") {
      note(element, "rejected", ownership.reason);
      continue;
    }
    const role = overlayRole(element, application, ownership.adapter, document);
    if (!role.accepted) {
      note(element, "rejected", role.reason, { moduleId: ownership.module.id });
      continue;
    }
    const id = `${ownership.module.id}:${semanticSlug(rootId)}`;
    if (found.has(id)) {
      note(element, "rejected", "duplicate overlay identity", { moduleId: ownership.module.id });
      continue;
    }
    found.set(id, Object.freeze({
      id,
      moduleId: String(ownership.module.id),
      moduleTitle: String(ownership.module.title ?? ownership.module.id),
      overlayName: friendlyOverlayName(element, ownership.module, ownership.adapter),
      rootId
    }));
    note(element, "accepted", `${ownership.reason}; ${role.reason}`, {
      moduleId: ownership.module.id,
      owner: ownership.module.id,
      source: application ? "application" : ownership.adapter ? "adapter" : "dom",
      connected: true,
      classification: ownership.adapter?.classification ?? "overlay"
    });
  }
  for (const module of activeModules) {
    for (const adapter of MODULE_OVERLAY_ADAPTERS[module.id] ?? []) {
      if (!adapter.catalogWhenAbsent) continue;
      const id = `${module.id}:${semanticSlug(adapter.rootId)}`;
      if (found.has(id)) continue;
      found.set(id, Object.freeze({
        id,
        moduleId: String(module.id),
        moduleTitle: String(module.title ?? module.id),
        overlayName: adapter.overlayName,
        rootId: adapter.rootId
      }));
      diagnostics.push(Object.freeze({
        rootId: adapter.rootId,
        outcome: "accepted",
        reason: localizeFoundry("VEMOBILE.Interface.ModuleOverlayGateway.VerifiedConditionalRootIsNotCurrentlyConnected", "{evidence}; verified conditional root is not currently connected", { evidence: (adapter.evidence) }),
        moduleId: module.id,
        owner: module.id,
        source: "adapter",
        connected: false,
        classification: adapter.classification ?? "overlay"
      }));
    }
  }
  const entries = Object.freeze([...found.values()].sort((a, b) => a.moduleTitle.localeCompare(b.moduleTitle) || a.overlayName.localeCompare(b.overlayName)));
  return Object.freeze({ entries, diagnostics: Object.freeze(diagnostics) });
}

function applicationOwnership(modules, foundry, ui) {
  const result = new Map();
  const applications = uniqueValues([
    ...registryValues(foundry?.applications?.instances),
    ...Object.values(ui?.windows ?? {}),
    ui?.activeWindow
  ]);
  for (const app of applications) {
    const element = applicationElement(app);
    if (!element) continue;
    const metadata = {
      id: [app?.id, app?.options?.id, ...(app?.options?.classes ?? []), app?.constructor?.name].filter(Boolean).join(" "),
      className: typeof element?.className === "string" ? element.className : "",
      dataset: element?.dataset ?? {},
      ownershipFragments: explicitOverlayStructure(element) ? ownershipIdentities(element) : []
    };
    const ownership = identifyModuleOwnership(metadata, modules, stableRootId(element));
    result.set(element, Object.freeze({ app, ownership }));
  }
  return result;
}

function applicationForElement(element, foundry, ui) {
  return uniqueValues([
    ...registryValues(foundry?.applications?.instances),
    ...Object.values(ui?.windows ?? {}),
    ui?.activeWindow
  ]).find((app) => applicationElement(app) === element) ?? null;
}

/** Move ApplicationV2 through its public positioning API so physical touch
 * never depends on synthetic pointer capture. */
export function createApplicationWindowMover(application, root) {
  if (typeof application?.setPosition !== "function") return null;
  let origin = null;
  return ({ phase, deltaX = 0, deltaY = 0 } = {}) => {
    if (phase === "start" || !origin) {
      const rect = root?.getBoundingClientRect?.() ?? {};
      const position = application.position ?? {};
      origin = Object.freeze({
        left: finiteNumber(position.left, rect.left),
        top: finiteNumber(position.top, rect.top),
        width: position.width,
        height: position.height
      });
    }
    if (phase !== "end") {
      const next = { left: origin.left + Number(deltaX || 0), top: origin.top + Number(deltaY || 0) };
      if (origin.width !== undefined) next.width = origin.width;
      if (origin.height !== undefined) next.height = origin.height;
      application.setPosition(next);
    }
    if (phase === "end") origin = null;
    return true;
  };
}

/** Some persistent ApplicationV2-shaped overlays are intentionally omitted
 * from Foundry's application registry. Move only roots that expose positioned
 * geometry, and restore no global behavior outside the enabled overlay scope. */
export function createPositionedElementMover(root) {
  const style = root?.style;
  if (!style?.setProperty || !root?.getBoundingClientRect) return null;
  const readLeft = () => style.getPropertyValue?.("left") ?? style.left ?? "";
  const readTop = () => style.getPropertyValue?.("top") ?? style.top ?? "";
  const inlineLeft = readLeft();
  const inlineTop = readTop();
  if (!String(inlineLeft).trim() && !String(inlineTop).trim()) return null;
  let origin = null;
  return ({ phase, deltaX = 0, deltaY = 0 } = {}) => {
    if (phase === "start" || !origin) {
      const rect = root.getBoundingClientRect() ?? {};
      origin = Object.freeze({
        left: finiteNumber(Number.parseFloat(readLeft()), rect.left),
        top: finiteNumber(Number.parseFloat(readTop()), rect.top)
      });
    }
    if (phase !== "end") {
      style.setProperty("left", `${origin.left + Number(deltaX || 0)}px`);
      style.setProperty("top", `${origin.top + Number(deltaY || 0)}px`);
    }
    if (phase === "end") origin = null;
    return true;
  };
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  if (Number.isFinite(number)) return number;
  const alternative = Number(fallback);
  return Number.isFinite(alternative) ? alternative : 0;
}

function boundedCandidates(document, appOwnership) {
  const result = [];
  const seen = new Set();
  const queue = [];
  const push = (element) => {
    if (!element || seen.has(element) || result.length >= MAX_SCAN_ELEMENTS) return false;
    seen.add(element);
    result.push(element);
    return true;
  };
  for (const element of appOwnership.keys()) push(element);
  for (const definitions of Object.values(MODULE_OVERLAY_ADAPTERS)) {
    if (!definitions.length) continue;
    for (const definition of definitions) push(document.getElementById?.(definition.rootId));
  }
  for (const element of document.body?.children ?? []) queue.push({ element, depth: 0 });
  for (const id of SCAN_ROOT_IDS) {
    const element = document.getElementById?.(id);
    if (element) queue.push({ element, depth: 0 });
  }
  while (queue.length && result.length < MAX_SCAN_ELEMENTS) {
    const { element, depth } = queue.shift();
    push(element);
    if (depth >= MAX_SCAN_DEPTH || shouldSkipDescendants(element)) continue;
    for (const child of element?.children ?? []) queue.push({ element: child, depth: depth + 1 });
  }
  return result;
}

function identifyModuleOwnership(element, modules, rootId = stableRootId(element)) {
  const explicit = [element?.dataset?.moduleId, element?.dataset?.module, element?.dataset?.packageId].filter(Boolean).map(String);
  if (explicit.length) {
    const matches = modules.filter((module) => explicit.includes(String(module.id)));
    if (matches.length === 1) return owned(matches[0], "explicit module/package metadata", adapterFor(matches[0], rootId));
    if (matches.length > 1) return ambiguous(matches, "conflicting explicit module/package metadata");
    return rejected("explicit module/package metadata is not an active module");
  }
  const adapterMatches = modules.flatMap((module) => {
    const adapter = adapterFor(module, rootId);
    return adapter ? [{ module, adapter }] : [];
  });
  if (adapterMatches.length === 1) return owned(adapterMatches[0].module, `compatibility adapter: ${adapterMatches[0].adapter.evidence}`, adapterMatches[0].adapter);
  if (adapterMatches.length > 1) return ambiguous(adapterMatches.map((entry) => entry.module), "multiple compatibility adapters claim this root");

  const identities = [...ownershipIdentities(element), ...(element?.ownershipFragments ?? [])];
  if (!identities.length) return rejected("no ownership namespace metadata");
  const matches = modules.filter((module) => moduleAliases(module).some((alias) => alias.length >= 4 && identities.some((identity) => tokenContains(identity, alias))));
  if (matches.length === 1) return owned(matches[0], "unambiguous active-module namespace", adapterFor(matches[0], rootId));
  if (matches.length > 1) return ambiguous(matches, "namespace matches multiple active modules");
  return rejected("no active-module ownership match");
}

function overlayRole(element, application, adapter, document) {
  if (adapter) return Object.freeze({ accepted: true, reason: adapter.evidence });
  const identity = `${element?.id ?? ""} ${typeof element?.className === "string" ? element.className : ""}`;
  const semantic = OVERLAY_WORDS.test(identity);
  if (element?.matches?.("dialog, [role='dialog']")) return Object.freeze({ accepted: false, reason: localizeFoundry("VEMOBILE.Interface.ModuleOverlayGateway.OrdinaryDialogApplication", "ordinary dialog application") });
  if (application) {
    const app = application.app;
    const frameLess = app?.options?.window?.frame === false || app?.options?.window?.positioned === false || app?.options?.popOut === false;
    const frameHidden = renderedApplicationFrameHidden(element, document);
    const explicitOverlayClass = explicitOverlayStructure(element);
    if (frameLess) return Object.freeze({ accepted: true, reason: "module-owned frameless application" });
    if (frameHidden) return Object.freeze({ accepted: true, reason: "module-owned application with hidden rendered frame" });
    if (semantic && (explicitOverlayClass || app?.nonDismissible === true)) return Object.freeze({ accepted: true, reason: "module-owned persistent overlay application" });
    return Object.freeze({ accepted: false, reason: localizeFoundry("VEMOBILE.Interface.ModuleOverlayGateway.OrdinaryModuleApplicationWindow", "ordinary module application window") });
  }
  const framedWindow = element?.classList?.contains?.("window-app") || element?.classList?.contains?.("application");
  const explicitOverlayClass = explicitOverlayStructure(element);
  if (framedWindow && !explicitOverlayClass) return Object.freeze({ accepted: false, reason: localizeFoundry("VEMOBILE.Interface.ModuleOverlayGateway.OrdinaryModuleApplicationWindow", "ordinary module application window") });
  if (!semantic) return Object.freeze({ accepted: false, reason: localizeFoundry("VEMOBILE.Interface.ModuleOverlayGateway.RootDoesNotDescribePersistentSceneAdjacentUI", "root does not describe persistent Scene-adjacent UI") });
  const interactive = Boolean(element?.matches?.("aside, nav, [role='toolbar'], [role='region']")
    || element?.querySelector?.("button, a[href], input, select, textarea, [role='button'], canvas"));
  return Object.freeze({ accepted: interactive, reason: interactive ? localizeFoundry("VEMOBILE.Interface.ModuleOverlayGateway.OwnedSemanticInteractiveOverlayRoot", "owned semantic interactive overlay root") : "non-interactive infrastructure root" });
}

function explicitOverlayStructure(element) {
  return Boolean(element?.matches?.(".overlay, .widget, .hud, [role='toolbar'], [role='region']")
    || /(?:^|\s)[^\s]*docked(?:\s|$)/iu.test(String(element?.className ?? "")));
}

function renderedApplicationFrameHidden(element, document) {
  const header = element?.querySelector?.(".window-header");
  if (!header) return false;
  const style = computedStyle(document, header);
  const rootStyle = computedStyle(document, element);
  return header.hidden === true
    || header.getAttribute?.("aria-hidden") === "true"
    || style?.display === "none"
    || (style?.visibility === "hidden" && rootStyle?.visibility !== "hidden");
}

/** Select Foundry's drag event lifecycle from the rendered application structure. */
export function classifyOverlayInteraction(root) {
  const hasHeader = Boolean(root?.querySelector?.(".window-header"));
  if (!hasHeader) return "mouse-target";
  if (root?.matches?.(".app.window-app, .window-app:not(.application)")) return "pointer-window";
  if (root?.matches?.(".application")) return "pointer-root";
  return "pointer-window";
}

function owned(module, reason, adapter = null) {
  return Object.freeze({ status: "owned", module, reason, adapter });
}

function rejected(reason) {
  return Object.freeze({ status: "rejected", reason });
}

function ambiguous(modules, reason) {
  return Object.freeze({ status: "ambiguous", modules: Object.freeze(modules), reason });
}

function adapterFor(module, rootId) {
  return MODULE_OVERLAY_ADAPTERS[module?.id]?.find((entry) => entry.rootId === rootId) ?? null;
}

function safeKnownRoot(root, module, document, entry) {
  if (excludedElement(root) || stableRootId(root) === "") return false;
  if (!document?.body?.contains?.(root) && root !== document?.body) return false;
  const exactCatalogIdentity = stableRootId(root) === entry?.rootId
    && entry?.id === `${module.id}:${semanticSlug(entry.rootId)}`;
  const ownership = identifyModuleOwnership(root, [module]);
  return exactCatalogIdentity && (ownership.status === "owned" || Boolean(entry?.moduleId === module.id));
}

function excludedElement(element) {
  return Boolean(element?.closest?.(".ve-mobile-app, .ve-mobile-bootstrap, .ve-mobile-dialog, .ve-mobile-settings-app, #notifications, #tooltip, #context-menu")
    || element?.matches?.("script, style, link, template"));
}

function shouldSkipDescendants(element) {
  return Boolean(element?.matches?.("script, style, link, template, canvas")
    || element?.closest?.(".ve-mobile-app, .ve-mobile-bootstrap, .ve-mobile-dialog, .ve-mobile-settings-app"));
}

function overlayHosts(root, document) {
  const result = [];
  let current = root?.parentElement;
  while (current && current !== document?.body) {
    result.push(current);
    current = current.parentElement;
  }
  return result;
}

export function inspectOverlayRuntime(entry, document, adapters = new Map(), viewport = null, capturedFor = "current") {
  const root = document?.getElementById?.(entry.rootId) ?? null;
  const style = computedStyle(document, root);
  const rect = safeRect(root);
  const hiddenAncestor = firstHiddenAncestor(root, document);
  return Object.freeze({
    id: entry.id,
    moduleId: entry.moduleId,
    rootId: entry.rootId,
    capturedFor,
    rootExpected: true,
    present: Boolean(root),
    connected: Boolean(root && root.isConnected !== false),
    admitted: Boolean(root?.classList?.contains?.(VISIBLE_CLASS) && adapters.has(root)),
    admissionClass: Boolean(root?.classList?.contains?.(VISIBLE_CLASS)),
    hostClasses: Object.freeze(overlayHosts(root, document).map((host) => Boolean(host?.classList?.contains?.(HOST_CLASS)))),
    display: style?.display ?? "unknown",
    visibility: style?.visibility ?? "unknown",
    opacity: style?.opacity ?? "unknown",
    pointerEvents: style?.pointerEvents ?? "unknown",
    position: style?.position ?? "unknown",
    zIndex: style?.zIndex ?? "unknown",
    scale: String(style?.scale ?? root?.style?.getPropertyValue?.("scale") ?? "unknown").slice(0, 80),
    transform: String(style?.transform ?? root?.style?.getPropertyValue?.("translate") ?? "unknown").slice(0, 180),
    rect,
    sceneRect: viewport ? sceneRect(viewport) : null,
    offscreen: Boolean(rect && viewport && (rect.left + rect.width <= viewport.left || rect.top + rect.height <= viewport.top || rect.left >= viewport.left + viewport.width || rect.top >= viewport.top + viewport.height)),
    hiddenAncestor: hiddenAncestor ? String(hiddenAncestor.id || hiddenAncestor.className || hiddenAncestor.tagName || "ancestor").slice(0, 180) : "none"
  });
}

function computedStyle(document, element) {
  try { return element ? document?.defaultView?.getComputedStyle?.(element) ?? globalThis.getComputedStyle?.(element) ?? null : null; } catch { return null; }
}

function safeRect(element) {
  try {
    const rect = element?.getBoundingClientRect?.();
    return rect ? Object.freeze({ left: number(rect.left), top: number(rect.top), width: number(rect.width), height: number(rect.height) }) : null;
  } catch { return null; }
}

function firstHiddenAncestor(root, document) {
  let current = root;
  while (current && current !== document?.body) {
    const style = computedStyle(document, current);
    if (style?.display === "none" || style?.visibility === "hidden" || style?.opacity === "0") return current;
    current = current.parentElement;
  }
  return null;
}

function formatTouchTrace(event) {
  return `event=${event.event} phase=${event.phase} pointer=${event.pointerId}/${event.pointerType} buttons=${event.buttons} pressure=${event.pressure} captured=${event.captured} prevented=${event.defaultPrevented} touchAction=${event.touchAction}`;
}

function number(value) {
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function friendlyOverlayName(element, module, adapter = null) {
  if (adapter?.overlayName) return adapter.overlayName;
  const explicit = element?.dataset?.overlayName ?? element?.getAttribute?.("aria-label") ?? element?.getAttribute?.("title");
  if (String(explicit ?? "").trim()) return String(explicit).trim().slice(0, 160);
  let value = stableRootId(element);
  for (const alias of moduleAliases(module)) value = value.replace(new RegExp(escapePattern(alias), "giu"), " ");
  value = value.replace(/(?:overlay|widget|toolbar|panel|container|root)/giu, " ");
  const words = value.split(/[-_\s]+/u).filter(Boolean).map((word) => word[0].toUpperCase() + word.slice(1));
  return words.join(" ") || "Canvas Overlay";
}

function stableRootId(element) {
  const id = String(element?.id ?? "").trim();
  if (!/^[A-Za-z][A-Za-z0-9:_-]{1,159}$/u.test(id) || /^app-?\d+$/iu.test(id)) return "";
  return id;
}

const SCENE_TAB_IDENTITY = /(?:^|[-_\s])scene[-_\s](?:nav(?:igation)?|tabs?)(?:$|[-_\s])/iu;

function isSceneTabSurface(element) {
  if (element?.closest?.("#scene-navigation")) return true;
  return SCENE_TAB_IDENTITY.test(`${element?.id ?? ""} ${typeof element?.className === "string" ? element.className : ""} ${element?.dataset?.moduleId ?? ""} ${element?.dataset?.module ?? ""}`);
}

function isCarolingianSurface(element) {
  if ([element?.dataset?.moduleId, element?.dataset?.module, element?.dataset?.packageId].includes("crlngn-ui")) return true;
  return /(?:^|[-_\s])crlngn[-_]/iu.test(`${element?.id ?? ""} ${typeof element?.className === "string" ? element.className : ""}`);
}

function isBlockedOverlayModule(module) {
  return module?.id === "crlngn-ui" || SCENE_TAB_IDENTITY.test(`${module?.id ?? ""} ${module?.title ?? ""}`);
}

function forbiddenOverlayEntry(entry) {
  return isBlockedOverlayModule({ id: entry.moduleId, title: entry.moduleTitle })
    || SCENE_TAB_IDENTITY.test(`${entry.rootId} ${entry.overlayName}`);
}

function normalizeCatalog(value) {
  const entries = Array.isArray(value) ? value : value?.entries;
  return Object.freeze({
    scanned: value?.scanned === true,
    entries: Object.freeze((Array.isArray(entries) ? entries : []).slice(0, 128).map((entry) => Object.freeze({
      id: String(entry?.id ?? ""),
      moduleId: String(entry?.moduleId ?? ""),
      moduleTitle: String(entry?.moduleTitle ?? entry?.moduleId ?? "Module"),
      overlayName: String(entry?.overlayName ?? "Canvas Overlay"),
      rootId: String(entry?.rootId ?? "")
    })).filter((entry) => entry.id && entry.moduleId && entry.rootId && !forbiddenOverlayEntry(entry)))
  });
}

function normalizeVisibility(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return Object.freeze({});
  return Object.freeze(Object.fromEntries(Object.entries(value).filter(([key, enabled]) => key && enabled === true)));
}

export function normalizeOverlayScale(value) {
  const scale = Math.round(Number(value) / 5) * 5;
  return Number.isFinite(scale) ? Math.max(50, Math.min(100, scale)) : 100;
}

export function normalizeScaleRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return Object.freeze({});
  return Object.freeze(Object.fromEntries(Object.entries(value)
    .filter(([id]) => Boolean(String(id).trim()))
    .map(([id, scale]) => [String(id), normalizeOverlayScale(scale)])
    .filter(([, scale]) => scale !== 100)
    .slice(0, 128)));
}

export function normalizeOrder(value) {
  if (!Array.isArray(value)) return Object.freeze([]);
  return Object.freeze([...new Set(value.map((entry) => String(entry ?? "").trim()).filter(Boolean))].slice(0, 128));
}

/** Preserve user order and append newly discovered overlays deterministically. */
export function orderOverlayEntries(entries, storedOrder = []) {
  const source = [...(entries ?? [])];
  const byId = new Map(source.map((entry) => [entry.id, entry]));
  const ordered = normalizeOrder(storedOrder).flatMap((id) => byId.has(id) ? [byId.get(id)] : []);
  const used = new Set(ordered.map((entry) => entry.id));
  ordered.push(...source.filter((entry) => !used.has(entry.id)).sort((a, b) => String(a.moduleTitle).localeCompare(String(b.moduleTitle)) || String(a.overlayName).localeCompare(String(b.overlayName))));
  return Object.freeze(ordered);
}

function readSetting(game, key) {
  try { return game?.settings?.get?.(MODULE_ID, key); } catch { return undefined; }
}

function applicationElement(app) {
  const element = app?.element;
  if (element?.nodeType === 1) return element;
  if (element?.[0]?.nodeType === 1) return element[0];
  return null;
}

function watchRootRemoval(root, scope, onRemoved) {
  const parent = root?.parentNode;
  const Observer = root?.ownerDocument?.defaultView?.MutationObserver ?? globalThis.MutationObserver;
  if (!parent || typeof Observer !== "function") return;
  const observer = new Observer(() => {
    if (root.isConnected !== false) return;
    observer.disconnect();
    scope.dispose();
    onRemoved?.();
  });
  observer.observe(parent, { childList: true });
  scope.own(() => observer.disconnect());
}

/** Clip painting and hit-testing to the authoritative Scene rectangle. */
export function createSceneBoundPresentation(root, adapter, scope, application = null) {
  const style = root?.style;
  if (!style?.setProperty || !root?.getBoundingClientRect) return Object.freeze({ update() {} });
  const applicationScale = createApplicationScaleController(application);
  const original = Object.freeze({
    clipPath: style.getPropertyValue("clip-path"),
    clipPriority: style.getPropertyPriority("clip-path"),
    translate: style.getPropertyValue("translate"),
    translatePriority: style.getPropertyPriority("translate"),
    order: style.getPropertyValue("--ve-mobile-overlay-order"),
    orderPriority: style.getPropertyPriority("--ve-mobile-overlay-order"),
    scale: style.getPropertyValue("scale"),
    scalePriority: style.getPropertyPriority("scale"),
    transformOrigin: style.getPropertyValue("transform-origin"),
    transformOriginPriority: style.getPropertyPriority("transform-origin")
  });
  const restore = () => {
    applicationScale?.restore();
    restoreProperty(style, "clip-path", original.clipPath, original.clipPriority);
    restoreProperty(style, "translate", original.translate, original.translatePriority);
    restoreProperty(style, "--ve-mobile-overlay-order", original.order, original.orderPriority);
    restoreProperty(style, "scale", original.scale, original.scalePriority);
    restoreProperty(style, "transform-origin", original.transformOrigin, original.transformOriginPriority);
    root?.classList?.remove?.("ve-mobile-overlay-pass-through-root");
  };
  scope?.own?.(restore);
  return Object.freeze({
    update(viewport, order = 0, requestedScale = 100) {
      restoreProperty(style, "translate", original.translate, original.translatePriority);
      restoreProperty(style, "clip-path", original.clipPath, original.clipPriority);
      restoreProperty(style, "scale", original.scale, original.scalePriority);
      restoreProperty(style, "transform-origin", original.transformOrigin, original.transformOriginPriority);
      const scale = normalizeOverlayScale(requestedScale);
      const scaledByApplication = applicationScale?.update(scale) === true;
      if (!scaledByApplication && scale !== 100) {
        style.setProperty("scale", String(scale / 100), "important");
        style.setProperty("transform-origin", "top left", "important");
      }
      const scene = sceneRect(viewport);
      if (!scene) return;
      style.setProperty("--ve-mobile-overlay-order", String(Math.max(0, Math.min(127, Number(order) || 0))));
      let rect = root.getBoundingClientRect();
      if (!rect || !(rect.width > 0) || !(rect.height > 0)) return;
      let dx = 0;
      let dy = 0;
      const edge = adapter?.sceneEdge ?? explicitHorizontalEdge(root);
      const inset = 12;
      if (rect.width <= scene.width - inset * 2 && edge === "right") dx = scene.right - inset - rect.right;
      else if (rect.width <= scene.width - inset * 2 && edge === "left") dx = scene.left + inset - rect.left;
      else if (rect.width <= scene.width) dx = clampDelta(rect.left, rect.right, scene.left, scene.right);
      else dx = scene.left - rect.left;
      if (rect.height <= scene.height) dy = clampDelta(rect.top, rect.bottom, scene.top, scene.bottom);
      else dy = scene.top - rect.top;
      if (dx || dy) {
        style.setProperty("translate", `${dx}px ${dy}px`, "important");
        rect = { ...rect, left: rect.left + dx, right: rect.right + dx, top: rect.top + dy, bottom: rect.bottom + dy };
      }
      const top = Math.max(0, scene.top - rect.top);
      const right = Math.max(0, rect.right - scene.right);
      const bottom = Math.max(0, rect.bottom - scene.bottom);
      const left = Math.max(0, scene.left - rect.left);
      style.setProperty("clip-path", `inset(${top}px ${right}px ${bottom}px ${left}px)`, "important");
      root?.classList?.toggle?.("ve-mobile-overlay-pass-through-root", transparentHitAreaRoot(root, rect, scene));
    }
  });
}

function explicitHorizontalEdge(root) {
  const style = computedStyle(root?.ownerDocument, root);
  if (!style || !["absolute", "fixed"].includes(style.position)) return null;
  // An arbitrary absolute left coordinate is also used by draggable floating
  // windows. Only a small declared inset is evidence of an edge anchor.
  const inset = value => /^\d+(?:\.\d+)?px$/u.test(String(value ?? "")) && Number.parseFloat(value) <= 80;
  const left = inset(style.left);
  const right = inset(style.right);
  if (right && !left) return "right";
  if (left && !right) return "left";
  return null;
}

/** Keep ApplicationV2's authoritative geometry and its painted scale in sync.
 * AppV1 and generic DOM overlays deliberately fall back to presentation-only CSS. */
function createApplicationScaleController(application) {
  if (typeof application?.setPosition !== "function") return null;
  const initialScale = Number(application.position?.scale);
  if (!Number.isFinite(initialScale) || !(initialScale > 0)) return null;
  let changed = false;
  return Object.freeze({
    update(requestedScale) {
      const desired = initialScale * normalizeOverlayScale(requestedScale) / 100;
      const current = Number(application.position?.scale);
      if (Number.isFinite(current) && Math.abs(current - desired) < 0.0001) return true;
      try {
        application.setPosition({ scale: desired });
        changed = true;
        return true;
      } catch {
        return false;
      }
    },
    restore() {
      if (!changed) return;
      try {
        const current = Number(application.position?.scale);
        if (!Number.isFinite(current) || Math.abs(current - initialScale) >= 0.0001) {
          application.setPosition({ scale: initialScale });
        }
      } catch {}
      changed = false;
    }
  });
}

/** Full-scene transparent containers must not steal hits outside their visible controls. */
export function transparentHitAreaRoot(root, rect = safeRect(root), scene = null) {
  if (!rect || !scene || rect.width < scene.width * 0.8 || rect.height < scene.height * 0.8) return false;
  const style = computedStyle(root?.ownerDocument, root);
  const transparent = !style || style.backgroundColor === "transparent" || style.backgroundColor === "rgba(0, 0, 0, 0)" || Number(style.opacity ?? 1) === 0;
  return transparent && Boolean(root?.querySelector?.("button, a[href], input, select, textarea, [role='button'], [role='toolbar']"));
}

function sceneRect(viewport) {
  const left = Number(viewport?.left);
  const top = Number(viewport?.top);
  const width = Number(viewport?.width);
  const height = Number(viewport?.height);
  if (![left, top, width, height].every(Number.isFinite) || !(width > 0) || !(height > 0)) return null;
  return { left, top, width, height, right: left + width, bottom: top + height };
}

function clampDelta(start, end, minimum, maximum) {
  if (start < minimum) return minimum - start;
  if (end > maximum) return maximum - end;
  return 0;
}

function restoreProperty(style, property, value, priority) {
  if (value) style.setProperty(property, value, priority);
  else style.removeProperty(property);
}

function formatScanDiagnostic(candidate) {
  const result = String(candidate?.outcome ?? "rejected").toUpperCase();
  return [
    "Module Overlay Scan",
    `candidate=#${candidate?.rootId ?? "unknown"}`,
    `owner=${candidate?.owner ?? candidate?.moduleId ?? "unresolved"}`,
    `source=${candidate?.source ?? "dom"}`,
    `connected=${candidate?.connected ?? "unknown"}`,
    `classification=${candidate?.classification ?? "unclassified"}`,
    `result=${result}`,
    `reason=${candidate?.reason ?? "none"}`
  ].join(" | ");
}

function registryValues(registry) {
  try { return typeof registry?.values === "function" ? [...registry.values()] : []; } catch { return []; }
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))];
}

function moduleAliases(module) {
  const id = semanticSlug(module?.id);
  const title = semanticSlug(module?.title);
  const aliases = new Set([id, title]);
  for (const prefix of ["foundryvtt-", "fvtt-"]) if (id.startsWith(prefix)) aliases.add(id.slice(prefix.length));
  for (const suffix of ["-foundryvtt", "-fvtt"]) if (id.endsWith(suffix)) aliases.add(id.slice(0, -suffix.length));
  return [...aliases].filter(Boolean);
}

/** Attribute a stable overlay shell from a bounded sample of the module-owned
 * namespace metadata it contains. This admits dock shells without turning a
 * document-wide descendant scan into module discovery. */
function ownershipIdentities(element) {
  const fragments = [
    element?.id,
    typeof element?.className === "string" ? element.className : "",
    ...Object.values(element?.dataset ?? {})
  ];
  const descendants = [];
  const queue = [...(element?.children ?? [])];
  while (queue.length && descendants.length < MAX_OWNERSHIP_DESCENDANTS) {
    const descendant = queue.shift();
    if (!descendant) continue;
    descendants.push(descendant);
    for (const child of descendant.children ?? []) {
      if (descendants.length + queue.length >= MAX_OWNERSHIP_DESCENDANTS) break;
      queue.push(child);
    }
  }
  for (const descendant of descendants) {
    fragments.push(
      descendant?.id,
      typeof descendant?.className === "string" ? descendant.className : "",
      ...Object.values(descendant?.dataset ?? {})
    );
  }
  return [...new Set(fragments.map(semanticSlug).filter(Boolean))];
}

function tokenContains(identity, alias) {
  return identity === alias || identity.startsWith(`${alias}-`) || identity.endsWith(`-${alias}`) || identity.includes(`-${alias}-`);
}

function semanticSlug(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, 160);
}

function escapePattern(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

export { HOST_CLASS, VISIBLE_CLASS, MAX_SCAN_DEPTH, MAX_SCAN_ELEMENTS, MODULE_OVERLAY_ADAPTERS };
