import { localizeFoundry } from "./localization.mjs";
import { MODULE_ID } from "./preferences.mjs";

const RELEASES_URL = "https://github.com/Silvestrae/ve-mobile/releases/tag/";
const LATEST_RELEASE_URL = "https://api.github.com/repos/Silvestrae/ve-mobile/releases/latest";
const CHECK_INTERVAL = 6 * 60 * 60 * 1000;
const REQUEST_TIMEOUT = 8000;
const ENABLED = "updateNotices";
const STATE = "updateNoticeState";
const VERSION_FLAG = "availableUpdateVersion";

/** Give GMs control of background checks and persist the result per world. */
export function registerFoundryUpdateNoticeSettings(game) {
  game.settings.register(MODULE_ID, ENABLED, {
    name: "VEMOBILE.UpdateNotice.Setting",
    hint: "VEMOBILE.UpdateNotice.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });
  game.settings.register(MODULE_ID, STATE, {
    scope: "world",
    config: false,
    type: Object,
    default: {}
  });
}

/** Check for an installable release independently of Mobile presentation. */
export function startFoundryUpdateNotices(scope, {
  getGame = () => globalThis.game,
  fetchRelease = globalThis.fetch,
  now = Date.now
} = {}) {
  const game = getGame();
  const userId = game?.user?.id;
  const worldId = game?.world?.id;
  if (!game?.user?.isGM || !userId || !worldId) return;

  // Recheck authority and the opt-out after a network request or document creation.
  const canCheck = () => !scope.disposed && getGame() === game && game.ready
    && game.world?.id === worldId && game.user?.id === userId
    && game.users?.activeGM?.id === userId && game.user.can("SETTINGS_MODIFY")
    && game.settings.get(MODULE_ID, ENABLED) === true;

  // Read the latest stable public release without sending session details.
  const check = async () => {
    if (!canCheck()) return;
    const installed = game.modules.get(MODULE_ID)?.version;
    const initial = game.settings.get(MODULE_ID, STATE);
    const elapsed = now() - initial.checkedAt;
    if (!installed || (elapsed >= 0 && elapsed < CHECK_INTERVAL)) return;

    const requestScope = scope.child("latest-release");
    const request = new AbortController();
    requestScope.own(() => request.abort());
    requestScope.timeout(() => request.abort(), REQUEST_TIMEOUT);
    try {
      const response = await fetchRelease(LATEST_RELEASE_URL, {
        credentials: "omit",
        referrerPolicy: "no-referrer",
        redirect: "error",
        signal: request.signal
      });
      if (!response.ok || request.signal.aborted || !canCheck()) return;
      const release = readRelease(await response.json());
      if (!release || request.signal.aborted || !canCheck()) return;

      const { isNewerVersion } = globalThis.foundry.utils;
      const state = game.settings.get(MODULE_ID, STATE);
      let notifiedVersion = state.notifiedVersion ?? "";
      if (isNewerVersion(release.version, installed)
        && (!notifiedVersion || isNewerVersion(release.version, notifiedVersion))) {
        if (!await postUpdateNotice(game, release, installed)) return;
        notifiedVersion = release.version;
      }
      if (!canCheck()) return;
      // A second GM may have taken over while the chat document was saving.
      // Preserve any newer recorded notice and defer retry if the write fails.
      const latest = game.settings.get(MODULE_ID, STATE).notifiedVersion;
      if (latest && (!notifiedVersion || isNewerVersion(latest, notifiedVersion))) notifiedVersion = latest;
      await game.settings.set(MODULE_ID, STATE, { checkedAt: now(), notifiedVersion });
    } finally {
      requestScope.dispose();
    }
  };

  // Keep the check off the startup path and retry on a later check if offline.
  const run = () => {
    void check().catch(() => {}).finally(() => {
      if (!scope.disposed) scope.timeout(run, CHECK_INTERVAL);
    });
  };
  scope.timeout(run, 0);
}

// Require the version and packaging shape used by the public release process.
function readRelease(data) {
  const match = /^v((?:0|[1-9]\d{0,5})\.(?:0|[1-9]\d{0,5})\.(?:0|[1-9]\d{0,5}))$/.exec(data?.tag_name);
  if (!match || data.draft !== false || data.prerelease !== false || !Array.isArray(data.assets)) return null;
  const version = match[1];
  const assets = data.assets;
  if (!assets.some(asset => asset?.name === "module.json")
    || !assets.some(asset => asset?.name === `ve-mobile-v${version}.zip`)) return null;
  return { version, url: RELEASES_URL + match[0] };
}

// Reuse the same ChatMessage identity for this release across clients and retries.
async function postUpdateNotice(game, { version, url }, installed) {
  const id = "veUp" + version.split(".").map(part => Number(part).toString(36).padStart(4, "0")).join("");
  const existing = game.messages.get(id);
  if (existing) return existing.getFlag(MODULE_ID, VERSION_FLAG) === version;

  const escape = globalThis.foundry.utils.escapeHTML;
  const title = localizeFoundry("VEMOBILE.UpdateNotice.Title", "VE Mobile update available");
  const detail = localizeFoundry("VEMOBILE.UpdateNotice.Detail",
    "Version {available} is available. This world is using {installed}. Update VE Mobile from Foundry Setup under Add-on Modules.",
    { available: version, installed });
  const link = localizeFoundry("VEMOBILE.UpdateNotice.Link", "View update");
  const posted = await globalThis.ChatMessage.create({
    _id: id,
    speaker: { alias: "VE Mobile" },
    whisper: game.users.filter(user => user.isGM).map(user => user.id),
    content: `<p><strong>${escape(title)}</strong></p><p>${escape(detail)}</p><p><a href="${url}" target="_blank" rel="noopener noreferrer">${escape(link)}</a></p>`,
    flags: { [MODULE_ID]: { [VERSION_FLAG]: version } }
  }, { keepId: true });
  return Boolean(posted);
}
