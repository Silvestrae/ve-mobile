import { ACTOR_COMMANDS as C } from "../../../kernel/command-names.mjs";
import { CommandError, canOwn } from "../../command-support.mjs";
import { localizeFoundry } from "../../localization.mjs";
import { editAcModifier, editShield, updateBiography } from "./character-edits.mjs";
import { auxiliaryActionKey } from "./strike-controls.mjs";
import { defenseEditorRecord, editDefenses } from "./defense-edits.mjs";
import { editSpellPreparation, editSpellManagement, readSpellCatalog } from "./spell-preparation.mjs";
import { editInventory, editEffect } from "./inventory-effect-controls.mjs";
import { editPlayControl } from "./play-controls.mjs";
import { useSpellReference } from "./spell-reference-actions.mjs";
import { setPf2eResource, setPf2eItemLimit } from "./resource-controls.mjs";
import { editPersistentDamage } from "./persistent-damage.mjs";

const fail = (code, key, fallback) => { throw new CommandError(code, localizeFoundry(`VEMOBILE.PF2E.${key}`, fallback)); };
const unavailable = () => fail("CAPABILITY_UNAVAILABLE", "Unavailable", "This PF2e action is unavailable.");
const invalid = () => fail("INVALID_INPUT", "InvalidInput", "This PF2e action is invalid or has changed. Refresh and try again.");
const MOVEMENT_ACTIONS = Object.freeze(["swim", "climb"]);
const nativeMovementActions = () => MOVEMENT_ACTIONS.filter(slug => typeof globalThis.game?.pf2e?.actions?.[slug] === "function");
function recoveryAvailable(actor) {
  const dying = actor.attributes?.dying ?? actor.system?.attributes?.dying;
  return actor.type === "character" && typeof actor.rollRecovery === "function" && actor.isDead !== true
    && Number.isFinite(dying?.value) && dying.value > 0 && Number.isFinite(dying?.max) && dying.value < dying.max;
}
const integer = (value, min, max) => {
  if (!Number.isSafeInteger(value) || value < min || value > max) invalid();
  return value;
};
export function resolvePf2eItem(actor, id) {
  if (typeof id !== "string" || !id) invalid();
  const item = actor.items?.get?.(id) ?? Array.from(actor.system?.actions ?? []).find(action => action.item?.id === id)?.item;
  if (!item) fail("TARGET_MISSING", "ItemMissing", "This item is no longer available.");
  return item;
}
const statistic = (actor, slug) => {
  if (typeof slug !== "string" || !/^[a-z0-9][a-z0-9-]{0,99}$/u.test(slug)) invalid();
  const stat = actor.getStatistic?.(slug);
  if (typeof stat?.check?.roll !== "function") unavailable();
  return stat;
};
function resource(actor, payload, context) {
  if (typeof actor.getResource === "function") return setPf2eResource(actor, { ...payload, resource: payload.resource === "heroPoints" ? "hero-points" : payload.resource }, context);
  if (!["heroPoints", "focus"].includes(payload.resource)) invalid();
  const current = actor.system?.resources?.[payload.resource];
  if (!current || typeof actor.updateResource !== "function") unavailable();
  const max = Number(current.max);
  if (!Number.isSafeInteger(max) || max < 0 || max > 10) unavailable();
  const value = integer(payload.value, 0, max);
  if (payload.originalValue !== current.value) fail("STALE_VALUE", "ResourceChanged", "This resource changed. Refresh and try again.");
  return actor.updateResource(payload.resource, value);
}
async function condition(actor, payload) {
  const slug = payload.conditionId;
  const types = globalThis.CONFIG?.PF2E?.conditionTypes;
  if (typeof slug !== "string" || !Object.hasOwn(types ?? {}, slug)) invalid();
  if (payload.direction !== 1 && payload.direction !== -1) invalid();
  const method = payload.direction > 0 ? "increaseCondition" : "decreaseCondition";
  if (typeof actor[method] !== "function") unavailable();
  return actor[method](slug);
}
async function hitPoints(actor, payload, context) {
  const hp = actor.system?.attributes?.hp;
  if (!hp || typeof actor.update !== "function") unavailable();
  const value = integer(payload.amount ?? payload.value, 0, 999999);
  if (["damage", "heal"].includes(payload.operation)) {
    if (typeof actor.applyDamage !== "function") unavailable();
    // Native HP-bar adjustments supply a TokenDocument and final=true. PF2e
    // uses the token for chat/defeat context after changing HP, so it is required
    // even for actors with no placed token. Never substitute another Actor.
    let token = actor.isToken ? actor.token : Array.from(actor.getActiveTokens?.(false, true) ?? []).find(entry => entry.actor === actor);
    if (!token && !actor.isToken && typeof actor.getTokenDocument === "function") {
      token = await actor.getTokenDocument({ actorLink: true, name: actor.name });
      context?.assertCurrent();
    }
    if (!token || token.actor !== actor || typeof token.name !== "string") unavailable();
    return actor.applyDamage({ damage: payload.operation === "heal" ? -value : value, token, final: true });
  }
  if (!["set-hp", "set-temp"].includes(payload.operation)) invalid();
  const field = payload.operation === "set-hp" ? "value" : "temp";
  if (payload.originalValue !== hp[field]) fail("STALE_VALUE", "HitPointsChanged", "Hit Points changed. Refresh and try again.");
  if (field === "value" && value > hp.max) invalid();
  return actor.update({ [`system.attributes.hp.${field}`]: value });
}
async function useItem(actor, payload) {
  if (["activation", "ritual"].includes(payload.kind)) return useSpellReference(actor, payload);
  const item = resolvePf2eItem(actor, payload.itemId);
  if (payload.kind === "strike") {
    const strike = Array.from(actor.system?.actions ?? []).find(action => action.item?.id === item.id && action.slug === payload.slug);
    if (!strike) unavailable();
    if (payload.mode === "auxiliary") {
      const auxiliary = strike.auxiliaryActions?.[integer(payload.index, 0, 99)];
      if (!auxiliary || strike.handsAvailable === false || strike.handsAvailable === 0 || typeof auxiliary.execute !== "function"
        || payload.key !== auxiliaryActionKey(auxiliary)) invalid();
      const options = Object.values(auxiliary.options ?? {});
      const selection = payload.selection ?? null;
      if (options.length ? !options.some(option => String(option.value) === selection) : selection !== null) invalid();
      return auxiliary.execute({ selection });
    }
    if (payload.mode === "versatile") {
      const options = strike.versatileOptions ?? [];
      if (!options.some(option => option.value === payload.value)
        || options.find(option => option.selected)?.value !== payload.originalValue) invalid();
      const weapon = strike.item;
      if (typeof weapon.system?.traits?.toggles?.update !== "function") unavailable();
      return weapon.system.traits.toggles.update({ trait: "versatile", selected: payload.value === weapon.system.damage?.damageType ? null : payload.value });
    }
    if (payload.mode === "damage" || payload.mode === "critical") {
      const method = payload.mode === "critical" ? "critical" : "damage";
      if (typeof strike[method] !== "function") unavailable();
      return strike[method]({});
    }
    if (payload.mode !== "attack") invalid();
    const variant = strike.variants?.[integer(payload.variant, 0, 2)];
    if (typeof variant?.roll !== "function") unavailable();
    return variant.roll({});
  }
  if (payload.kind === "cast") {
    if (item.type !== "spell") invalid();
    const entry = actor.spellcasting?.get?.(payload.entryId);
    if (!entry || typeof entry.cast !== "function" || !entry.spells?.get?.(item.id)
      || item.system?.location?.value !== entry.id) invalid();
    const rank = integer(payload.rank, 0, 10);
    // Entry.canCast describes tradition eligibility, not membership or a valid
    // prepared slot. Validate the exact slot before delegating consumption.
    const signature = item.system?.location?.signature === true;
    const nativeRank = Number(item.rank ?? item.system?.level?.value ?? 1);
    const minimumRank = signature ? Number(item.baseRank ?? item.system?.level?.value ?? nativeRank) : nativeRank;
    if (!item.isCantrip && !item.isFocusSpell && rank < minimumRank) invalid();
    if (entry.isInnate && rank !== nativeRank) invalid();
    if (entry.isFlexible && !item.isCantrip && !item.isFocusSpell && !signature) invalid();
    if (entry.isPrepared && !entry.isFlexible && !item.isCantrip && !item.isFocusSpell) {
      const slotId = integer(payload.slotId, 0, 99);
      const slot = entry.system?.slots?.[`slot${rank}`]?.prepared?.[slotId];
      if (!slot || slot.id !== item.id || slot.expended) invalid();
    } else if (!item.isCantrip && !item.isFocusSpell && !entry.isInnate && !entry.isRitual) {
      const slots = entry.system?.slots?.[`slot${rank}`];
      if (!slots || slots.max < 1 || slots.value < 1) invalid();
      if (entry.isSpontaneous && !item.system?.location?.signature && rank !== Number(item.rank)) invalid();
    }
    return entry.cast(item, { rank, ...(payload.slotId === undefined ? {} : { slotId: integer(payload.slotId, 0, 99) }), consume: true, message: true });
  }
  if (payload.kind === "consume") {
    if (item.type !== "consumable" || typeof item.consume !== "function") unavailable();
    if (item.quantity < 1 || item.uses?.value === 0) invalid();
    return item.consume();
  }
  if (payload.kind !== "item") invalid();
  if (["action", "feat"].includes(item.type)) {
    if (typeof globalThis.game?.pf2e?.rollItemMacro !== "function") unavailable();
    return globalThis.game.pf2e.rollItemMacro(item.uuid);
  }
  if (typeof item.toMessage !== "function") unavailable();
  return item.toMessage();
}
async function carry(actor, payload) {
  const item = resolvePf2eItem(actor, payload.itemId);
  if (item.isOfType?.("physical") !== true || typeof actor.changeCarryType !== "function") unavailable();
  if (!["held", "worn", "stowed", "dropped"].includes(payload.carryType)) invalid();
  const handsHeld = integer(payload.handsHeld ?? 0, 0, 2);
  if (payload.carryType === "held" && handsHeld < 1) invalid();
  if (payload.inSlot !== undefined && typeof payload.inSlot !== "boolean") invalid();
  return actor.changeCarryType(item, { carryType: payload.carryType, handsHeld, inSlot: payload.inSlot === true });
}
async function invest(actor, payload) {
  const item = resolvePf2eItem(actor, payload.itemId);
  if (typeof actor.toggleInvested !== "function" || !item.traits?.has?.("invested") || typeof payload.invested !== "boolean") unavailable();
  if (Boolean(item.isInvested) === payload.invested) return null;
  return actor.toggleInvested(item.id);
}
async function currency(actor, payload, context) {
  if (payload.values !== undefined) {
    const keys = ["pp", "gp", "sp", "cp"];
    const validRecord = record => record && typeof record === "object" && !Array.isArray(record)
      && Object.keys(record).length === keys.length && Object.keys(record).every(key => keys.includes(key));
    if (!validRecord(payload.values) || !validRecord(payload.originalValues)) invalid();
    const inventory = actor.inventory;
    if (typeof inventory?.addCoins !== "function" || typeof inventory?.removeCoins !== "function") unavailable();
    const remove = {}, add = {};
    for (const key of keys) {
      integer(payload.values[key], 0, 999999);
      const current = inventory.currency?.[key];
      if (!Number.isSafeInteger(current) || current !== payload.originalValues[key]) fail("STALE_VALUE", "CurrencyChanged", "Currency changed. Refresh and try again.");
      const delta = payload.values[key] - current;
      if (delta < 0) remove[key] = -delta;
      if (delta > 0) add[key] = delta;
    }
    context?.assertCurrent();
    if (Object.keys(remove).length && await inventory.removeCoins(remove, { byValue: false }) === false) {
      fail("STALE_VALUE", "CurrencyChanged", "Currency changed. Refresh and try again.");
    }
    context?.assertCurrent();
    // The native APIs update inventory documents. Recheck the remaining totals
    // after their await; never convert denominations or overwrite another edit.
    for (const key of keys) if (inventory.currency?.[key] !== payload.originalValues[key] - (remove[key] ?? 0)) {
      fail("STALE_VALUE", "CurrencyChanged", "Currency changed. Refresh and try again.");
    }
    if (Object.keys(add).length) return inventory.addCoins(add);
    return null;
  }
  const { denomination, value, originalValue } = payload;
  if (!["pp", "gp", "sp", "cp"].includes(denomination)) invalid();
  integer(value, 0, 999999);
  const inventory = actor.inventory;
  const current = inventory?.currency?.[denomination];
  if (!Number.isSafeInteger(current) || typeof inventory?.addCoins !== "function" || typeof inventory?.removeCoins !== "function") unavailable();
  if (current !== originalValue) fail("STALE_VALUE", "CurrencyChanged", "Currency changed. Refresh and try again.");
  context?.assertCurrent();
  if (value > current) return inventory.addCoins({ [denomination]: value - current });
  if (value < current) return inventory.removeCoins({ [denomination]: current - value }, { byValue: false });
  return null;
}
async function addExperience(actor, payload) {
  const xp = actor.system?.details?.xp;
  if (actor.type !== "character" || typeof actor.update !== "function" || !xp
    || !Number.isSafeInteger(xp.value) || xp.value < 0) unavailable();
  const amount = payload.amount;
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > 1_000_000_000) invalid();
  if (payload.originalValue !== xp.value) fail("STALE_VALUE", "ResourceChanged", "This resource changed. Refresh and try again.");
  const previous = xp.value;
  const value = previous + amount;
  if (!Number.isSafeInteger(value)) invalid();
  await actor.update({ "system.details.xp.value": value });
  return Object.freeze({ previous, added: amount, value });
}
function useMovementAction(actor, payload, context) {
  if (!MOVEMENT_ACTIONS.includes(payload.slug)) invalid();
  const action = globalThis.game?.pf2e?.actions?.[payload.slug];
  if (typeof action !== "function") unavailable();
  context?.assertCurrent();
  return action({ actors: [actor] });
}
const handlers = Object.freeze({
  [C.ROLL_PF2E_RECOVERY]: (actor, _payload, context) => {
    if (!recoveryAvailable(actor)) unavailable();
    context?.assertCurrent();
    return actor.rollRecovery();
  },
  [C.ROLL_STATISTIC]: (actor, payload) => statistic(actor, payload.statistic).check.roll({}),
  [C.ROLL_SKILL]: (actor, payload) => {
    if (!Object.hasOwn(actor.skills ?? {}, payload.skill)) invalid();
    return statistic(actor, payload.skill).check.roll({});
  },
  [C.USE_PF2E_MOVEMENT_ACTION]: useMovementAction,
  [C.EDIT_PF2E_SPELL_PREPARATION]: editSpellPreparation,
  [C.EDIT_PF2E_PLAY]: editPlayControl,
  [C.EDIT_PF2E_INVENTORY]: (actor, payload, context) => payload.operation === "limit" ? setPf2eItemLimit(actor, payload, context) : editInventory(actor, payload, context),
  [C.EDIT_PF2E_EFFECT]: editEffect,
  [C.EDIT_PF2E_SPELLS]: (actor,payload,context) => payload.operation === "search" ? readSpellCatalog(actor,payload,context) : editSpellManagement(actor,payload,context),
  [C.ROLL_SAVE]: (actor, payload) => {
    if (!["fortitude", "reflex", "will"].includes(payload.ability)) invalid();
    return statistic(actor, payload.ability).check.roll({});
  },
  [C.ROLL_INITIATIVE]: actor => {
    if (typeof actor.initiative?.roll !== "function") unavailable();
    return actor.initiative.roll({});
  },
  [C.SET_PF2E_RESOURCE]: resource,
  [C.SET_PF2E_CONDITION]: condition,
  [C.EDIT_PF2E_PERSISTENT_DAMAGE]: editPersistentDamage,
  [C.EDIT_HIT_POINTS]: hitPoints,
  [C.USE_ITEM]: useItem,
  [C.SET_ITEM_EQUIPPED]: carry,
  [C.SET_ITEM_ATTUNED]: invest,
  [C.UPDATE_CURRENCY]: currency,
  [C.UPDATE_BIOGRAPHY_SECTION]: updateBiography,
  [C.EDIT_PF2E_AC_MODIFIER]: editAcModifier,
  [C.EDIT_PF2E_SHIELD]: editShield,
  [C.EDIT_PF2E_DEFENSES]: editDefenses,
  [C.ADD_EXPERIENCE]: addExperience,
  [C.OPEN_ITEM_SHEET]: (actor, payload) => {
    const item = resolvePf2eItem(actor, payload.itemId);
    if (typeof item.sheet?.render !== "function") unavailable();
    return item.sheet.render(item.sheet.isV2 === true ? { force: true } : true);
  },
  [C.TAKE_REST]: (actor, payload) => {
    if (actor.type !== "character" || payload.rest !== "night" || typeof globalThis.game?.pf2e?.actions?.restForTheNight !== "function") unavailable();
    return globalThis.game.pf2e.actions.restForTheNight({ actors: actor });
  }
});
export const pf2eActorActions = Object.freeze({
  handlers,
  readDefenseEditor: defenseEditorRecord,
  resolveItem: resolvePf2eItem,
  assertActorCommand(actor, name) {
    if (!Object.hasOwn(handlers, name) || !actor) unavailable();
  },
  fingerprint(name, sourceUuid, payload) {
    const rolling = [C.ROLL_STATISTIC, C.ROLL_SKILL, C.ROLL_SAVE, C.ROLL_INITIATIVE, C.ROLL_PF2E_RECOVERY, C.USE_PF2E_MOVEMENT_ACTION].includes(name);
    return `${sourceUuid}:${rolling ? `${name}:${payload.statistic ?? payload.skill ?? payload.ability ?? payload.slug ?? ""}` : "pf2e-action"}`;
  },
  capabilitiesForActor(actor, user) {
    const owner = canOwn(actor, user);
    return Object.freeze({ owner, rollSkill: owner ? Object.keys(actor.skills ?? {}) : [],
      rollRecovery: owner && recoveryAvailable(actor),
      movementActions: owner ? nativeMovementActions() : [],
      rollSave: owner ? ["fortitude", "reflex", "will"].filter(slug => actor.saves?.[slug]?.check) : [],
      rollStatistic: owner && typeof actor.getStatistic === "function", rollInitiative: owner && typeof actor.initiative?.roll === "function",
      useItem: owner, editHitPoints: owner && Boolean(actor.system?.attributes?.hp),
      editExperience: owner && actor.type === "character" && typeof actor.update === "function"
        && Number.isSafeInteger(actor.system?.details?.xp?.value) && actor.system.details.xp.value >= 0,
      prepareSpells: owner,
      manageSpells: owner, playControls: owner,
      conditions: owner && typeof actor.increaseCondition === "function", resources: owner && typeof actor.updateResource === "function",
      editPersistentDamage: owner && actor.type === "character" && typeof actor.createEmbeddedDocuments === "function",
      nativeEditor: owner, rest: owner && actor.type === "character", currency: owner && Boolean(actor.inventory),
      editBiography: owner && actor.type === "character" && typeof actor.update === "function",
      editArmorClass: owner && ["character", "npc"].includes(actor.type) && typeof actor.addCustomModifier === "function" && typeof actor.removeCustomModifier === "function",
      editShield: owner && typeof actor.heldShield?.update === "function",
      editDefenses: owner && ["character", "npc", "hazard", "vehicle"].includes(actor.type) && typeof actor.update === "function",
      repairShield: owner && Boolean(actor.heldShield) && typeof globalThis.game?.pf2e?.actions?.repair === "function",
      equipItem: owner && typeof actor.changeCarryType === "function", investItem: owner && typeof actor.toggleInvested === "function" });
  },
  readItemMenu(actor, payload) {
    const item = resolvePf2eItem(actor, payload.itemId);
    return Object.freeze({ itemId: item.id, name: String(item.name), activities: [] });
  },
  resultFields(name,output) { return name === C.EDIT_PF2E_SPELLS && Array.isArray(output?.spells) ? {catalog:output} : {}; }
});
