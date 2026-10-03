import { isMobilePerformanceAuthorityActive } from "../kernel/presentation-mode-authority.mjs";
import { localizeFoundry } from "./localization.mjs";

const MODULE_ID = "ve-mobile";
const DESKTOP_HIDDEN_SETTING_KEYS = Object.freeze([
  "theme",
  "colorScheme",
  "headerArtwork",
  "headerArtworkOpacity",
  "quickbarEnabled",
  "quickbarRows",
  "movementRepeatDelay",
  "recenterAfterMove",
  "joystickSide",
  "combatCarousel",
  "keepScreenAwake",
  "graphicsSafety",
  "diceRendering",
  "protectVeStyling",
  "characterFavouritesSource",
  "loggingLevel"
]);
const GROUPS = Object.freeze([
  { id: "preferences", keys: ["quickbarSource", "showActionSummaries", "compactActionSummaries"] },
  { id: "compatibility", keys: ["fcsAutoSoftOverride"] },
  { id: "support", keys: ["saveDiagnosticsToJournal", "controlsGuide"] }
]);

/** Remove only unedited/omitted VE controls; other modules retain native submission. */
export function filterVeSettingsSubmission(values, fields, { readCurrent, canWrite, localize = localizeFoundry }) {
  const result = { ...values };
  for (const id of Object.keys(result)) {
    if (!id.startsWith("ve-mobile.")) continue;
    const field = fields.get(id);
    if (!field || field.control.disabled || field.control.closest?.(".ve-mobile-desktop-hidden-setting")
      || sameValue(controlValue(field.control), field.initial)) { delete result[id]; continue; }
    if (!canWrite(id)) throw new Error(localize("VEMOBILE.Graphics.DesktopSettingsPermission", "You no longer have permission to change this setting."));
    const current = readCurrent(id);
    if (!sameValue(current, field.stored) && !sameValue(current, result[id])) {
      throw new Error(localize("VEMOBILE.Graphics.DesktopSettingsStale", "This setting changed while the form was open. Close and reopen settings before changing it."));
    }
  }
  return result;
}
const controlValue = control => control.type === "checkbox" ? Boolean(control.checked) : control.value;
const sameValue = (a, b) => typeof a === "boolean" || typeof b === "boolean" ? a === b : String(a) === String(b);

/**
 * Keep VE Mobile's native settings focused on desktop-relevant controls while
 * Foundry's effective presentation is Desktop. This only changes rendered DOM;
 * registered settings and their stored values remain untouched.
 */
export function createFoundryDesktopSettingsVisibilityGateway({
  readPolicy,
  getHooks = () => globalThis.Hooks,
  getGame = () => globalThis.game,
  getForceClientSettings = defaultForceClientSettings,
  getMutationObserver = () => globalThis.MutationObserver
} = {}) {
  let enabled = false;
  let scopeOwner = null;
  const roots = new Map();
  const rowState = new Map();

  const desktopPresentation = () => !isMobilePerformanceAuthorityActive(readPolicy);

  const localize = key => {
    try { return getGame()?.i18n?.localize?.(`VEMOBILE.Controls.Settings.${key}`) ?? key; }
    catch { return key; }
  };
  const grouped = new Map();
  const submissions = new Map();

  const restoreGrouping = root => {
    const groups = grouped.get(root);
    if (!groups) return;
    for (const group of groups) {
      for (const [row, marker] of group.rows) {
        if (marker.parentNode) marker.replaceWith(row);
        marker.remove();
      }
      group.element.remove();
    }
    grouped.delete(root);
  };
  const groupRows = (root, category) => {
    if (grouped.has(root)) return;
    const groups = [];
    grouped.set(root, groups);
    for (const group of GROUPS) {
      const rows = group.keys.map(key => settingRow(category, key)).filter(Boolean);
      if (!rows.length) continue;
      const element = category.ownerDocument.createElement("details");
      element.className = "ve-native-settings-group";
      element.dataset.veSettingsGroup = group.id;
      const summary = category.ownerDocument.createElement("summary");
      summary.textContent = localize(group.id);
      element.append(summary);
      if (group.id === "preferences") {
        const note = category.ownerDocument.createElement("p");
        note.textContent = localize("BrowserOnly");
        element.append(note);
      }
      category.append(element);
      const ownedRows = [];
      groups.push({ element, rows: ownedRows });
      for (const row of rows) {
        const marker = category.ownerDocument.createComment("VE settings original position");
        row.before(marker);
        ownedRows.push([row, marker]);
        element.append(row);
      }
    }
  };
  const summaryDependency = category => {
    const parent = category.querySelector('[name="ve-mobile.showActionSummaries"]');
    const child = category.querySelector('[name="ve-mobile.compactActionSummaries"]');
    if (!parent || !child) return;
    const entry = submissions.get(category);
    if (entry && !entry.dependency) {
      entry.dependency = { child, disabled: child.disabled };
      entry.change = () => { child.disabled = entry.dependency.disabled || !parent.checked; };
      parent.addEventListener("change", entry.change);
    }
    if (entry?.dependency) child.disabled = entry.dependency.disabled || !parent.checked;
  };
  const protectSubmission = (app, category) => {
    if (!category || submissions.has(category)) return;
    const game = getGame();
    const fields = new Map([...category.querySelectorAll('input[name], select[name], textarea[name]')].filter(control => control.name?.startsWith("ve-mobile.")).map(control => {
      const id = control.name;
      return [id, { control, initial: controlValue(control), stored: game?.settings?.get?.(MODULE_ID, id.slice(MODULE_ID.length + 1)) }];
    }));
    const formOptions = app?.options?.form;
    const original = formOptions?.handler;
    const identity = { world: game?.world?.id, user: game?.user?.id };
    const entry = { fields, formOptions, original, dependency: null, change: null, wrapper: null };
    submissions.set(category, entry);
    if (typeof original !== "function") return;
    const wrapper = async function(event, form, data) {
      const currentGame = getGame();
      if (identity.world !== currentGame?.world?.id || identity.user !== currentGame?.user?.id) throw new Error(localizeFoundry("VEMOBILE.Graphics.DesktopSettingsSessionChanged", "The settings session changed."));
      const values = data.object;
      const filtered = filterVeSettingsSubmission(values, fields, {
        localize: (key, fallback) => localizeFoundry(key, fallback),
        readCurrent: id => currentGame.settings.get(MODULE_ID, id.slice(MODULE_ID.length + 1)),
        canWrite: id => {
          const setting = currentGame.settings.settings.get(id);
          const FCS = getForceClientSettings();
          return Boolean(setting?.config && (setting.scope !== "world" || currentGame.user?.can?.("SETTINGS_MODIFY"))
            && !(FCS?.isRestricted?.(id)) && !(FCS?.isForced?.(id) && !currentGame.user?.isGM));
        }
      });
      for (const id of Object.keys(values)) if (id.startsWith("ve-mobile.") && !Object.hasOwn(filtered, id)) delete values[id];
      return original.call(this, event, form, data);
    };
    formOptions.handler = wrapper;
    entry.wrapper = wrapper;
  };
  const restoreSubmission = category => {
    const entry = submissions.get(category);
    if (!entry) return;
    if (entry.formOptions?.handler === entry.wrapper) entry.formOptions.handler = entry.original;
    if (entry.dependency) {
      category.querySelector('[name="ve-mobile.showActionSummaries"]')?.removeEventListener("change", entry.change);
      entry.dependency.child.disabled = entry.dependency.disabled;
    }
    submissions.delete(category);
  };

  const captureAndSetHidden = (row, hidden, root) => {
    if (!rowState.has(row)) {
      rowState.set(row, {
        hidden: row.hasAttribute?.("hidden") ?? Boolean(row.hidden),
        ariaHidden: row.getAttribute?.("aria-hidden") ?? null,
        controls: [...(row.querySelectorAll?.("input, select, textarea") ?? [])].map(control => [control, Boolean(control.disabled)]),
        root
      });
    }
    const previous = rowState.get(row);
    applyOriginalVisibility(row, previous, hidden);
  };

  const restoreRow = (row) => {
    const previous = rowState.get(row);
    if (!previous) return;
    row.hidden = previous.hidden;
    if (previous.hidden) row.setAttribute?.("hidden", "");
    else row.removeAttribute?.("hidden");
    if (previous.ariaHidden === null) row.removeAttribute?.("aria-hidden");
    else row.setAttribute?.("aria-hidden", previous.ariaHidden);
    row.classList?.remove?.("ve-mobile-desktop-hidden-setting");
    for (const [control, disabled] of previous.controls) control.disabled = disabled;
    rowState.delete(row);
  };

  const applyOriginalVisibility = (row, previous, hide) => {
    row.hidden = hide || previous.hidden;
    row.classList?.toggle?.("ve-mobile-desktop-hidden-setting", hide);
    for (const [control, disabled] of previous.controls) control.disabled = hide || disabled;
    if (hide) row.setAttribute?.("aria-hidden", "true");
    else if (previous.ariaHidden === null) row.removeAttribute?.("aria-hidden");
    else row.setAttribute?.("aria-hidden", previous.ariaHidden);
  };

  const moduleCategory = (root) => {
    const element = unwrapElement(root);
    if (!element) return null;
    // CategoryBrowser uses data-tab on both sidebar buttons and content tabs.
    // Only the main part's data-category section contains setting form groups.
    return element.querySelector?.(`[data-application-part="main"] section[data-category="${MODULE_ID}"]`) ?? null;
  };

  const settingRow = (category, key) => {
    const settingId = `${MODULE_ID}.${key}`;
    const escaped = cssEscape(settingId);
    const candidates = category.querySelectorAll?.(`[name="${escaped}"], [data-setting-id="${escaped}"]`) ?? [];
    const control = [...candidates].find((element) => element.closest?.(`section[data-category="${MODULE_ID}"]`) === category);
    if (!control) return category.querySelector?.(`[data-key="${MODULE_ID}.${key}"]`)?.closest?.(".form-group") ?? null;
    return control.closest?.(".form-group") ?? null;
  };

  const refreshRoot = (root) => {
    const category = moduleCategory(root);
    if (!category) return;
    const hideMobileControls = desktopPresentation();
    const currentRows = new Set();
    for (const key of DESKTOP_HIDDEN_SETTING_KEYS) {
      const row = settingRow(category, key);
      if (!row) continue;
      currentRows.add(row);
      captureAndSetHidden(row, hideMobileControls, root);
    }
    for (const [row, state] of rowState) if (state.root === root && !currentRows.has(row)) restoreRow(row);

    category.querySelector?.("#ve-mobile-desktop-settings-notice")?.remove();
    if (hideMobileControls) groupRows(root, category);
    else restoreGrouping(root);
    summaryDependency(category);
  };

  const restoreRoot = (root) => {
    for (const [row, state] of rowState) if (state.root === root) restoreRow(row);
    restoreGrouping(root);
    restoreSubmission(moduleCategory(root));
  };

  const onRenderSettings = (app, html) => {
    const root = unwrapElement(html) ?? unwrapElement(app?.element);
    if (!root) return;
    const identity = app ?? root;
    const previous = roots.get(identity);
    previous?.observer?.disconnect?.();
    if (previous) restoreRoot(previous.root);
    roots.set(identity, { root, observer: null });
    protectSubmission(app, moduleCategory(root));
    refreshRoot(root);
    const Observer = getMutationObserver();
    const observer = Observer ? new Observer(() => refreshRoot(root)) : null;
    observer?.observe(root, { childList: true, subtree: true });
    roots.get(identity).observer = observer;
  };

  const onCloseSettings = (app) => {
    const entry = roots.get(app);
    if (!entry) return;
    entry.observer?.disconnect?.();
    restoreRoot(entry.root);
    roots.delete(app);
  };

  const refresh = () => {
    for (const { root } of roots.values()) refreshRoot(root);
  };

  const enable = (scope) => {
    if (enabled) return;
    enabled = true;
    scopeOwner = scope;
    const hooks = getHooks();
    const registrations = [
      ["renderSettingsConfig", onRenderSettings],
      ["closeSettingsConfig", onCloseSettings]
    ].map(([name, listener]) => [name, hooks?.on?.(name, listener)]);
    scope?.own?.(() => {
      for (const [name, id] of registrations) if (id !== undefined) hooks?.off?.(name, id);
      for (const [app, entry] of roots) {
        entry.observer?.disconnect?.();
        restoreRoot(entry.root);
        roots.delete(app);
      }
      enabled = false;
      scopeOwner = null;
    });
  };

  return Object.freeze({
    enable,
    refresh,
    snapshot() {
      return Object.freeze({ enabled, desktopPresentation: desktopPresentation(), openSettingsWindows: roots.size, owner: scopeOwner?.label ?? null });
    }
  });
}

export { DESKTOP_HIDDEN_SETTING_KEYS };

function unwrapElement(value) {
  if (value?.nodeType === 1) return value;
  if (value?.[0]?.nodeType === 1) return value[0];
  return null;
}

function cssEscape(value) {
  return globalThis.CSS?.escape?.(value) ?? value.replaceAll('"', '\\"');
}

function defaultForceClientSettings() {
  try { if (typeof ForceClientSettings !== "undefined") return ForceClientSettings; } catch {}
  return globalThis.ForceClientSettings ?? null;
}
