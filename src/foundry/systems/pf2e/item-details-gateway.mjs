import { resolveActorSource, validSourceUuid } from "../../character-source.mjs";
import { CommandError, assertSession, identifier } from "../../command-support.mjs";
import { localizeFoundry } from "../../localization.mjs";

/** Read the user-visible PF2e item summary without returning the native document. */
export function createPf2eItemDetailsGateway({ getGame = () => globalThis.game, getConnectionGeneration = () => 0,
  getEditor = () => globalThis.CONFIG?.ux?.TextEditor } = {}) {
  const unavailable = () => { throw new CommandError("CAPABILITY_UNAVAILABLE", localizeFoundry("VEMOBILE.PF2E.NativeEditorRequired", "Use the native PF2e sheet for this operation.")); };

  return Object.freeze({
    async read({ actorSourceUuid, itemId }, expected = {}) {
      const game = getGame();
      assertSession(game, expected, getConnectionGeneration);
      const worldId = game.world.id;
      const userId = game.user.id;
      const generation = getConnectionGeneration();
      const source = validSourceUuid(actorSourceUuid);
      const id = identifier(itemId, "itemId");
      const actor = resolveActorSource(source, { game });
      const resolveItem = () => actor?.items?.get?.(id) ?? null;
      const canRead = () => actor && resolveActorSource(source, { game }) === actor
        && actor.testUserPermission?.(game.user, "OWNER") === true;
      const item = resolveItem();
      if (!canRead() || !item || item.actor !== actor) unavailable();

      const signature = itemSignature(item);
      const editor = getEditor();
      if (typeof editor?.enrichHTML !== "function" || typeof item.getChatData !== "function") unavailable();

      // PF2e's getChatData -> getDescription pipeline performs native
      // enrichment and respects the current user's secret visibility. It also
      // returns description.gm for GMs, so the public result below only takes
      // description.value and never serializes the whole chat-data object.
      // Match ActorSheetPF2e's item-summary call. PF2e supplies its own item
      // roll data; merging actor.getRollData() into it tries to assign native
      // read-only document properties (including Actor.items).
      const chatData = await item.getChatData({ secrets: true });

      assertSession(getGame(), expected, getConnectionGeneration);
      const sessionCurrent = getGame() === game && game.world?.id === worldId
        && game.user?.id === userId && getConnectionGeneration() === generation;
      if (!sessionCurrent || !canRead()) {
        throw new CommandError("STALE_VALUE", localizeFoundry("VEMOBILE.PF2E.ItemDetailsChanged", "This item is no longer available. Refresh and try again."));
      }
      const current = resolveItem();
      if (current !== item || current.actor !== actor || itemSignature(current) !== signature) {
        throw new CommandError("STALE_VALUE", localizeFoundry("VEMOBILE.PF2E.ItemDetailsChanged", "This item changed while its details were loading. Refresh and try again."));
      }

      const description = chatData?.description?.value;
      // The native item summary hides its entire trait row for unidentified
      // physical items. PF2e marks some traits as excluded as well; preserve
      // both parts of that visibility contract.
      const showTraits = game.user.isGM === true || item.isOfType?.("physical") !== true || item.isIdentified !== false;
      const traits = showTraits && Array.isArray(chatData?.traits)
        ? chatData.traits.filter(trait => typeof trait?.label === "string" && trait.label.trim())
          .filter(trait => trait.excluded !== true)
          .map(trait => Object.freeze({ label: trait.label }))
        : [];
      return Object.freeze({
        actorSourceUuid: source,
        itemId: id,
        name: String(item.name ?? ""),
        img: String(item.img ?? ""),
        type: String(item.type ?? ""),
        html: typeof description === "string" ? description : "",
        traits: Object.freeze(traits)
      });
    }
  });
}

function itemSignature(item) {
  try {
    return JSON.stringify(item._source ?? (typeof item.toObject === "function" ? item.toObject() : {
      id: item.id,
      uuid: item.uuid,
      type: item.type,
      name: item.name,
      img: item.img,
      system: item.system
    }));
  } catch {
    return "";
  }
}
