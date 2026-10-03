import { localizeFoundry } from "./localization.mjs";
import { profileLevel } from "./low-memory-canvas-gateway.mjs";

export const MOBILE_CAPABILITY_SOCKET = "module.ve-mobile";
export const MOBILE_CAPABILITY_SCHEMA_VERSION = 1;
export const MOBILE_CAPABILITY_STALE_MS = 5 * 60 * 1000;

export function createMobileClientCapabilityGateway({
  getGame = () => globalThis.game,
  getDocument = () => globalThis.document,
  getWindow = () => globalThis.window,
  getNavigator = () => globalThis.navigator,
  getCanvas = () => globalThis.canvas,
  getPhysicalDeviceClass = () => "desktop",
  getPresentationMode = () => "desktop",
  getGraphicsPolicy = () => null,
  getProfileSnapshot = () => null,
  getDerivativeStatus = () => null,
  getRecovery = () => null,
  readDeviceIdentity = async () => ({ label: localizeFoundry("VEMOBILE.Interface.MobileClientCapabilityGateway.UnknownDevice", "Unknown device"), precision: "unknown" }),
  getSceneRisk = () => null,
  openOptimizer = () => {},
  createPrompt = createGmMobileRiskPrompt,
  readTheme = () => "system",
  now = () => Date.now(),
  diagnostics = null
} = {}) {
  const records = new Map();
  let generation = 0;
  let lastPublishedKey = "";
  let activePrompt = null;
  let stopped = false;
  const mobilePresentation = () => ["phone", "tablet"].includes(String(getPresentationMode()));
  const pendingActivations = new Map();
  const wrappedEntries = new WeakSet();

  const api = {
    start(scope) {
      stopped = false;
      const game = getGame();
      const socket = game?.socket;
      if (!socket?.on || !socket?.off) return false;
      const receive = (message) => {
        if (message?.type === "capability-request") {
          if (mobilePresentation()) void api.publish("request");
          return;
        }
        receiveCapabilityMessage(message, game, records, now());
      };
      socket.on(MOBILE_CAPABILITY_SOCKET, receive);
      scope?.own?.(() => socket.off(MOBILE_CAPABILITY_SOCKET, receive));
      scope?.own?.(() => {
        stopped = true;
        api.remove();
        records.clear();
        activePrompt?.dismiss?.("cancel");
        activePrompt = null;
      });
      const requestCapabilities = () => {
        if (isDesktopGm(game, getPresentationMode())) {
          socket.emit(MOBILE_CAPABILITY_SOCKET, { type: "capability-request", schemaVersion: MOBILE_CAPABILITY_SCHEMA_VERSION });
        }
      };
      scope?.hook?.("userConnected", (user, connected) => {
        if (connected === false) records.delete(String(user?.id ?? ""));
        else requestCapabilities();
      });
      scope?.hook?.("deleteUser", (user) => records.delete(String(user?.id ?? "")));
      if (isDesktopGm(game, getPresentationMode())) {
        scope?.hook?.("getSceneContextOptions", (_application, entries) => wrapSceneActivationEntries(entries));
      }
      requestCapabilities();
      let viewportQueued = false;
      const publishViewport = () => {
        if (viewportQueued) return;
        viewportQueued = true;
        scope?.timeout?.(() => {
          viewportQueued = false;
          void api.publish("viewport");
        }, 750);
      };
      scope?.listen?.(getWindow(), "resize", publishViewport, { passive: true });
      scope?.listen?.(getWindow()?.visualViewport, "resize", publishViewport, { passive: true });
      const scheduleExpiry = () => {
        if (scope?.disposed) return;
        pruneCapabilityRecords(records, game, now());
        if (mobilePresentation()) void api.publish("heartbeat");
        scope?.timeout?.(scheduleExpiry, 2 * 60 * 1000);
      };
      scope?.timeout?.(scheduleExpiry, 2 * 60 * 1000);
      return true;
    },

    async publish(reason = "update") {
      const game = getGame();
      const physicalDeviceClass = String(getPhysicalDeviceClass());
      if (!mobilePresentation() || !["phone", "tablet"].includes(physicalDeviceClass) || !game?.user?.id || !game?.socket?.emit) return null;
      const identity = await Promise.resolve(readDeviceIdentity()).catch(() => null);
      const policy = getGraphicsPolicy?.() ?? {};
      const profile = getProfileSnapshot?.() ?? {};
      const derivative = getDerivativeStatus?.() ?? {};
      const recovery = getRecovery?.() ?? {};
      const windowRef = getWindow();
      const navigatorRef = getNavigator();
      const canvasRef = getCanvas();
      const record = normalizeCapabilityRecord({
        schemaVersion: MOBILE_CAPABILITY_SCHEMA_VERSION,
        userId: String(game.user.id),
        physicalDeviceClass,
        deviceLabel: identity?.label,
        deviceLabelPrecision: identity?.precision,
        browserFamily: browserFamily(navigatorRef),
        presentationMode: String(getPresentationMode()),
        dpr: Number(windowRef?.devicePixelRatio) || 1,
        backingPixels: Number(policy?.device?.backingPixels) || null,
        deviceFamily: policy?.device?.family,
        deviceTier: policy?.device?.tier,
        rendererResolution: Number(canvasRef?.app?.renderer?.resolution) || null,
        profile: profile.profile,
        effectiveProfile: profile.effectiveProfile ?? profile.profile,
        derivativePolicy: derivative.preference,
        derivativeStatus: derivative.status,
        contextLossThisSession: Boolean(recovery.contextLossThisSession),
        recentGraphicsInterruption: Boolean(recovery.recentSceneDrawInterruption),
        recentReliableContextLoss: Boolean(recovery.contextLossThisSession || Number(recovery.recentContextLossCount) > 0 || recovery.recentSceneDrawInterruption),
        recentContextLossCount: Math.max(0, Number(recovery.recentContextLossCount) || 0),
        historicalContextLoss: Boolean(recovery.historicalContextLoss),
        deviceMemoryGb: Number.isFinite(Number(navigatorRef?.deviceMemory)) ? Number(navigatorRef.deviceMemory) : null,
        reportedAt: Number(now()),
        generation: ++generation
      });
      if (!record) return null;
      const stableKey = JSON.stringify({ ...record, reportedAt: 0, generation: 0 });
      if (reason !== "ready" && reason !== "reconnect" && reason !== "heartbeat" && reason !== "request" && stableKey === lastPublishedKey) return record;
      lastPublishedKey = stableKey;
      game.socket.emit(MOBILE_CAPABILITY_SOCKET, { type: "capability", record });
      return record;
    },

    remove() {
      const game = getGame();
      const userId = String(game?.user?.id ?? "");
      if (userId && game?.socket?.emit) game.socket.emit(MOBILE_CAPABILITY_SOCKET, { type: "capability-remove", userId });
    },

    snapshot() {
      pruneCapabilityRecords(records, getGame(), now());
      return Object.freeze([...records.values()].map((record) => Object.freeze({ ...record })));
    },

    preflightActivation(scene, activate, isEligible = () => true) {
      const game = getGame();
      const sceneId = String(scene?.id ?? "");
      const worldId = game?.world?.id;
      const userId = game?.user?.id;
      const cancel = (reason) => Object.freeze({ action: "cancel", reason });
      if (typeof activate !== "function") return Promise.resolve(cancel("missing-activation"));
      if (!isDesktopGm(game, getPresentationMode())) return Promise.resolve(cancel("not-desktop-gm"));
      const validate = () => {
        const current = getGame();
        if (stopped || current !== game || current?.world?.id !== worldId || current?.user?.id !== userId) return "session-changed";
        if (!isDesktopGm(current, getPresentationMode())) return "authority-changed";
        const target = current.scenes?.get?.(sceneId);
        if (!target) return "scene-missing";
        if (target.active) return "already-active";
        if (typeof target.canUserModify === "function" && !target.canUserModify(current.user, "update")) return "permission-changed";
        if (!isEligible()) return "action-unavailable";
        return null;
      };
      const resume = () => {
        const reason = validate();
        return reason ? cancel(reason) : activate();
      };
      if (pendingActivations.has(sceneId)) return pendingActivations.get(sceneId);
      const run = async () => {
        const reason = validate();
        if (reason) return cancel(reason);
        let risk;
        try { risk = getSceneRisk?.(scene?.id); }
        catch (error) {
          diagnostics?.record?.("error", `Desktop mobile-client Scene activation risk check failed open for ${scene?.id ?? "unknown"}`, error);
          return resume();
        }
        const recommendation = risk?.recommendation ?? risk ?? {};
        if (profileLevel(recommendation.recommendedMinimumProfile ?? "normal") === 0) return resume();
        const clients = atRiskClientRecords(api.snapshot(), recommendation, { game, now: now() });
        if (!clients.length) return resume();
        if (activePrompt) return cancel("prompt-pending");
        const prompt = createPrompt({
          document: getDocument(),
          scene,
          risk,
          recommendation,
          clients,
          game,
          theme: readTheme()
        });
        activePrompt = prompt;
        const choice = await prompt.promise.finally(() => {
          prompt.dismiss?.("cancel");
          if (activePrompt === prompt) activePrompt = null;
        });
        if (choice === "activate") {
          const reason = validate();
          if (reason) return cancel(reason);
          await activate();
          return Object.freeze({ action: "activate", sceneId: String(scene?.id ?? "") });
        }
        if (choice === "optimise") {
          const reason = validate();
          if (reason) return cancel(reason);
          openOptimizer(sceneId, String(getGame().scenes.get(sceneId).name ?? ""));
          return Object.freeze({ action: "optimise", sceneId: String(scene?.id ?? "") });
        }
        return Object.freeze({ action: "cancel", sceneId: String(scene?.id ?? "") });
      };
      const pending = run().finally(() => {
        if (pendingActivations.get(sceneId) === pending) pendingActivations.delete(sceneId);
      });
      pendingActivations.set(sceneId, pending);
      return pending;
    }
  };

  function wrapSceneActivationEntries(entries) {
    if (!Array.isArray(entries)) return;
    for (const entry of entries) {
      if (entry?.name !== "SCENE.Activate" || typeof entry.callback !== "function" || wrappedEntries.has(entry)) continue;
      const nativeActivate = entry.callback;
      const wrapper = function (element, ...args) {
        const sceneId = String(element?.dataset?.sceneId ?? element?.dataset?.entryId ?? "");
        const scene = getGame()?.scenes?.get?.(sceneId);
        if (!scene) return Promise.resolve(Object.freeze({ action: "cancel", reason: "scene-missing" }));
        const isEligible = () => {
          if (String(element?.dataset?.sceneId ?? element?.dataset?.entryId ?? "") !== sceneId) return false;
          try { return typeof entry.condition === "function" ? entry.condition.call(entry, element) !== false : entry.condition !== false; }
          catch { return false; }
        };
        return api.preflightActivation(scene, () => nativeActivate.call(this, element, ...args), isEligible).catch((error) => {
          diagnostics?.record?.("error", `Desktop mobile-client Scene activation failed for ${sceneId}`, error);
          return Object.freeze({ action: "error", sceneId });
        });
      };
      entry.callback = wrapper;
      wrappedEntries.add(entry);
    }
  }

  return Object.freeze(api);
}

export function normalizeCapabilityRecord(value) {
  if (!value || Number(value.schemaVersion) !== MOBILE_CAPABILITY_SCHEMA_VERSION) return null;
  const userId = bounded(value.userId, 128);
  const physicalDeviceClass = ["phone", "tablet"].includes(value.physicalDeviceClass) ? value.physicalDeviceClass : "";
  if (!userId || !physicalDeviceClass) return null;
  return Object.freeze({
    schemaVersion: MOBILE_CAPABILITY_SCHEMA_VERSION,
    userId,
    physicalDeviceClass,
    deviceLabel: bounded(value.deviceLabel, 80) || localizeFoundry("VEMOBILE.Preflight.UnknownDevice", "Unknown mobile device"),
    deviceLabelPrecision: ["model", "family"].includes(value.deviceLabelPrecision) ? value.deviceLabelPrecision : "unknown",
    browserFamily: bounded(value.browserFamily, 32) || localizeFoundry("VEMOBILE.Preflight.UnknownBrowser", "Unknown browser"),
    presentationMode: ["phone", "tablet", "desktop"].includes(value.presentationMode) ? value.presentationMode : physicalDeviceClass,
    dpr: finiteRange(value.dpr, 1, 8, 1),
    backingPixels: finiteNullable(value.backingPixels),
    deviceFamily: ["apple-touch", "android", "other"].includes(value.deviceFamily) ? value.deviceFamily : "other",
    deviceTier: ["constrained", "balanced", "capable"].includes(value.deviceTier) ? value.deviceTier : "balanced",
    rendererResolution: finiteNullable(value.rendererResolution),
    profile: normalizedProfile(value.profile),
    effectiveProfile: normalizedProfile(value.effectiveProfile),
    derivativePolicy: bounded(value.derivativePolicy, 24) || "unknown",
    derivativeStatus: bounded(value.derivativeStatus, 32) || "unknown",
    contextLossThisSession: Boolean(value.contextLossThisSession),
    recentGraphicsInterruption: Boolean(value.recentGraphicsInterruption),
    recentReliableContextLoss: Boolean(value.recentReliableContextLoss),
    recentContextLossCount: Math.max(0, Math.floor(Number(value.recentContextLossCount) || 0)),
    historicalContextLoss: Boolean(value.historicalContextLoss),
    deviceMemoryGb: finiteNullable(value.deviceMemoryGb),
    reportedAt: Math.max(0, Number(value.reportedAt) || 0),
    generation: Math.max(0, Math.floor(Number(value.generation) || 0))
  });
}

export function receiveCapabilityMessage(message, game, records, timestamp = Date.now()) {
  if (!message || !records?.set) return false;
  if (message.type === "capability-remove") {
    records.delete(String(message.userId ?? ""));
    return true;
  }
  if (message.type !== "capability") return false;
  const record = normalizeCapabilityRecord(message.record);
  if (!record || record.reportedAt > Number(timestamp) + 60_000 || Number(timestamp) - record.reportedAt > MOBILE_CAPABILITY_STALE_MS) return false;
  if (!game?.users?.get?.(record.userId)) return false;
  const existing = records.get(record.userId);
  if (existing && (existing.reportedAt > record.reportedAt
    || (existing.reportedAt === record.reportedAt && existing.generation >= record.generation))) return false;
  records.set(record.userId, record);
  return true;
}

export function pruneCapabilityRecords(records, game, timestamp = Date.now()) {
  for (const [userId, record] of records ?? []) {
    const user = game?.users?.get?.(userId);
    if (!user || user.active === false || Number(timestamp) - Number(record.reportedAt) > MOBILE_CAPABILITY_STALE_MS) records.delete(userId);
  }
  return records;
}

export function atRiskClientRecords(records, recommendation, { game, now = Date.now() } = {}) {
  const targetLevel = profileLevel(recommendation?.recommendedMinimumProfile ?? "normal");
  if (targetLevel === 0) return Object.freeze([]);
  const result = [];
  for (const record of records ?? []) {
    const normalized = normalizeCapabilityRecord(record);
    const user = normalized ? game?.users?.get?.(normalized.userId) : null;
    if (!normalized || !user || user.active === false || Number(now) - normalized.reportedAt > MOBILE_CAPABILITY_STALE_MS) continue;
    const stableCapableAndroid = normalized.deviceFamily === "android"
      && normalized.deviceTier === "capable"
      && !normalized.recentReliableContextLoss
      && recommendation?.risk !== "very-high";
    const clientTargetLevel = stableCapableAndroid ? 0 : targetLevel;
    const underProfile = profileLevel(normalized.effectiveProfile) < clientTargetLevel;
    const failureRisk = normalized.recentReliableContextLoss && ["high", "very-high"].includes(String(recommendation?.risk));
    if (!underProfile && !failureRisk && !recommendation?.exceedsMaximum) continue;
    result.push(Object.freeze({ ...normalized, userName: bounded(user.name, 120) || localizeFoundry("VEMOBILE.Preflight.ConnectedPlayer", "Connected player") }));
  }
  return Object.freeze(result.sort((left, right) => left.userName.localeCompare(right.userName)));
}

export function createGmMobileRiskPrompt({ document, scene, risk, recommendation, clients, game, theme = "system" }) {
  if (!document?.createElement || !document?.body) return Object.freeze({ sceneId: String(scene?.id ?? ""), promise: Promise.resolve("cancel"), dismiss() {} });
  const root = document.createElement("div");
  root.className = "ve-gm-mobile-risk";
  root.dataset.veBackDismissable = "true";
  root.dataset.veBackKind = "profile-warning";
  root.dataset.theme = ["light", "dark"].includes(theme) ? theme : "system";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-labelledby", "ve-gm-mobile-risk-title");
  const card = document.createElement("section");
  card.className = "ve-gm-mobile-risk-card";
  const heading = document.createElement("h2");
  heading.id = "ve-gm-mobile-risk-title";
  heading.textContent = localizeFoundry("VEMOBILE.Interface.MobileClientCapabilityGateway.CheckThisSceneForPlayersOnPhonesOrTablets", "Check this scene for players on phones or tablets");
  const summary = document.createElement("p");
  summary.textContent = localizeFoundry("VEMOBILE.Interface.MobileClientCapabilityGateway.HasImageContentThatMayBeDifficultForThe", "{nameThisscene} has image content that may be difficult for the connected players listed below. This is a precaution based on the scene, their current settings, or a recent graphics problem; it is not a measured lack of hardware memory.", { nameThisscene: (scene?.name ?? localizeFoundry("VEMOBILE.Preflight.ThisScene", "This scene")) });
  const clientList = document.createElement("ul");
  clientList.className = "ve-gm-mobile-risk-clients";
  for (const client of clients ?? []) {
    const item = document.createElement("li");
    const name = document.createElement("strong");
    name.textContent = client.userName;
    const details = document.createElement("span");
    details.textContent = client.recentReliableContextLoss ? localizeFoundry("VEMOBILE.Preflight.ClientRecentFailure", "{device} · Current graphics: {profile} · This player recently had a graphics problem", { device: client.deviceLabel, profile: title(client.effectiveProfile) }) : localizeFoundry("VEMOBILE.Preflight.ClientGraphics", "{device} · Current graphics: {profile}", { device: client.deviceLabel, profile: title(client.effectiveProfile) });
    item.append(name, details);
    clientList.append(item);
  }
  const assetList = document.createElement("ul");
  assetList.className = "ve-gm-mobile-risk-assets";
  for (const surface of [...(risk?.surfaces ?? [])].sort((a, b) => Number(b?.effective?.decodedBytes ?? 0) - Number(a?.effective?.decodedBytes ?? 0)).slice(0, 3)) {
    const item = document.createElement("li");
    item.textContent = basename(surface.source);
    assetList.append(item);
  }
  const assetsHeading = document.createElement("h3");
  assetsHeading.textContent = localizeFoundry("VEMOBILE.Interface.MobileClientCapabilityGateway.LargestSceneImages", "Largest scene images");
  const actions = document.createElement("div");
  actions.className = "ve-gm-mobile-risk-actions";
  const button = (label, choice, primary = false) => {
    const control = document.createElement("button");
    control.type = "button";
    control.dataset.choice = choice;
    control.textContent = label;
    if (primary) control.className = "is-primary";
    actions.append(control);
    return control;
  };
  button(localizeFoundry("VEMOBILE.Interface.MobileClientCapabilityGateway.OpenSceneAnyway", "Open scene anyway"), "activate", true);
  button(localizeFoundry("VEMOBILE.Interface.MobileClientCapabilityGateway.ReviewSceneImages", "Review scene images"), "optimise");
  button(localizeFoundry("VEMOBILE.Interface.Presenter.Cancel", "Cancel"), "cancel");
  card.append(heading, summary, clientList, assetsHeading, assetList, actions);
  root.append(card);
  document.body.append(root);
  let resolve;
  let settled = false;
  const promise = new Promise((done) => { resolve = done; });
  const dismiss = (choice = "cancel") => {
    if (settled) return;
    settled = true;
    root.remove();
    resolve(choice);
  };
  root.addEventListener("click", (event) => {
    const choice = event.target?.closest?.("button[data-choice]")?.dataset?.choice;
    if (choice) dismiss(choice);
  });
  root.addEventListener("ve-close", () => dismiss("cancel"));
  actions.querySelector?.("button")?.focus?.({ preventScroll: true });
  return Object.freeze({ sceneId: String(scene?.id ?? ""), element: root, promise, dismiss });
}

function isDesktopGm(game, physicalDeviceClass) { return Boolean(game?.user?.isGM) && String(physicalDeviceClass) === "desktop"; }
function normalizedProfile(value) { return ["normal", "balanced", "strong", "maximum"].includes(String(value)) ? String(value) : "normal"; }
function bounded(value, maximum) { return String(value ?? "").replace(/[\u0000-\u001F\u007F]/gu, "").trim().slice(0, maximum); }
function finiteNullable(value) {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}
function finiteRange(value, minimum, maximum, fallback) { const number = Number(value); return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback; }
function browserFamily(navigatorRef) { const ua = String(navigatorRef?.userAgent ?? ""); if (/Edg\//iu.test(ua)) return "Edge"; if (/Firefox\//iu.test(ua)) return "Firefox"; if (/CriOS|Chrome\//iu.test(ua)) return "Chrome"; if (/Safari\//iu.test(ua)) return "Safari"; return "Other"; }
function title(value) { const profile = normalizedProfile(value); return localizeFoundry(`VEMOBILE.MemoryProfile.${profile}.Label`, { normal: "Normal", balanced: "Balanced", strong: "Strong", maximum: "Maximum" }[profile]); }
function basename(value) { return String(value ?? localizeFoundry("VEMOBILE.Preflight.UnknownAsset", "Unknown asset")).split(/[\\/]/u).pop() || localizeFoundry("VEMOBILE.Preflight.UnknownAsset", "Unknown asset"); }
