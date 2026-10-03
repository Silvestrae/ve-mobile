import { localizeFoundry } from "./localization.mjs";
import { ACTOR_COMMANDS } from "../kernel/command-names.mjs";
import { MODULE_ID } from "./preferences.mjs";
import { resolveActorSource, validSourceUuid } from "./character-source.mjs";
import { ACTION_BAR_SLOT_COUNT } from "../kernel/action-bar-model.mjs";

export const QUICKBAR_SLOT_COUNT = ACTION_BAR_SLOT_COUNT;
const QUICKBAR_FLAG = "quickbar";
const QUICKBAR_VERSION = 2;

export class QuickbarError extends Error {
  constructor(code, message, options = {}) {
    super(message, options);
    this.name = "QuickbarError";
    this.code = code;
  }
}

/** Actor-flag persistence and live descriptor resolution for the VE Quickbar. */
export function createFoundryQuickbarGateway({
  getGame = () => globalThis.game,
  getConfig = () => globalThis.CONFIG,
  isActive = () => false,
  moduleId = MODULE_ID
} = {}) {
  const pendingWrites = new Set();
  const persist = async (actor, slots) => {
    const key = actor.uuid ?? actor.id;
    if (pendingWrites.has(key)) throw new QuickbarError("BUSY", localizeFoundry("VEMOBILE.Interface.QuickbarGateway.ThisQuickbarIsAlreadyBeingSaved", "This Quickbar is already being saved."));
    pendingWrites.add(key);
    try { await actor.setFlag(moduleId, QUICKBAR_FLAG, flagValue(slots)); }
    finally { pendingWrites.delete(key); }
  };
  const snapshotForActor = (actor, user = getGame()?.user) => {
    if (!actor || !canOwn(actor, user)) return emptyQuickbar();
    const descriptors = readDescriptors(actor, moduleId);
    return Object.freeze(descriptors.map((descriptor) => resolveDescriptor(actor, descriptor, getGame(), getConfig())));
  };

  const resolveActor = (actorSourceUuid, expectedSession) => {
    if (!isActive()) throw new QuickbarError("INACTIVE", localizeFoundry("VEMOBILE.Interface.HotbarGateway.MobileModeIsNotActive", "Mobile mode is not active."));
    const game = getGame();
    assertSession(game, expectedSession);
    let sourceUuid;
    try { sourceUuid = validSourceUuid(actorSourceUuid); }
    catch (error) { throw new QuickbarError("INVALID_INPUT", error.message, { cause: error }); }
    const actor = resolveActorSource(sourceUuid, { game });
    if (!actor) throw new QuickbarError("TARGET_MISSING", localizeFoundry("VEMOBILE.Interface.QuickbarGateway.ThatActorIsNoLongerAvailable", "That actor is no longer available."));
    if (!canOwn(actor, game.user)) throw new QuickbarError("FORBIDDEN", localizeFoundry("VEMOBILE.Interface.QuickbarGateway.YouNoLongerControlThatActor", "You no longer control that actor."));
    if (typeof actor.setFlag !== "function") throw new QuickbarError("CAPABILITY_UNAVAILABLE", localizeFoundry("VEMOBILE.Interface.QuickbarGateway.ThisActorCannotSaveAQuickbar", "This actor cannot save a Quickbar."));
    return { actor, game };
  };

  return Object.freeze({
    snapshotForActor,

    async add(request, expectedSession = {}) {
      const { actor, game } = resolveActor(request?.actorSourceUuid || (request?.actorId ? `Actor.${request.actorId}` : ""), expectedSession);
      const descriptor = descriptorForWrite(request?.descriptor);
      assertDescriptorAvailable(actor, descriptor, game);
      const slots = readDescriptors(actor, moduleId);
      const index = slots.findIndex((slot) => !slot);
      if (index < 0) throw new QuickbarError("QUICKBAR_FULL", localizeFoundry("VEMOBILE.Interface.QuickbarGateway.QuickbarFull", "Quickbar full"));
      slots[index] = descriptor;
      await persist(actor, slots);
      return Object.freeze({ ok: true, index, slots: snapshotForActor(actor, game.user) });
    },

    async save(request, expectedSession = {}) {
      const { actor, game } = resolveActor(request?.actorSourceUuid || (request?.actorId ? `Actor.${request.actorId}` : ""), expectedSession);
      if (!Array.isArray(request?.slots) || request.slots.length !== QUICKBAR_SLOT_COUNT) {
        throw new QuickbarError("INVALID_INPUT", localizeFoundry("VEMOBILE.Interface.QuickbarGateway.QuickbarMustContainExactlySlots", "Quickbar must contain exactly {QUICKBARSLOTCOUNT} slots.", { QUICKBARSLOTCOUNT: (QUICKBAR_SLOT_COUNT) }));
      }
      const slots = request.slots.map((slot) => slot ? descriptorForWrite(slot) : null);
      if (request.expectedSlots && descriptorSignature(readDescriptors(actor, moduleId)) !== descriptorSignature(request.expectedSlots)) {
        throw new QuickbarError("STALE_SLOTS", localizeFoundry("VEMOBILE.Interface.QuickbarGateway.ThisQuickbarChangedWhileYouWereEditingReopenIt", "This Quickbar changed while you were editing. Reopen it and try again."));
      }
      await persist(actor, slots);
      return Object.freeze({ ok: true, slots: snapshotForActor(actor, game.user) });
    }
  });
}

function emptyQuickbar() {
  return Object.freeze(Array.from({ length: QUICKBAR_SLOT_COUNT }, () => null));
}

function descriptorSignature(slots) {
  return JSON.stringify(slots.map((slot) => !slot ? null : slot.kind === "skill"
    ? [slot.kind, slot.skill] : [slot.kind, slot.itemId, slot.activityId ?? ""]));
}

function flagValue(slots) {
  return { version: QUICKBAR_VERSION, slots: slots.map((slot) => slot ? { ...slot } : null) };
}

function readDescriptors(actor, moduleId) {
  let value;
  try {
    value = actor.getFlag?.(moduleId, QUICKBAR_FLAG) ?? actor.flags?.[moduleId]?.[QUICKBAR_FLAG];
  } catch {
    value = null;
  }
  // Legacy arrays and v1's 13 slots retain their exact offsets. Reading is
  // side-effect free; only an explicit add/save stores the expanded v2 flag.
  const source = Array.isArray(value) ? value : [1, QUICKBAR_VERSION].includes(value?.version) && Array.isArray(value.slots) ? value.slots : [];
  return Array.from({ length: QUICKBAR_SLOT_COUNT }, (_, index) => {
    try {
      return source[index] ? descriptorForWrite(source[index]) : null;
    } catch {
      return null;
    }
  });
}

function descriptorForWrite(value) {
  const kind = String(value?.kind ?? "");
  const label = text(value?.label, "label", 100);
  const img = optionalText(value?.img, 1000);
  if (kind === "item") {
    const itemId = identifier(value?.itemId, "itemId");
    const activityId = optionalIdentifier(value?.activityId);
    return Object.freeze({ kind, itemId, ...(activityId ? { activityId } : {}), label, ...(img ? { img } : {}) });
  }
  if (kind === "skill") {
    const skill = key(value?.skill, "skill");
    return Object.freeze({ kind, skill, label, ...(img ? { img } : {}) });
  }
  throw new QuickbarError("INVALID_INPUT", localizeFoundry("VEMOBILE.Interface.QuickbarGateway.ThatActionTypeCannotBePlacedOnTheQuickbar", "That action type cannot be placed on the Quickbar."));
}

function resolveDescriptor(actor, descriptor, game, config) {
  if (!descriptor) return null;
  if (descriptor.kind === "item") {
    const item = actor.items?.get?.(descriptor.itemId)
      ?? collectionValues(actor.items).find((candidate) => String(candidate?.id ?? "") === descriptor.itemId);
    return Object.freeze({
      ...descriptor,
      label: String(item?.name ?? descriptor.label),
      img: String(item?.img ?? descriptor.img ?? ""),
      itemType: String(item?.type ?? "item"),
      available: Boolean(item && typeof item.use === "function" && (!descriptor.activityId || usableActivity(item, descriptor.activityId))),
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
}

function assertDescriptorAvailable(actor, descriptor) {
  if (descriptor.kind === "item") {
    const item = actor.items?.get?.(descriptor.itemId)
      ?? collectionValues(actor.items).find((candidate) => String(candidate?.id ?? "") === descriptor.itemId);
    if (!item || typeof item.use !== "function" || (descriptor.activityId && !usableActivity(item, descriptor.activityId))) {
      throw new QuickbarError("TARGET_MISSING", localizeFoundry("VEMOBILE.Interface.QuickbarGateway.ThatItemOrActivityIsNoLongerAvailable", "That item or activity is no longer available."));
    }
    return;
  }
  if (!actor.system?.skills?.[descriptor.skill] || typeof actor.rollSkill !== "function") {
    throw new QuickbarError("TARGET_MISSING", localizeFoundry("VEMOBILE.Interface.QuickbarGateway.ThatSkillIsNoLongerAvailable", "That skill is no longer available."));
  }
}

function usableActivity(item, activityId) {
  const activity = item?.system?.activities?.get?.(activityId)
    ?? collectionValues(item?.system?.activities).find((candidate) => String(candidate?.id ?? "") === activityId);
  return Boolean(activity?.canUse && typeof activity.use === "function");
}

function canOwn(actor, user) {
  if (!actor || !user) return false;
  try {
    if (user.isGM) return true;
    if (typeof actor.testUserPermission === "function") return actor.testUserPermission(user, "OWNER");
    return Boolean(actor.isOwner);
  } catch {
    return false;
  }
}

function assertSession(game, expected) {
  if (expected.worldId && game?.world?.id !== expected.worldId) throw new QuickbarError("STALE_SESSION", localizeFoundry("VEMOBILE.Interface.HotbarGateway.TheActiveWorldChanged", "The active world changed."));
  if (expected.userId && game?.user?.id !== expected.userId) throw new QuickbarError("STALE_SESSION", localizeFoundry("VEMOBILE.Interface.HotbarGateway.TheActiveUserChanged", "The active user changed."));
}

function identifier(value, field) {
  const normalized = String(value ?? "").trim();
  if (!/^[A-Za-z0-9_-]{1,128}$/u.test(normalized)) throw new QuickbarError("INVALID_INPUT", localizeFoundry("VEMOBILE.Interface.CharacterSource.IsInvalid", "{field} is invalid.", { field: (field) }));
  return normalized;
}

function optionalIdentifier(value) {
  const normalized = String(value ?? "").trim();
  return normalized ? identifier(normalized, "activityId") : "";
}

function key(value, field) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!/^[a-z0-9_-]{1,32}$/u.test(normalized)) throw new QuickbarError("INVALID_INPUT", localizeFoundry("VEMOBILE.Interface.CharacterSource.IsInvalid", "{field} is invalid.", { field: (field) }));
  return normalized;
}

function text(value, field, maximum) {
  const normalized = String(value ?? "").trim();
  if (!normalized || normalized.length > maximum) throw new QuickbarError("INVALID_INPUT", localizeFoundry("VEMOBILE.Interface.CharacterSource.IsInvalid", "{field} is invalid.", { field: (field) }));
  return normalized;
}

function optionalText(value, maximum) {
  const normalized = String(value ?? "").trim();
  return normalized.length <= maximum ? normalized : "";
}

function collectionValues(collection) {
  if (!collection) return [];
  if (Array.isArray(collection.contents)) return collection.contents;
  try {
    return Array.from(collection);
  } catch {
    return [];
  }
}
