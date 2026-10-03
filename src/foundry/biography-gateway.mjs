import { localizeFoundry } from "./localization.mjs";
import { resolveActorSource, validSourceUuid } from "./character-source.mjs";

const INLINE_ROLL_MODES = new Set(["roll", "gmroll", "blindroll", "selfroll", "publicroll"]);
const ENCODED_MARKUP = /&lt;\/?(?:p|div|br|ul|ol|li|h[1-6]|blockquote|strong|b|em|i|a|img|section)\b[^&]*&gt;/iu;

/** Exact-source asynchronous rich-text boundary for the Character Biography page. */
export function createFoundryBiographyGateway({
  getGame = () => globalThis.game,
  getConnectionGeneration = () => 0,
  getTextEditor = () => globalThis.CONFIG?.ux?.TextEditor
    ?? globalThis.TextEditor?.implementation
    ?? globalThis.foundry?.applications?.ux?.TextEditor?.implementation,
  getCleanHtml = () => globalThis.foundry?.utils?.cleanHTML,
  getRollClass = () => globalThis.Roll,
  getChatMessageClass = () => globalThis.foundry?.utils?.getDocumentClass?.("ChatMessage")
    ?? globalThis.ChatMessage?.implementation
    ?? globalThis.ChatMessage
} = {}) {
  return Object.freeze({
    async read({ actorSourceUuid }, expectedSession = {}) {
      const game = getGame();
      assertSession(game, expectedSession, getConnectionGeneration);
      const sourceUuid = exactSourceUuid(actorSourceUuid);
      const actor = requireReadableActor(sourceUuid, game);
      const owner = canOwn(actor, game.user);
      const editField = selectBiographyField(actor, { owner, isGM: Boolean(game.user?.isGM) });
      const source = biographySource(actor, editField);
      const editor = getTextEditor();
      if (typeof editor?.enrichHTML !== "function") throw new Error(localizeFoundry("VEMOBILE.Character.BiographyGateway.FoundryRichTextEnrichmentIsUnavailable", "Foundry rich-text enrichment is unavailable."));
      const normalized = normalizeLegacyBiography(source, {
        decodeHTML: (value) => editor.decodeHTML(value),
        cleanHTML: getCleanHtml()
      });
      const rollData = actor.type !== "group" && typeof actor.getRollData === "function" ? actor.getRollData() : {};
      const html = String(await editor.enrichHTML(normalized.content, {
        secrets: owner,
        documents: true,
        links: true,
        embeds: true,
        rolls: true,
        custom: true,
        relativeTo: actor,
        rollData
      }));
      assertSession(game, expectedSession, getConnectionGeneration);
      const current = resolveActorSource(sourceUuid, { game });
      if (!current || current !== actor || !canRead(current, game.user)) throw new Error(localizeFoundry("VEMOBILE.Character.BiographyGateway.TheSelectedActorIsNoLongerAvailable", "The selected actor is no longer available."));
      const currentOwner = canOwn(current, game.user);
      const currentField = selectBiographyField(current, { owner: currentOwner, isGM: Boolean(game.user?.isGM) });
      const currentSource = biographySource(current, currentField);
      if (currentSource !== source || currentField !== editField || currentOwner !== owner) throw new Error(localizeFoundry("VEMOBILE.Character.BiographyGateway.TheBiographyChangedWhileItWasLoading", "The biography changed while it was loading."));
      return Object.freeze({
        actorSourceUuid: sourceUuid,
        html,
        owner,
        editable: ["character", "npc"].includes(current.type) && owner && typeof current.update === "function",
        editField: owner ? editField : "",
        editorText: owner ? normalized.content : "",
        originalSource: owner ? source : "",
        normalizedLegacy: normalized.normalizedLegacy,
        inlineRollsInteractive: owner && current.type !== "group"
      });
    },

    async roll({ actorSourceUuid, formula, mode = "roll", flavor = "" }, expectedSession = {}) {
      const game = getGame();
      assertSession(game, expectedSession, getConnectionGeneration);
      const sourceUuid = exactSourceUuid(actorSourceUuid);
      const actor = resolveActorSource(sourceUuid, { game });
      if (!actor) throw new Error(localizeFoundry("VEMOBILE.Character.BiographyGateway.TheSelectedActorIsNoLongerAvailable", "The selected actor is no longer available."));
      if (actor.type === "group") throw new Error(localizeFoundry("VEMOBILE.Character.BiographyGateway.GroupRollsRequireTheNativeGroupWorkflow", "Group rolls require the native Group workflow."));
      if (!canOwn(actor, game.user)) throw new Error(localizeFoundry("VEMOBILE.Character.BiographyGateway.YouNoLongerHavePermissionToRollForThis", "You no longer have permission to roll for this actor."));
      const expression = String(formula ?? "").trim();
      const rollMode = String(mode ?? "roll").toLowerCase();
      if (!expression || expression.length > 1000 || !INLINE_ROLL_MODES.has(rollMode)) throw new Error(localizeFoundry("VEMOBILE.Character.BiographyGateway.ThisInlineRollIsInvalid", "This inline roll is invalid."));
      const RollClass = getRollClass();
      const ChatMessageClass = getChatMessageClass();
      if (typeof RollClass?.create !== "function" || typeof ChatMessageClass?.getSpeaker !== "function") {
        throw new Error(localizeFoundry("VEMOBILE.Character.BiographyGateway.FoundrySInlineRollPipelineIsUnavailable", "Foundry's inline-roll pipeline is unavailable."));
      }
      const speaker = ChatMessageClass.getSpeaker({ actor, user: game.user });
      const roll = RollClass.create(expression, typeof actor.getRollData === "function" ? actor.getRollData() : {});
      const output = await roll.toMessage({ flavor: String(flavor ?? "").slice(0, 500), speaker }, { rollMode });
      assertSession(game, expectedSession, getConnectionGeneration);
      const current = resolveActorSource(sourceUuid, { game });
      if (!current) throw new Error(localizeFoundry("VEMOBILE.Character.BiographyGateway.TheSelectedActorIsNoLongerAvailable", "The selected actor is no longer available."));
      if (!canOwn(current, game.user)) throw new Error(localizeFoundry("VEMOBILE.Character.BiographyGateway.YouNoLongerHavePermissionToRollForThis", "You no longer have permission to roll for this actor."));
      return Object.freeze({ ok: true, actorSourceUuid: sourceUuid, messageId: String(output?.id ?? "") });
    }
  });
}

/** Preserve production NPC visibility while keeping Character biographies complete. */
export function selectBiographySource(actor, { owner = false, isGM = false } = {}) {
  const field = selectBiographyField(actor, { owner, isGM });
  return String(actor?.system?.details?.biography?.[field] ?? "");
}

/** Identify the exact D&D5e biography leaf currently presented to this user. */
export function selectBiographyField(actor, { owner = false, isGM = false } = {}) {
  if (actor?.type === "group") return "full";
  const biography = actor?.system?.details?.biography ?? {};
  if (actor?.type !== "npc") return "value";
  if (owner || isGM) return String(biography.value ?? "") ? "value" : "public";
  return "public";
}

function biographySource(actor, field) {
  return String((actor?.type === "group" ? actor.system?.description?.[field] : actor?.system?.details?.biography?.[field]) ?? "");
}

/** Decode only one likely legacy markup layer, then clean exactly that introduced HTML. */
export function normalizeLegacyBiography(content, { decodeHTML, cleanHTML } = {}) {
  const source = String(content ?? "");
  if (!ENCODED_MARKUP.test(source)) return Object.freeze({ content: source, normalizedLegacy: false });
  if (typeof decodeHTML !== "function" || typeof cleanHTML !== "function") {
    throw new Error(localizeFoundry("VEMOBILE.Character.BiographyGateway.FoundryHTMLCleaningIsUnavailableForLegacyBiographyContent", "Foundry HTML cleaning is unavailable for legacy biography content."));
  }
  const decoded = String(decodeHTML(source));
  return Object.freeze({ content: String(cleanHTML(decoded)), normalizedLegacy: true });
}

function exactSourceUuid(value) {
  try {
    return validSourceUuid(value);
  } catch (error) {
    throw new Error(error?.message ?? localizeFoundry("VEMOBILE.Character.BiographyGateway.AValidActorSourceIsRequired", "A valid actor source is required."));
  }
}

function requireReadableActor(sourceUuid, game) {
  const actor = resolveActorSource(sourceUuid, { game });
  if (!actor) throw new Error(localizeFoundry("VEMOBILE.Character.BiographyGateway.TheSelectedActorIsNoLongerAvailable", "The selected actor is no longer available."));
  if (!canRead(actor, game.user)) throw new Error(localizeFoundry("VEMOBILE.Character.BiographyGateway.YouNoLongerHavePermissionToViewThisActor", "You no longer have permission to view this actor."));
  return actor;
}

function canRead(actor, user) {
  if (actor?.type === "npc" && user?.isGM) return true;
  try {
    return actor?.testUserPermission?.(user, "OBSERVER") ?? Boolean(actor?.visible || actor?.isOwner);
  } catch {
    return false;
  }
}

function canOwn(actor, user) {
  try {
    return actor?.testUserPermission?.(user, "OWNER") ?? Boolean(actor?.isOwner);
  } catch {
    return false;
  }
}

function assertSession(game, expected, getConnectionGeneration) {
  if (!game?.user || !game?.world) throw new Error(localizeFoundry("VEMOBILE.Character.BiographyGateway.TheFoundrySessionIsNotReady", "The Foundry session is not ready."));
  if (expected.worldId && expected.worldId !== game.world.id) throw new Error(localizeFoundry("VEMOBILE.Character.BiographyGateway.TheActiveFoundryWorldHasChanged", "The active Foundry world has changed."));
  if (expected.userId && expected.userId !== game.user.id) throw new Error(localizeFoundry("VEMOBILE.Character.BiographyGateway.TheActiveFoundryUserHasChanged", "The active Foundry user has changed."));
  if (expected.connectionGeneration !== undefined && expected.connectionGeneration !== getConnectionGeneration()) {
    throw new Error(localizeFoundry("VEMOBILE.Character.BiographyGateway.TheConnectionChangedWhileBiographyContentWasLoading", "The connection changed while biography content was loading."));
  }
}
