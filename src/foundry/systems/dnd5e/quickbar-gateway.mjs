import { ACTOR_COMMANDS } from "../../../kernel/command-names.mjs";
import { localizeFoundry } from "../../localization.mjs";
import { createFoundryQuickbarGateway as createNativeQuickbarGateway, QUICKBAR_SLOT_COUNT, QuickbarError } from "../../native-quickbar-gateway.mjs";

export { QUICKBAR_SLOT_COUNT, QuickbarError };

/** D&D5e item/activity and skill resolution over shared Quickbar persistence. */
export function createFoundryQuickbarGateway(options = {}) {
  return createNativeQuickbarGateway({ ...options, systemAdapter: dnd5eQuickbarAdapter });
}

const dnd5eQuickbarAdapter = Object.freeze({
  resolveDescriptor(actor, descriptor, game, config) {
    if (descriptor.kind === "item") {
      const item = getItem(actor, descriptor.itemId);
      const activity = descriptor.activityId ? getActivity(item, descriptor.activityId) : null;
      return Object.freeze({
        ...descriptor,
        label: String(item?.name ?? descriptor.label),
        img: String(item?.img ?? descriptor.img ?? ""),
        itemType: String(item?.type ?? "item"),
        available: Boolean(item && typeof item.use === "function" && (!descriptor.activityId || usableActivity(activity))),
        command: ACTOR_COMMANDS.USE_ITEM,
        payload: Object.freeze({ itemId: descriptor.itemId, ...(descriptor.activityId ? { activityId: descriptor.activityId } : {}) })
      });
    }
    const skill = actor.system?.skills?.[descriptor.skill];
    const definition = config?.DND5E?.skills?.[descriptor.skill];
    const localized = definition?.label && typeof game?.i18n?.localize === "function" ? game.i18n.localize(definition.label) : "";
    return Object.freeze({
      ...descriptor,
      label: String(localized || skill?.label || descriptor.label),
      img: String(descriptor.img ?? ""),
      available: Boolean(skill && typeof actor.rollSkill === "function"),
      command: ACTOR_COMMANDS.ROLL_SKILL,
      payload: Object.freeze({ skill: descriptor.skill })
    });
  },
  assertDescriptorAvailable(actor, descriptor, _game, { QuickbarError: ErrorType }) {
    if (descriptor.kind === "item") {
      const item = getItem(actor, descriptor.itemId);
      const activity = descriptor.activityId ? getActivity(item, descriptor.activityId) : null;
      if (!item || typeof item.use !== "function" || (descriptor.activityId && !usableActivity(activity))) {
        throw new ErrorType("TARGET_MISSING", localizeFoundry("VEMOBILE.Interface.QuickbarGateway.ThatItemOrActivityIsNoLongerAvailable", "That item or activity is no longer available."));
      }
      return;
    }
    if (!actor.system?.skills?.[descriptor.skill] || typeof actor.rollSkill !== "function") {
      throw new ErrorType("TARGET_MISSING", localizeFoundry("VEMOBILE.Interface.QuickbarGateway.ThatSkillIsNoLongerAvailable", "That skill is no longer available."));
    }
  }
});

function getItem(actor, itemId) {
  return actor?.items?.get?.(itemId) ?? collectionValues(actor?.items).find((item) => String(item?.id ?? "") === itemId) ?? null;
}

function getActivity(item, activityId) {
  return item?.system?.activities?.get?.(activityId) ?? collectionValues(item?.system?.activities).find((activity) => String(activity?.id ?? "") === activityId) ?? null;
}

function usableActivity(activity) {
  return Boolean(activity?.canUse && typeof activity.use === "function");
}

function collectionValues(collection) {
  if (!collection) return [];
  if (Array.isArray(collection.contents)) return collection.contents;
  try { return Array.from(collection); } catch { return []; }
}
