import { localizeFoundry } from "./localization.mjs";
import { actorSourceUuid, resolveActorSource, validSourceUuid } from "./character-source.mjs";

/** Explicit native editing sessions are owned by mobile runtime, not by the
 * persistent Desktop sheet. Admission is instance-specific, never a selector
 * or an Actor-backed-application exception. Native systems enforce edits. */
export function createActorEditorGateway({ getGame = () => globalThis.game, isActive = () => false,
  getConnectionGeneration = () => 0 } = {}) {
  const sessions = new Map();
  const pending = new Set();
  const owners = new Set();
  const requireActor = (sourceUuid, expected, owner, original = null) => {
    const game = getGame();
    if (!owner || owner.disposed || !isActive() || !game?.ready || !game.user
      || (expected.worldId !== undefined && expected.worldId !== game.world?.id)
      || (expected.userId !== undefined && expected.userId !== game.user.id)
      || (expected.connectionGeneration !== undefined && expected.connectionGeneration !== getConnectionGeneration())) {
      throw new Error(localizeFoundry("VEMOBILE.Character.ActorEditorGateway.ThisNativeEditorSessionIsNoLongerActive", "This native editor session is no longer active."));
    }
    const actor = resolveActorSource(validSourceUuid(sourceUuid), { game });
    if (!actor || (original && actor !== original) || !["group", "vehicle"].includes(actor.type)
      || !actor.testUserPermission?.(game.user, "OWNER")) throw new Error(localizeFoundry("VEMOBILE.Character.ActorEditorGateway.ThisActorIsNoLongerEditable", "This actor is no longer editable."));
    return actor;
  };
  return Object.freeze({
    ownsApplication: application => sessions.has(application),
    closeAll: () => { for (const owner of [...owners]) owner.dispose(); },
    async open({ actorSourceUuid: sourceUuid }, expected = {}, owner) {
      const actor = requireActor(sourceUuid, expected, owner);
      if (pending.has(sourceUuid) || [...sessions.values()].some(session => session.sourceUuid === sourceUuid)) {
        throw new Error(localizeFoundry("VEMOBILE.Character.ActorEditorGateway.ThisNativeEditorIsAlreadyOpen", "This native editor is already open."));
      }
      pending.add(sourceUuid);
      const scope = owner.child("native-actor-editor");
      owners.add(scope);
      scope.own(() => owners.delete(scope));
      let application = null;
      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        if (application) sessions.delete(application);
        try { void Promise.resolve(application?.close?.()).catch(() => {}); } catch { /* preserve original failure */ }
      };
      scope.own(close);
      try {
        const assigned = actor.sheet;
        if (!assigned?.constructor || typeof assigned.render !== "function") throw new Error(localizeFoundry("VEMOBILE.Character.ActorEditorGateway.TheNativeActorEditorIsUnavailable", "The native Actor editor is unavailable."));
        application = assigned.isV2 === false
          ? new assigned.constructor(actor, { editable: true }) : new assigned.constructor({ document: actor });
        sessions.set(application, { sourceUuid: actorSourceUuid(actor) });
        for (const hook of ["closeApplication", "closeApplicationV2"]) scope.hook(hook, app => {
          if (app !== application) return;
          closed = true;
          sessions.delete(application);
          scope.dispose();
        });
        const revalidate = () => {
          try { requireActor(sourceUuid, expected, scope, actor); } catch { scope.dispose(); }
        };
        for (const hook of ["updateActor", "deleteActor", "updateUser", "deleteToken", "updateToken"]) scope.hook(hook, revalidate);
        requireActor(sourceUuid, expected, scope, actor);
        // Opening native access must not start editable rich-text controls:
        // some native sheets autosave normalized HTML on blur/close. Owners
        // can deliberately enter Edit using the native sheet's own control.
        const viewMode = application.constructor.MODES?.PLAY ?? application.constructor.MODES?.VIEW;
        try {
          if (assigned.isV2 === false) await Promise.resolve(application.render(true));
          else await Promise.resolve(application.render({ force: true, ...(viewMode === undefined ? {} : { mode: viewMode }) }));
        } finally {
          // Native rendering can finish after teardown closed the provisional
          // instance. Dispose any late native resources too, preserving errors.
          if (scope.disposed) {
            try { await Promise.resolve(application.close?.()); } catch { /* preserve render/cancellation error */ }
          }
        }
        requireActor(sourceUuid, expected, scope, actor);
        if (closed) throw new Error(localizeFoundry("VEMOBILE.Character.ActorEditorGateway.ThisNativeEditorWasClosedWhileOpening", "This native editor was closed while opening."));
        return Object.freeze({ actorSourceUuid: sourceUuid, opened: true });
      } catch (error) {
        scope.dispose();
        throw error;
      } finally { pending.delete(sourceUuid); }
    }
  });
}
