import { actorSourceUuid, resolveActorSource } from "./character-source.mjs";
import { CUSTOM_HEADER_FLAG, CUSTOM_HEADER_SCOPE_FLAG, readCustomHeaderImage, readCustomHeaderUserSettings } from "./custom-header-image.mjs";
import { customHeaderImagePath } from "../kernel/custom-header-image.mjs";
import { localizeFoundry } from "./localization.mjs";

// Own native file selection for the exact actor or authenticated user and session.
export function createCustomHeaderGateway({
  getGame = () => globalThis.game,
  getFilePicker = () => globalThis.foundry?.applications?.apps?.FilePicker?.implementation ?? globalThis.FilePicker,
  resolveActor = (sourceUuid, game) => resolveActorSource(sourceUuid, { game }),
  isActive = () => false
} = {}) {
  const pending = new Set();

  // User-wide mode needs no actor. Actor mode preserves an exact token source;
  // only an absent selection may use the profile's assigned actor.
  const target = selectedSourceUuid => {
    const game = getGame();
    const userSettings = readCustomHeaderUserSettings(game?.user);
    if (userSettings.scope === "user") return { game, scope: "user", sourceUuid: "", actor: null, subject: game?.user, userSettings };
    const sourceUuid = selectedSourceUuid || actorSourceUuid(game?.user?.character);
    let actor = null;
    try { actor = sourceUuid ? resolveActor(sourceUuid, game) : null; } catch { /* Invalid selections fail closed. */ }
    return { game, scope: "actor", sourceUuid, actor, subject: actor, userSettings };
  };

  // Publish a narrow, serializable settings record without accessing file storage.
  const snapshot = selectedSourceUuid => {
    const { game, scope, sourceUuid, actor, userSettings } = target(selectedSourceUuid);
    const canChangeScope = canWriteOwnProfile(game?.user);
    let reason = "";
    if (scope === "user" && !canChangeScope) reason = "forbidden";
    else if (scope === "actor" && !actor) reason = "noActor";
    else if (scope === "actor" && (!canOwn(actor, game?.user) || typeof actor.setFlag !== "function")) reason = "forbidden";
    else if (game?.user?.can?.("FILES_BROWSE") === false) reason = "noBrowse";
    else if (!getFilePicker()) reason = "unavailable";
    return Object.freeze({ scope, userId: String(game?.user?.id ?? ""), userName: String(game?.user?.name ?? ""),
      actorSourceUuid: actor ? sourceUuid : "", actorName: String(actor?.name ?? ""),
      path: scope === "user" ? userSettings.image : readCustomHeaderImage(actor), canChoose: !reason, canChangeScope, reason });
  };

  return Object.freeze({ snapshot,
    // Change only this user's scope flag. Actor image flags are never rewritten.
    async setScope(value, { selectedSourceUuid = "", expectedSession = {}, isCurrent = () => false } = {}) {
      if (!["actor", "user"].includes(value)) throw new Error(localizeFoundry("VEMOBILE.Settings.UI.CustomHeaderStale", "The target or session changed. Reopen the image picker."));
      const game = getGame();
      const worldId = game?.world?.id;
      const userId = game?.user?.id;
      // Native User.canUserModify permits players to update their own flags.
      const current = () => isActive() && isCurrent() && getGame()?.world?.id === worldId
        && getGame()?.user?.id === userId && (!expectedSession.worldId || expectedSession.worldId === worldId)
        && (!expectedSession.userId || expectedSession.userId === userId) && canWriteOwnProfile(getGame()?.user);
      if (!current()) throw new Error(localizeFoundry("VEMOBILE.Settings.UI.CustomHeaderStale", "The target or session changed. Reopen the image picker."));
      await game.user.setFlag("ve-mobile", CUSTOM_HEADER_SCOPE_FLAG, value);
      if (!current()) throw new Error(localizeFoundry("VEMOBILE.Settings.UI.CustomHeaderStale", "The target or session changed. Reopen the image picker."));
      return snapshot(selectedSourceUuid);
    },
    // Resolve selection/cancellation without letting late native callbacks outlive their owner.
    async pick({ selectedSourceUuid = "", expectedSession = {}, scope, isCurrent = () => false }) {
      const initial = snapshot(selectedSourceUuid);
      const initialGame = getGame();
      const session = { worldId: initialGame?.world?.id, userId: initialGame?.user?.id, ...expectedSession };
      const sourceUuid = initial.actorSourceUuid;
      const pendingKey = initial.scope === "user" ? `User.${initial.userId}` : sourceUuid;
      // Recheck the selected scope, target authority, session and kernel lifecycle guard.
      const requireTarget = () => {
        const game = getGame();
        const current = snapshot(selectedSourceUuid);
        if (!isActive() || !scope || scope.disposed || !isCurrent()
          || game?.world?.id !== session.worldId || game?.user?.id !== session.userId
          || !current.canChoose || current.scope !== initial.scope || current.actorSourceUuid !== sourceUuid) {
          throw new Error(localizeFoundry("VEMOBILE.Settings.UI.CustomHeaderStale", "The target or session changed. Reopen the image picker."));
        }
        return target(selectedSourceUuid).subject;
      };
      requireTarget();
      if (pending.has(pendingKey)) throw new Error(localizeFoundry("VEMOBILE.Settings.UI.CustomHeaderBusy", "An image picker is already open."));
      pending.add(pendingKey);
      const pickerScope = scope.child("custom-header-picker");
      let picker = null;
      let choosing = false;
      let finished = false;
      let complete;
      let fail;
      const result = new Promise((resolve, reject) => { complete = resolve; fail = reject; });
      // Settle once, then release native listeners, the window and pending ownership.
      const finish = (value, error = null) => {
        if (finished) return;
        finished = true;
        pickerScope.dispose();
        if (error) fail(error); else complete(value);
      };
      pickerScope.own(() => {
        pending.delete(pendingKey);
        if (picker) void Promise.resolve(picker.close()).catch(() => {});
        if (!finished) { finished = true; complete(null); }
      });
      try {
        const FilePicker = getFilePicker();
        const HeaderImagePicker = headerImagePickerClass(FilePicker, pickerScope);
        picker = new HeaderImagePicker({ type: "image", current: initial.path,
          // Native FilePicker handles uploads under Foundry's file permissions.
          callback: path => {
            if (choosing || finished) return;
            choosing = true;
            void (async () => {
              const imagePath = customHeaderImagePath(path);
              if (!imagePath) throw new Error(localizeFoundry("VEMOBILE.Settings.UI.CustomHeaderInvalid", "Choose a valid image file."));
              const subject = requireTarget();
              if (readCustomHeaderImage(subject) !== initial.path) throw new Error(localizeFoundry("VEMOBILE.Settings.UI.CustomHeaderChanged", "This header image changed. Reopen the image picker."));
              await subject.setFlag("ve-mobile", CUSTOM_HEADER_FLAG, imagePath);
              if (!pickerScope.disposed && isCurrent()) finish(imagePath);
              else finish(null);
            })().catch(error => finish(null, error));
          }
        });
        pickerScope.listen(picker, "close", () => { if (!choosing) finish(null); });
        await picker.render({ force: true });
        if (pickerScope.disposed) void Promise.resolve(picker.close()).catch(() => {});
      } catch (error) { finish(null, error); }
      return result;
    }
  });
}

// Native v13/v14 FilePicker focuses the path input on every render. Suppress
// that call before it opens a touch keyboard, rather than blurring afterwards.
// Only this owned picker is adapted; normal pointer/keyboard field entry remains native.
function headerImagePickerClass(FilePicker, pickerScope) {
  return class VEHeaderImagePicker extends FilePicker {
    // Replacing the path bar during directory navigation must not restore its
    // old focus and reopen a dismissed keyboard. Preserve other native state.
    _syncPartState(partId, newElement, priorElement, state) {
      if (pickerScope.disposed) return;
      const restoredField = state.focus ? newElement.querySelector(state.focus) : null;
      return super._syncPartState(partId, newElement, priorElement,
        restoredField?.name === "target" ? { ...state, focus: undefined } : state);
    }

    async _onRender(context, options) {
      if (pickerScope.disposed) return;
      const input = this.element?.elements?.target;
      if (!input) return super._onRender(context, options);
      const renderScope = pickerScope.child("header-picker-render");
      const originalFocus = Object.getOwnPropertyDescriptor(input, "focus");
      // Browser taps focus inputs internally; blocking this method only stops
      // the native render hook's unsolicited JavaScript focus call.
      const suppressRenderFocus = () => {};
      Object.defineProperty(input, "focus", { configurable: true, writable: true, value: suppressRenderFocus });
      renderScope.own(() => {
        if (input.focus !== suppressRenderFocus) return;
        if (originalFocus) Object.defineProperty(input, "focus", originalFocus);
        else delete input.focus;
      });
      try { return await super._onRender(context, options); }
      finally { renderScope.dispose(); }
    }
  };
}

// Permission failures must disable selection rather than grant implicit ownership.
function canOwn(actor, user) {
  try { return Boolean(user && (user.isGM || actor.testUserPermission?.(user, "OWNER") === true)); }
  catch { return false; }
}

// No user ID is accepted from the UI: writes always target game.user's own flags.
function canWriteOwnProfile(user) {
  if (!user?.id || typeof user.setFlag !== "function") return false;
  try { return typeof user.canUserModify === "function" ? user.canUserModify(user, "update", { flags: { "ve-mobile": {} } }) === true : user.isSelf === true; }
  catch { return false; }
}
