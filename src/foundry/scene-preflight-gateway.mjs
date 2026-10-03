import { localizedNumber } from "../ui/localized-text.mjs";
import { KEYS, MODULE_ID } from "./preferences.mjs";
import { MEMORY_PROFILES, profileLevel } from "./low-memory-canvas-gateway.mjs";
import { localizeFoundry } from "./localization.mjs";

const PREFLIGHT_STATE_VERSION = 1;
const PROFILE_TRANSACTION_VERSION = 1;
const RELOAD_GUARD_WINDOW_MS = 10 * 60 * 1000;

/**
 * One authoritative profile transaction for Settings, Scene Preflight, and
 * graphics recovery. It persists intent before native renderer writes, keeps
 * Canvas redraw suppression active, and owns the one real document reload.
 */
export function createDurableProfileHandoff({
  gateway,
  mobileAuthority = null,
  getGame = () => globalThis.game,
  getWindow = () => globalThis.window,
  now = () => Date.now(),
  createToken = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
  requestReload = null,
  diagnostics = null
} = {}) {
  let preparing = false;
  let reloadRequested = false;

  const api = {
    get changing() { return preparing || reloadRequested || Boolean(gateway?.changing); },

    snapshot() {
      const snapshot = gateway?.snapshot?.() ?? {};
      const transaction = readTransaction();
      return Object.freeze({ ...snapshot, changing: api.changing, transaction });
    },

    preview: (...args) => gateway?.preview?.(...args) ?? Object.freeze([]),
    plan: (...args) => gateway?.plan?.(...args) ?? null,
    previewEnable: (...args) => gateway?.previewEnable?.(...args) ?? Object.freeze([]),
    applyPresentationClass: (...args) => gateway?.applyPresentationClass?.(...args),

    async apply(profile, { source = "unknown" } = {}) {
      const authorityToken = mobileAuthority?.capture?.() ?? 0;
      const assertMobile = () => {
        if (mobileAuthority && !mobileAuthority.allows(authorityToken)) throw new Error(localizeFoundry("VEMOBILE.Graphics.AuthorityEnded", "Mobile performance authority ended before the graphics transaction."));
      };
      assertMobile();
      const target = normalizeProfile(profile);
      if (preparing || reloadRequested) throw new Error(localizeFoundry("VEMOBILE.Graphics.ProfileTransactionInProgress", "Memory Protection settings are already being applied or are waiting for a document reload."));
      const game = getGame();
      const plan = gateway?.plan?.(target) ?? null;
      const transaction = Object.freeze({
        version: PROFILE_TRANSACTION_VERSION,
        generation: String(createToken()).slice(0, 120),
        profile: target,
        requestedProfile: target,
        configuredProfile: target,
        source: String(source).slice(0, 60),
        requestedAt: Number(now()),
        reloadRequired: Boolean(plan?.reloadRequired),
        phase: "applying"
      });
      preparing = true;
      try {
        assertMobile();
        await writeTransaction(transaction);
        assertMobile();
        const result = await gateway.apply(target);
        assertMobile();
        const committed = gateway?.snapshot?.() ?? {};
        if (normalizeProfile(committed.profile) !== target) throw new Error(localizeFoundry("VEMOBILE.Graphics.ProfilePersistVerifyFailed", "Memory Protection could not save {profile} as the configured profile.", { profile: profileLabel(target) }));
        if (!result?.requiresReload) {
          assertMobile();
          await writeTransaction({});
          return Object.freeze({ ...result, plan, configuredProfile: target, reloadTriggered: false });
        }
        const reloadTransaction = Object.freeze({ ...transaction, reloadRequired: true, phase: "reload-pending" });
        assertMobile();
        await writeTransaction(reloadTransaction);
        assertMobile();
        diagnostics?.record?.("warn", `Memory Protection prepared ${target}; requesting one full Foundry document reload.`);
        const reloadTriggered = await requestDocumentReload();
        if (!reloadTriggered) throw new Error(localizeFoundry("VEMOBILE.Graphics.ProfilePersisted", "The profile was saved, but the required full document reload could not start."));
        reloadRequested = true;
        return Object.freeze({ ...result, plan, configuredProfile: target, requiresReload: true, reloadTriggered, transaction: reloadTransaction });
      } catch (error) {
        error.profileApplicationFailed = true;
        if (!mobileAuthority || mobileAuthority.allows(authorityToken)) {
          try { await writeTransaction({ ...transaction, phase: "failed", error: String(error.message), configuredProfile: safeGet(game, MODULE_ID, KEYS.MEMORY_PROTECTION_PROFILE) }); } catch {}
        }
        throw error;
      } finally {
        preparing = false;
      }
    },

    enable(options) { return api.apply("balanced", options); },
    disable(options) { return api.apply("normal", options); },
    restorePrevious(options) { return api.apply("normal", options); },

    async resumeInterrupted() {
      if (mobileAuthority && !mobileAuthority.active()) return Object.freeze({ action: "none" });
      const transaction = readTransaction();
      if (!["reload-pending", "applying"].includes(transaction.phase)) return Object.freeze({ action: "none" });
      const state = api.snapshot();
      // The persisted selection always wins over old recovery intent. Never
      // re-save a profile from an older transaction during startup hydration.
      if (state.profile !== transaction.configuredProfile || state.effective) {
        await writeTransaction({});
        return Object.freeze({ action: "completed", transaction, result: api.snapshot() });
      }
      await writeTransaction({ ...transaction, phase: "failed" });
      return Object.freeze({ action: "incomplete", transaction, result: api.snapshot() });
    }
  };

  function readTransaction() {
    return normalizeProfileTransaction(safeGet(getGame(), MODULE_ID, KEYS.GRAPHICS_PROFILE_TRANSACTION));
  }

  async function writeTransaction(value) {
    await getGame()?.settings?.set?.(MODULE_ID, KEYS.GRAPHICS_PROFILE_TRANSACTION, value);
  }

  async function requestDocumentReload() {
    if (typeof requestReload === "function") {
      try { return (await requestReload()) !== false; }
      catch (error) { diagnostics?.record?.("error", "The injected full-document reload request failed.", error); }
    }
    const supported = globalThis.foundry?.utils?.debouncedReload;
    if (typeof supported === "function") {
      try {
        supported();
        return true;
      } catch (error) { diagnostics?.record?.("error", "Foundry's full-document reload helper failed.", error); }
    }
    const direct = getWindow()?.location?.reload;
    if (typeof direct === "function") {
      try {
        direct.call(getWindow().location);
        return true;
      } catch (error) { diagnostics?.record?.("error", "The browser full-document reload fallback failed.", error); }
    }
    diagnostics?.record?.("error", "Memory Protection requires a full reload, but no document reload API is available.");
    return false;
  }

  return Object.freeze(api);
}

/**
 * Gate the public Canvas#draw boundary. Foundry 13.351 calls this from
 * Scene#view before Canvas#draw reaches TextureLoader.loadSceneTextures.
 */
export function createScenePreflightGateway({
  getCanvas = () => globalThis.canvas,
  getGame = () => globalThis.game,
  getDocument = () => globalThis.document,
  getWindow = () => globalThis.window,
  readActive = () => true,
  readBehavior = () => safeGet(getGame(), MODULE_ID, KEYS.MEMORY_PROTECTION_BEHAVIOR) ?? "recommend",
  readWarnings = () => safeGet(getGame(), MODULE_ID, KEYS.SCENE_MEMORY_WARNINGS) !== false,
  readTheme = () => "system",
  getProfileSnapshot = () => null,
  previewProfile = () => [],
  planProfile = null,
  getSceneRisk = () => null,
  applyProfile = async () => ({ ok: true, requiresReload: false }),
  setNoCanvas = value => getGame()?.settings?.set?.("core", "noCanvas", value),
  now = () => Date.now(),
  createToken = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
  reload = () => getWindow()?.location?.reload?.(),
  onDrawStart = () => {},
  onDrawComplete = () => {},
  diagnostics = null
} = {}) {
  let installedCanvas = null;
  let originalDraw = null;
  let proxyDraw = null;
  let activePrompt = null;
  let last = null;
  let resumingPending = false;
  const approved = new Map();
  const maximumWarningsAcknowledged = new Set();

  const api = {
    install(scope) {
      const canvas = getCanvas();
      if (!canvas || typeof canvas.draw !== "function" || installedCanvas) return false;
      installedCanvas = canvas;
      originalDraw = canvas.draw;
      proxyDraw = async function (scene, ...args) {
        const draw = () => drawWithInterruptionMarker(this, scene, args);
        // Foundry's client performance-setting handlers synchronously request
        // Canvas redraws for each write. During a staged profile transaction
        // those redraws can decode the current Scene before the profile and
        // reload handoff are durably saved. The completed transaction performs
        // its one required reload, so suppress only these in-flight redraws.
        if (getProfileSnapshot()?.changing) return this;
        if (!scene || consumeApproval(scene?.id)) return draw();
        try {
          const result = await api.preflight(scene, { source: "canvas-draw", allowCancel: false });
          if (result.action === "reload") return this;
          return draw();
        } catch (error) {
          if (error.profileApplicationFailed) {
            diagnostics?.record?.("error", "Graphics profile application failed; Scene remains held", error);
            throw error;
          }
          diagnostics?.record?.("error", "Scene Preflight failed open before canvas draw", error);
          return draw();
        }
      };
      canvas.draw = proxyDraw;
      scope?.own?.(() => {
        if (installedCanvas?.draw === proxyDraw) installedCanvas.draw = originalDraw;
        installedCanvas = originalDraw = proxyDraw = null;
        activePrompt?.dismiss?.("continue");
        activePrompt = null;
      });
      return true;
    },

    async preflight(scene, { source = "user", allowCancel = true } = {}) {
      const sceneId = String(scene?.id ?? "");
      if (!sceneId || !readActive() || normalizeBehavior(readBehavior()) === "off") return approve(sceneId, "proceed", source);
      const risk = getSceneRisk(sceneId);
      // Scene-size advice targets physical mobile browsers, even when a
      // desktop is deliberately using the Phone or Tablet presentation.
      // A real unacknowledged graphics loss remains relevant on any device.
      if (risk?.profileRecommendationApplicable === false && !risk?.priorGraphicsLoss) return approve(sceneId, "proceed", source);
      const profile = getProfileSnapshot() ?? {};
      const recommendation = risk?.recommendation ?? risk ?? {};
      const recommended = normalizeProfile(recommendation.recommendedMinimumProfile);
      const current = normalizeProfile(profile.profile);
      const effective = normalizeProfile(profile.effectiveProfile ?? current);
      const required = profileLevel(current) > profileLevel(recommended) ? current : recommended;
      const plan = normalizePreflightPlan(
        typeof planProfile === "function" ? planProfile(required) : null,
        { requestedProfile: required, configuredProfile: current, effectiveProfile: effective, preview: previewProfile(required) }
      );
      const targetConflicts = plan.changes.filter((entry) => entry?.conflict);
      const blockedSettings = plan.blockedSettings;
      const configuredSufficient = profileLevel(current) >= profileLevel(recommended);
      const requirementsSatisfied = plan.requirementsSatisfied;
      const satisfied = configuredSufficient && requirementsSatisfied;
      const needsEscalation = !configuredSufficient;
      const repairable = !profile.overrideFailed && !requirementsSatisfied && plan.changes.some((entry) => !entry.conflict || entry.autoOverride);
      const blocked = blockedSettings.length > 0;
      const maximumAdvisory = recommendation.exceedsMaximum === true && current === "maximum" && !maximumWarningsAcknowledged.has(sceneId);
      last = freezeLast({ scene, source, risk, recommendation, current, effective, blocked, satisfied, plan });

      if (satisfied && !maximumAdvisory) {
        await clearSatisfiedPending(sceneId, current);
        return approve(sceneId, "proceed", source);
      }

      const behavior = normalizeBehavior(readBehavior());
      if (behavior === "automatic" && (needsEscalation || repairable) && recommended !== "normal") {
        return automaticallyEscalate(scene, recommendation, { source, current, effective, blocked, plan });
      }
      if (!readWarnings()) return approve(sceneId, "proceed", source);

      const choice = await showPrompt(scene, recommendation, {
        risk,
        current,
        effective,
        blocked,
        blockedSettings,
        targetConflicts,
        plan,
        satisfied,
        needsEscalation,
        repairable,
        overrideFailed: profile.overrideFailed === true,
        allowCancel,
        maximumAdvisory
      });
      if (!readActive()) return approve(sceneId, "proceed", source);
      // A physical Back dismissal is a cancellation even on automatic draw
      // prompts whose visible actions deliberately omit a Cancel button.
      if (choice === "cancel") return Object.freeze({ action: "cancel", sceneId, recommendation });
      if (choice === "no-canvas") return applyNoCanvas(scene, recommendation);
      if ((choice === "apply" && needsEscalation) || (choice === "repair" && repairable)) {
        return applyEscalation(scene, recommendation, { source, current, effective, blocked, plan });
      }
      if (maximumAdvisory) maximumWarningsAcknowledged.add(sceneId);
      return approve(sceneId, "proceed", source);
    },

    approveNextDraw(sceneId) {
      approved.set(String(sceneId), Number(now()) + 5000);
    },

    async resumePendingUserScene(viewScene) {
      if (resumingPending) return Object.freeze({ action: "waiting" });
      const pending = readPending();
      if (pending.source !== "user" || !pending.sceneId || typeof viewScene !== "function") return Object.freeze({ action: "none" });
      const current = normalizeProfile(getProfileSnapshot()?.profile);
      const plan = normalizePreflightPlan(
        typeof planProfile === "function" ? planProfile(pending.profile) : null,
        { requestedProfile: pending.profile, configuredProfile: current, effectiveProfile: getProfileSnapshot()?.effectiveProfile ?? current, preview: previewProfile(pending.profile) }
      );
      if (!plan.satisfied) return Object.freeze({ action: "waiting", sceneId: pending.sceneId });
      resumingPending = true;
      try {
        const result = await viewScene(pending.sceneId);
        await writePending({});
        return Object.freeze({ action: "resumed", sceneId: pending.sceneId, result });
      } catch (error) {
        await writePending({});
        throw error;
      } finally { resumingPending = false; }
    },

    snapshot() {
      return Object.freeze({
        behavior: normalizeBehavior(readBehavior()),
        pending: readPending(),
        activePrompt: activePrompt ? Object.freeze({ sceneId: activePrompt.sceneId }) : null,
        last
      });
    }
  };

  async function drawWithInterruptionMarker(receiver, scene, args) {
    try { onDrawStart(scene); }
    catch (error) { diagnostics?.record?.("warn", "Unable to mark the mobile Scene draw as in progress", error); }
    try {
      return await originalDraw.call(receiver, scene, ...args);
    } finally {
      try { onDrawComplete(scene); }
      catch (error) { diagnostics?.record?.("warn", "Unable to clear the completed mobile Scene draw marker", error); }
    }
  }

  async function automaticallyEscalate(scene, recommendation, context) {
    const sceneId = String(scene.id);
    const target = normalizeProfile(context.plan?.requestedProfile ?? recommendation.recommendedMinimumProfile);
    const pending = readPending();
    if (isRepeatReload(pending, sceneId, target)) {
      diagnostics?.record?.("warn", `Scene Preflight prevented a repeated ${target} reload for ${sceneId}.`);
      return approve(sceneId, "proceed", "automatic-loop-guard");
    }
    return applyEscalation(scene, recommendation, { ...context, automatic: true });
  }

  async function applyEscalation(scene, recommendation, context) {
    if (!readActive()) return approve(String(scene?.id ?? ""), "proceed", context.source);
    const sceneId = String(scene.id);
    const target = normalizeProfile(context.plan?.requestedProfile ?? recommendation.recommendedMinimumProfile);
    const pending = readPending();
    if (context.plan?.reloadRequired && isRepeatReload(pending, sceneId, target)) {
      throw Object.assign(new Error(localizeFoundry("VEMOBILE.Graphics.Preflight.PreviousReloadNotSatisfied", "The previous graphics reload did not satisfy this profile. Inspect the unmet settings before retrying.")), { profileApplicationFailed: true });
    }
    const attempt = pending.sceneId === sceneId && pending.profile === target ? pending.attempt + 1 : 1;
    const state = Object.freeze({
      version: PREFLIGHT_STATE_VERSION,
      sceneId,
      sceneName: String(scene.name ?? "Unnamed Scene").slice(0, 160),
      profile: target,
      reason: String(recommendation.reasons?.[0] ?? "Scene recommendation").slice(0, 240),
      generation: String(createToken()).slice(0, 120),
      attempt,
      requestedAt: Number(now()),
      source: String(context.source ?? "unknown").slice(0, 40)
    });
    await writePending(state);
    let result;
    try { result = await applyProfile(target, { source: `scene-preflight:${context.source ?? "unknown"}` }); }
    catch (error) {
      await writePending({});
      error.profileApplicationFailed = true;
      throw error;
    }
    // A scheduled real reload must hold the Scene even while construction-bound
    // renderer values still report incomplete. Do not decode before navigation.
    if (result.requiresReload) {
      if (!result.reloadTriggered) throw Object.assign(new Error(localizeFoundry("VEMOBILE.Graphics.Preflight.RequiredDocumentReloadNotStarted", "The required document reload did not start.")), { profileApplicationFailed: true });
      return Object.freeze({ action: "reload", sceneId, profile: target, result });
    }
    const after = getProfileSnapshot() ?? {};
    const afterPlan = normalizePreflightPlan(
      typeof planProfile === "function" ? planProfile(target) : null,
      { requestedProfile: target, configuredProfile: after.profile, effectiveProfile: after.effectiveProfile ?? after.profile, preview: previewProfile(target) }
    );
    await writePending({});
    if (!afterPlan.satisfied) {
      const settings = afterPlan.changes.map(entry => localizeFoundry("VEMOBILE.Graphics.Preflight.OverrideSetting", "{setting}: {current} → {target}", {
        setting: graphicsSettingLabel(entry.key),
        current: graphicsSettingValue(entry.current, entry.key),
        target: graphicsSettingValue(entry.next, entry.key)
      })).join("; ");
      throw Object.assign(new Error(localizeFoundry("VEMOBILE.Graphics.Preflight.OverrideFailed", "VE graphics override failed: {settings}", { settings })), { profileApplicationFailed: true });
    }
    return approve(sceneId, "proceed", context.source);
  }

  async function applyNoCanvas(scene, recommendation) {
    if (!readActive()) return approve(String(scene?.id ?? ""), "proceed", "desktop-transition");
    await setNoCanvas(true);
    diagnostics?.record?.("warn", `The user explicitly chose Foundry without Canvas for Scene ${scene?.id ?? "unknown"}.`);
    reload();
    return Object.freeze({ action: "reload", sceneId: String(scene?.id ?? ""), profile: "no-canvas", recommendation });
  }

  async function clearSatisfiedPending(sceneId, profile) {
    const pending = readPending();
    if (pending.sceneId === sceneId && profileLevel(profile) >= profileLevel(pending.profile)) await writePending({});
  }

  function approve(sceneId, action, source) {
    if (source !== "canvas-draw") api.approveNextDraw(sceneId);
    return Object.freeze({ action, sceneId: String(sceneId), source });
  }

  function consumeApproval(sceneId) {
    const id = String(sceneId ?? "");
    const expires = approved.get(id);
    if (!expires) return false;
    approved.delete(id);
    return expires >= Number(now());
  }

  function showPrompt(scene, recommendation, options) {
    if (activePrompt?.sceneId === String(scene.id)) return activePrompt.promise;
    activePrompt?.dismiss?.("continue");
    const prompt = createPreflightPrompt({ document: getDocument(), scene, recommendation, theme: readTheme(), ...options });
    activePrompt = prompt;
    prompt.promise.finally(() => { if (activePrompt === prompt) activePrompt = null; });
    return prompt.promise;
  }

  function readPending() {
    return normalizePending(safeGet(getGame(), MODULE_ID, KEYS.MEMORY_PREFLIGHT_STATE));
  }
  async function writePending(value) {
    await getGame()?.settings?.set?.(MODULE_ID, KEYS.MEMORY_PREFLIGHT_STATE, value);
  }
  function isRepeatReload(pending, sceneId, profile) {
    return pending.sceneId === sceneId && pending.profile === profile && pending.attempt >= 1 && Number(now()) - pending.requestedAt < RELOAD_GUARD_WINDOW_MS;
  }

  return Object.freeze(api);
}

export function createPreflightPrompt({ document, scene, risk = null, recommendation, current, effective, blocked, blockedSettings = [], targetConflicts = [], plan = null, satisfied = false, needsEscalation = true, repairable = false, overrideFailed = false, allowCancel, maximumAdvisory, theme = "system" }) {
  if (!document?.createElement || !document?.body) return Object.freeze({ sceneId: String(scene?.id ?? ""), promise: Promise.resolve("continue"), dismiss() {} });
  const root = document.createElement("div");
  root.className = "ve-scene-preflight";
  root.dataset.veBackDismissable = "true";
  root.dataset.veBackKind = "scene-warning";
  root.dataset.theme = ["light", "dark"].includes(theme) ? theme : "system";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-labelledby", "ve-scene-preflight-title");
  const card = document.createElement("section");
  card.className = "ve-scene-preflight-card";
  const title = document.createElement("h2");
  title.id = "ve-scene-preflight-title";
  title.textContent = overrideFailed ? localizeFoundry("VEMOBILE.Graphics.Preflight.GraphicsChangeFailedTitle", "Graphics settings could not be changed") : maximumAdvisory
    ? localizeFoundry("VEMOBILE.Graphics.Preflight.SceneMayBeDifficultTitle", "{scene} may still be difficult to load", { scene: scene?.name ?? localizeFoundry("VEMOBILE.Graphics.Preflight.ThisScene", "This scene") })
    : !needsEscalation && blocked
      ? localizeFoundry("VEMOBILE.Graphics.Preflight.LockedTitle", "A graphics setting is locked")
      : !needsEscalation && repairable
        ? localizeFoundry("VEMOBILE.Graphics.Preflight.UpdateNeededTitle", "A graphics setting needs updating")
        : localizeFoundry("VEMOBILE.Graphics.Preflight.SuggestedTitle", "Suggested graphics settings for {scene}", { scene: scene?.name ?? localizeFoundry("VEMOBILE.Graphics.Preflight.thisScene", "this scene") });
  const summary = document.createElement("p");
  summary.textContent = overrideFailed
    ? localizeFoundry("VEMOBILE.Graphics.Preflight.GraphicsChangeFailed", "VE Mobile could not apply the suggested graphics settings. You can keep the current settings or review any locked setting below.")
    : maximumAdvisory
    ? localizeFoundry("VEMOBILE.Graphics.Preflight.MaximumAdvisory", "This scene has a lot of image content. Even the strongest VE Mobile graphics setting may not prevent loading problems.")
    : risk?.priorGraphicsLoss
    ? localizeFoundry("VEMOBILE.Graphics.Preflight.PriorFailure", "A recent graphics problem was recorded. VE Mobile suggests {recommended} graphics; you are using {current}.", { recommended: profileLabel(recommendation.recommendedMinimumProfile), current: profileLabel(current) })
    : localizeFoundry("VEMOBILE.Graphics.Preflight.SceneSuggestion", "Based on this scene's images and effects, VE Mobile suggests {recommended} graphics. You are using {current}.", { recommended: profileLabel(recommendation.recommendedMinimumProfile), current: profileLabel(current) });
  const maximumNote = maximumAdvisory ? document.createElement("p") : null;
  if (maximumNote) maximumNote.textContent = localizeFoundry("VEMOBILE.Graphics.Preflight.NoCanvasReload", "Opening without the live map will reload Foundry.");
  const effectiveNote = blocked ? document.createElement("p") : null;
  if (effectiveNote) {
    effectiveNote.className = "ve-scene-preflight-conflict";
    effectiveNote.textContent = localizeFoundry(blockedSettings.length === 1 ? "VEMOBILE.Graphics.Preflight.LockedSetting" : "VEMOBILE.Graphics.Preflight.LockedSettings", blockedSettings.length === 1 ? "{count} graphics setting is locked by another rule. VE Mobile cannot change it here." : "{count} graphics settings are locked by another rule. VE Mobile cannot change them here.", { count: blockedSettings.length });
  }
  const unmet = plan?.changes ?? blockedSettings;
  const blockedList = unmet.length ? document.createElement("ul") : null;
  if (blockedList) {
    blockedList.className = "ve-scene-preflight-blocked-settings";
    for (const entry of unmet) {
      const item = document.createElement("li");
      item.textContent = `${graphicsSettingLabel(entry.key)}: ${graphicsSettingValue(entry.current, entry.key)} → ${graphicsSettingValue(entry.next, entry.key)}${entry.conflict ? ` ${localizeFoundry("VEMOBILE.Graphics.Preflight.LockedByRule", "(locked by another rule)")}` : ""}`;
      blockedList.append(item);
    }
  }
  const repairNote = !blocked && !needsEscalation && repairable ? document.createElement("p") : null;
  if (repairNote) repairNote.textContent = localizeFoundry((plan?.changes?.length ?? 0) === 1 ? "VEMOBILE.Graphics.Preflight.RepairNeededOne" : "VEMOBILE.Graphics.Preflight.RepairNeeded", (plan?.changes?.length ?? 0) === 1 ? "{profile} is already selected, but one setting still needs updating." : "{profile} is already selected, but {count} settings still need updating.", { profile: profileLabel(current), count: plan?.changes?.length ?? 0 });
  const reason = document.createElement("p");
  const imageCount = Number(recommendation.inputs?.visibleRasterCount);
  const videoCount = Number(recommendation.inputs?.videoCount);
  reason.textContent = risk?.priorGraphicsLoss
    ? localizeFoundry("VEMOBILE.Graphics.Preflight.FailureAdvice", "This suggestion follows a recorded graphics problem. It does not mean VE Mobile measured a lack of hardware memory.")
    : Number.isFinite(imageCount) && imageCount >= 3
    ? localizeFoundry("VEMOBILE.Graphics.Preflight.ImageAdvice", "This scene has {images} visible image layers{videoSuffix}. This is a precaution based on scene content, not a measurement of available hardware memory.", { images: imageCount, videoSuffix: videoCount > 0 ? ` ${localizeFoundry(videoCount === 1 ? "VEMOBILE.Graphics.Preflight.VideoSuffixOne" : "VEMOBILE.Graphics.Preflight.VideoSuffixMany", videoCount === 1 ? "and {count} video tile" : "and {count} video tiles", { count: videoCount })}` : "" })
    : localizeFoundry("VEMOBILE.Graphics.Preflight.ContentAdvice", "This is a precaution based on scene content, not a measurement of available hardware memory.");
  const actions = document.createElement("div");
  actions.className = "ve-scene-preflight-actions";
  const button = (label, value, primary = false) => {
    const control = document.createElement("button");
    control.type = "button";
    control.textContent = label;
    control.dataset.choice = value;
    if (primary) control.className = "is-primary";
    actions.append(control);
    return control;
  };
  const reloadSuffix = plan?.reloadRequired ? ` ${localizeFoundry("VEMOBILE.Graphics.Preflight.ReloadSuffix", "and reload")}` : "";
  if (!overrideFailed && !maximumAdvisory && needsEscalation) button(localizeFoundry("VEMOBILE.Graphics.Preflight.UseProfile", "Use {profile} graphics{reloadSuffix}", { profile: profileLabel(recommendation.recommendedMinimumProfile), reloadSuffix }), "apply", true);
  else if (!overrideFailed && !maximumAdvisory && repairable) button(localizeFoundry("VEMOBILE.Graphics.Preflight.UpdateGraphics", "Update graphics settings{reloadSuffix}", { reloadSuffix }), "repair", true);
  button(localizeFoundry("VEMOBILE.Graphics.Preflight.KeepCurrent", "Keep current settings"), "continue");
  if (maximumAdvisory) button(localizeFoundry("VEMOBILE.Graphics.Preflight.OpenWithoutMap", "Open without the live map"), "no-canvas");
  if (allowCancel) button(localizeFoundry("VEMOBILE.Graphics.Preflight.Cancel", "Cancel"), "cancel");
  card.append(title, summary, ...(maximumNote ? [maximumNote] : []), ...(effectiveNote ? [effectiveNote] : []), ...(blockedList ? [blockedList] : []), ...(repairNote ? [repairNote] : []), reason, actions);
  root.append(card);
  document.body.append(root);
  let resolve;
  let settled = false;
  const promise = new Promise((done) => { resolve = done; });
  const dismiss = (choice) => {
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
  actions.querySelector?.(".is-primary, button")?.focus?.({ preventScroll: true });
  return Object.freeze({ sceneId: String(scene?.id ?? ""), element: root, promise, dismiss });
}

function freezeLast({ scene, source, risk, recommendation, current, effective, blocked, satisfied, plan }) {
  return Object.freeze({ sceneId: String(scene?.id ?? ""), sceneName: String(scene?.name ?? ""), source: String(source), requestedProfile: plan?.requestedProfile ?? recommendation.recommendedMinimumProfile, configuredProfile: current, currentProfile: current, recommendedProfile: recommendation.recommendedMinimumProfile, recommendedMinimumProfile: recommendation.recommendedMinimumProfile, effectiveProfile: effective, blocked: Boolean(blocked), blockedSettings: Object.freeze([...(plan?.blockedSettings ?? [])]), satisfied: Boolean(satisfied), transactionPlan: plan, risk: recommendation.risk, confidence: recommendation.confidence, reasons: Object.freeze([...(recommendation.reasons ?? [])]), effectiveDecodedBytes: risk?.effectiveDecodedBytes ?? null, originalDecodedBytes: risk?.originalDecodedBytes ?? null, visibleRasterCount: risk?.visibleRasterCount ?? 0, hiddenRasterCount: risk?.hiddenRasterCount ?? 0, videoCount: risk?.videoCount ?? 0 });
}
function normalizePreflightPlan(value, { requestedProfile, configuredProfile, effectiveProfile, preview = [] }) {
  const requested = normalizeProfile(value?.requestedProfile ?? requestedProfile);
  const configured = normalizeProfile(value?.configuredProfile ?? configuredProfile);
  const effective = normalizeProfile(value?.effectiveProfile ?? effectiveProfile ?? configured);
  const changes = Object.freeze([...(Array.isArray(value?.changes) ? value.changes : preview)].map((entry) => Object.freeze({ ...entry })));
  const blockedSettings = Object.freeze([...(Array.isArray(value?.blockedSettings)
    ? value.blockedSettings
    : changes.filter((entry) => entry?.conflict && !entry.autoOverride))].map((entry) => Object.freeze({ ...entry })));
  const configuredSufficient = profileLevel(configured) >= profileLevel(requested);
  const requirementsSatisfied = typeof value?.requirementsSatisfied === "boolean" ? value.requirementsSatisfied : changes.length === 0;
  return Object.freeze({
    requestedProfile: requested,
    configuredProfile: configured,
    effectiveProfile: effective,
    changes,
    blockedSettings,
    authorityAdjustments: Object.freeze([...(value?.authorityAdjustments ?? [])]),
    reloadRequired: Boolean(value?.reloadRequired ?? changes.some((entry) => entry.requiresReload && !blockedSettings.some((blocked) => blocked.key === entry.key))),
    configuredSufficient,
    requirementsSatisfied,
    satisfied: configuredSufficient && requirementsSatisfied
  });
}
function normalizePending(value) { if (!value || Number(value.version) !== PREFLIGHT_STATE_VERSION) return Object.freeze({ version: PREFLIGHT_STATE_VERSION, sceneId: "", profile: "normal", reason: "", generation: "", attempt: 0, requestedAt: 0, source: "" }); return Object.freeze({ version: PREFLIGHT_STATE_VERSION, sceneId: String(value.sceneId ?? ""), sceneName: String(value.sceneName ?? ""), profile: normalizeProfile(value.profile), reason: String(value.reason ?? ""), generation: String(value.generation ?? ""), attempt: Math.max(0, Math.floor(Number(value.attempt) || 0)), requestedAt: Math.max(0, Number(value.requestedAt) || 0), source: String(value.source ?? "") }); }
function normalizeProfileTransaction(value) { if (!value || Number(value.version) !== PROFILE_TRANSACTION_VERSION || !["applying", "reload-pending", "failed"].includes(value.phase)) return Object.freeze({ version: PROFILE_TRANSACTION_VERSION, generation: "", profile: "normal", requestedProfile: "normal", configuredProfile: "normal", source: "", requestedAt: 0, reloadRequired: false, phase: "none" }); const profile = normalizeProfile(value.profile); return Object.freeze({ version: PROFILE_TRANSACTION_VERSION, generation: String(value.generation ?? ""), profile, requestedProfile: normalizeProfile(value.requestedProfile ?? profile), configuredProfile: normalizeProfile(value.configuredProfile ?? profile), source: String(value.source ?? ""), requestedAt: Math.max(0, Number(value.requestedAt) || 0), reloadRequired: Boolean(value.reloadRequired), phase: value.phase, error: String(value.error ?? "") }); }
function normalizeBehavior(value) { return ["recommend", "automatic", "off"].includes(value) ? value : "recommend"; }
function normalizeProfile(value) { const profile = String(value ?? "normal").toLowerCase(); return Object.hasOwn(MEMORY_PROFILES, profile) ? profile : "normal"; }
function profileLabel(value) { const profile = normalizeProfile(value); return localizeFoundry(`VEMOBILE.Graphics.Profile.${profile}.Name`, MEMORY_PROFILES[profile].label); }
function graphicsSettingLabel(key) { const entries = { "core.performanceMode": ["FoundryPerformance", "Foundry performance"], "core.maxFPS": ["FrameRateLimit", "Frame rate limit"], "core.pixelRatioResolutionScaling": ["HighResolutionMap", "High-resolution map"], "core.mipmap": ["ImageSmoothing", "Image smoothing while zooming"], "core.lightAnimation": ["AnimatedLighting", "Animated lighting"] }; const entry = entries[key]; return entry ? localizeFoundry(`VEMOBILE.Graphics.Preflight.${entry[0]}`, entry[1]) : String(key); }
function graphicsSettingValue(value, key = "") {
  if (typeof value === "boolean") return localizeFoundry(value ? "VEMOBILE.Settings.UI.Graphics.On" : "VEMOBILE.Settings.UI.Graphics.Off", value ? "On" : "Off");
  if (key === "core.maxFPS" && Number.isFinite(Number(value))) return localizedNumber(Number(value), globalThis.game?.i18n?.lang ?? "en");
  const entries = {
    0: ["Low", "Low"], 1: ["Medium", "Medium"], 2: ["High", "High"], 3: ["Maximum", "Maximum"],
    off: ["Off", "Off"], balanced: ["Balanced", "Balanced"], strict: ["Minimum", "Minimum"], normal: ["Normal", "Normal"], reduced: ["Reduced", "Reduced"], static: ["Static", "Static"]
  };
  const entry = entries[value];
  return entry ? localizeFoundry(`VEMOBILE.Settings.UI.Graphics.${entry[0]}`, entry[1]) : String(value);
}
function safeGet(game, namespace, key) { try { return game?.settings?.get?.(namespace, key); } catch { return undefined; } }
