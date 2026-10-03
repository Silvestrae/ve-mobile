import { MODULE_ID } from "./preferences.mjs";
import { localizeFoundry } from "./localization.mjs";
import { localizedDate, localizedText } from "../ui/localized-text.mjs";

export const DIAGNOSTICS_SOCKET = `module.${MODULE_ID}`;
export const DIAGNOSTICS_MAX_EVENTS = 200;
export const DIAGNOSTICS_MAX_PAYLOAD = 120_000;
export const DIAGNOSTICS_MAX_PAGE = 150_000;
export const DIAGNOSTICS_FLUSH_MS = 45_000;
const JOURNAL_FLAG = "diagnosticsJournal";
const PAGE_FLAG = "diagnosticsPage";
const MODES = new Set(["phone", "tablet"]);
const BROWSERS = new Set(["Chrome", "Firefox", "Safari", "Edge", "Other"]);
const PLATFORMS = new Set(["Android", "iOS", "Windows", "macOS", "Linux", "Other"]);
const EVENT_CATEGORIES = Object.freeze([
  ["MODE TRANSITION", "Mode transition"],
  ["Graphics", "Graphics policy"],
  ["graphics", "Graphics recovery"],
  ["context", "Canvas context"],
  ["reconnect", "Reconnect"],
  ["Reconnect", "Reconnect"],
  ["Application admission", "Application admission"],
  ["Module Overlay", "Module overlay"],
  ["VE style authority", "Style authority"],
  ["startup", "Startup"],
  ["Startup", "Startup"],
  ["cleanup", "Cleanup"],
  ["Memory", "Memory protection"],
  ["memory", "Memory protection"],
  ["Browser Back", "Browser navigation"]
]);
const NATIVE_SETTINGS = Object.freeze([
  ["core", "maxFPS"], ["core", "performanceMode"],
  ["core", "pixelRatioResolutionScaling"], ["core", "mipmap"],
  ["core", "lightAnimation"], ["core", "noCanvas"]
]);
const NATIVE_MODULES = Object.freeze(["dice-so-nice", "force-client-settings"]);

/** The receiving GM uses Foundry's authenticated socket sender argument. */
export function createDiagnosticsJournalGateway({
  getGame = () => globalThis.game,
  getMode = () => "desktop",
  getPreferences = () => null,
  getGraphics = () => null,
  getDiagnostics = () => null,
  getNavigator = () => globalThis.navigator,
  getJournalClass = () => globalThis.JournalEntry,
  now = () => Date.now()
} = {}) {
  let scope = null;
  let timer = null;
  let writing = Promise.resolve();
  let lastFlushAt = 0;
  let stopped = true;

  const activeClient = () => {
    if (!MODES.has(String(getMode()))) return false;
    try { return getGame()?.settings?.get?.(MODULE_ID, "saveDiagnosticsToJournal") !== false; }
    catch { return false; }
  };
  const electedGm = () => [...(getGame()?.users ?? [])]
    .filter(user => user?.isGM && user.active !== false)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))[0] ?? null;
  const queueWrite = (payload) => {
    writing = writing.catch(() => {}).then(() => writeDiagnosticsPage(payload, {
      game: getGame(), JournalEntry: getJournalClass(), now
    }));
    return writing;
  };
  const api = {
    start(owner) {
      if (scope && !scope.disposed) return;
      scope = owner;
      stopped = false;
      const socket = getGame()?.socket;
      const receive = (message, senderId) => {
        if (stopped || message?.type !== "diagnostics-write") return;
        const game = getGame();
        if (!game?.user?.isGM || electedGm()?.id !== game.user.id) return;
        if (!validateDiagnosticsPayload(message.payload, game, senderId)) return;
        void queueWrite(message.payload).catch(error => {
          console.warn("VE Mobile | Diagnostics Journal write failed", error);
        });
      };
      socket?.on?.(DIAGNOSTICS_SOCKET, receive);
      owner?.own?.(() => {
        stopped = true;
        if (timer !== null) clearTimeout(timer);
        timer = null;
        socket?.off?.(DIAGNOSTICS_SOCKET, receive);
      });
      owner?.hook?.("userConnected", (_user, connected) => {
        if (connected !== false && activeClient()) api.schedule();
      });
      owner?.listen?.(globalThis.window, "pagehide", () => {
        if (timer !== null) clearTimeout(timer);
        timer = null;
      }, { passive: true });
    },
    onRecord(entry) {
      if (!entry || !activeClient()) return;
      api.schedule();
    },
    schedule() {
      if (stopped || !activeClient() || timer !== null) return;
      const delay = lastFlushAt ? Math.max(0, DIAGNOSTICS_FLUSH_MS - (now() - lastFlushAt)) : DIAGNOSTICS_FLUSH_MS;
      timer = setTimeout(() => {
        timer = null;
        void api.flush().catch(error => {
          console.warn("VE Mobile | Diagnostics Journal flush failed", error);
        });
      }, delay);
    },
    async flush({ explicit = false } = {}) {
      if (stopped || !activeClient()) return false;
      const game = getGame();
      const gm = electedGm();
      if (!gm || !game?.user?.id) return false;
      if (!explicit && now() - lastFlushAt < DIAGNOSTICS_FLUSH_MS) return false;
      const payload = buildDiagnosticsPayload({
        game, mode: getMode(), preferences: getPreferences(),
        graphics: getGraphics(), diagnostics: getDiagnostics(),
        navigator: getNavigator(), now
      });
      if (!payload) return false;
      if (gm.id === game.user.id) await queueWrite(payload);
      else {
        if (typeof game.socket?.emit !== "function") return false;
        game.socket.emit(DIAGNOSTICS_SOCKET, { type: "diagnostics-write", payload });
      }
      lastFlushAt = now();
      return true;
    }
  };
  return Object.freeze(api);
}

export function buildDiagnosticsPayload({ game, mode, preferences, graphics, diagnostics, navigator, now = () => Date.now() }) {
  if (!MODES.has(mode) || !game?.user?.id) return null;
  const settings = [...(game.settings?.settings?.entries?.() ?? [])]
    .filter(([id, definition]) => id.startsWith(`${MODULE_ID}.`) && definition?.scope === "client" && definition?.config === true)
    .map(([id]) => {
      const key = id.slice(MODULE_ID.length + 1);
      const resolved = readSetting(game, MODULE_ID, key);
      const stored = storedClientValue(game, MODULE_ID, key) ?? resolved;
      const effective = key === "mode" ? mode
        : key === "memoryProtectionProfile" ? graphics?.effectiveProfile
        : key === "graphicsSafety" ? graphics?.effects
        : key === "diceRendering" ? graphics?.dice
        : key === "characterFavouritesSource" ? preferences?.characterFavouritesSource
        : resolved;
      const storedValue = safeSettingValue(stored);
      const effectiveValue = safeSettingValue(effective);
      return { key, stored: storedValue, ...((key === "mode" || effectiveValue !== storedValue) ? { effective: effectiveValue } : {}) };
    }).slice(0, 80);
  const native = Object.fromEntries(NATIVE_SETTINGS.map(([namespace, key]) => {
    try { return [`${namespace}.${key}`, safeSettingValue(game.settings?.get?.(namespace, key))]; }
    catch { return [`${namespace}.${key}`, "unavailable"]; }
  }));
  for (const moduleId of NATIVE_MODULES) native[`${moduleId}.active`] = String(Boolean(game.modules?.get?.(moduleId)?.active));
  const browser = browserFamily(navigator?.userAgent);
  const events = (diagnostics?.snapshot?.() ?? []).slice(-DIAGNOSTICS_MAX_EVENTS)
    .map(entry => ({ at: bounded(entry?.at, 30), level: bounded(entry?.level, 5), category: eventCategory(entry?.message, entry?.level) }));
  const payload = {
    schemaVersion: 1,
    userId: String(game.user.id), mode, browser,
    at: new Date(now()).toISOString(),
    environment: {
      veVersion: bounded(game.modules?.get?.(MODULE_ID)?.version, 40),
      foundryVersion: bounded(game.version, 40),
      systemVersion: bounded(game.system?.version, 40),
      worldId: bounded(game.world?.id, 80),
      platform: platformFamily(navigator),
      configuredMode: safeSettingValue(game.settings?.get?.(MODULE_ID, "mode")),
      graphicsProfile: safeSettingValue(graphics?.effectiveProfile ?? graphics?.profile),
      restoration: safeSettingValue(graphics?.restorationStatus ?? graphics?.status),
      fcsAuthority: graphics?.forceClientSettings
        ? bounded(`soft ${graphics.forceClientSettings.softKeys?.length ?? 0}, hard ${graphics.forceClientSettings.hardKeys?.length ?? 0}, conflicts ${graphics.forceClientSettings.conflicts?.length ?? 0}`, 100)
        : "unavailable"
    }, settings, native, events
  };
  while (payload.events.length && JSON.stringify(payload).length > DIAGNOSTICS_MAX_PAYLOAD) payload.events.shift();
  return JSON.stringify(payload).length <= DIAGNOSTICS_MAX_PAYLOAD ? payload : null;
}

export function validateDiagnosticsPayload(payload, game, authenticatedSenderId) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  try { if (JSON.stringify(payload).length > DIAGNOSTICS_MAX_PAYLOAD) return false; }
  catch { return false; }
  if (!exactKeys(payload, ["schemaVersion", "userId", "mode", "browser", "at", "environment", "settings", "native", "events"])) return false;
  if (payload.schemaVersion !== 1 || String(authenticatedSenderId ?? "") !== payload.userId) return false;
  if (!game?.users?.get?.(payload.userId)?.active || !MODES.has(payload.mode) || !BROWSERS.has(payload.browser)) return false;
  if (!validTime(payload.at) || !payload.environment || !exactKeys(payload.environment, ["veVersion", "foundryVersion", "systemVersion", "worldId", "platform", "configuredMode", "graphicsProfile", "restoration", "fcsAuthority"])) return false;
  if (Object.values(payload.environment).some(value => !smallScalar(value, 100))) return false;
  if (!PLATFORMS.has(payload.environment.platform)) return false;
  const allowedSettings = new Set([...(game.settings?.settings?.entries?.() ?? [])]
    .filter(([id, definition]) => id.startsWith(`${MODULE_ID}.`) && definition?.scope === "client" && definition?.config === true)
    .map(([id]) => id.slice(MODULE_ID.length + 1)));
  if (!Array.isArray(payload.settings) || payload.settings.length > 80 || payload.settings.some(item =>
    !exactKeys(item, ["key", "stored"], ["effective"]) || !allowedSettings.has(item.key)
    || !smallScalar(item.stored, 120) || (item.effective !== undefined && !smallScalar(item.effective, 120)))) return false;
  if (!payload.native || !exactKeys(payload.native, [...NATIVE_SETTINGS.map(([ns, key]) => `${ns}.${key}`), ...NATIVE_MODULES.map(id => `${id}.active`)])
    || Object.values(payload.native).some(value => !smallScalar(value, 120))) return false;
  if (!Array.isArray(payload.events) || payload.events.length > DIAGNOSTICS_MAX_EVENTS || payload.events.some(item =>
    !exactKeys(item, ["at", "level", "category"]) || !validTime(item.at)
    || !["error", "warn", "info", "debug"].includes(item.level)
    || !["VE event", "VE error", ...EVENT_CATEGORIES.map(([, category]) => category)].includes(item.category))) return false;
  return true;
}

export async function writeDiagnosticsPage(payload, { game, JournalEntry, now = () => Date.now() }) {
  if (!game?.user?.isGM || !JournalEntry?.create) return false;
  const journalTitle = localizedText(localizeFoundry, "VEMOBILE.Diagnostics.JournalTitle", "VE Diagnostics");
  const suffixedJournalTitle = localizedText(localizeFoundry, "VEMOBILE.Diagnostics.JournalTitleSuffixed", "VE Diagnostics (VE Mobile)");
  const journals = () => [...(game.journal ?? [])];
  let journal = journals().find(entry => entry?.getFlag?.(MODULE_ID, JOURNAL_FLAG) === true);
  if (!journal) {
    const name = journals().some(entry => entry.name === journalTitle) ? suffixedJournalTitle : journalTitle;
    journal = await JournalEntry.create({ name, ownership: { default: 0 }, flags: { [MODULE_ID]: { [JOURNAL_FLAG]: true } } });
  }
  if (!journal || journal.getFlag?.(MODULE_ID, JOURNAL_FLAG) !== true) return false;
  const key = `${payload.userId}:${payload.mode}:${payload.browser}`;
  const user = game.users?.get?.(payload.userId);
  if (!user) return false;
  const mode = localizedText(localizeFoundry, `VEMOBILE.Diagnostics.Mode.${payload.mode}`, payload.mode);
  const name = localizedText(localizeFoundry, "VEMOBILE.Diagnostics.JournalPageTitle", "{user} — {mode} {browser}", { user: bounded(user.name, 60), mode, browser: payload.browser });
  const content = renderDiagnosticsPage(payload, game, now, localizeFoundry);
  let page = [...(journal.pages ?? [])].find(item => item.getFlag?.(MODULE_ID, PAGE_FLAG) === key);
  if (!page) {
    await journal.createEmbeddedDocuments("JournalEntryPage", [{ name, type: "text", text: { content, format: 1 }, flags: { [MODULE_ID]: { [PAGE_FLAG]: key } } }]);
    return true;
  }
  await page.update({ name, "text.content": content });
  return true;
}

export function renderDiagnosticsPage(payload, game, now = () => Date.now(), localize = localizeFoundry) {
  const t = (key, fallback, data) => localizedText(localize, `VEMOBILE.Diagnostics.${key}`, fallback, data);
  const locale = String(game?.i18n?.lang ?? "en");
  const sectionLabel = category => {
    const keys = {
      "Mode transition": "ModeTransition", "Graphics policy": "GraphicsPolicy", "Graphics recovery": "GraphicsRecovery",
      "Canvas context": "CanvasContext", Reconnect: "Reconnect", "Application admission": "ApplicationAdmission",
      "Module overlay": "ModuleOverlay", "Style authority": "StyleAuthority", Startup: "Startup", Cleanup: "Cleanup",
      "Memory protection": "MemoryProtection", "Browser navigation": "BrowserNavigation"
    };
    return keys[category] ? t(`Category.${keys[category]}`, category) : t(category === "VE error" ? "EventError" : "Event", category);
  };
  const lines = [
    t("DiagnosticReportTitle", "VE Diagnostics — {user}", { user: bounded(game.users?.get?.(payload.userId)?.name, 60) }),
    t("Saved", "Saved: {date}", { date: localizedDate(now(), locale) }),
    t("Client", "Client: {mode} {browser}", { mode: localizedText(localize, `VEMOBILE.Diagnostics.Mode.${payload.mode}`, payload.mode), browser: payload.browser }),
    "", t("Environment", "ENVIRONMENT"), ...Object.entries(payload.environment).map(([key, value]) => `${key}: ${value}`),
    "", t("CurrentSettings", "CURRENT VE SETTINGS"), ...payload.settings.map(item => item.effective === undefined
      ? t("Stored", "{key}: Stored {stored}", { key: item.key, stored: item.stored })
      : t("StoredEffective", "{key}: Stored {stored}; Effective {effective}", { key: item.key, stored: item.stored, effective: item.effective })),
    "", t("WorldPolicy", "WORLD / GM POLICY"),
    t("FcsOverride", "FCS auto-soft override: {value}", { value: safeSettingValue(readSetting(game, MODULE_ID, "fcsAutoSoftOverride")) }),
    t("AssetCatalog", "Asset catalogue: {summary}", { summary: catalogSummary(readSetting(game, MODULE_ID, "mobileAssetCatalog"), t) }),
    "", t("NativeSettings", "RELEVANT NATIVE SETTINGS"), ...Object.entries(payload.native).map(([key, value]) => `${key}: ${value}`),
    "", t("RecentEvents", "RECENT VE EVENTS"), ...payload.events.map(item => `${item.at} ${item.level.toUpperCase()} ${sectionLabel(item.category)}`)
  ];
  while (lines.length && lines.join("\n").length > DIAGNOSTICS_MAX_PAGE - 100) {
    const index = lines.indexOf("RECENT VE EVENTS");
    if (index < 0 || index === lines.length - 1) break;
    lines.splice(index + 1, 1);
  }
  return `<pre>${escapeHtml(lines.join("\n").slice(0, DIAGNOSTICS_MAX_PAGE - 20))}</pre>`;
}

function catalogSummary(value, localize = (key, fallback) => fallback) {
  const entries = Array.isArray(value?.entries) ? value.entries : Array.isArray(value) ? value : [];
  const summary = value ? localize("PresentEntries", "present; {count} entries", { count: entries.length }) : localize("AbsentEntries", "absent; {count} entries", { count: entries.length });
  return summary;
}
function readSetting(game, namespace, key) {
  try { return game.settings?.get?.(namespace, key); } catch { return undefined; }
}
function storedClientValue(game, namespace, key) {
  try {
    const document = game.settings?.storage?.get?.("client")?.get?.(`${namespace}.${key}`);
    return document && Object.hasOwn(document, "value") ? document.value : undefined;
  } catch { return undefined; }
}
function eventCategory(message, level) {
  const text = String(message ?? "");
  return EVENT_CATEGORIES.find(([prefix]) => text.includes(prefix))?.[1] ?? (level === "error" ? "VE error" : "VE event");
}
function browserFamily(userAgent) {
  const value = String(userAgent ?? "");
  if (/Edg\//u.test(value)) return "Edge";
  if (/Firefox\//u.test(value)) return "Firefox";
  if (/Chrome\//u.test(value)) return "Chrome";
  if (/Safari\//u.test(value)) return "Safari";
  return "Other";
}
function platformFamily(navigator) {
  const value = `${navigator?.platform ?? ""} ${navigator?.userAgent ?? ""}`;
  if (/Android/iu.test(value)) return "Android";
  if (/iPhone|iPad|iPod/iu.test(value)) return "iOS";
  if (/Windows/iu.test(value)) return "Windows";
  if (/Mac/iu.test(value)) return "macOS";
  if (/Linux/iu.test(value)) return "Linux";
  return "Other";
}
function safeSettingValue(value) {
  if (value === null || value === undefined) return "unavailable";
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  if (typeof value === "string") return bounded(value.replace(/https?:\/\/\S+/giu, "[URL]"), 120);
  if (Array.isArray(value)) return `${value.length} entries`;
  if (typeof value === "object") return `${Object.keys(value).length} keys`;
  return "unavailable";
}
function bounded(value, limit) {
  return String(value ?? "unknown").replace(/[\u0000-\u001f\u007f]/gu, " ").slice(0, limit);
}
function exactKeys(value, required, optional = []) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return required.every(key => keys.includes(key)) && keys.every(key => required.includes(key) || optional.includes(key));
}
function smallScalar(value, limit) {
  return typeof value === "string" && value.length <= limit && !/[\u0000-\u001f\u007f]/u.test(value);
}
function validTime(value) {
  return typeof value === "string" && value.length <= 30 && Number.isFinite(Date.parse(value));
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/gu, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}
