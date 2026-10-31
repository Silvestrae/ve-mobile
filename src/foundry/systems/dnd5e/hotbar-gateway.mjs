import { localizeFoundry } from "../../localization.mjs";
import { resolveActorSource, validSourceUuid } from "../../character-source.mjs";
import { createFoundryHotbarGateway as createNativeHotbarGateway, HotbarError } from "../../native-hotbar-gateway.mjs";

export { HotbarError };

/** D&D5e item macro behavior layered over the system-neutral native hotbar. */
export function createFoundryHotbarGateway(options = {}) {
  return createNativeHotbarGateway({ ...options, itemMacroAdapter: dnd5eItemMacroAdapter });
}

const dnd5eItemMacroAdapter = Object.freeze({
  resolve(game, request) {
    if (game?.system?.id !== "dnd5e") throw new HotbarError("CAPABILITY_UNAVAILABLE", localizeFoundry("VEMOBILE.Interface.HotbarGateway.ItemHotbarMacrosRequireDDE", "Item hotbar macros require D&D5e."));
    let source;
    try { source = validSourceUuid(request?.actorSourceUuid); }
    catch { throw new HotbarError("INVALID_INPUT", localizeFoundry("VEMOBILE.Interface.HotbarGateway.AValidCharacterIsRequired", "A valid character is required.")); }
    const actor = resolveActorSource(source, { game });
    if (!actor) throw new HotbarError("TARGET_MISSING", localizeFoundry("VEMOBILE.Interface.HotbarGateway.ThatCharacterIsNoLongerAvailable", "That character is no longer available."));
    let owned = false;
    try { owned = game.user.isGM || (typeof actor.testUserPermission === "function" ? actor.testUserPermission(game.user, "OWNER") : actor.isOwner === true); } catch {}
    if (!owned) throw new HotbarError("FORBIDDEN", localizeFoundry("VEMOBILE.Interface.HotbarGateway.YouNoLongerControlThatCharacter", "You no longer control that character."));
    const item = actor.items?.get?.(macroId(request?.itemId));
    if (!item || typeof item.use !== "function") throw new HotbarError("TARGET_MISSING", localizeFoundry("VEMOBILE.Interface.HotbarGateway.ThatItemIsNoLongerAvailable", "That item is no longer available."));
    const activity = request?.activityId ? item.system?.activities?.get?.(macroId(request.activityId)) : null;
    if (request?.activityId && (!activity?.canUse || typeof activity.use !== "function")) throw new HotbarError("TARGET_MISSING", localizeFoundry("VEMOBILE.Interface.HotbarGateway.ThatActivityIsNoLongerAvailable", "That activity is no longer available."));
    return { item, activity };
  },
  toMacroData({ item, activity }) {
    return {
      name: activity ? `${item.name}: ${activity.name}` : String(item.name),
      img: String(activity?.img ?? item.img ?? ""), type: "script", scope: "actor",
      command: `dnd5e.documents.macro.rollItem(${JSON.stringify(String(item._source?.name ?? item.name))}, {${activity ? ` activityName: ${JSON.stringify(String(activity._source?.name ?? activity.name))},` : ""} event })${activity ? ";" : ""}`,
      flags: { "dnd5e.itemMacro": true }
    };
  }
});

function macroId(value) {
  if (typeof value !== "string" || !value.trim() || value.length > 128) {
    throw new HotbarError("INVALID_INPUT", localizeFoundry("VEMOBILE.Interface.HotbarGateway.AValidMacroIDIsRequired", "A valid macro ID is required."));
  }
  return value;
}
