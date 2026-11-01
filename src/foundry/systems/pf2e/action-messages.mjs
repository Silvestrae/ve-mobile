import { speakerMatchesActor } from "../../character-source.mjs";

/** Apply PF2e's message visibility rules before an action card is shown. */
export function canRevealPf2eMessage(message, game = globalThis.game) {
  return message?.visible !== false && message?.isContentVisible !== false && (!message?.blind || game?.user?.isGM === true);
}
export function pf2eMessageReferencesItem(message, itemId) {
  // PF2e may expose the source Item as a prepared object or only as an origin UUID.
  const item = message?.item;
  if (String(item?.id ?? "") === String(itemId)) return true;
  const uuid = message?.flags?.pf2e?.origin?.uuid;
  return typeof uuid === "string" && uuid.endsWith(`.Item.${itemId}`);
}
export const pf2eActionMessages = Object.freeze({
  canReveal: canRevealPf2eMessage,
  originatingMessageId: message => String(message?.flags?.pf2e?.context?.origin?.messageId ?? ""),
  referencesItem: pf2eMessageReferencesItem,
  rootMatches(message, actor, item) {
    return speakerMatchesActor(message, actor) && pf2eMessageReferencesItem(message, item.id);
  },
    // Accept a PF2e action message only when its speaker, item, and initiating user match this request.
    acceptsAction(message, actor, item, _command, _payload, userId, initiatingUserId) {
    if (!canRevealPf2eMessage(message) || !speakerMatchesActor(message, actor)) return false;
    const author = String(message?.author?.id ?? message?.user?.id ?? message?.user ?? initiatingUserId ?? "");
    if (author !== String(userId)) return false;
    return item ? pf2eMessageReferencesItem(message, item.id) : Boolean(message?.rolls?.length);
  },
  watchItemUsage() { return Object.freeze({ pending: false, finish() {}, dispose() {} }); }
});
