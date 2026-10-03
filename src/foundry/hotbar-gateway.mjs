import { localizeFoundry } from "./localization.mjs";
import { resolveActorSource, validSourceUuid } from "./character-source.mjs";

const SLOT_COUNT = 50;


export class HotbarError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "HotbarError";
    this.code = code;
  }
}

/** Permission-checked access to the current user's native Foundry hotbar. */
export function createFoundryHotbarGateway({
  getGame = () => globalThis.game,
  getMacroClass = () => globalThis.CONFIG?.Macro?.documentClass ?? globalThis.Macro,
  isActive = () => false
} = {}) {
  const pendingExecutions = new Set();
  let mutationBusy = false;

  const session = (expected = {}) => {
    if (!isActive()) throw new HotbarError("INACTIVE", localizeFoundry("VEMOBILE.Interface.HotbarGateway.MobileModeIsNotActive", "Mobile mode is not active."));
    const game = getGame();
    if (!game?.world?.id || !game?.user?.id) throw new HotbarError("SESSION_UNAVAILABLE", localizeFoundry("VEMOBILE.Interface.CombatGateway.TheFoundrySessionIsNotReady", "The Foundry session is not ready."));
    if (expected?.worldId && expected.worldId !== game.world.id) {
      throw new HotbarError("STALE_SESSION", localizeFoundry("VEMOBILE.Interface.HotbarGateway.TheActiveWorldChanged", "The active world changed."));
    }
    if (expected?.userId && expected.userId !== game.user.id) {
      throw new HotbarError("STALE_SESSION", localizeFoundry("VEMOBILE.Interface.HotbarGateway.TheActiveUserChanged", "The active user changed."));
    }
    return game;
  };

  const locked = (game) => {
    try { return game.settings?.get?.("core", "hotbarLock") === true; }
    catch { return true; }
  };

  const canUpdateOwnHotbar = (user) => {
    try { return typeof user?.canUserModify === "function" && user.canUserModify(user, "update") === true; }
    catch { return false; }
  };

  const macroById = (game, id) => {
    try { return game.macros?.get?.(id) ?? null; }
    catch { return null; }
  };

  const canExecute = (macro, user) => {
    try {
      const documentPermission = typeof macro?.canUserExecute === "function"
        ? macro.canUserExecute(user) === true
        : macro?.canExecute === true;
      if (!documentPermission) return false;
      // In v13, MACRO_SCRIPT controls authoring script code. Existing macro
      // execution uses LIMITED document permission through canUserExecute.
      return true;
    } catch { return false; }
  };

  const isOwner = (macro) => {
    try { return macro?.isOwner === true; }
    catch { return false; }
  };

  const slotValue = (user, slot) => {
    const value = user?.hotbar?.[String(slot)];
    return typeof value === "string" && value.length ? value : null;
  };

  const assertSlot = (slot) => {
    if (!Number.isInteger(slot) || slot < 1 || slot > SLOT_COUNT) {
      throw new HotbarError("INVALID_SLOT", localizeFoundry("VEMOBILE.Interface.HotbarGateway.HotbarSlotsMustBeBetweenAnd", "Hotbar slots must be between 1 and 50."));
    }
  };

  const assertExpectedSlot = (user, slot, expectedMacroId) => {
    if (slotValue(user, slot) !== expectedMacroId) {
      throw new HotbarError("STALE_SLOT", localizeFoundry("VEMOBILE.Interface.HotbarGateway.ThatHotbarSlotChangedRefreshAndTryAgain", "That hotbar slot changed. Refresh and try again."));
    }
  };

  const assertMacroId = (value) => {
    if (typeof value !== "string" || !value.trim() || value.length > 128) {
      throw new HotbarError("INVALID_INPUT", localizeFoundry("VEMOBILE.Interface.HotbarGateway.AValidMacroIDIsRequired", "A valid macro ID is required."));
    }
    return value;
  };

  const assertMutationAllowed = (game) => {
    if (locked(game)) throw new HotbarError("HOTBAR_LOCKED", localizeFoundry("VEMOBILE.Interface.HotbarGateway.TheFoundryHotbarIsLocked", "The Foundry hotbar is locked."));
    if (!canUpdateOwnHotbar(game.user)) throw new HotbarError("FORBIDDEN", localizeFoundry("VEMOBILE.Interface.HotbarGateway.YouCannotUpdateYourHotbar", "You cannot update your hotbar."));
  };

  const resolveExecutableMacro = (game, macroId) => {
    const macro = macroById(game, assertMacroId(macroId));
    if (!macro) throw new HotbarError("TARGET_MISSING", localizeFoundry("VEMOBILE.Interface.HotbarGateway.ThatMacroIsNoLongerAvailable", "That macro is no longer available."));
    if (!canExecute(macro, game.user)) throw new HotbarError("FORBIDDEN", localizeFoundry("VEMOBILE.Interface.HotbarGateway.YouCanNoLongerUseThatMacro", "You can no longer use that macro."));
    return macro;
  };

  const expectedSlotId = (request) => {
    if (!request || !Object.hasOwn(request, "expectedMacroId")) {
      throw new HotbarError("INVALID_INPUT", localizeFoundry("VEMOBILE.Interface.HotbarGateway.TheExpectedHotbarSlotValueIsRequired", "The expected hotbar slot value is required."));
    }
    const value = request.expectedMacroId;
    if (value !== null && (typeof value !== "string" || !value.length)) {
      throw new HotbarError("INVALID_INPUT", localizeFoundry("VEMOBILE.Interface.HotbarGateway.TheExpectedHotbarSlotValueIsInvalid", "The expected hotbar slot value is invalid."));
    }
    return value;
  };

  const serializeMacro = (macro, user, available) => Object.freeze({
    kind: "macro",
    macroId: String(macro.id),
    label: String(macro.name ?? ""),
    img: String(macro.img ?? ""),
    available,
    editable: isOwner(macro)
  });

  const unavailableSlot = (macroId) => Object.freeze({
    kind: "macro",
    macroId,
    label: localizeFoundry("VEMOBILE.ActionBar.UnavailableMacro", "Unavailable macro"),
    img: "",
    available: false,
    editable: false
  });

  const withMutationLock = async (fn) => {
    if (mutationBusy) throw new HotbarError("BUSY", localizeFoundry("VEMOBILE.Interface.HotbarGateway.AHotbarChangeIsAlreadyInProgress", "A hotbar change is already in progress."));
    mutationBusy = true;
    try { return await fn(); }
    finally { mutationBusy = false; }
  };

  const resolveItem = (game, request) => {
    let source;
    try { source = validSourceUuid(request?.actorSourceUuid); }
    catch { throw new HotbarError("INVALID_INPUT", localizeFoundry("VEMOBILE.Interface.HotbarGateway.AValidCharacterIsRequired", "A valid character is required.")); }
    const actor = resolveActorSource(source, { game });
    if (!actor) throw new HotbarError("TARGET_MISSING", localizeFoundry("VEMOBILE.Interface.HotbarGateway.ThatCharacterIsNoLongerAvailable", "That character is no longer available."));
    let owned = false;
    try { owned = game.user.isGM || (typeof actor.testUserPermission === "function" ? actor.testUserPermission(game.user, "OWNER") : actor.isOwner === true); } catch {}
    if (!owned) throw new HotbarError("FORBIDDEN", localizeFoundry("VEMOBILE.Interface.HotbarGateway.YouNoLongerControlThatCharacter", "You no longer control that character."));
    const item = actor.items?.get?.(assertMacroId(request?.itemId));
    if (!item || typeof item.use !== "function") throw new HotbarError("TARGET_MISSING", localizeFoundry("VEMOBILE.Interface.HotbarGateway.ThatItemIsNoLongerAvailable", "That item is no longer available."));
    const activity = request?.activityId ? item.system?.activities?.get?.(assertMacroId(request.activityId)) : null;
    if (request?.activityId && (!activity?.canUse || typeof activity.use !== "function")) throw new HotbarError("TARGET_MISSING", localizeFoundry("VEMOBILE.Interface.HotbarGateway.ThatActivityIsNoLongerAvailable", "That activity is no longer available."));
    return { item, activity };
  };

  const itemMacroData = ({ item, activity }) => ({
    name: activity ? `${item.name}: ${activity.name}` : String(item.name),
    img: String(activity?.img ?? item.img ?? ""), type: "script", scope: "actor",
    command: `dnd5e.documents.macro.rollItem(${JSON.stringify(String(item._source?.name ?? item.name))}, {${activity ? ` activityName: ${JSON.stringify(String(activity._source?.name ?? activity.name))},` : ""} event })${activity ? ";" : ""}`,
    flags: { "dnd5e.itemMacro": true }
  });

  return Object.freeze({
    snapshot() {
      const game = getGame();
      if (!game?.world?.id || !game?.user?.id) {
        return Object.freeze({
          slots: Object.freeze(Array.from({ length: SLOT_COUNT }, () => null)),
          macros: Object.freeze([]),
          rootSorting: "m",
          locked: true
        });
      }
      const user = game.user;
      const slots = Array.from({ length: SLOT_COUNT }, (_, index) => {
        const macroId = slotValue(user, index + 1);
        if (!macroId) return null;
        const macro = macroById(game, macroId);
        if (!macro || !canExecute(macro, user)) return unavailableSlot(macroId);
        return serializeMacro(macro, user, true);
      });
      const macros = [];
      for (const macro of collectionValues(game.macros)) {
        if (canExecute(macro, user)) macros.push(Object.freeze({ ...serializeMacro(macro, user, true), sort: Number(macro.sort) || 0, folderPath: macroFolderPath(macro) }));
      }
      return Object.freeze({ slots: Object.freeze(slots), macros: Object.freeze(macros), rootSorting: game.macros?.sortingMode === "a" ? "a" : "m", locked: locked(game) });
    },

    async execute(request, expectedSession = {}) {
      const game = session(expectedSession);
      const slot = request?.slot;
      assertSlot(slot);
      const expectedMacroId = assertMacroId(request?.macroId);
      assertExpectedSlot(game.user, slot, expectedMacroId);
      const macro = resolveExecutableMacro(game, expectedMacroId);
      if (pendingExecutions.has(macro.id)) throw new HotbarError("BUSY", localizeFoundry("VEMOBILE.Interface.HotbarGateway.ThatMacroIsAlreadyRunning", "That macro is already running."));
      pendingExecutions.add(macro.id);
      try {
        session(expectedSession);
        assertExpectedSlot(game.user, slot, expectedMacroId);
        resolveExecutableMacro(game, expectedMacroId);
        await macro.execute();
        return Object.freeze({ ok: true });
      } finally { pendingExecutions.delete(macro.id); }
    },

    async addItem(request, expectedSession = {}) {
      return withMutationLock(async () => {
        const game = session(expectedSession);
        assertMutationAllowed(game);
        if (game.system?.id !== "dnd5e") throw new HotbarError("CAPABILITY_UNAVAILABLE", localizeFoundry("VEMOBILE.Interface.HotbarGateway.ItemHotbarMacrosRequireDDE", "Item hotbar macros require D&D5e."));
        const data = itemMacroData(resolveItem(game, request));
        const slot = Array.from({length:SLOT_COUNT}, (_, index) => index + 1).find(candidate => !slotValue(game.user, candidate));
        if (!slot) throw new HotbarError("HOTBAR_FULL", localizeFoundry("VEMOBILE.Interface.HotbarGateway.HotbarFull", "Hotbar full"));
        let macro = collectionValues(game.macros).find(candidate => candidate.isAuthor && candidate.name === data.name && candidate.command === data.command && canExecute(candidate, game.user));
        if (!macro) {
          const Macro = getMacroClass();
          if (!Macro?.canUserCreate?.(game.user) || !game.user.hasPermission?.("MACRO_SCRIPT")) throw new HotbarError("FORBIDDEN", localizeFoundry("VEMOBILE.Interface.HotbarGateway.YouCannotCreateItemMacros", "You cannot create item macros."));
          macro = await Macro.create(data);
        }
        const currentGame = session(expectedSession);
        assertMutationAllowed(currentGame);
        assertExpectedSlot(currentGame.user, slot, null);
        if (JSON.stringify(itemMacroData(resolveItem(currentGame, request))) !== JSON.stringify(data)) throw new HotbarError("STALE_ITEM", localizeFoundry("VEMOBILE.Interface.HotbarGateway.ThatItemChangedTryAgain", "That item changed. Try again."));
        if (!macro || !canExecute(macro, currentGame.user)) throw new HotbarError("FORBIDDEN", localizeFoundry("VEMOBILE.Interface.HotbarGateway.ThatMacroIsNotAvailableToYou", "That macro is not available to you."));
        macro = resolveExecutableMacro(currentGame, macro.id);
        if (typeof currentGame.user.assignHotbarMacro !== "function") throw new HotbarError("CAPABILITY_UNAVAILABLE", localizeFoundry("VEMOBILE.Interface.HotbarGateway.FoundryCannotUpdateTheHotbar", "Foundry cannot update the hotbar."));
        await currentGame.user.assignHotbarMacro(macro, slot);
        return Object.freeze({ok:true, slot});
      });
    },

    async assign(request, expectedSession = {}) {
      return withMutationLock(async () => {
        const game = session(expectedSession);
        const slot = request?.slot;
        assertSlot(slot);
        const expectedMacroId = expectedSlotId(request);
        assertExpectedSlot(game.user, slot, expectedMacroId);
        assertMutationAllowed(game);
        if (!request || !Object.hasOwn(request, "macroId")) {
          throw new HotbarError("INVALID_INPUT", localizeFoundry("VEMOBILE.Interface.HotbarGateway.AMacroIDOrNullIsRequired", "A macro ID or null is required."));
        }
        const macroId = request?.macroId == null ? null : assertMacroId(request.macroId);
        const macro = macroId ? resolveExecutableMacro(game, macroId) : null;
        session(expectedSession);
        assertExpectedSlot(game.user, slot, expectedMacroId);
        assertMutationAllowed(game);
        if (typeof game.user.assignHotbarMacro !== "function") {
          throw new HotbarError("CAPABILITY_UNAVAILABLE", localizeFoundry("VEMOBILE.Interface.HotbarGateway.FoundryCannotUpdateTheHotbar", "Foundry cannot update the hotbar."));
        }
        await game.user.assignHotbarMacro(macro, slot);
        return Object.freeze({ ok: true });
      });
    },

    async move(request, expectedSession = {}) {
      return withMutationLock(async () => {
        const game = session(expectedSession);
        const fromSlot = request?.fromSlot;
        const slot = request?.slot;
        assertSlot(fromSlot);
        assertSlot(slot);
        if (fromSlot === slot) throw new HotbarError("INVALID_INPUT", localizeFoundry("VEMOBILE.Interface.HotbarGateway.ChooseADifferentDestinationSlot", "Choose a different destination slot."));
        const expectedMacroId = expectedSlotId(request);
        const sourceMacroId = assertMacroId(request?.macroId);
        assertExpectedSlot(game.user, fromSlot, sourceMacroId);
        assertExpectedSlot(game.user, slot, expectedMacroId);
        assertMutationAllowed(game);
        const macro = resolveExecutableMacro(game, sourceMacroId);
        session(expectedSession);
        assertExpectedSlot(game.user, fromSlot, sourceMacroId);
        assertExpectedSlot(game.user, slot, expectedMacroId);
        assertMutationAllowed(game);
        if (typeof game.user.assignHotbarMacro !== "function") {
          throw new HotbarError("CAPABILITY_UNAVAILABLE", localizeFoundry("VEMOBILE.Interface.HotbarGateway.FoundryCannotUpdateTheHotbar", "Foundry cannot update the hotbar."));
        }
        await game.user.assignHotbarMacro(macro, slot, { fromSlot });
        return Object.freeze({ ok: true });
      });
    },

    async edit(request, expectedSession = {}) {
      const game = session(expectedSession);
      const slot = request?.slot;
      assertSlot(slot);
      const expectedMacroId = assertMacroId(request?.macroId);
      assertExpectedSlot(game.user, slot, expectedMacroId);
      const macro = macroById(game, expectedMacroId);
      if (!macro || macro.id !== expectedMacroId) throw new HotbarError("STALE_SLOT", localizeFoundry("VEMOBILE.Interface.HotbarGateway.ThatHotbarSlotChangedRefreshAndTryAgain", "That hotbar slot changed. Refresh and try again."));
      if (!isOwner(macro)) throw new HotbarError("FORBIDDEN", localizeFoundry("VEMOBILE.Interface.HotbarGateway.YouCanNoLongerEditThatMacro", "You can no longer edit that macro."));
      if (typeof macro.sheet?.render !== "function") throw new HotbarError("CAPABILITY_UNAVAILABLE", localizeFoundry("VEMOBILE.Interface.HotbarGateway.ThatMacroHasNoEditableSheet", "That macro has no editable sheet."));
      session(expectedSession);
      assertExpectedSlot(game.user, slot, expectedMacroId);
      await macro.sheet.render({ force: true, hotbarSlot: slot });
      return Object.freeze({ ok: true, opened: true });
    }
  });
}

function macroFolderPath(macro) {
  const path = [];
  const seen = new Set();
  let folder = macro.folder ?? null;
  while (folder?.id && !seen.has(folder.id)) {
    seen.add(folder.id);
    path.unshift(Object.freeze({ id: String(folder.id), name: String(folder.name ?? "Folder"), sort: Number(folder.sort) || 0, sorting: folder.sorting === "a" ? "a" : "m" }));
    folder = folder.folder ?? folder.parent ?? null;
  }
  return Object.freeze(path);
}

function collectionValues(collection) {
  if (!collection) return [];
  try { return Array.from(typeof collection.values === "function" ? collection.values() : collection); }
  catch { return []; }
}
