import { resolveActorSource, validSourceUuid } from "../../character-source.mjs";
import { CommandError, canOwn, assertSession } from "../../command-support.mjs";
import { localizeFoundry } from "../../localization.mjs";
import { biographyEditorData } from "./character-edits.mjs";

/** PF2e biography fields are explicit; never copy NPC private notes into a public record. */
export function createPf2eBiographyGateway({ getGame = () => globalThis.game, getConnectionGeneration = () => 0,
  getEditor = () => globalThis.CONFIG?.ux?.TextEditor } = {}) {
  const unavailable = () => { throw new CommandError("CAPABILITY_UNAVAILABLE", localizeFoundry("VEMOBILE.PF2E.NativeEditorRequired", "Use the native PF2e sheet for this operation.")); };
  return Object.freeze({
    async read({ actorSourceUuid }, expected = {}) {
      const game = getGame();
      assertSession(game, expected, getConnectionGeneration);
      const source = validSourceUuid(actorSourceUuid);
      const actor = resolveActorSource(source, { game });
      const readable = () => actor && resolveActorSource(source, { game }) === actor && actor.testUserPermission?.(game.user, "OBSERVER");
      if (!readable()) unavailable();
      const owner = canOwn(actor, game.user);
      const content = biographyContent(actor, owner);
      const signature = JSON.stringify(content);
      const editor = getEditor();
      if (typeof editor?.enrichHTML !== "function") unavailable();
      const options = { secrets: owner, relativeTo: actor, rollData: actor.getRollData?.() ?? {}, custom: true };
      const sections = Array.isArray(content) ? await Promise.all(content.map(async section => ({
        id: section.id,
        ...(owner && actor.type === "character" ? { editorFields: biographyEditorData(actor, section.id) } : {}),
        fields: await Promise.all(section.fields.map(async field => field.rich !== undefined
          ? { key: field.key, html: String(await editor.enrichHTML(field.rich, options)) }
          : field))
      }))) : null;
      const html = sections ? sections.flatMap(section => section.fields.map(field => field.html ?? "")).filter(Boolean).join("\n")
        : String(await editor.enrichHTML(content, options));
      assertSession(getGame(), expected, getConnectionGeneration);
      if (getGame() !== game || !readable()) unavailable();
      if (canOwn(actor, game.user) !== owner || JSON.stringify(biographyContent(actor, owner)) !== signature) {
        throw new CommandError("STALE_VALUE", localizeFoundry("VEMOBILE.Character.BiographyGateway.TheBiographyChangedWhileItWasLoading", "The biography changed while it was loading."));
      }
      return Object.freeze({ actorSourceUuid: source, html, ...(sections ? { sections } : {}), owner: canOwn(actor, game.user), editable: owner && actor.type === "character", inlineRollsInteractive: false });
    },
    roll: unavailable
  });
}

function biographyContent(actor, owner) {
  const details = actor.system?.details ?? {};
  if (actor.type === "npc") return [details.blurb, details.publicNotes].filter(value => typeof value === "string").join("\n");
  const bio = details.biography ?? {};
  const specs = [
    ["appearance", ["appearance"], { height: details.height?.value, weight: details.weight?.value }],
    ["backstory", ["backstory"], { birthPlace: bio.birthPlace }],
    ["personality", [], Object.fromEntries(["attitude", "beliefs", "edicts", "anathema", "likes", "dislikes", "catchphrases"].map(key => [key, bio[key]]))],
    ["campaign", ["campaignNotes", "allies", "enemies", "organizations"], {}]
  ];
  // Match the native character template's independently visible biography sections.
  return specs.filter(([id]) => owner || (bio.visibility?.[id] ?? (id === "appearance")) === true).map(([id, richKeys, plain]) => ({
    id,
    fields: [
      ...richKeys.filter(key => typeof bio[key] === "string" && bio[key].trim()).map(key => ({ key, rich: bio[key] })),
      ...Object.entries(plain).map(([key, value]) => ({ key, text: Array.isArray(value) ? value.filter(entry => typeof entry === "string").join("; ") : typeof value === "string" ? value : "" })).filter(field => field.text.trim())
    ]
  }));
}
