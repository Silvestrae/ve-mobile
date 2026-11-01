import { createFoundryHotbarGateway as createNativeHotbarGateway, HotbarError } from "../../native-hotbar-gateway.mjs";
import { resolveActorSource, validSourceUuid } from "../../character-source.mjs";
import { canOwn } from "../../command-support.mjs";
import { localizeFoundry } from "../../localization.mjs";

export { HotbarError };
/** PF2e hotbar adapter for reading and executing the user's native hotbar slots. */
export function createPf2eHotbarGateway(options = {}) {
  return createNativeHotbarGateway({ ...options, itemMacroAdapter: pf2eItemMacroAdapter });
}
export const createFoundryHotbarGateway = createPf2eHotbarGateway;

// Return the standard capability error for an unavailable PF2e hotbar action.
const unavailable = () => { throw new HotbarError("CAPABILITY_UNAVAILABLE", localizeFoundry("VEMOBILE.PF2E.Unavailable", "This PF2e action is unavailable.")); };
const pf2eItemMacroAdapter = Object.freeze({
    // Resolve the requested PF2e item source against the current Actor and world collections.
    resolve(game, request) {
    if (game?.system?.id !== "pf2e" || typeof game?.pf2e?.rollItemMacro !== "function" || request?.activityId) unavailable();
    let source;
    try { source = validSourceUuid(request?.actorSourceUuid); } catch { unavailable(); }
    const actor = resolveActorSource(source, { game });
    if (!actor || !canOwn(actor, game.user)) throw new HotbarError("FORBIDDEN", localizeFoundry("VEMOBILE.Interface.QuickbarGateway.YouNoLongerControlThatActor", "You no longer control that actor."));
    const item = actor.items?.get?.(request?.itemId);
    if (!item || typeof item.toMessage !== "function" || item.uuid !== `${source}.Item.${item.id}`) unavailable();
    return { item, source };
  },
    // Build the native PF2e item-use Macro data for the resolved item source.
    toMacroData({ item, source }) {
    const uuid = JSON.stringify(String(item.uuid));
    const actorUuid = JSON.stringify(source);
    const denied = JSON.stringify(localizeFoundry("VEMOBILE.Interface.QuickbarGateway.YouNoLongerControlThatActor", "You no longer control that actor."));
    return { name: String(item.name), img: String(item.img ?? ""), type: "script", scope: "actor",
      command: `const worldId = game.world.id;\nconst userId = game.user.id;\nconst item = await fromUuid(${uuid});\nif (game.world.id !== worldId || game.user.id !== userId || item?.actor?.uuid !== ${actorUuid} || !item.actor.testUserPermission(game.user, "OWNER")) throw new Error(${denied});\nreturn game.pf2e.rollItemMacro(${uuid}, event);`,
      flags: { pf2e: { itemMacro: true } } };
  }
});
