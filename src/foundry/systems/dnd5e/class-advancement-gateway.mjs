import { resolveActorSource, validSourceUuid } from "../../character-source.mjs";
import { assertSession, canOwn, CommandError, identifier } from "../../command-support.mjs";
import { localizeFoundry } from "../../localization.mjs";
import { createTaskScope } from "../../../kernel/task-scope.mjs";

// Read the same total level cap as the native sheet. Multiclass characters share it across all classes.
function availableClassLevels(actor, maxLevel = globalThis.CONFIG?.DND5E?.maxLevel) {
  const level = actor?.system?.details?.level;
  // A character without a class has level zero and can still add its first class.
  if (!Number.isSafeInteger(maxLevel) || !Number.isSafeInteger(level) || level < 0) return 0;
  return Math.max(0, maxLevel - level);
}

// Read the version-matched D&D5e applications at the Foundry boundary.
const managerClass = () => globalThis.dnd5e?.applications?.advancement?.AdvancementManager;
const compendiumBrowser = () => globalThis.dnd5e?.applications?.CompendiumBrowser;
const changedMessage = () => localizeFoundry("VEMOBILE.Character.ActorEditorGateway.AdvancementCharacterChanged", "The character changed. Reopen class advancement to use the latest sheet.");
const unavailable = () => new CommandError("COMMAND_UNAVAILABLE",
  localizeFoundry("VEMOBILE.Character.ActorEditorGateway.AdvancementUnavailable", "Native class advancement is unavailable."));
const classUnavailable = () => new CommandError("COMMAND_UNAVAILABLE",
  localizeFoundry("VEMOBILE.Character.ClassAdvancement.ClassUnavailable", "This compendium class is no longer available."));

// Offer class actions only to owned characters with room under the system cap.
export function classLevelUpCapacity(actor) {
  return actor?.type === "character" && typeof managerClass()?.forLevelChange === "function" ? availableClassLevels(actor) : 0;
}

// Native compendium document UUIDs address a root Item in one exact pack.
function classPack(game, uuid) {
  const packId = typeof uuid === "string" && uuid.match(/^Compendium\.([^.]+\.[^.]+)\.Item\.[^.]+$/u)?.[1];
  const pack = packId && game.packs?.get(packId);
  if (!pack?.visible || pack.metadata?.type !== "Item"
    || game.settings.get("dnd5e", "packSourceConfiguration")?.[packId] === false) return null;
  const types = pack.metadata.flags?.dnd5e?.types;
  return !types || types.includes("class") ? pack : null;
}

// Compare D&D5e's class identifiers so different editions and copies don't add an existing class twice.
function ownedClassIdentifiers(actor) {
  return new Set((actor.itemTypes.class ?? []).map(item => item.identifier));
}

export function createClassAdvancementGateway({ getGame = () => globalThis.game, getManager = managerClass,
  getBrowser = compendiumBrowser, getItemClass = () => globalThis.Item,
  loadClass = uuid => globalThis.fromUuid(uuid),
  getMaxLevel = () => globalThis.CONFIG?.DND5E?.maxLevel, isActive = () => false,
  getConnectionGeneration = () => 0, page = globalThis.window,
  warn = message => globalThis.ui?.notifications?.warn(message) } = {}) {
  let session = null;
  let pageScope = null;
  const managed = new WeakMap();

  // Native step processing can still be awaiting a choice when a window closes.
  // Page-owned hooks can veto late renders and writes from closed managers. Weak
  // keys let the native instances and their callbacks be collected on close.
  function watchNativeManager() {
    if (pageScope) return;
    pageScope = createTaskScope("dnd5e-class-advancement-page");
    pageScope.listen(page, "pagehide", event => {
      if (event.persisted) return;
      session?.dispose();
      pageScope.dispose();
    });
    pageScope.hook("dnd5e.preAdvancementManagerRender", application => {
      if (managed.get(application)?.canRender() === false) return false;
    });
    pageScope.hook("dnd5e.preAdvancementManagerComplete", application => {
      if (managed.get(application)?.canCommit() === false) return false;
    });
  }

  // Re-resolve the current editable character for browsing, opening and saving.
  function requireActor(sourceUuid, expected, scope, requireView) {
    const game = getGame();
    assertSession(game, expected, getConnectionGeneration);
    if (!game.ready || !isActive() || scope.disposed) throw unavailable();
    requireView();
    const actor = resolveActorSource(sourceUuid, { game });
    if (actor?.type !== "character" || !canOwn(actor, game.user)) {
      throw new CommandError("FORBIDDEN",
        localizeFoundry("VEMOBILE.Character.ActorEditorGateway.ThisActorIsNoLongerEditable", "This actor is no longer editable."));
    }
    if (!availableClassLevels(actor, getMaxLevel())) throw new CommandError("STALE_ACTOR", changedMessage());
    return actor;
  }

  // Own one pending or open native advancement. D&D5e handles the choices and commits from its clone.
  async function advance(request, expected, owner, requireView, prepare) {
    if (session) throw new CommandError("BUSY",
      localizeFoundry("VEMOBILE.Character.ActorEditorGateway.ThisNativeEditorIsAlreadyOpen", "This native editor is already open."));
    const sourceUuid = validSourceUuid(request.actorSourceUuid);
    const actor = requireActor(sourceUuid, expected, owner, requireView);
    const scope = owner.child("class-advancement");
    session = scope;
    scope.own(() => { session = null; });

    // Re-check the exact document even if a replacement has the same UUID.
    const getCurrentActor = () => {
      if (requireActor(sourceUuid, expected, scope, requireView) !== actor) {
        throw new CommandError("STALE_ACTOR", changedMessage());
      }
      return actor;
    };

    try {
      const { createManager, saveDirect, validate } = await prepare(actor, getCurrentActor, request);
      getCurrentActor();
      validate();
      const disabled = getGame().settings.get("dnd5e", "disableAdvancements");
      const original = JSON.stringify(actor.toObject());
      const application = disabled ? null : createManager();
      // A sole automatic marker only assigns the new level. With no choices or
      // advancements disabled, use the same Item operation as the native sheet.
      if (!application?.steps.length || (application.steps.length === 1
        && application.steps[0].automatic && !application.steps[0].flow)) {
        await saveDirect();
        scope.dispose();
        return;
      }

      watchNativeManager();
      let originalSource = original;
      let committing = false;
      let closed = false;
      // Teardown bypasses the native confirmation prompt. The player's close button keeps it.
      scope.own(() => {
        originalSource = null;
        if (!closed) void Promise.resolve(application.close({ skipConfirmation: true })).catch(() => {});
      });
      for (const hook of ["closeAdvancementManager", "closeApplicationV2"]) scope.hook(hook, app => {
        if (app !== application) return;
        closed = true;
        scope.dispose();
      });
      // The native bulk update contains the whole clone. Block concurrent edits,
      // including changes outside the selected class, before they can be overwritten.
      managed.set(application, {
        canRender() { return !scope.disposed; },
        canCommit() {
          if (scope.disposed || committing) return false;
          try {
            getCurrentActor();
            validate();
            if (getGame().settings.get("dnd5e", "disableAdvancements")
              || JSON.stringify(actor.toObject()) !== originalSource) throw new CommandError("STALE_ACTOR", changedMessage());
          } catch (error) {
            warn(error instanceof CommandError ? error.message : changedMessage());
            return false;
          }
          committing = true;
          return true;
        }
      });
      try {
        await application.render(true);
      } finally {
        // Native rendering can finish after a reconnect or mode change closed the provisional instance.
        if (scope.disposed && application.rendered) await application.close({ skipConfirmation: true });
      }
      if (!application.rendered || scope.disposed) throw unavailable();
    } catch (error) {
      scope.dispose();
      throw error;
    }
  }

  return Object.freeze({
    closeAll: () => session?.dispose(),

    // Load the native browser's currently enabled, visible compendium sources on demand.
    async listClasses({ actorSourceUuid }, expected, owner, requireView) {
      const sourceUuid = validSourceUuid(actorSourceUuid);
      const actor = requireActor(sourceUuid, expected, owner, requireView);
      const Browser = getBrowser();
      if (typeof Browser?.fetch !== "function") throw unavailable();
      const rows = await Browser.fetch(getItemClass(), { types: new Set(["class"]), indexFields: new Set(["system.identifier"]) });
      if (requireActor(sourceUuid, expected, owner, requireView) !== actor) throw new CommandError("STALE_ACTOR", changedMessage());
      const game = getGame();
      const existing = ownedClassIdentifiers(actor);
      return rows.flatMap(row => {
        const pack = classPack(game, row.uuid);
        if (!pack || row.type !== "class" || existing.has(row.system?.identifier)) return [];
        return [{ uuid: row.uuid, name: row.name, packLabel: pack.metadata.label }];
      });
    },

    // Level an existing embedded class using the same native factory as the character sheet.
    open(request, expected, owner, requireView) {
      return advance(request, expected, owner, requireView, (actor, _getCurrentActor, { classId, fromLevel, toLevel }) => {
        const Manager = getManager();
        if (typeof Manager?.forLevelChange !== "function") throw unavailable();
        const itemId = identifier(classId, "classId");
        const item = actor.items.get(itemId);
        const delta = toLevel - fromLevel;
        const validate = () => {
          if (actor.items.get(itemId) !== item || item?.type !== "class" || item.parent !== actor) {
            throw new CommandError("FORBIDDEN",
              localizeFoundry("VEMOBILE.Character.ActorEditorGateway.ThisActorIsNoLongerEditable", "This actor is no longer editable."));
          }
          if (!Number.isSafeInteger(fromLevel) || fromLevel < 1 || fromLevel !== item.system.levels
            || !Number.isSafeInteger(toLevel) || delta < 1 || delta > availableClassLevels(actor, getMaxLevel())) {
            throw new CommandError("STALE_ACTOR", changedMessage());
          }
        };
        return { validate, createManager: () => Manager.forLevelChange(actor, itemId, delta),
          saveDirect: () => item.update({ "system.levels": toLevel }) };
      });
    },

    // Enter only the first level of a new compendium class. Subsequent levels use Level Up.
    addClass(request, expected, owner, requireView) {
      return advance(request, expected, owner, requireView, async (actor, getCurrentActor, { classUuid }) => {
        const Manager = getManager();
        if (typeof Manager?.forNewItem !== "function") throw unavailable();
        const pack = classPack(getGame(), classUuid);
        if (!pack) throw classUnavailable();
        const source = await loadClass(classUuid);
        getCurrentActor();

        // Verify the same published class, pack visibility and D&D5e source settings
        // again at save. A newly-owned copy must go through the existing-class workflow.
        const validate = () => {
          if (classPack(getGame(), classUuid) !== pack || !pack.index.has(source?.id)
            || source?.uuid !== classUuid || source.type !== "class" || source.pack !== pack.collection) throw classUnavailable();
          if (ownedClassIdentifiers(actor).has(source.identifier)) throw new CommandError("STALE_ACTOR", changedMessage());
        };
        validate();
        const classData = getGame().items.fromCompendium(source);
        classData.system.levels = 1;
        return { validate, createManager: () => Manager.forNewItem(actor, classData),
          saveDirect: () => actor.createEmbeddedDocuments("Item", [classData]) };
      });
    }
  });
}
