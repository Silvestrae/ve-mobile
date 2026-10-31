import { ACTOR_COMMANDS } from "../../../kernel/command-names.mjs";
import { actorSourceUuid, speakerMatchesActor } from "../../character-source.mjs";
import { readDnd5eMessageItem, readDnd5eMessageRoll, readDnd5eMessageOriginId } from "./dnd5e-message-reference.mjs";

export const dnd5eActionMessages = Object.freeze({
  originatingMessageId: readDnd5eMessageOriginId,
  referencesItem: messageReferencesItem,
  acceptsAction: isAcceptedActionMessage,
  watchItemUsage: watchTemplateUsage
});

function watchTemplateUsage(hooks, actor, item, onReady) {
  const usages = new Map();
  const matches = (activity) => activity?.item?.id === item.id
    && actorSourceUuid(activity.actor ?? activity.item.actor) === actorSourceUuid(actor);
  const registrations = [];
  const register = (name, listener) => {
    const id = hooks?.on?.(name, listener);
    if (id !== undefined && id !== null) registrations.push([name, id]);
  };
  register("dnd5e.preUseActivity", (activity, config) => {
    if (matches(activity)) usages.set(activity.id, config);
  });
  register("dnd5e.postUseActivity", (activity, _config, results) => {
    if (!matches(activity)) return;
    usages.delete(activity.id);
    onReady(results);
  });
  return Object.freeze({
    get pending() { return [...usages.values()].some((config) => config?.create?.measuredTemplate === true); },
    finish() { usages.clear(); },
    dispose() { for (const [name, id] of registrations.splice(0)) hooks?.off?.(name, id); usages.clear(); }
  });
}

function messageAuthorId(message) {
  return String(message?.author?.id ?? message?.user?.id ?? message?._source?.author ?? message?._source?.user ?? "");
}

function messageReferencesItem(message, itemId) {
  const reference = readDnd5eMessageItem(message);
  const id = String(reference?.id ?? "");
  const uuid = String(reference?.uuid ?? "");
  const expected = String(itemId ?? "");
  return id === expected || uuid.endsWith(`.Item.${expected}`);
}

/** Strict provenance for navigation. Summary-card discovery may deliberately
 * accept looser integration formats; those never grant navigation authority. */

function isAcceptedActionMessage(message, actor, item, command, payload, userId, initiatingUserId) {
  if (!speakerMatchesActor(message, actor)) return false;
  const tokenSource = String(payload?.actorSourceUuid ?? "").match(/^Scene\.([^.]+)\.Token\.([^.]+)$/u);
  const speaker = message?.speaker ?? message?._source?.speaker ?? {};
  if (tokenSource && (String(speaker.scene ?? "") !== tokenSource[1] || String(speaker.token ?? "") !== tokenSource[2])) return false;
  const author = messageAuthorId(message);
  if (initiatingUserId ? String(initiatingUserId) !== String(userId) : author !== String(userId)) return false;
  if (author && author !== String(userId)) return false;
  if (item) return messageReferencesItem(message, item.id);
  const roll = readDnd5eMessageRoll(message);
  const type = String(roll.type ?? "");
  switch (command) {
    case ACTOR_COMMANDS.ROLL_ABILITY: return type === "ability" && String(roll.ability ?? "") === String(payload.ability ?? "");
    case ACTOR_COMMANDS.ROLL_SAVE: return type === "save" && String(roll.ability ?? "") === String(payload.ability ?? "");
    case ACTOR_COMMANDS.ROLL_SKILL: return type === "skill" && String(roll.skill ?? "") === String(payload.skill ?? "");
    case ACTOR_COMMANDS.ROLL_TOOL: return type === "tool" && String(roll.tool ?? "") === String(payload.tool ?? "");
    case ACTOR_COMMANDS.ROLL_INITIATIVE: return type === "initiative";
    case ACTOR_COMMANDS.ROLL_DEATH_SAVE: return type === "death";
    default: return false;
  }
}
