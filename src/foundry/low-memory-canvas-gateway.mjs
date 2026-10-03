import { localizeFoundry } from "./localization.mjs";
import { KEYS, MODULE_ID, normalizedMemoryProfile } from "./preferences.mjs";
import { createGraphicsAuthority, GRAPHICS_KEYS } from "./graphics-authority-gateway.mjs";
import { readLocalSetting, restoreLocalSetting } from "./client-setting-restoration.mjs";
import { MEMORY_PROFILE_ORDER, MEMORY_PROFILES, memoryProfilePolicy, profileLevel, resolvedProfileSettings, settingSatisfiesProfileRequirement } from "../kernel/memory-profile-model.mjs";

export const MEMORY_PROFILE_SNAPSHOT_VERSION = 4;
export { MEMORY_PROFILE_ORDER, MEMORY_PROFILES, memoryProfilePolicy, profileLevel, resolvedProfileSettings, settingSatisfiesProfileRequirement };

// Compatibility exports: the previous binary profile is now Balanced.
export const LOW_MEMORY_SNAPSHOT_VERSION = MEMORY_PROFILE_SNAPSHOT_VERSION;
export const LOW_MEMORY_PROFILE = MEMORY_PROFILES.balanced.settings;

const FCS_MODULE_ID = "force-client-settings";
const MANAGED_GRAPHICS_KEYS = GRAPHICS_KEYS;

export function createLowMemoryCanvasGateway({ getGame = () => globalThis.game, getCanvas = () => globalThis.canvas, getDevicePixelRatio = () => globalThis.devicePixelRatio ?? 1, getGraphicsPolicy = () => null, getForceClientSettingsRuntime = defaultForceClientSettingsRuntime, mobileAuthority = null, authority: suppliedAuthority = null, now = () => Date.now(), diagnostics = null } = {}) {
  let applying = false;
  let restoration = null;
  let idle = Promise.resolve();
  let releaseIdle = null;

  const mobileActive = () => mobileAuthority?.active?.() ?? true;
  const captureAuthority = () => mobileAuthority?.capture?.() ?? 0;
  const allowsAuthority = token => mobileAuthority?.allows?.(token) ?? true;
  const authority = suppliedAuthority ?? createGraphicsAuthority({ getGame, resolveTargets: resolvedProfileSettings, isMobileAuthorityActive: mobileActive });
  const underlying = () => Object.fromEntries(GRAPHICS_KEYS.map(key => [key, authority.readUnderlying(...splitSettingKey(key))]));
  const localBaseline = () => Object.fromEntries(GRAPHICS_KEYS.map(key => [key, readLocalSetting(getGame(), key)]));
  const saveLedger = async (value) => {
    await getGame().settings.set(MODULE_ID, KEYS.GRAPHICS_SETTINGS_SNAPSHOT, value);
    if (JSON.stringify(safeGet(getGame(), MODULE_ID, KEYS.GRAPHICS_SETTINGS_SNAPSHOT)) !== JSON.stringify(value)) throw new Error(localizeFoundry("VEMOBILE.Interface.LowMemoryCanvasGateway.GraphicsRestorationLedgerCouldNotBeVerified", "Graphics restoration ledger could not be verified."));
  };
  const runtimeSettings = () => {
    const canvas = getCanvas();
    if (!canvas?.initialized || !canvas.app?.renderer) return {};
    const performance = canvas.performance ?? {};
    return {
      "core.performanceMode": performance.mode,
      "core.maxFPS": performance.fps === 0 ? 60 : performance.fps,
      "core.mipmap": performance.mipmap === "ON",
      "core.pixelRatioResolutionScaling": canvas.app.renderer.resolution > 1
    };
  };
  const needsReload = key => settingRequiresReload(getGame(), key)
    || (key === "core.mipmap" && getCanvas()?.ready === true);
  // A 1x renderer cannot distinguish enabled from disabled scaling at DPR1.
  // This equivalence concerns runtime evidence only; the setting itself must
  // still satisfy the target. Share it between diagnostics and planning.
  const equivalentScalingRuntime = (key, target, runtime) => {
    const dpr = Number(getDevicePixelRatio());
    return key === "core.pixelRatioResolutionScaling" && target === true && runtime === false
      && Number.isFinite(dpr) && dpr > 0 && dpr <= 1;
  };
  const restoreDesktop = async ({ notify = true } = {}) => {
    await idle;
    const game = getGame();
    const saved = normalizeSnapshot(safeGet(game, MODULE_ID, KEYS.GRAPHICS_SETTINGS_SNAPSHOT), localBaseline());
    if (!saved) {
      const raw = safeGet(game, MODULE_ID, KEYS.GRAPHICS_SETTINGS_SNAPSHOT);
      if (raw && Object.keys(raw).length) throw new Error(localizeFoundry("VEMOBILE.Interface.LowMemoryCanvasGateway.TheSavedGraphicsBaselineIsInvalidItHasBeen", "The saved graphics baseline is invalid; it has been retained for recovery."));
      return Object.freeze({ restored: [], requiresReload: false });
    }
    applying = true;
    idle = new Promise(resolve => { releaseIdle = resolve; });
    try {
      const restored = [];
      let requiresReload = false;
      await saveLedger({ ...saved, phase: "restoring" });
      for (const key of [...Object.keys(saved.applied), ...(typeof saved.noCanvasOriginal === "boolean" ? ["core.noCanvas"] : [])]) {
        const original = key === "core.noCanvas" ? saved.noCanvasOriginal : saved.original[key];
        if (sameSettingValue(readLocalSetting(game, key), original)) continue;
        requiresReload ||= key === "core.noCanvas" || needsReload(key);
        await restoreLocalSetting(game, key, original, { notify });
        restored.push(key);
      }
      if (api.pendingRestoration().length) throw new Error(localizeFoundry("VEMOBILE.Interface.LowMemoryCanvasGateway.DesktopRestorationStillHasPendingSettings", "Desktop restoration still has pending settings."));
      await saveLedger({});
      syncPresentationClasses(globalThis.document, "normal");
      if (notify && restored.length && getCanvas()?.initialized && getCanvas()?.app?.renderer) getCanvas()._configurePerformanceMode();
      return Object.freeze({ restored: Object.freeze(restored), requiresReload });
    } finally { applying = false; releaseIdle?.(); releaseIdle = null; }
  };
  const api = {
    get changing() { return applying || Boolean(restoration); },
    whenIdle() { return restoration ?? idle; },
    async beginMobileSession({ entryToken = "" } = {}) {
      // Capturing is safe before mutation authority opens. A surviving ledger
      // always wins over a new entry token: only verified restoration retires it.
      const game = getGame();
      const stored = normalizeSnapshot(safeGet(game, MODULE_ID, KEYS.GRAPHICS_SETTINGS_SNAPSHOT), localBaseline());
      if (stored) return Object.freeze({ active: true, previous: stored, reused: true });
      if (Object.keys(safeGet(game, MODULE_ID, KEYS.GRAPHICS_SETTINGS_SNAPSHOT) ?? {}).length) throw new Error(localizeFoundry("VEMOBILE.Interface.LowMemoryCanvasGateway.TheSavedGraphicsBaselineIsInvalidRefusingToReplace", "The saved graphics baseline is invalid; refusing to replace it."));
      const saved = { schemaVersion: MEMORY_PROFILE_SNAPSHOT_VERSION, capturedAt: Number(now()), original: localBaseline(),
        applied: {}, pending: [], phase: "captured", profile: configuredProfile(game), conflicts: [],
        noCanvasOriginal: readLocalSetting(game, "core.noCanvas") === true, entryToken: String(entryToken).slice(0, 120) };
      await saveLedger(saved);
      return Object.freeze({ active: true, previous: normalizeSnapshot(saved), reused: false });
    },
    pendingRestoration() {
      const saved = normalizeSnapshot(safeGet(getGame(), MODULE_ID, KEYS.GRAPHICS_SETTINGS_SNAPSHOT), localBaseline());
      if (!saved) return [];
      return [...Object.keys(saved.applied), ...(typeof saved.noCanvasOriginal === "boolean" ? ["core.noCanvas"] : [])]
        .filter(key => !sameSettingValue(readLocalSetting(getGame(), key), key === "core.noCanvas" ? saved.noCanvasOriginal : saved.original[key]));
    },
    async setNoCanvas(value) {
      const token = captureAuthority();
      if (!allowsAuthority(token)) throw new Error(localizeFoundry("VEMOBILE.Interface.LowMemoryCanvasGateway.MobilePerformanceAuthorityIsUnavailable", "Mobile performance authority is unavailable."));
      if (applying || restoration) throw new Error(localizeFoundry("VEMOBILE.Interface.LowMemoryCanvasGateway.GraphicsSettingsAreAlreadyChanging", "Graphics settings are already changing."));
      applying = true;
      idle = new Promise(resolve => { releaseIdle = resolve; });
      try {
        await api.beginMobileSession();
        const saved = normalizeSnapshot(safeGet(getGame(), MODULE_ID, KEYS.GRAPHICS_SETTINGS_SNAPSHOT), localBaseline());
        await saveLedger({ ...saved, noCanvasOwned: true, phase: "applying", pending: [...saved.pending, "core.noCanvas"] });
        if (!allowsAuthority(token)) throw new Error(localizeFoundry("VEMOBILE.Interface.LowMemoryCanvasGateway.MobilePerformanceAuthorityEndedBeforeTheCanvasWrite", "Mobile performance authority ended before the Canvas write."));
        await restoreLocalSetting(getGame(), "core.noCanvas", value === true);
        await saveLedger({ ...saved, noCanvasOwned: true, phase: "applied", pending: saved.pending });
      } finally { applying = false; releaseIdle?.(); releaseIdle = null; }
    },
    restoreForDesktop(options) {
      if (!restoration) restoration = restoreDesktop(options).finally(() => { restoration = null; });
      return restoration;
    },
    installAuthority(scope) { return authority.install(scope); },
    // One-time retirement of the previous strategy, scoped to explicitly owned
    // graphics entries. Existing user unlocks and all world policy are retained.
    async retireLegacyUnlocks() {
      if (!mobileActive()) return;
      const game = getGame();
      const owned = normalizeManagedKeys(safeGet(game, MODULE_ID, KEYS.FCS_MANAGED_UNLOCK_KEYS));
      if (!owned.length || !game?.modules?.get?.(FCS_MODULE_ID)?.active) return;
      const runtime = getForceClientSettingsRuntime?.();
      if (!(runtime?.unlocked instanceof Map)) throw new Error(localizeFoundry("VEMOBILE.Interface.LowMemoryCanvasGateway.CannotRetireThePreviousVEGraphicsUnlocksFCSRuntime", "Cannot retire the previous VE graphics unlocks: FCS runtime unavailable."));
      const unlocked = { ...normalizeObject(safeGet(game, FCS_MODULE_ID, "unlocked")) };
      for (const key of owned) { delete unlocked[key]; runtime.unlocked.delete(key); }
      await game.settings.set(FCS_MODULE_ID, "unlocked", unlocked);
      await game.settings.set(MODULE_ID, KEYS.FCS_MANAGED_UNLOCK_KEYS, []);
    },
    snapshot() {
      const game = getGame();
      const saved = normalizeSnapshot(safeGet(game, MODULE_ID, KEYS.GRAPHICS_SETTINGS_SNAPSHOT), underlying());
      const profile = configuredProfile(game);
      const current = readNativeGraphicsSettings(game);
      const mobile = mobileActive();
      const intended = mobile ? resolvedProfileSettings(profile, saved?.original ?? underlying()) : {};
      const runtime = runtimeSettings();
      const fcs = readForceClientSettingsState(game, intended);
      const conflicts = detectForceClientSettingsConflicts(game, intended);
      const unmetSettings = Object.entries(intended).flatMap(([key, target]) => {
        const runtimeMismatch = Object.hasOwn(runtime, key) && !equivalentScalingRuntime(key, target, runtime[key])
          && !settingSatisfiesProfileRequirement(key, runtime[key], target);
        if (settingSatisfiesProfileRequirement(key, current[key], target) && !runtimeMismatch) return [];
        return [Object.freeze({ key, current: current[key], target, runtime: runtime[key], runtimeMismatch, requiresReload: needsReload(key) })];
      });
      const overrideFailed = mobile && profile !== "normal" && authority.enabled() && unmetSettings.some(entry =>
        !settingSatisfiesProfileRequirement(entry.key, entry.current, entry.target));
      const effective = mobile && unmetSettings.length === 0;
      return Object.freeze({
        profile, configuredProfile: profile, profileLabel: localizeFoundry(MEMORY_PROFILES[profile].labelKey, MEMORY_PROFILES[profile].label),
        active: mobile && profile !== "normal", mobileAuthorityActive: mobile, effective, profileSatisfied: mobile ? effective : null,
        // Compatibility diagnostic only; user-facing status is per setting.
        effectiveProfile: effective ? profile : "normal",
        status: !mobile ? localizeFoundry("VEMOBILE.Interface.LowMemoryCanvasGateway.InactiveInDesktopMode", "Inactive in Desktop mode") : overrideFailed ? localizeFoundry("VEMOBILE.Interface.LowMemoryCanvasGateway.VEGraphicsOverrideFailed", "VE graphics override failed") : effective ? localizeFoundry("VEMOBILE.Interface.LowMemoryCanvasGateway.Satisfied", "Satisfied") : localizeFoundry("VEMOBILE.MemoryProfile.Incomplete", "Incomplete — settings needing correction: {count}", { count: unmetSettings.length }),
        overrideFailed, unmetSettings: Object.freeze(unmetSettings),
        ineffectiveKeys: Object.freeze(unmetSettings.map(entry => entry.key)),
        profileVersion: MEMORY_PROFILE_SNAPSHOT_VERSION, intended, requiredSettings: intended,
        current, actualEffectiveSettings: current, runtime: Object.freeze(runtime),
        previous: saved, restoreAvailable: Boolean(saved), changing: applying,
        forceClientSettings: Object.freeze({ ...fcs, authorityInstalled: authority.installed, conflicts })
      });
    },
    plan(profile) {
      const requestedProfile = normalizeProfile(profile);
      const snapshot = api.snapshot();
      const game = getGame();
      const base = underlying();
      const saved = snapshot.previous;
      const intended = requestedProfile === "normal" ? { ...(saved?.original ?? {}) }
        : { ...resolvedProfileSettings(requestedProfile, saved?.original ?? base) };
      const forced = normalizeObject(safeGet(game, FCS_MODULE_ID, "forced"));
      const fcsPresent = Boolean(game?.modules?.get?.(FCS_MODULE_ID)?.active);
      if (requestedProfile === "normal") for (const key of GRAPHICS_KEYS) {
        if (fcsPresent && forced[key]) intended[key] = base[key];
        else if (saved && !sameSettingValue(base[key], saved.applied[key])) intended[key] = base[key];
      }
      const conflicts = detectForceClientSettingsConflicts(game, intended);
      const runtime = runtimeSettings();
      const changes = Object.entries(intended).flatMap(([key, next]) => {
        const satisfies = value => requestedProfile === "normal" ? sameSettingValue(value, next) : settingSatisfiesProfileRequirement(key, value, next);
        // At DPR1 a 1x renderer satisfies enabled scaling as well as disabled
        // scaling. It is not evidence that an enabled native setting failed.
        const equivalentDprOne = equivalentScalingRuntime(key, next, runtime[key]);
        const runtimeMismatch = Object.hasOwn(runtime, key) && !equivalentDprOne && !satisfies(runtime[key]);
        if (satisfies(snapshot.current[key]) && !runtimeMismatch) return [];
        const conflict = conflicts.find(entry => entry.key === key) ?? null;
        return [Object.freeze({ key, current: snapshot.current[key], next, runtime: runtime[key], runtimeMismatch, conflict,
          autoOverride: requestedProfile !== "normal" && authority.enabled() && authority.installed,
          requiresReload: needsReload(key) })];
      });
      const blockedSettings = changes.filter(entry => entry.conflict && !entry.autoOverride && requestedProfile !== "normal");
      const requirementsSatisfied = changes.length === 0;
      const configuredSufficient = profileLevel(snapshot.profile) >= profileLevel(requestedProfile);
      const strongerConfiguredProfileSatisfied = profileLevel(snapshot.profile) > profileLevel(requestedProfile) && snapshot.effective;
      return Object.freeze({ requestedProfile, configuredProfile: snapshot.profile, effectiveProfile: snapshot.effectiveProfile,
        intended: Object.freeze(intended), current: snapshot.current, changes: Object.freeze(changes),
        authorityAdjustments: Object.freeze(changes.filter(entry => entry.autoOverride && entry.conflict).map(entry => entry.key)),
        blockedSettings: Object.freeze(blockedSettings),
        reloadRequired: changes.some(entry => entry.requiresReload && !blockedSettings.includes(entry)),
        requirementsSatisfied, configuredSufficient, satisfied: configuredSufficient && (requestedProfile === "normal" || requirementsSatisfied || strongerConfiguredProfileSatisfied) });
    },
    preview(profile) {
      const target = normalizeProfile(profile);
      const current = memoryProfilePolicy(api.snapshot().profile, getGraphicsPolicy?.() ?? {});
      const next = memoryProfilePolicy(target, getGraphicsPolicy?.() ?? {});
      const extras = [["ve.effects", current.effects, next.effects], ["ve.dice", current.dice, next.dice]]
        .filter(([, before, after]) => before !== after).map(([key, before, after]) => Object.freeze({key, current: before, next: after, requiresReload: false, conflict: null}));
      return Object.freeze([...api.plan(target).changes, ...extras]);
    },
    previewEnable() { return api.preview("balanced"); },
    async apply(profile) {
      if (applying || restoration) throw new Error(localizeFoundry("VEMOBILE.Interface.LowMemoryCanvasGateway.MemoryProtectionSettingsAreAlreadyBeingApplied", "Memory Protection settings are already being applied."));
      const authorityToken = captureAuthority();
      const assertMobile = () => {
        if (!allowsAuthority(authorityToken)) throw new Error(localizeFoundry("VEMOBILE.Interface.LowMemoryCanvasGateway.MobilePerformanceAuthorityEndedBeforeTheGraphicsWrite", "Mobile performance authority ended before the graphics write."));
      };
      assertMobile();
      const target = normalizeProfile(profile);
      const game = getGame();
      assertSettings(game);
      const plan = api.plan(target);
      const previous = normalizeSnapshot(safeGet(game, MODULE_ID, KEYS.GRAPHICS_SETTINGS_SNAPSHOT), underlying());
      const original = previous?.original ?? localBaseline();
      let ledger = previous ?? { schemaVersion: MEMORY_PROFILE_SNAPSHOT_VERSION, capturedAt: Number(now()), original,
        applied: {}, pending: [], profile: target, conflicts: [], noCanvasOriginal: readLocalSetting(game, "core.noCanvas") === true, entryToken: "" };
      applying = true;
      idle = new Promise(resolve => { releaseIdle = resolve; });
      const changed = [];
      try {
        assertMobile();
        ledger = { ...ledger, profile: target, phase: "applying" };
        await saveLedger(ledger);
        assertMobile();
        await game.settings.set(MODULE_ID, KEYS.MEMORY_PROTECTION_PROFILE, target);
        assertMobile();
        if (safeGet(game, MODULE_ID, KEYS.MEMORY_PROTECTION_PROFILE) !== target) throw new Error(localizeFoundry("VEMOBILE.Interface.LowMemoryCanvasGateway.CouldNotPersistAsTheConfiguredProfile", "Could not persist {target} as the configured profile.", { target: (target) }));
        assertMobile();
        await game.settings.set(MODULE_ID, KEYS.LOW_MEMORY_CANVAS, target !== "normal");
        const forced = normalizeObject(safeGet(game, FCS_MODULE_ID, "forced"));
        const present = Boolean(game?.modules?.get?.(FCS_MODULE_ID)?.active);
        for (const [key, value] of Object.entries(plan.intended)) {
          // Never send these writes through FCS: a GM write edits WORLD policy.
          // The read authority provides the local result for both lock modes.
          if (present && forced[key]) continue;
          const [namespace, setting] = splitSettingKey(key);
          if (sameSettingValue(authority.readUnderlying(namespace, setting), value)) continue;
          assertMobile();
          // Durable ownership precedes EVERY native write. Even a page dying
          // inside the setter leaves enough information for a new runtime.
          ledger = { ...ledger, applied: { ...ledger.applied, [key]: value }, pending: [...new Set([...ledger.pending, key])] };
          await saveLedger(ledger);
          assertMobile();
          await restoreLocalSetting(game, key, value);
          changed.push(key);
          ledger = { ...ledger, pending: ledger.pending.filter(entry => entry !== key) };
          await saveLedger(ledger);
        }
        // Native maxFPS/mipmap callbacks are not a reliable transaction boundary.
        // Refresh the existing live-safe performance state once, without draw.
        const canvas = getCanvas();
        assertMobile();
        if (canvas?.initialized && canvas.app?.renderer) canvas._configurePerformanceMode();
        const saved = { ...ledger, phase: "applied", conflicts: detectForceClientSettingsConflicts(game, plan.intended) };
        assertMobile();
        await saveLedger(saved);
        syncPresentationClasses(globalThis.document, target);
        const state = api.snapshot();
        return Object.freeze({ ok: true, profile: target, configuredProfile: target, effective: state.effective,
          requiresReload: plan.reloadRequired, changed: Object.freeze(changed), plan, snapshot: normalizeSnapshot(saved), conflicts: state.forceClientSettings.conflicts });
      } catch (error) {
        // The write-ahead ledger already owns pending and completed writes;
        // error handling must never overwrite it with stale in-memory state.
        diagnostics?.record?.("error", `Graphics application failed for configured ${target}`, error);
        throw error;
      } finally {
        applying = false;
        releaseIdle?.();
        releaseIdle = null;
      }
    },
    enable() { return api.apply("balanced"); },
    disable() { return api.apply("normal"); },
    restorePrevious() { return api.apply("normal"); },
    applyPresentationClass(scope, getDocument = () => globalThis.document) {
      const body = getDocument()?.body;
      if (!body) return false;
      syncPresentationClasses(getDocument(), api.snapshot().profile);
      scope?.own?.(() => {
        if (body.dataset) delete body.dataset.veMemoryProfile;
        body.classList.remove("ve-mobile-low-memory");
        body.classList.remove("ve-mobile-memory-maximum");
      });
      return true;
    }
  };
  return Object.freeze(api);
}

export function nextMemoryProfile(profile) { return MEMORY_PROFILE_ORDER[Math.min(MEMORY_PROFILE_ORDER.length - 1, profileLevel(profile) + 1)]; }

export function readNativeGraphicsSettings(game = globalThis.game) {
  return Object.freeze(Object.fromEntries(MANAGED_GRAPHICS_KEYS.map((compoundKey) => {
    const [namespace, key] = splitSettingKey(compoundKey);
    return [compoundKey, serializableSettingValue(safeGet(game, namespace, key))];
  })));
}

export function detectForceClientSettingsConflicts(game = globalThis.game, intended = LOW_MEMORY_PROFILE) {
  if (!game?.modules?.get?.(FCS_MODULE_ID)?.active) return Object.freeze([]);
  const forced = normalizeObject(safeGet(game, FCS_MODULE_ID, "forced"));
  const unlocked = normalizeObject(safeGet(game, FCS_MODULE_ID, "unlocked"));
  return Object.freeze(Object.entries(intended).flatMap(([key, target]) => {
    if (!GRAPHICS_KEYS.includes(key) || !forced[key]) return [];
    const value = safeGet(game, FCS_MODULE_ID, `_${key}`);
    if (settingSatisfiesProfileRequirement(key, value, target)) return [];
    const escaped = Boolean(unlocked[key] && (forced[key].mode === "soft" || game?.user?.isGM));
    return escaped ? [] : [Object.freeze({ key, mode: forced[key].mode === "soft" ? "soft" : "hard", forcedValue: value, intendedValue: target,
      reason: localizeFoundry("VEMOBILE.Interface.LowMemoryCanvasGateway.ForceClientSettingsSpecifiesADifferentGraphicsValue", "Force Client Settings specifies a different graphics value.") })];
  }));
}

export function readForceClientSettingsState(game = globalThis.game, intended = LOW_MEMORY_PROFILE) {
  const module = game?.modules?.get?.(FCS_MODULE_ID);
  const present = Boolean(module?.active);
  const forced = present ? normalizeObject(safeGet(game, FCS_MODULE_ID, "forced")) : {};
  return Object.freeze({ present, version: present ? String(module.version ?? "") : "",
    precedenceEnabled: safeGet(game, MODULE_ID, KEYS.FCS_AUTO_SOFT_OVERRIDE) !== false,
    softKeys: Object.freeze(GRAPHICS_KEYS.filter(key => forced[key]?.mode === "soft")),
    hardKeys: Object.freeze(GRAPHICS_KEYS.filter(key => forced[key] && forced[key].mode !== "soft")),
    managedUnlockKeys: Object.freeze(normalizeManagedKeys(safeGet(game, MODULE_ID, KEYS.FCS_MANAGED_UNLOCK_KEYS))) });
}

function defaultForceClientSettingsRuntime() {
  try { if (typeof ForceClientSettings !== "undefined") return ForceClientSettings; } catch {}
  return globalThis.ForceClientSettings ?? null;
}

export function normalizeSnapshot(value, migrationBaseline = {}) {
  const sourceSchema = Number(value?.schemaVersion);
  if (!value || ![1, 2, 3, MEMORY_PROFILE_SNAPSHOT_VERSION].includes(sourceSchema)) return null;
  const legacy = sourceSchema < MEMORY_PROFILE_SNAPSHOT_VERSION;
  const legacyKeys = MANAGED_GRAPHICS_KEYS.filter((key) => key !== "core.lightAnimation");
  const original = normalizeSettingsRecord(value.original, { requireAll: true, keys: legacy ? legacyKeys : MANAGED_GRAPHICS_KEYS });
  const applied = normalizeSettingsRecord(value.applied, { requireAll: false, keys: legacy ? legacyKeys : MANAGED_GRAPHICS_KEYS });
  if (!original || !applied) return null;
  if (legacy) original["core.lightAnimation"] = serializableSettingValue(migrationBaseline["core.lightAnimation"]);
  if (typeof original["core.lightAnimation"] !== "boolean") return null;
  const profile = sourceSchema === 1 ? "balanced" : normalizeProfile(value.profile);
  return Object.freeze({ schemaVersion: MEMORY_PROFILE_SNAPSHOT_VERSION, migratedFromSchema: sourceSchema < MEMORY_PROFILE_SNAPSHOT_VERSION ? sourceSchema : null, capturedAt: Number(value.capturedAt) || 0, profile, original: Object.freeze(original), applied: Object.freeze(applied), phase: String(value.phase ?? "applied"), pending: Object.freeze(Array.isArray(value.pending) ? value.pending.filter(key => [...MANAGED_GRAPHICS_KEYS, "core.noCanvas"].includes(key)) : []), noCanvasOwned: value.noCanvasOwned === true, noCanvasOriginal: typeof value.noCanvasOriginal === "boolean" ? value.noCanvasOriginal : null, entryToken: String(value.entryToken ?? "").slice(0, 120), conflicts: Object.freeze(Array.isArray(value.conflicts) ? value.conflicts.map((entry) => Object.freeze({ key: String(entry?.key ?? ""), mode: String(entry?.mode ?? "unknown"), forcedValue: serializableSettingValue(entry?.forcedValue), intendedValue: serializableSettingValue(entry?.intendedValue), reason: String(entry?.reason ?? "") })).filter((entry) => MANAGED_GRAPHICS_KEYS.includes(entry.key)) : []) });
}

function configuredProfile(game) { return normalizedMemoryProfile(safeGet(game, MODULE_ID, KEYS.MEMORY_PROTECTION_PROFILE), safeGet(game, MODULE_ID, KEYS.LOW_MEMORY_CANVAS)); }
function normalizeProfile(value) { const profile = String(value ?? "").toLowerCase(); if (!MEMORY_PROFILE_ORDER.includes(profile)) throw new Error(localizeFoundry("VEMOBILE.Interface.LowMemoryCanvasGateway.ThatMemoryProtectionProfileIsNotSupported", "That Memory Protection profile is not supported.")); return profile; }
function normalizeSettingsRecord(value, { requireAll, keys = MANAGED_GRAPHICS_KEYS }) { if (!value || typeof value !== "object" || Array.isArray(value)) return requireAll ? null : {}; const result = {}; for (const key of keys) { if (!Object.hasOwn(value, key)) { if (requireAll) return null; continue; } const candidate = value[key]; if (!["boolean", "number"].includes(typeof candidate) && candidate !== null) return null; result[key] = candidate; } return result; }
function normalizeManagedKeys(value) { return Array.isArray(value) ? [...new Set(value.map((key) => String(key)).filter((key) => MANAGED_GRAPHICS_KEYS.includes(key)))] : []; }
function normalizeObject(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function splitSettingKey(value) { const separator = value.indexOf("."); return [value.slice(0, separator), value.slice(separator + 1)]; }
function safeGet(game, namespace, key) { try { return game?.settings?.get?.(namespace, key); } catch { return undefined; } }
function assertSettings(game) { if (!game?.settings?.get || !game?.settings?.set) throw new Error(localizeFoundry("VEMOBILE.Interface.LowMemoryCanvasGateway.FoundrySettingsAreUnavailable", "Foundry settings are unavailable.")); }
function sameSettingValue(left, right) { return left === right || (typeof right === "number" && Number(left) === right); }
function serializableSettingValue(value) { return ["string", "number", "boolean"].includes(typeof value) || value === null ? value : null; }
function settingRequiresReload(game, key) {
  const registered = game?.settings?.settings?.get?.(key);
  if (registered && typeof registered.requiresReload === "boolean") return registered.requiresReload;
  return key === "core.performanceMode" || key === "core.pixelRatioResolutionScaling";
}
function syncPresentationClasses(document, profile) { const body = document?.body; if (!body) return; if (body.dataset) body.dataset.veMemoryProfile = profile; if (profile !== "normal") body.classList.add("ve-mobile-low-memory"); else body.classList.remove("ve-mobile-low-memory"); if (profile === "maximum") body.classList.add("ve-mobile-memory-maximum"); else body.classList.remove("ve-mobile-memory-maximum"); }
