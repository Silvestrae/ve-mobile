import { resolveActorSource, speakerMatchesActor } from "../../character-source.mjs";
import { canOwn } from "../../command-support.mjs";
import { canRevealPf2eMessage, pf2eMessageReferencesItem } from "./action-messages.mjs";

/** Host PF2e's rendered cards intact. renderHTML installs the system's own
 * strike/spell/damage/IWR/degree-of-success listeners and visibility filters. */
export function createPf2eActionSessionGateway({ getGame = () => globalThis.game } = {}) {
  return Object.freeze({ async mount(host, session, scope) {
    const game = getGame();
    const world = game?.world?.id;
    const user = game?.user?.id;
    const source = session?.actorSourceUuid || `Actor.${session?.actorId}`;
    const actor = resolveActorSource(source, { game });
    const ids = new Set([session?.rootMessageId, ...(session?.messageIds ?? [])].filter(Boolean));
    let queue = Promise.resolve();
    const current = () => !scope.disposed && getGame() === game && game.world?.id === world && game.user?.id === user
      && resolveActorSource(source, { game }) === actor && canOwn(actor, game.user);
    const belongs = message => speakerMatchesActor(message, actor)
      && pf2eMessageReferencesItem(message, session.itemId) && canRevealPf2eMessage(message, game);
    const render = async () => {
      if (!current()) { host.replaceChildren(); return; }
      const elements = [];
      for (const message of Array.from(game.messages ?? [])) {
        if (!ids.has(message.id) || !belongs(message)) continue;
        const element = await message.renderHTML();
        if (!current()) { host.replaceChildren(); return; }
        if (!belongs(message)) continue;
        const card = element?.jquery ? element[0] : element;
        if (card?.classList) { card.classList.add("ve-action-session-message"); elements.push(card); }
      }
      if (current()) host.replaceChildren(...elements);
    };
    const schedule = () => { queue = queue.then(render).catch(error => console.warn("VE Mobile | PF2e card rendering failed", error)); return queue; };
    host.classList.add("chat-popout", "themed", "pf2e");
    scope.own(() => host.replaceChildren());
    scope.hook("createChatMessage", message => {
      if (belongs(message)) { ids.add(message.id); void schedule(); }
    });
    for (const hook of ["updateChatMessage", "deleteChatMessage"]) scope.hook(hook, message => {
      if (ids.has(message.id)) void schedule();
    });
    for (const hook of ["updateActor", "deleteActor", "updateToken", "deleteToken", "updateUser"]) scope.hook(hook, () => { if (!current()) host.replaceChildren(); });
    await schedule();
    return Object.freeze({ ok: current() });
  } });
}
