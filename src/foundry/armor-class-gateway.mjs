import { localizeFoundry } from "./localization.mjs";
import { resolveActorSource, validSourceUuid } from "./character-source.mjs";

/** Open D&D5e 5.3.3's own ArmorClassConfig for the exact represented Actor. */
export function createArmorClassGateway({
  getGame = () => globalThis.game,
  getConfigClass = () => globalThis.dnd5e?.applications?.actor?.ArmorClassConfig,
  getConnectionGeneration = () => 0,
  getMode = () => "desktop",
  resolve = (uuid, game) => resolveActorSource(uuid, { game })
} = {}) {
  const openApps = new Map();
  return Object.freeze({
    async open({ actorSourceUuid, worldId, userId, connectionGeneration } = {}) {
      const uuid = validSourceUuid(actorSourceUuid);
      const game = getGame();
      const currentSession = () => getGame() === game && game?.user?.id === userId && game?.world?.id === worldId
        && getConnectionGeneration() === connectionGeneration && ["phone", "tablet"].includes(getMode());
      if (!currentSession()) {
        throw new Error(localizeFoundry("VEMOBILE.Character.ArmorClassGateway.TheCharacterSessionChangedBeforeArmourClassCouldOpen", "The Character session changed before Armor Class could open."));
      }
      const actor = resolve(uuid, game);
      if (!actor || actor.uuid !== uuid || !["character", "npc"].includes(actor.type)
        || actor.testUserPermission?.(game.user, "OWNER") !== true) {
        throw new Error(localizeFoundry("VEMOBILE.Character.ArmorClassGateway.ThisActorSArmourClassIsUnavailableOrNo", "This Actor's Armor Class is unavailable or no longer editable."));
      }
      const Config = getConfigClass();
      if (typeof Config !== "function") throw new Error(localizeFoundry("VEMOBILE.Character.ArmorClassGateway.DDEArmourClassConfigurationIsUnavailable", "D&D5e Armor Class configuration is unavailable."));
      const existing = openApps.get(uuid);
      if (existing && existing.app?.document !== actor) {
        openApps.delete(uuid);
        await existing.app?.close?.();
        if (!currentSession() || resolve(uuid, game) !== actor || actor.testUserPermission?.(game.user, "OWNER") !== true) {
          throw new Error(localizeFoundry("VEMOBILE.Character.ArmorClassGateway.TheCharacterSessionChangedWhileArmourClassOpened", "The Character session changed while Armor Class opened."));
        }
      } else if (existing?.opening || existing?.app?.rendered) {
        existing.app.bringToFront?.();
        return Object.freeze({ ok: true, actorSourceUuid: uuid });
      }
      const app = new Config({ document: actor });
      const record = { app, opening: true };
      openApps.set(uuid, record);
      try { await app.render({ force: true }); record.opening = false; }
      catch (error) {
        if (openApps.get(uuid) === record) openApps.delete(uuid);
        throw error;
      }
      if (!currentSession() || resolve(uuid, game) !== actor || actor.testUserPermission?.(game.user, "OWNER") !== true) {
        await app.close?.();
        if (openApps.get(uuid) === record) openApps.delete(uuid);
        throw new Error(localizeFoundry("VEMOBILE.Character.ArmorClassGateway.TheCharacterSessionChangedWhileArmourClassOpened", "The Character session changed while Armor Class opened."));
      }
      return Object.freeze({ ok: true, actorSourceUuid: uuid });
    }
  });
}
