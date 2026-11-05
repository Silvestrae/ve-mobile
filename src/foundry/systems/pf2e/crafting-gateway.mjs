import { assertSession, canOwn } from "../../command-support.mjs";
import { resolveActorSource, validSourceUuid } from "../../character-source.mjs";
import { craftingError, nativeCrafting, formulaIsReadable, craftingFormulaRecord, craftingFormulaCost, craftingAbilityStamp, resolveCraftingAbility, canUseLegacyQuickAlchemy } from "./crafting-records.mjs";
import { spellConsumableTemplate, craftingSpellOptions } from "./crafting-item-actions.mjs";
import { localizeFoundry } from "../../localization.mjs";

/** Lazy crafting reads belong to the open tab, not the frequently published actor view.
 * Native PF2e owns its formula cache. This gateway retains no documents or result cache,
 * so world/user changes cannot reuse a previous actor's enriched formula data. */
export function createPf2eCraftingGateway({ getGame = () => globalThis.game,
  getConnectionGeneration = () => 0, getHooks = () => globalThis.Hooks } = {}) {
  return Object.freeze({
    // Watch only the open tab's source dependencies. Native updates invalidate
    // plain presentation data; they never trigger writes or preload closed tabs.
    watch({ actorSourceUuid }, scope, onChange) {
      const game = getGame(), userId = game.user?.id, worldId = game.world?.id;
      const source = validSourceUuid(actorSourceUuid), actor = resolveActorSource(source, { game });
      nativeCrafting(actor);
      const hooks = getHooks();
      const known = new Set(), packs = new Set();
      // Learning/removing formulas changes the watch's dependencies without
      // requiring this pane's mounting context to be replaced first.
      const refreshSources = () => {
        known.clear(); packs.clear();
        for (const row of actor.system?.crafting?.formulas ?? []) {
          known.add(row.uuid);
          if (row.uuid.startsWith("Compendium.")) packs.add(row.uuid.slice(11).split(".Item.")[0]);
        }
      };
      refreshSources();
      let queued = false;
      // Coalesce one native operation's several document events within this pane owner.
      const invalidate = () => {
        if (scope.disposed || queued) return;
        queued = true;
        queueMicrotask(() => {
          queued = false;
          if (!scope.disposed && getGame() === game && game.world?.id === worldId && game.user?.id === userId
            && resolveActorSource(source, { game }) === actor) onChange();
        });
      };
      const listen = (name, callback) => {
        const id = hooks.on(name, callback);
        scope.own(() => hooks.off(name, id));
      };
      listen("updateActor", changed => { if (changed === actor) { refreshSources(); invalidate(); } });
      for (const event of ["createItem", "updateItem", "deleteItem"]) listen(event, item => {
        if (item.actor === actor || known.has(item.uuid) || packs.has(item.pack)) invalidate();
      });
      for (const event of ["updateCompendium", "createCompendium", "deleteCompendium"]) listen(event, pack => {
        if (packs.has(pack.collection) || game.pf2e?.compendiumBrowser?.loadedPacks?.("equipment")?.includes(pack.collection)) invalidate();
      });
      listen("updateUser", user => { if (user.id === userId) invalidate(); });
    },
    // Read the requested surface and revalidate exact ownership after every native await.
    async read(payload, expected = {}) {
      const game = getGame();
      const worldId = game.world?.id, userId = game.user?.id, generation = getConnectionGeneration();
      const source = validSourceUuid(payload?.actorSourceUuid);
      const actor = resolveActorSource(source, { game });
      const crafting = nativeCrafting(actor);
      const owner = canOwn(actor, game.user);
      const formulasSource = actor.system?.crafting?.formulas;
      const abilities = Array.from(crafting.abilities ?? []);
      const stamps = abilities.map(ability => craftingAbilityStamp(ability));
      const completion = actor.flags?.pf2e?.dailyCraftingComplete === true;
      const freeCrafting = actor.flags?.pf2e?.freeCrafting === true;
      const quickAlchemy = actor.flags?.pf2e?.quickAlchemy === true;
      // Shared session validation handles reconnects; identity checks also cover same-ID replacement.
      const assertCurrent = () => {
        assertSession(getGame(), expected, getConnectionGeneration);
        if (getGame() !== game || game.world?.id !== worldId || game.user?.id !== userId
          || getConnectionGeneration() !== generation || game.system?.id !== "pf2e" || resolveActorSource(source, { game }) !== actor
          || actor.testUserPermission?.(game.user, "OBSERVER") !== true || canOwn(actor, game.user) !== owner
          || actor.crafting !== crafting || actor.system?.crafting?.formulas !== formulasSource
          || (actor.flags?.pf2e?.dailyCraftingComplete === true) !== completion
          || (actor.flags?.pf2e?.freeCrafting === true) !== freeCrafting
          || (actor.flags?.pf2e?.quickAlchemy === true) !== quickAlchemy
          || crafting.abilities.size !== abilities.length
          || abilities.some((ability, index) => crafting.abilities.get(ability.slug) !== ability || craftingAbilityStamp(ability) !== stamps[index])) craftingError("STALE_VALUE");
      };
      assertCurrent();
      const allFormulas = await crafting.getFormulas();
      assertCurrent();
      const formulas = allFormulas.filter(formula => formulaIsReadable(formula.item, game));
      const operation = payload.operation ?? "read";
      // Draft quantity costs are presentation reads: no enrichment, writes or rolls.
      if (operation === "cost") {
        const formula = formulas.find(row => row.uuid === payload.formulaUuid);
        const quantity = payload.quantity;
        if (!formula || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 9999) craftingError();
        return { quantity, cost: craftingFormulaCost(formula, quantity, game) };
      }
      if (operation === "spell-options") {
        const formula = formulas.find(row => row.uuid === payload.formulaUuid);
        const template = formula ? spellConsumableTemplate(formula.item) : null;
        if (!owner || !template) craftingError();
        return { rank: template.rank, category: template.category,
          spells: craftingSpellOptions(actor, template).map(spell => ({ id: spell.id, name: String(spell.name), img: String(spell.img ?? ""), rank: spell.baseRank })) };
      }
      if (operation === "details") {
        const formula = formulas.find(row => row.uuid === payload.formulaUuid);
        if (!formula || typeof formula.item.getChatData !== "function") craftingError();
        const data = await formula.item.getChatData({ secrets: owner });
        assertCurrent();
        if (!formulaIsReadable(formula.item, game)) craftingError("FORBIDDEN");
        return { ...craftingFormulaRecord(formula), html: typeof data?.description?.value === "string" ? data.description.value : "" };
      }
      if (operation === "options") {
        const ability = resolveCraftingAbility(actor, payload.abilitySlug);
        const valid = await ability.getValidFormulas();
        assertCurrent();
        return { formulas: valid.filter(row => formulaIsReadable(row.item, game)).map(craftingFormulaRecord), abilityStamp: craftingAbilityStamp(ability) };
      }
      if (operation === "search") return searchFormulaSources({ payload, game, assertCurrent });
      if (operation !== "read") craftingError();
      const entries = [];
      const resolvedUuids = new Set(allFormulas.map(formula => formula.uuid));
      for (const ability of abilities) {
        // Native getSheetData prunes unresolved prepared UUIDs in memory. Predict
        // only that documented normalization; any other entry change still fails.
        stamps[abilities.indexOf(ability)] = craftingAbilityStamp(ability,
          (ability.preparedFormulaData ?? []).filter(row => resolvedUuids.has(row.uuid)));
        const data = await ability.getSheetData();
        assertCurrent();
        const label = String(data.label ?? ability.label ?? ability.slug);
        const resourceLabel = String(data.resource?.label ?? ability.resource ?? "");
        entries.push({ slug: ability.slug, label: localizeFoundry(label, label),
          stamp: craftingAbilityStamp(ability), isPrepared: ability.isPrepared === true,
          isDailyPrep: ability.isDailyPrep === true,
          isAlchemical: ability.isAlchemical === true,
          maxSlots: Number(data.maxSlots ?? 0), maxItemLevel: Number(ability.maxItemLevel ?? 0),
          remainingSlots: Number(data.remainingSlots ?? 0), cost: Number(data.resourceCost ?? 0), insufficient: data.insufficient === true,
          resource: data.resource ? { slug: String(ability.resource), label: localizeFoundry(resourceLabel, resourceLabel),
            value: Number(data.resource.value ?? 0), max: Number(data.resource.max ?? 0) } : null,
          prepared: (data.prepared ?? []).flatMap((row, index) => formulaIsReadable(row.item, game) ? [{
            ...craftingFormulaRecord(row), index, quantity: Number(row.quantity ?? 1), batches: Number(row.batches ?? 1),
            expended: row.expended === true, isSignatureItem: row.isSignatureItem === true
          }] : []) });
      }
      assertCurrent();
      const infusedReagents = actor.getResource?.("infused-reagents");
      return { actorSourceUuid: source, owner, complete: completion,
        legacyQuickAlchemy: canUseLegacyQuickAlchemy(actor), quickAlchemy,
        infusedReagents: infusedReagents ? {
          value: Number(infusedReagents.value ?? 0),
          max: Number(infusedReagents.max ?? 0)
        } : null,
        knownUuids: owner ? (formulasSource ?? []).map(row => row.uuid) : formulas.map(row => row.uuid),
        unavailableFormulas: owner ? [...new Set((formulasSource ?? []).map(row => row.uuid))].filter(uuid => !resolvedUuids.has(uuid)) : [],
        freeCrafting,
        formulas: formulas.map(formula => ({ ...craftingFormulaRecord(formula), spellConsumable: Boolean(spellConsumableTemplate(formula.item)) })), abilities: entries };
    }
  });
}

/** Search accessible equipment indices in bounded pages. Only matching page items are
 * resolved on learning; the unopened tab never builds a compendium catalogue. */
async function searchFormulaSources({ payload, game, assertCurrent }) {
  const query = String(payload.search ?? "").trim().slice(0, 80).toLocaleLowerCase();
  const cursor = Number.isSafeInteger(payload.cursor) && payload.cursor >= 0 ? payload.cursor : 0;
  if (query.length < 2) return { formulas: [], nextCursor: null };
  const physicalTypes = new Set(["weapon", "armor", "equipment", "consumable", "treasure", "backpack", "ammo", "shield"]);
  const enabled = new Set(game.pf2e?.compendiumBrowser?.loadedPacks?.("equipment") ?? []);
  const results = [];
  // The native sheet also accepts visible world Items via drag/drop. The picker
  // offers their metadata explicitly without resolving or enriching every document.
  for (const item of Array.from(game.items ?? [])) {
    if (!physicalTypes.has(item.type) || !formulaIsReadable(item, game) || !String(item.name).toLocaleLowerCase().includes(query)) continue;
    results.push({ uuid: item.uuid, name: String(item.name), img: String(item.img ?? ""), level: Number(item.level ?? 0),
      price: craftingFormulaCost({ item }, item.price?.per ?? 1, game), pricePer: Number(item.price?.per ?? 1),
      sourceLabel: localizeFoundry("VEMOBILE.PF2E.Crafting.WorldItems", "World items") });
    if (results.length > cursor + 40) return { formulas: results.slice(cursor, cursor + 40), nextCursor: cursor + 40 };
  }
  // Native configured equipment packs are the deliberate source boundary, including module packs.
  for (const pack of Array.from(game.packs ?? [])) {
    if (pack.metadata?.type !== "Item" || !enabled.has(pack.collection) || pack.testUserPermission?.(game.user, "LIMITED") !== true) continue;
    const index = await pack.getIndex({ fields: ["type", "system.level.value", "system.price"] });
    assertCurrent();
    if (game.packs.get(pack.collection) !== pack || pack.testUserPermission?.(game.user, "LIMITED") !== true
      || !game.pf2e?.compendiumBrowser?.loadedPacks?.("equipment")?.includes(pack.collection)) craftingError("STALE_VALUE");
    for (const item of index) {
      if (!physicalTypes.has(item.type) || !String(item.name).toLocaleLowerCase().includes(query)) continue;
      results.push({ uuid: `Compendium.${pack.collection}.Item.${item._id ?? item.id}`, name: String(item.name),
        img: String(item.img ?? ""), level: Number(item.system?.level?.value ?? 0),
        price: craftingFormulaCost({ item: { price: item.system?.price } }, item.system?.price?.per ?? 1, game), pricePer: Number(item.system?.price?.per ?? 1),
        sourceLabel: String(pack.metadata?.label ?? pack.collection) });
      if (results.length > cursor + 40) return { formulas: results.slice(cursor, cursor + 40), nextCursor: cursor + 40 };
    }
  }
  return { formulas: results.slice(cursor, cursor + 40), nextCursor: null };
}
