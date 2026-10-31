import { ACTOR_COMMANDS } from "../../../kernel/command-names.mjs";
import { localizeFoundry } from "../../localization.mjs";
import { createFoundryQuickbarGateway as createNativeQuickbarGateway, QUICKBAR_SLOT_COUNT, QuickbarError } from "../../native-quickbar-gateway.mjs";

export { QUICKBAR_SLOT_COUNT, QuickbarError };

/** PF2e actor inventory items and statistics resolved over shared persistence. */
export function createPf2eQuickbarGateway(options = {}) {
  return createNativeQuickbarGateway({ ...options, systemAdapter: pf2eQuickbarAdapter });
}

export const createFoundryQuickbarGateway = createPf2eQuickbarGateway;

const pf2eQuickbarAdapter = Object.freeze({
  resolveDescriptor(actor, descriptor) {
    if (descriptor.kind === "item") {
      const item = getItem(actor, descriptor.itemId);
      return Object.freeze({
        ...descriptor,
        label: String(item?.name ?? descriptor.label),
        img: String(item?.img ?? descriptor.img ?? ""),
        itemType: String(item?.type ?? "item"),
        available: Boolean(item && typeof item.toMessage === "function"),
        command: ACTOR_COMMANDS.USE_ITEM,
        payload: Object.freeze({ itemId: descriptor.itemId, kind: "item" })
      });
    }
    const statistic = actor?.skills?.[descriptor.skill];
    return Object.freeze({
      ...descriptor,
      label: String(statistic?.label ?? descriptor.label),
      img: String(descriptor.img ?? ""),
      available: Boolean(statistic?.check && typeof statistic.check.roll === "function"),
      command: ACTOR_COMMANDS.ROLL_SKILL,
      payload: Object.freeze({ skill: descriptor.skill })
    });
  },
  assertDescriptorAvailable(actor, descriptor, _game, { QuickbarError: ErrorType }) {
    if (descriptor.kind === "item") {
      const item = getItem(actor, descriptor.itemId);
      if (!item || typeof item.toMessage !== "function") {
        throw new ErrorType("TARGET_MISSING", localizeFoundry("VEMOBILE.Interface.QuickbarGateway.ThatItemIsNoLongerAvailable", "That item is no longer available."));
      }
      return;
    }
    const statistic = actor?.skills?.[descriptor.skill];
    if (!statistic?.check || typeof statistic.check.roll !== "function") {
      throw new ErrorType("TARGET_MISSING", localizeFoundry("VEMOBILE.Interface.QuickbarGateway.ThatSkillIsNoLongerAvailable", "That skill is no longer available."));
    }
  }
});

function getItem(actor, itemId) {
  return actor?.items?.get?.(itemId) ?? collectionValues(actor?.items).find((item) => String(item?.id ?? "") === itemId) ?? null;
}

function collectionValues(collection) {
  if (!collection) return [];
  if (Array.isArray(collection.contents)) return collection.contents;
  try { return Array.from(collection); } catch { return []; }
}
