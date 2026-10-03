import { localizeFoundry } from "./localization.mjs";
import { ACTOR_COMMANDS } from "../kernel/command-names.mjs";
import { biographyPlainText, createItemMenuRecord, resolveItemSourceItem } from "./actor-view.mjs";
import { actorSourceUuid, resolveActorSource, speakerMatchesActor, validSourceUuid } from "./character-source.mjs";

export { ACTOR_COMMANDS };

const CURRENCY_DENOMINATIONS = Object.freeze(["pp", "gp", "ep", "sp", "cp"]);
const PREPARING_SPELL_METHODS = new Set(["pact", "spell"]);
const BIOGRAPHY_CHARACTERISTICS = Object.freeze(["alignment", "faith", "gender", "age", "height", "weight", "eyes", "hair", "skin"]);
const BIOGRAPHY_TEXT_SECTIONS = new Set(["ideal", "bond", "flaw", "trait", "appearance"]);
const BIOGRAPHY_STORY_FIELDS = new Set(["value", "public"]);
const COLLECTIVE_ITEM_COMMANDS = new Set([ACTOR_COMMANDS.USE_ITEM, ACTOR_COMMANDS.OPEN_ITEM_SHEET,
  ACTOR_COMMANDS.UPDATE_CURRENCY, ACTOR_COMMANDS.SET_ITEM_EQUIPPED, ACTOR_COMMANDS.SET_ITEM_ATTUNED, ACTOR_COMMANDS.SET_ITEM_FAVORITE]);
const VEHICLE_COMMANDS = new Set([...COLLECTIVE_ITEM_COMMANDS, ACTOR_COMMANDS.ROLL_ABILITY, ACTOR_COMMANDS.ROLL_SAVE,
  ACTOR_COMMANDS.ROLL_INITIATIVE, ACTOR_COMMANDS.EDIT_HIT_POINTS, ACTOR_COMMANDS.TOGGLE_CONDITION]);

export class CommandError extends Error {
  constructor(code, message, options = {}) {
    super(message, options);
    this.name = "CommandError";
    this.code = code;
  }
}

/**
 * The only write/action boundary used by the renderer. Commands are
 * allowlisted, resolve fresh Foundry documents, and re-check the current
 * session and ownership immediately before invoking a system API.
 */
export function createFoundryCommandGateway({
  getGame = () => globalThis.game,
  getHooks = () => globalThis.Hooks,
  getNotifications = () => globalThis.ui?.notifications,
  getConnectionGeneration = () => 0
} = {}) {
  const inFlight = new Set();

  const handlers = Object.freeze({
    [ACTOR_COMMANDS.ROLL_ABILITY]: (actor, payload) => rollAbility(actor, payload.ability, false),
    [ACTOR_COMMANDS.ROLL_SAVE]: (actor, payload) => rollAbility(actor, payload.ability, true),
    [ACTOR_COMMANDS.ROLL_SKILL]: (actor, payload) => rollSkill(actor, payload.skill),
    [ACTOR_COMMANDS.ROLL_TOOL]: (actor, payload) => rollTool(actor, payload.tool),
    [ACTOR_COMMANDS.ROLL_INITIATIVE]: (actor) => rollInitiative(actor),
    [ACTOR_COMMANDS.ROLL_DEATH_SAVE]: (actor) => rollDeathSave(actor),
    [ACTOR_COMMANDS.SET_INSPIRATION]: (actor, payload) => setInspiration(actor, payload),
    [ACTOR_COMMANDS.TOGGLE_CONDITION]: (actor, payload) => toggleCondition(actor, payload),
    [ACTOR_COMMANDS.EDIT_HIT_POINTS]: (actor, payload) => editHitPoints(actor, payload),
    [ACTOR_COMMANDS.ADD_EXPERIENCE]: (actor, payload) => addExperience(actor, payload),
    [ACTOR_COMMANDS.UPDATE_BIOGRAPHY_SECTION]: (actor, payload) => updateBiographySection(actor, payload),
    [ACTOR_COMMANDS.UPDATE_CURRENCY]: (actor, payload) => updateCurrency(actor, payload),
    [ACTOR_COMMANDS.SET_SPELL_SLOT_VALUE]: (actor, payload) => setSpellSlotValue(actor, payload),
    [ACTOR_COMMANDS.SET_ITEM_EQUIPPED]: (actor, payload) => setItemEquipped(actor, payload),
    [ACTOR_COMMANDS.SET_ITEM_ATTUNED]: (actor, payload) => setItemAttuned(actor, payload),
    [ACTOR_COMMANDS.SET_ITEM_FAVORITE]: (actor, payload) => setItemFavorite(actor, payload),
    [ACTOR_COMMANDS.SET_SPELL_PREPARED]: (actor, payload) => setSpellPrepared(actor, payload),
    [ACTOR_COMMANDS.OPEN_ITEM_SHEET]: (actor, payload) => openItemSheet(actor, payload),
    [ACTOR_COMMANDS.ADJUST_HIT_DICE]: (actor, payload) => adjustHitDice(actor, payload),
    [ACTOR_COMMANDS.TAKE_REST]: (actor, payload) => takeRest(actor, payload),
    [ACTOR_COMMANDS.USE_ITEM]: (actor, payload) => useItem(actor, payload.itemId, payload.activityId)
  });

  return Object.freeze({
    notifyError(error) {
      const message = error?.message ?? localizeFoundry("VEMOBILE.Character.CommandGateway.TheFoundryActionFailed", "The Foundry action failed.");
      getNotifications()?.error?.(message);
      return message;
    },
    capabilitiesForActor(actor, user = getGame()?.user) {
      if (!canOwn(actor, user)) return emptyActorCapabilities();
      const abilities = keysOf(actor.system?.abilities);
      const skills = keysOf(actor.system?.skills);
      const tools = toolKeys(actor);
      const collective = ["group", "vehicle"].includes(actor.type);
      const group = actor.type === "group";
      return Object.freeze({
        ...(collective ? { nativeActorEditor: typeof actor.update === "function" } : {}),
        rollAbility: !group && supportsAbilityCheck(actor) ? abilities : Object.freeze([]),
        rollSave: !group && supportsAbilitySave(actor) ? abilities : Object.freeze([]),
        rollSkill: !collective && typeof actor.rollSkill === "function" ? skills : Object.freeze([]),
        rollTool: !collective && typeof actor.rollToolCheck === "function" ? tools : Object.freeze([]),
        rollInitiative: !group && typeof actor.rollInitiative === "function",
        rollDeathSave: !collective && canRollDeathSave(actor),
        editInspiration: actor.type === "character" && typeof actor.update === "function" && typeof actor.system?.attributes?.inspiration === "boolean",
        configureArmorClass: ["character", "npc"].includes(actor.type) && Boolean(actor.system?.attributes?.ac),
        toggleConditions: !group && typeof actor.toggleStatusEffect === "function",
        editHitPoints: !group && typeof actor.update === "function" && typeof actor.applyDamage === "function"
          && (actor.type !== "vehicle" || Number.isFinite(actor.system?.attributes?.hp?.value)),
        editExperience: actor.type === "character" && typeof actor.update === "function"
          && Number.isSafeInteger(actor.system?.details?.xp?.value) && actor.system.details.xp.value >= 0,
        editBiography: ["character", "npc"].includes(actor.type) && typeof actor.update === "function" && Boolean(actor.system?.details),
        updateCurrency: Boolean(actor.system?.currency) && typeof actor.update === "function",
        editSpellSlots: collective ? Object.freeze([]) : editableSpellSlotKeys(actor),
        adjustHitDice: !collective && supportsHitDiceEditing(actor),
        shortRest: !collective && typeof actor.shortRest === "function",
        longRest: !collective && typeof actor.longRest === "function",
        useItem: usableItemIds(actor)
      });
    },

    readItemMenu(payload, expectedSession = {}) {
      const game = getGame();
      assertSession(game, expectedSession, getConnectionGeneration);
      const actor = resolveActorSource(validSourceUuid(payload.actorSourceUuid), { game });
      if (!actor) throw new CommandError("TARGET_MISSING", localizeFoundry("VEMOBILE.Character.BiographyGateway.TheSelectedActorIsNoLongerAvailable", "The selected actor is no longer available."));
      if (!canOwn(actor, game.user)) throw new CommandError(localizeFoundry("VEMOBILE.Character.CommandGateway.FORBIDDEN", "FORBIDDEN"), localizeFoundry("VEMOBILE.Character.CommandGateway.YouNoLongerHavePermissionToControlThisActor", "You no longer have permission to control this actor."));
      const item = resolveOwnedEmbeddedItem(actor, payload.itemId);
      if (payload.activityId && !collectionValues(item.system?.activities).some(activity => String(activity.id) === String(payload.activityId))) {
        throw new CommandError("TARGET_MISSING", localizeFoundry("VEMOBILE.Character.CommandGateway.ThisActivityIsNoLongerAvailableOnTheSelected", "This Activity is no longer available on the selected item."));
      }
      return Object.freeze({ item: createItemMenuRecord(actor, item, game.user, payload), canUse: typeof item.use === "function" });
    },

    async execute(name, payload = {}, expectedSession = {}, observer = {}) {
      const handler = handlers[name];
      if (!handler) throw new CommandError("UNKNOWN_COMMAND", localizeFoundry("VEMOBILE.Character.CommandGateway.UnsupportedCommand", "Unsupported command: {name}", { name: String(name) }));

      const game = getGame();
      assertSession(game, expectedSession, getConnectionGeneration);
      let sourceUuid;
      const explicitSourceUuid = Boolean(payload.actorSourceUuid);
      try { sourceUuid = validSourceUuid(payload.actorSourceUuid || (payload.actorId ? `Actor.${identifier(payload.actorId, "actorId")}` : "")); }
      catch (error) { throw new CommandError("INVALID_INPUT", error.message, { cause: error }); }
      const fingerprint = commandFingerprint(name, sourceUuid, payload);
      if (inFlight.has(fingerprint)) {
        throw new CommandError("COMMAND_BUSY", localizeFoundry("VEMOBILE.Character.CommandGateway.ThisActionIsAlreadyRunning", "This action is already running."));
      }

      inFlight.add(fingerprint);
      let actionCapture = null;
      let announcedActionSession = null;
      const diceWaiter = name === ACTOR_COMMANDS.USE_ITEM ? null : createDiceSoNiceWaiter(game, getHooks);
      try {
        const actor = resolveActorSource(sourceUuid, { game });
        if (!actor) throw new CommandError("TARGET_MISSING", localizeFoundry("VEMOBILE.Character.BiographyGateway.TheSelectedActorIsNoLongerAvailable", "The selected actor is no longer available."));
        if (!canOwn(actor, game.user)) {
          throw new CommandError(localizeFoundry("VEMOBILE.Character.CommandGateway.FORBIDDEN", "FORBIDDEN"), localizeFoundry("VEMOBILE.Character.CommandGateway.YouNoLongerHavePermissionToControlThisActor", "You no longer have permission to control this actor."));
        }
        if ((actor.type === "group" && !COLLECTIVE_ITEM_COMMANDS.has(name))
          || (actor.type === "vehicle" && !VEHICLE_COMMANDS.has(name))) {
          throw new CommandError("CAPABILITY_UNAVAILABLE", localizeFoundry("VEMOBILE.Character.CommandGateway.ThisActorTypeRequiresItsNativeWorkflowForThat", "This Actor type requires its native workflow for that operation."));
        }
        const actorId = String(actor.id ?? "");
        const actionItem = name === ACTOR_COMMANDS.USE_ITEM ? resolveItem(actor, payload.itemId) : null;
        const actionTargets = actionItem ? Array.from(game.user?.targets ?? [], (target) => target?.document ?? target).filter((target) => target?.id) : [];
        const actionTargetIds = actionTargets.map((target) => String(target.id));
        // A GM can see every targeted token. Other users get identities only
        // from the native, permission-filtered chat card after it renders.
        const actionTargetPreviews = game.user?.isGM ? actionTargets.map((target) => Object.freeze({
          id: String(target.id),
          name: String(target.name ?? target.actor?.name ?? "Target").slice(0, 100),
          img: String(target._source?.texture?.src ?? target.texture?.src ?? "")
        })) : [];
        const existingMessageIds = new Set(messageDocuments(game).map(messageIdentifier).filter(Boolean));
        const announceActionSession = (output) => {
          if (expectedSession.connectionGeneration !== undefined
            && expectedSession.connectionGeneration !== getConnectionGeneration()) return null;
          if (!actionItem) return null;
          const session = actionSessionFromNewMessages(
            game,
            existingMessageIds,
            actor,
            actionItem,
            output,
            actionCapture?.messages,
            explicitSourceUuid,
            actionTargetIds,
            actionTargetPreviews
          );
          if (!session) return null;
          if (announcedActionSession && JSON.stringify(announcedActionSession) === JSON.stringify(session)) return announcedActionSession;
          announcedActionSession = session;
          if (typeof observer?.onActionSession === "function") {
            queueMicrotask(() => {
              try {
                if (expectedSession.connectionGeneration !== undefined
                  && expectedSession.connectionGeneration !== getConnectionGeneration()) return;
                observer.onActionSession(session);
              } catch (error) {
                console.warn("VE Mobile | Action session observer failed", error);
              }
            });
          }
          return session;
        };
        actionCapture = actionItem
          ? beginActionMessageCapture(getHooks(), existingMessageIds, () => announceActionSession())
          : null;
        const output = await handler(actor, payload);
        assertSession(game, expectedSession, getConnectionGeneration);
        let rollResult = resultFromRollOutput(output) ?? resultFromNewMessage(game, existingMessageIds, actor, game.user.id);
        if (rollResult && diceWaiter) rollResult = await diceWaiter.finalize(rollResult, game, output);
        const response = { ok: true, command: name, actorId, ...(explicitSourceUuid ? { actorSourceUuid: sourceUuid } : {}) };
        if (name === ACTOR_COMMANDS.ADJUST_HIT_DICE && output) response.hitDice = output;
        if (name === ACTOR_COMMANDS.UPDATE_CURRENCY && output) {
          response.changed = output.changed;
          response.currency = output.currency;
        }
        if (name === ACTOR_COMMANDS.SET_SPELL_SLOT_VALUE && output) Object.assign(response, output);
        if (name === ACTOR_COMMANDS.SET_SPELL_PREPARED && output) {
          response.itemId = output.itemId;
          response.prepared = output.prepared;
        }
        if ([ACTOR_COMMANDS.SET_ITEM_EQUIPPED, ACTOR_COMMANDS.SET_ITEM_ATTUNED, ACTOR_COMMANDS.SET_ITEM_FAVORITE, ACTOR_COMMANDS.OPEN_ITEM_SHEET].includes(name) && output) {
          Object.assign(response, output);
        }
        let actionSession = announceActionSession(output) ?? announcedActionSession;
        if (actionItem && !actionSession && actionCapture) {
          await actionCapture.waitForChange(actionCapture.messages.length, 450);
          actionSession = announcedActionSession ?? announceActionSession(output);
        }
        if (actionSession) response.actionSession = actionSession;
        if (rollResult) response.rollResult = rollResult;
        assertSession(game, expectedSession, getConnectionGeneration);
        return Object.freeze(response);
      } catch (error) {
        if (error instanceof CommandError) throw error;
        throw new CommandError("COMMAND_FAILED", error?.message ?? localizeFoundry("VEMOBILE.Character.CommandGateway.TheFoundryActionFailed", "The Foundry action failed."), { cause: error });
      } finally {
        actionCapture?.dispose();
        diceWaiter?.dispose();
        inFlight.delete(fingerprint);
      }
    }
  });
}

function canRollDeathSave(actor) {
  const attributes = actor?.system?.attributes ?? {};
  const hp = Number(attributes.hp?.value);
  const success = Number(attributes.death?.success ?? 0);
  const failure = Number(attributes.death?.failure ?? 0);
  return typeof actor?.rollDeathSave === "function"
    && hp === 0
    && success < 3
    && failure < 3;
}

async function setInspiration(actor, payload) {
  if (actor.type !== "character" || typeof actor.update !== "function" || typeof actor.system?.attributes?.inspiration !== "boolean") {
    throw new CommandError("CAPABILITY_UNAVAILABLE", localizeFoundry("VEMOBILE.Character.CommandGateway.HeroicInspirationIsNotAvailableForThisActor", "Heroic Inspiration is not available for this actor."));
  }
  const intended = requiredBoolean(payload?.active, "active");
  if (actor.system.attributes.inspiration === intended) {
    throw new CommandError("STALE_STATE", localizeFoundry("VEMOBILE.Character.CommandGateway.HeroicInspirationIsAlready", "Heroic Inspiration is already {state}.", { state: localizeFoundry(intended ? "VEMOBILE.Character.CommandGateway.Active" : "VEMOBILE.Character.CommandGateway.Inactive", intended ? "active" : "inactive") }));
  }
  await actor.update({ "system.attributes.inspiration": intended });
  return Object.freeze({ active: intended });
}

async function updateBiographySection(actor, payload) {
  if (!["character", "npc"].includes(actor.type) || typeof actor.update !== "function" || !actor.system?.details) {
    throw new CommandError("CAPABILITY_UNAVAILABLE", localizeFoundry("VEMOBILE.Character.CommandGateway.ThisActorSBiographyCannotBeEdited", "This actor's biography cannot be edited."));
  }
  const section = String(payload?.section ?? "");
  if (section === "characteristics") return updateBiographyCharacteristics(actor, payload);
  if (section === "biography") return updateBiographyStory(actor, payload);
  if (!BIOGRAPHY_TEXT_SECTIONS.has(section) || actor.type !== "character") {
    throw new CommandError("INVALID_INPUT", localizeFoundry("VEMOBILE.Character.CommandGateway.ChooseADisplayedBiographySection", "Choose a displayed biography section."));
  }
  const current = biographyPlainText(actor.system.details?.[section]);
  const original = biographyText(payload?.originalValue, "originalValue", 20_000);
  if (current !== original) throw new CommandError("STALE_STATE", localizeFoundry("VEMOBILE.Character.CommandGateway.ThisBiographySectionChangedWhileItWasBeingEdited", "This biography section changed while it was being edited."));
  const value = biographyText(payload?.value, "value", 20_000);
  const changed = value !== current;
  if (changed) await actor.update({ [`system.details.${section}`]: value });
  return Object.freeze({ section, changed });
}

async function updateBiographyCharacteristics(actor, payload) {
  if (actor.type !== "character") throw new CommandError("INVALID_INPUT", localizeFoundry("VEMOBILE.Character.CommandGateway.CharacteristicsAreOnlyAvailableForPlayerCharacters", "Characteristics are only available for player characters."));
  const values = exactBiographyFields(payload?.values, "values");
  const originals = exactBiographyFields(payload?.originalValues, "originalValues");
  for (const field of BIOGRAPHY_CHARACTERISTICS) {
    const current = String(actor.system.details?.[field] ?? "").trim();
    if (current !== originals[field]) throw new CommandError("STALE_STATE", localizeFoundry("VEMOBILE.Character.CommandGateway.CharacteristicsChangedWhileTheyWereBeingEdited", "Characteristics changed while they were being edited."));
  }
  const updates = {};
  for (const field of BIOGRAPHY_CHARACTERISTICS) {
    if (values[field] !== originals[field]) updates[`system.details.${field}`] = values[field];
  }
  if (Object.keys(updates).length) await actor.update(updates);
  return Object.freeze({ section: "characteristics", changed: Object.freeze(Object.keys(updates).map((path) => path.split(".").at(-1))) });
}

async function updateBiographyStory(actor, payload) {
  const field = String(payload?.biographyField ?? "");
  if (!BIOGRAPHY_STORY_FIELDS.has(field) || (actor.type !== "npc" && field !== "value")) {
    throw new CommandError("INVALID_INPUT", localizeFoundry("VEMOBILE.Character.CommandGateway.ChooseTheBiographyFieldCurrentlyBeingDisplayed", "Choose the biography field currently being displayed."));
  }
  const biography = actor.system.details?.biography;
  if (!biography || typeof biography !== "object") throw new CommandError("CAPABILITY_UNAVAILABLE", localizeFoundry("VEMOBILE.Character.CommandGateway.ThisActorSBiographyTextIsUnavailable", "This actor's biography text is unavailable."));
  const displayedField = actor.type === "npc" && !String(biography.value ?? "") ? "public" : "value";
  if (field !== displayedField) throw new CommandError("STALE_STATE", localizeFoundry("VEMOBILE.Character.CommandGateway.TheDisplayedBiographyFieldChangedWhileItWasBeing", "The displayed biography field changed while it was being edited."));
  const current = biographyText(String(biography[field] ?? ""), "current biography", 100_000, false);
  const original = biographyText(payload?.originalValue, "originalValue", 100_000, false);
  if (current !== original) throw new CommandError("STALE_STATE", localizeFoundry("VEMOBILE.Character.CommandGateway.TheBiographyChangedWhileItWasBeingEdited", "The biography changed while it was being edited."));
  const value = biographyText(payload?.value, "value", 100_000, false);
  const changed = value !== current;
  if (changed) await actor.update({ [`system.details.biography.${field}`]: value });
  return Object.freeze({ section: "biography", field, changed });
}

function exactBiographyFields(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new CommandError("INVALID_INPUT", localizeFoundry("VEMOBILE.Character.CommandGateway.MustContainTheDisplayedCharacteristics", "{label} must contain the displayed characteristics.", { label: (label) }));
  const keys = Object.keys(value);
  if (keys.length !== BIOGRAPHY_CHARACTERISTICS.length || keys.some((key) => !BIOGRAPHY_CHARACTERISTICS.includes(key))) {
    throw new CommandError("INVALID_INPUT", localizeFoundry("VEMOBILE.Character.CommandGateway.MustContainOnlyTheDisplayedCharacteristics", "{label} must contain only the displayed characteristics.", { label: (label) }));
  }
  return Object.freeze(Object.fromEntries(BIOGRAPHY_CHARACTERISTICS.map((field) => [field, biographyText(value[field], field, 200)])));
}

function biographyText(value, label, maximum, trim = true) {
  if (typeof value !== "string") throw new CommandError("INVALID_INPUT", localizeFoundry("VEMOBILE.Character.CommandGateway.MustBeText", "{label} must be text.", { label: (label) }));
  const normalized = value.replace(/\r\n?/gu, "\n");
  const result = trim ? normalized.trim() : normalized;
  if (result.length > maximum) throw new CommandError("INVALID_INPUT", localizeFoundry("VEMOBILE.Character.CommandGateway.IsTooLong", "{label} is too long.", { label: (label) }));
  return result;
}

async function toggleCondition(actor, payload) {
  if (typeof actor.toggleStatusEffect !== "function") {
    throw new CommandError("CAPABILITY_UNAVAILABLE", localizeFoundry("VEMOBILE.Character.CommandGateway.ConditionsAreNotAvailableForThisActor", "Conditions are not available for this actor."));
  }
  const conditionId = String(payload?.conditionId ?? "").trim();
  const definition = globalThis.CONFIG?.DND5E?.conditionTypes?.[conditionId];
  if (!validKey(conditionId) || !definition || definition.pseudo) {
    throw new CommandError("INVALID_INPUT", localizeFoundry("VEMOBILE.Character.CommandGateway.ChooseANativeDDECondition", "Choose a native D&D5e condition."));
  }
  const active = requiredBoolean(payload?.active, "active");
  await actor.toggleStatusEffect(conditionId, { active });
  return Object.freeze({ conditionId, active });
}

async function rollDeathSave(actor) {
  if (!canRollDeathSave(actor)) {
    throw new CommandError("CAPABILITY_UNAVAILABLE", localizeFoundry("VEMOBILE.Character.CommandGateway.ADeathSavingThrowIsNotCurrentlyAvailable", "A death saving throw is not currently available."));
  }
  return actor.rollDeathSave({ legacy: false });
}

function createDiceSoNiceWaiter(game, getHooks) {
  let active = false;
  try {
    active = Boolean(game?.modules?.get?.("dice-so-nice")?.active);
    if (active && game?.dice3d?.messageHookDisabled) active = false;
    if (active && typeof game?.dice3d?.isEnabled === "function" && !game.dice3d.isEnabled()) active = false;
  } catch {
    active = false;
  }
  const hooks = typeof getHooks === "function" ? getHooks() : null;
  if (!active || typeof hooks?.on !== "function") return null;

  const completed = new Set();
  let resolvePending = null;
  const onComplete = (messageId) => {
    const id = messageIdentifier(messageId);
    if (!id) return;
    completed.add(id);
    resolvePending?.(id);
    resolvePending = null;
  };
  const hookId = hooks.on("diceSoNiceRollComplete", onComplete);

  return {
    async finalize(result, currentGame, output) {
      const messageId = String(result?.messageId ?? "");
      if (!messageId) return result;
      if (!completed.has(messageId)) {
        await new Promise((resolve) => {
          let settled = false;
          let timerId = null;
          const finish = () => {
            if (settled) return;
            settled = true;
            if (timerId !== null) clearTimeout(timerId);
            resolvePending = null;
            resolve();
          };
          resolvePending = (id) => {
            if (id === messageId) finish();
          };
          timerId = setTimeout(finish, 12000);
        });
      }
      const returned = resultFromRollOutput(output);
      const message = messageDocuments(currentGame).find((candidate) => messageIdentifier(candidate) === messageId);
      const refreshed = Array.from(message?.rolls ?? [])
        .map((roll) => rollResultRecord(roll, message))
        .find(Boolean);
      return refreshed ?? (returned?.messageId === messageId ? returned : result);
    },
    dispose() {
      hooks.off?.("diceSoNiceRollComplete", hookId);
      resolvePending = null;
    }
  };
}

function resultFromRollOutput(output) {
  const rolls = Array.isArray(output) ? output : [];
  for (const roll of rolls) {
    const message = roll?.parent;
    if (!message || !canRevealMessage(message)) continue;
    const result = rollResultRecord(roll, message);
    if (result) return result;
  }
  return null;
}

function resultFromNewMessage(game, existingIds, actor, userId) {
  const messages = messageDocuments(game).filter((message) => {
    const id = messageIdentifier(message);
    if (!id || existingIds.has(id) || !canRevealMessage(message)) return false;
    const source = message?._source ?? message;
    const authorId = message?.author?.id ?? message?.user?.id ?? source?.user;
    return speakerMatchesActor(message, actor) && (!authorId || authorId === userId);
  });
  for (const message of messages.reverse()) {
    for (const roll of Array.from(message?.rolls ?? [])) {
      const result = rollResultRecord(roll, message);
      if (result) return result;
    }
  }
  return null;
}

function rollResultRecord(roll, message) {
  const total = Number(roll?.total);
  if (!Number.isFinite(total)) return null;
  const formula = String(roll?.formula ?? roll?._formula ?? "").trim();
  const breakdown = rollBreakdown(roll);
  return Object.freeze({
    total,
    messageId: messageIdentifier(message),
    ...(formula ? { formula: formula.slice(0, 160) } : {}),
    ...(breakdown.length ? { breakdown: Object.freeze(breakdown) } : {})
  });
}

function rollBreakdown(roll) {
  let terms = [];
  try {
    terms = Array.from(roll?.terms ?? roll?._terms ?? roll?.dice ?? roll?._dice ?? []);
  } catch {
    terms = [];
  }
  const breakdown = [];
  for (const term of terms) {
    const formula = String(term?.formula ?? "").trim();
    const faces = Number(term?.faces);
    let results = [];
    try {
      results = Array.from(term?.results ?? term?._results ?? []);
    } catch {
      results = [];
    }
    if (faces > 0 && results.length) {
      for (const result of results) {
        if (result && typeof result === "object" && (result.active === false || result.discarded || result.rerolled)) continue;
        const value = Number(result && typeof result === "object" ? result.result : result);
        if (Number.isFinite(value)) breakdown.push({ kind: "die", label: `${Number(term?.number ?? term?._number) > 1 ? `${Number(term?.number ?? term?._number)}` : ""}d${faces}`, value });
      }
      continue;
    }
    if (faces > 0) {
      const value = Number(term?.total ?? term?._total);
      if (Number.isFinite(value)) breakdown.push({ kind: "die", label: `${Number(term?.number ?? term?._number) > 1 ? `${Number(term?.number ?? term?._number)}` : ""}d${faces}`, value });
      continue;
    }
    if (!/^[+-]?\d+(?:\.\d+)?$/u.test(formula)) continue;
    const value = Number(term?.total ?? formula);
    if (Number.isFinite(value)) breakdown.push({ kind: "modifier", label: `${value >= 0 ? "+" : ""}${value}` });
  }
  return breakdown.slice(0, 12);
}

function messageDocuments(game) {
  try {
    return Array.from(game?.messages ?? []);
  } catch {
    return [];
  }
}

function messageIdentifier(message) {
  if (typeof message === "string" || typeof message === "number") return String(message);
  return String(message?.id ?? message?._id ?? message?._source?._id ?? "");
}

function actionSessionFromNewMessages(game, existingIds, actor, item, output, captured = [], includeSourceUuid = false, targetIds = [], targetPreviews = []) {
  const created = uniqueMessages([...messageDocuments(game), ...captured]).filter((message) => {
    const id = messageIdentifier(message);
    return id && !existingIds.has(id) && canRevealMessage(message);
  });
  const returnedRootId = returnedActionMessageId(output);
  const returnedRoot = returnedRootId
    ? created.find((message) => messageIdentifier(message) === returnedRootId)
    : null;
  if (!created.length && !returnedRoot) return null;

  const createdIds = new Set(created.map(messageIdentifier));
  const capturedIds = new Set(captured.map(messageIdentifier));
  const roots = created.filter((message) => {
    const origin = originatingMessageId(message);
    return !origin || !createdIds.has(origin);
  });
  const root = returnedRoot
    ?? roots.find((message) => speakerMatchesActor(message, actor) && messageReferencesItem(message, item.id))
    ?? created.find((message) => speakerMatchesActor(message, actor) && messageReferencesItem(message, item.id))
    ?? (actor?.isToken ? roots.find((message) => speakerMatchesActor(message, actor)) : null)
    ?? (actor?.isToken ? created.find((message) => speakerMatchesActor(message, actor)) : null)
    ?? roots.find((message) => messageReferencesItem(message, item.id))
    ?? created.find((message) => messageReferencesItem(message, item.id))
    ?? roots.find((message) => speakerMatchesActor(message, actor))
    ?? created.find((message) => speakerMatchesActor(message, actor))
    ?? roots.find((message) => messageAuthorId(message) === String(game?.user?.id ?? ""))
    ?? created.find((message) => messageAuthorId(message) === String(game?.user?.id ?? ""))
    ?? roots.find((message) => capturedIds.has(messageIdentifier(message)))
    ?? created.find((message) => capturedIds.has(messageIdentifier(message)))
    ?? (roots.length === 1 ? roots[0] : null)
    ?? (created.length === 1 ? created[0] : null)
    ?? null;
  if (!root) return null;

  const included = new Set([messageIdentifier(root)]);
  // A native item use can create separate activity cards without an
  // originatingMessage flag. Only include exact actor/item cards captured
  // during this command; unrelated contemporary chat remains excluded.
  for (const message of created) {
    if (capturedIds.has(messageIdentifier(message)) && speakerMatchesActor(message, actor) && messageReferencesItem(message, item.id)) included.add(messageIdentifier(message));
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const message of created) {
      const id = messageIdentifier(message);
      if (included.has(id) || !included.has(originatingMessageId(message))) continue;
      included.add(id);
      changed = true;
    }
  }
  return Object.freeze({
    rootMessageId: messageIdentifier(root),
    messageIds: Object.freeze(created.map(messageIdentifier).filter((id) => included.has(id))),
    actorId: String(actor.id ?? ""),
    ...(includeSourceUuid || actor.isToken ? { actorSourceUuid: actorSourceUuid(actor) } : {}),
    itemId: String(item.id ?? ""),
    ...(targetIds.length ? { targetIds: Object.freeze([...new Set(targetIds)]) } : {}),
    ...(targetPreviews.length ? { targetPreviews: Object.freeze(targetPreviews) } : {}),
    label: String(item.name ?? root.title ?? localizeFoundry("VEMOBILE.Character.CommandGateway.ItemAction", "Item action")).slice(0, 160),
    img: String(item.img ?? "")
  });
}

function beginActionMessageCapture(hooks, existingIds, onMessage = () => {}) {
  const messages = [];
  const waiters = new Set();
  const onCreate = (message) => {
    const id = messageIdentifier(message);
    if (!id || existingIds.has(id) || messages.some((candidate) => messageIdentifier(candidate) === id)) return;
    messages.push(message);
    onMessage(message);
    for (const wake of [...waiters]) wake();
  };
  const hookId = hooks?.on?.("createChatMessage", onCreate);
  return Object.freeze({
    get messages() {
      return [...messages];
    },
    waitForChange(previousCount, delay) {
      if (messages.length > previousCount) return Promise.resolve();
      return new Promise((resolve) => {
        let timeoutId;
        const finish = () => {
          clearTimeout(timeoutId);
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        timeoutId = setTimeout(finish, delay);
      });
    },
    dispose() {
      if (hookId !== undefined && hookId !== null) hooks?.off?.("createChatMessage", hookId);
      for (const wake of [...waiters]) wake();
    }
  });
}

function uniqueMessages(messages) {
  const seen = new Set();
  return messages.filter((message) => {
    const id = messageIdentifier(message);
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function returnedActionMessageId(output) {
  const references = [
    output?.message,
    output?.chatMessage,
    output?.document,
    output?.workflow?.chatCard,
    output?.workflow?.itemCardUuid,
    output?.itemCardUuid,
    output
  ];
  for (const reference of references) {
    const id = messageIdFromReference(reference);
    if (id) return id;
  }
  return "";
}

function messageIdFromReference(reference) {
  if (!reference) return "";
  if (typeof reference === "string") {
    const match = reference.match(/(?:^|\.)ChatMessage\.([^.]+)$/u);
    return match?.[1] ?? "";
  }
  const documentName = String(reference.documentName ?? reference.constructor?.metadata?.name ?? "");
  if (documentName && documentName !== "ChatMessage") return "";
  return messageIdentifier(reference);
}

function originatingMessageId(message) {
  try {
    return String(message?.getFlag?.("dnd5e", "originatingMessage")
      ?? message?.flags?.dnd5e?.originatingMessage
      ?? message?._source?.flags?.dnd5e?.originatingMessage
      ?? "");
  } catch {
    return "";
  }
}

function speakerActorId(message) {
  return String(message?.speaker?.actor ?? message?._source?.speaker?.actor ?? "");
}

function messageAuthorId(message) {
  return String(message?.author?.id ?? message?.user?.id ?? message?._source?.user ?? "");
}

function messageReferencesItem(message, itemId) {
  const reference = message?.flags?.dnd5e?.item ?? message?._source?.flags?.dnd5e?.item;
  const id = String(reference?.id ?? "");
  const uuid = String(reference?.uuid ?? "");
  const expected = String(itemId ?? "");
  return id === expected || uuid.endsWith(`.Item.${expected}`);
}

function canRevealMessage(message) {
  return message?.visible !== false && message?.isContentVisible !== false;
}

function emptyActorCapabilities() {
  return Object.freeze({
    rollAbility: Object.freeze([]),
    rollSave: Object.freeze([]),
    rollSkill: Object.freeze([]),
    rollTool: Object.freeze([]),
    rollInitiative: false,
    rollDeathSave: false,
    editInspiration: false,
    configureArmorClass: false,
    toggleConditions: false,
    editHitPoints: false,
    editExperience: false,
    editBiography: false,
    updateCurrency: false,
    editSpellSlots: Object.freeze([]),
    adjustHitDice: false,
    shortRest: false,
    longRest: false,
    useItem: Object.freeze([])
  });
}

function canOwn(actor, user) {
  if (!actor || !user) return false;
  try {
    if (typeof actor.testUserPermission === "function") return actor.testUserPermission(user, "OWNER");
    return Boolean(actor.isOwner && user.id === globalThis.game?.user?.id);
  } catch {
    return false;
  }
}

function assertSession(game, expected, getConnectionGeneration = () => 0) {
  if (!game?.user || !game?.world) throw new CommandError("SESSION_UNAVAILABLE", localizeFoundry("VEMOBILE.Character.BiographyGateway.TheFoundrySessionIsNotReady", "The Foundry session is not ready."));
  if (expected.worldId && expected.worldId !== game.world.id) {
    throw new CommandError("STALE_SESSION", localizeFoundry("VEMOBILE.Character.BiographyGateway.TheActiveFoundryWorldHasChanged", "The active Foundry world has changed."));
  }
  if (expected.userId && expected.userId !== game.user.id) {
    throw new CommandError("STALE_SESSION", localizeFoundry("VEMOBILE.Character.BiographyGateway.TheActiveFoundryUserHasChanged", "The active Foundry user has changed."));
  }
  if (expected.connectionGeneration !== undefined && expected.connectionGeneration !== getConnectionGeneration()) {
    throw new CommandError("STALE_SESSION", localizeFoundry("VEMOBILE.Character.CommandGateway.TheConnectionChangedWhileThisActionWasRunning", "The connection changed while this action was running."));
  }
}

function keysOf(record) {
  if (!record || typeof record !== "object") return Object.freeze([]);
  return Object.freeze(Object.keys(record).filter(validKey).sort());
}

function availableTools(actor) {
  const tools = { ...(actor.system?.tools ?? {}) };
  for (const key of collectionValues(actor.system?.traits?.toolProf?.value)) {
    if (validKey(key)) tools[key] ??= { value: 1 };
  }
  return tools;
}

function editableSpellSlotKeys(actor) {
  if (typeof actor?.update !== "function") return Object.freeze([]);
  return Object.freeze(Object.entries(actor.system?.spells ?? {})
    .filter(([key, slot]) => /^spell[1-9]$/u.test(key) && Number.isSafeInteger(Number(slot?.max)) && Number(slot.max) > 0)
    .map(([key]) => key)
    .sort());
}

function toolKeys(actor) {
  const tools = availableTools(actor);
  return Object.freeze(Object.keys(tools)
    .filter(validKey)
    .filter((key) => Number(tools[key]?.effectValue ?? tools[key]?.value) > 0)
    .sort());
}

function identifier(value, field) {
  const id = String(value ?? "").trim();
  if (!id || id.length > 128) throw new CommandError("INVALID_INPUT", localizeFoundry("VEMOBILE.Character.CommandGateway.IsRequired", "{field} is required.", { field: (field) }));
  return id;
}

function commandKey(value, available, field) {
  const key = String(value ?? "").trim().toLowerCase();
  if (!validKey(key) || !Object.hasOwn(available ?? {}, key)) {
    throw new CommandError("INVALID_INPUT", localizeFoundry("VEMOBILE.Character.CommandGateway.Unknown", "Unknown {field}: {key}", { field, key: key || localizeFoundry("VEMOBILE.Character.CommandGateway.Empty", "(empty)") }));
  }
  return key;
}

function validKey(value) {
  return /^[a-z0-9_-]{1,32}$/u.test(value);
}

function spellSlotKey(value) {
  const key = String(value ?? "").trim();
  if (!/^spell[1-9]$/u.test(key)) throw new CommandError("INVALID_INPUT", localizeFoundry("VEMOBILE.Character.CommandGateway.ChooseADisplayedLevelSpellSlotResource", "Choose a displayed level spell-slot resource."));
  return key;
}

function commandFingerprint(name, actorId, payload) {
  let option = payload.ability;
  if (name === ACTOR_COMMANDS.USE_ITEM || name === ACTOR_COMMANDS.OPEN_ITEM_SHEET) option = payload.itemId;
  else if (name === ACTOR_COMMANDS.UPDATE_BIOGRAPHY_SECTION) option = `${payload.section}:${payload.biographyField ?? ""}`;
  else if (name === ACTOR_COMMANDS.SET_SPELL_PREPARED) option = `${payload.itemId}:${payload.prepared}`;
  else if (name === ACTOR_COMMANDS.SET_ITEM_EQUIPPED) option = `${payload.itemId}:${payload.equipped}`;
  else if (name === ACTOR_COMMANDS.SET_ITEM_ATTUNED) option = `${payload.itemId}:${payload.attuned}`;
  else if (name === ACTOR_COMMANDS.SET_ITEM_FAVORITE) option = `${payload.itemId}:${payload.favorite}`;
  else if (name === ACTOR_COMMANDS.SET_SPELL_SLOT_VALUE) option = `${payload.slotKey}:${payload.value}`;
  else if (name === ACTOR_COMMANDS.UPDATE_CURRENCY) option = JSON.stringify(payload.values ?? {});
  else if (name === ACTOR_COMMANDS.ADD_EXPERIENCE) option = payload.amount;
  else if (name === ACTOR_COMMANDS.ADJUST_HIT_DICE) option = `${payload.denomination}:${payload.direction}`;
  else if (name === ACTOR_COMMANDS.TAKE_REST) option = payload.type;
  else if (name === ACTOR_COMMANDS.SET_INSPIRATION) option = payload.active;
  else if (name === ACTOR_COMMANDS.TOGGLE_CONDITION) option = `${payload.conditionId}:${payload.active}`;
  else if (name === ACTOR_COMMANDS.ROLL_SKILL) option = payload.skill;
  else if (name === ACTOR_COMMANDS.ROLL_TOOL) option = payload.tool;
  return `${name}:${actorId}:${String(option ?? "")}`;
}

function usableItemIds(actor) {
  return Object.freeze(collectionValues(actor.items)
    .filter((item) => typeof item?.use === "function")
    .map((item) => String(item.id ?? ""))
    .filter(Boolean));
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

function supportsAbilityCheck(actor) {
  return typeof actor.rollAbilityCheck === "function" || typeof actor.rollAbilityTest === "function";
}

function supportsAbilitySave(actor) {
  return typeof actor.rollSavingThrow === "function" || typeof actor.rollAbilitySave === "function";
}

async function rollAbility(actor, requestedAbility, save) {
  const ability = commandKey(requestedAbility, actor.system?.abilities, "ability");
  if (save) {
    if (typeof actor.rollSavingThrow === "function") return actor.rollSavingThrow({ ability });
    if (typeof actor.rollAbilitySave === "function") return actor.rollAbilitySave(ability);
  } else {
    if (typeof actor.rollAbilityCheck === "function") return actor.rollAbilityCheck({ ability });
    if (typeof actor.rollAbilityTest === "function") return actor.rollAbilityTest(ability);
  }
  throw new CommandError("CAPABILITY_UNAVAILABLE", localizeFoundry("VEMOBILE.Character.CommandGateway.ThisActorCannotPerformThatRoll", "This actor cannot perform that roll."));
}

async function rollSkill(actor, requestedSkill) {
  const skill = commandKey(requestedSkill, actor.system?.skills, "skill");
  if (typeof actor.rollSkill !== "function") {
    throw new CommandError("CAPABILITY_UNAVAILABLE", localizeFoundry("VEMOBILE.Character.CommandGateway.ThisActorCannotRollSkills", "This actor cannot roll skills."));
  }
  return actor.rollSkill({ skill });
}

async function rollTool(actor, requestedTool) {
  if (typeof actor.rollToolCheck !== "function") {
    throw new CommandError("CAPABILITY_UNAVAILABLE", localizeFoundry("VEMOBILE.Character.CommandGateway.ThisActorCannotRollTools", "This actor cannot roll tools."));
  }
  const tool = commandKey(requestedTool, availableTools(actor), "tool");
  return actor.rollToolCheck({ tool });
}

function rollInitiative(actor) {
  if (typeof actor.rollInitiative !== "function") {
    throw new CommandError("CAPABILITY_UNAVAILABLE", localizeFoundry("VEMOBILE.Character.CommandGateway.ThisActorCannotRollInitiative", "This actor cannot roll initiative."));
  }
  return actor.rollInitiative();
}

async function editHitPoints(actor, payload) {
  const operation = String(payload?.operation ?? "");
  const hp = actor.system?.attributes?.hp;
  if (!hp || (actor.type === "vehicle" && (hp.value === null || hp.value === undefined || !Number.isFinite(Number(hp.value)))) || typeof actor.update !== "function") {
    throw new CommandError("CAPABILITY_UNAVAILABLE", localizeFoundry("VEMOBILE.Character.CommandGateway.ThisActorSHitPointsCannotBeEdited", "This actor's hit points cannot be edited."));
  }

  if (operation === "damage" || operation === "heal") {
    if (typeof actor.applyDamage !== "function") {
      throw new CommandError("CAPABILITY_UNAVAILABLE", localizeFoundry("VEMOBILE.Character.CommandGateway.ThisActorCannotApplyDamageOrHealing", "This actor cannot apply damage or healing."));
    }
    const amount = wholeNumber(payload.amount, "amount", 1, 1_000_000);
    await actor.applyDamage(operation === "damage" ? amount : -amount);
  } else if (operation === "set-hp") {
    const maximum = Math.max(0, Number(hp.effectiveMax ?? (Number(hp.max) || 0) + (Number(hp.tempmax) || 0)) || 0);
    const amount = wholeNumber(payload.amount, "amount", 0, maximum);
    await actor.update({ "system.attributes.hp.value": amount });
  } else if (operation === "set-temp") {
    const amount = wholeNumber(payload.amount, "amount", 0, 1_000_000);
    await actor.update({ "system.attributes.hp.temp": amount });
  } else {
    throw new CommandError("INVALID_INPUT", localizeFoundry("VEMOBILE.Character.CommandGateway.ChooseAValidHitPointOperation", "Choose a valid hit-point operation."));
  }

  const current = actor.system?.attributes?.hp ?? hp;
  return Object.freeze({
    value: Math.max(0, Number(current.value) || 0),
    max: Math.max(0, Number(current.effectiveMax ?? current.max) || 0),
    temp: Math.max(0, Number(current.temp) || 0)
  });
}

async function addExperience(actor, payload) {
  const xp = actor.system?.details?.xp;
  if (actor.type !== "character" || typeof actor.update !== "function" || !xp) {
    throw new CommandError("CAPABILITY_UNAVAILABLE", localizeFoundry("VEMOBILE.Character.CommandGateway.ThisActorSExperienceCannotBeEdited", "This actor's experience cannot be edited."));
  }
  const current = xp.value;
  if (typeof current !== "number" || !Number.isSafeInteger(current) || current < 0) {
    throw new CommandError("CAPABILITY_UNAVAILABLE", localizeFoundry("VEMOBILE.Character.CommandGateway.ThisActorDoesNotHaveAValidExperienceTotal", "This actor does not have a valid experience total."));
  }
  if (typeof payload.amount !== "number" || !Number.isSafeInteger(payload.amount) || payload.amount < 0 || payload.amount > 1_000_000_000) {
    throw new CommandError("INVALID_INPUT", localizeFoundry("VEMOBILE.Character.CommandGateway.AmountMustBeAWholeNumberFromTo", "amount must be a whole number from 0 to 1000000000."));
  }
  const amount = payload.amount;
  const value = current + amount;
  if (!Number.isSafeInteger(value)) throw new CommandError("INVALID_INPUT", localizeFoundry("VEMOBILE.Character.CommandGateway.TheResultingExperienceTotalIsTooLarge", "The resulting experience total is too large."));
  await actor.update({ "system.details.xp.value": value });
  return Object.freeze({ previous: current, added: amount, value });
}

async function updateCurrency(actor, payload) {
  if (typeof actor.update !== "function" || !actor.system?.currency) {
    throw new CommandError("CAPABILITY_UNAVAILABLE", localizeFoundry("VEMOBILE.Character.CommandGateway.ThisActorSCurrencyCannotBeEdited", "This actor's currency cannot be edited."));
  }
  const values = payload?.values;
  if (!values || typeof values !== "object" || Array.isArray(values)) {
    throw new CommandError("INVALID_INPUT", localizeFoundry("VEMOBILE.Character.CommandGateway.ChooseAtLeastOneCurrencyDenominationToUpdate", "Choose at least one currency denomination to update."));
  }
  const entries = Object.entries(values);
  if (!entries.length || entries.some(([key]) => !CURRENCY_DENOMINATIONS.includes(key))) {
    throw new CommandError("INVALID_INPUT", localizeFoundry("VEMOBILE.Character.CommandGateway.OnlyPpGpEpSpAndCpMayBe", "Only pp, gp, ep, sp, and cp may be updated."));
  }
  const updates = {};
  for (const [denomination, rawValue] of entries) {
    if (typeof rawValue !== "number" || !Number.isSafeInteger(rawValue) || rawValue < 0) {
      throw new CommandError("INVALID_INPUT", localizeFoundry("VEMOBILE.Character.Presenter.MustBeANonNegativeWholeNumber", "{denomination} must be a non-negative whole number.", { denomination: denomination.toUpperCase() }));
    }
    const value = rawValue;
    const current = Number(actor.system.currency?.[denomination]);
    if (current !== value) updates[`system.currency.${denomination}`] = value;
  }
  if (Object.keys(updates).length) await actor.update(updates);
  return Object.freeze({
    changed: Object.freeze(Object.keys(updates).map((path) => path.split(".").at(-1))),
    currency: Object.freeze(Object.fromEntries(CURRENCY_DENOMINATIONS.map((denomination) => {
      const updated = updates[`system.currency.${denomination}`];
      const current = Number(actor.system.currency?.[denomination]);
      return [denomination, updated ?? (Number.isSafeInteger(current) && current >= 0 ? current : 0)];
    })))
  });
}

async function setSpellSlotValue(actor, payload) {
  if (typeof actor.update !== "function") {
    throw new CommandError("CAPABILITY_UNAVAILABLE", localizeFoundry("VEMOBILE.Character.CommandGateway.ThisActorSSpellSlotsCannotBeEdited", "This actor's spell slots cannot be edited."));
  }
  const slotKey = spellSlotKey(payload?.slotKey);
  const slot = actor.system?.spells?.[slotKey];
  if (!slot) throw new CommandError("TARGET_MISSING", localizeFoundry("VEMOBILE.Character.CommandGateway.ThisSpellSlotResourceIsNoLongerAvailable", "This spell-slot resource is no longer available."));
  const maximum = nonNegativeWholeNumber(slot.max, "spell-slot maximum");
  if (maximum <= 0) throw new CommandError("CAPABILITY_UNAVAILABLE", localizeFoundry("VEMOBILE.Character.CommandGateway.ThisSpellSlotResourceIsNoLongerAvailable", "This spell-slot resource is no longer available."));
  if (typeof payload?.value !== "number") throw new CommandError("INVALID_INPUT", localizeFoundry("VEMOBILE.Character.CommandGateway.SpellSlotValueMustBeNumeric", "Spell-slot value must be numeric."));
  const value = wholeNumber(payload?.value, "spell-slot value", 0, maximum);
  const current = wholeNumber(slot.value, "current spell-slot value", 0, maximum);
  if (current !== value) await actor.update({ [`system.spells.${slotKey}.value`]: value });
  return Object.freeze({ slotKey, value, max: maximum, changed: current !== value });
}

async function setItemEquipped(actor, payload) {
  const item = mutableEmbeddedItem(actor, payload?.itemId);
  const intended = requiredBoolean(payload?.equipped, "equipped");
  if (!("equipped" in (item.system ?? {}))) {
    throw new CommandError("CAPABILITY_UNAVAILABLE", localizeFoundry("VEMOBILE.Character.CommandGateway.ThisItemDoesNotSupportAnEquippedState", "This item does not support an equipped state."));
  }
  if (item.system.equipped === intended) {
    throw new CommandError("STALE_STATE", localizeFoundry("VEMOBILE.Character.CommandGateway.ThisItemIsAlready", "This item is already {state}.", { state: localizeFoundry(intended ? "VEMOBILE.Character.CommandGateway.Equipped" : "VEMOBILE.Character.CommandGateway.Unequipped", intended ? "equipped" : "unequipped") }));
  }
  await item.update({ "system.equipped": intended });
  return Object.freeze({ itemId: String(item.id), equipped: intended });
}

async function setItemAttuned(actor, payload) {
  const item = mutableEmbeddedItem(actor, payload?.itemId);
  const intended = requiredBoolean(payload?.attuned, "attuned");
  if (!["required", "optional"].includes(String(item.system?.attunement ?? "")) || typeof item.system?.attuned !== "boolean") {
    throw new CommandError("CAPABILITY_UNAVAILABLE", localizeFoundry("VEMOBILE.Character.CommandGateway.ThisItemDoesNotSupportAttunement", "This item does not support attunement."));
  }
  if (item.system.attuned === intended) {
    throw new CommandError("STALE_STATE", localizeFoundry("VEMOBILE.Character.CommandGateway.ThisItemIsAlready2", "This item is already {state}.", { state: localizeFoundry(intended ? "VEMOBILE.Character.CommandGateway.Attuned" : "VEMOBILE.Character.CommandGateway.Unattuned", intended ? "attuned" : "unattuned") }));
  }
  await item.update({ "system.attuned": intended });
  return Object.freeze({ itemId: String(item.id), attuned: intended });
}

async function setItemFavorite(actor, payload) {
  const item = resolveOwnedEmbeddedItem(actor, payload?.itemId);
  const intended = requiredBoolean(payload?.favorite, "favorite");
  const favorites = actor.system;
  if (!("favorites" in (favorites ?? {})) || typeof favorites?.hasFavorite !== "function"
    || typeof favorites?.addFavorite !== "function" || typeof favorites?.removeFavorite !== "function"
    || typeof item.getRelativeUUID !== "function") {
    throw new CommandError("CAPABILITY_UNAVAILABLE", localizeFoundry("VEMOBILE.Character.CommandGateway.DDEFavoritesAreNotAvailableForThis", "D&D5e favorites are not available for this actor or item."));
  }
  let relativeUuid;
  try { relativeUuid = String(item.getRelativeUUID(actor) ?? ""); }
  catch (error) { throw new CommandError("CAPABILITY_UNAVAILABLE", localizeFoundry("VEMOBILE.Character.CommandGateway.ThisItemSNativeDDEFavouriteTag", "This item's native D&D5e favorite tag is unavailable."), { cause: error }); }
  if (!relativeUuid) throw new CommandError("CAPABILITY_UNAVAILABLE", localizeFoundry("VEMOBILE.Character.CommandGateway.ThisItemSNativeDDEFavouriteTag", "This item's native D&D5e favorite tag is unavailable."));
  const requestedIds = intended ? [] : favouriteIds(payload?.favouriteIds);
  const allowedIds = new Set([relativeUuid, ...collectionValues(item.system?.activities).map((activity) => {
    const id = String(activity?.relativeUUID ?? "").trim();
    return id || (activity?.id ? `${relativeUuid}.Activity.${activity.id}` : "");
  }).filter(Boolean)]);
  if (requestedIds.some((id) => !allowedIds.has(id))) {
    throw new CommandError("INVALID_INPUT", localizeFoundry("VEMOBILE.Character.CommandGateway.AFavouriteEntryDoesNotBelongToTheSelected", "A favorite entry does not belong to the selected item."));
  }
  const targetIds = requestedIds.length ? requestedIds : [relativeUuid];
  const currentIds = targetIds.filter((id) => favorites.hasFavorite(id));
  const current = favorites.hasFavorite(relativeUuid);
  if ((intended && current) || (!intended && !currentIds.length)) {
    throw new CommandError("STALE_STATE", localizeFoundry("VEMOBILE.Character.CommandGateway.ThisItemIsAlready3", "This item is already {state}.", { state: localizeFoundry(intended ? "VEMOBILE.Character.CommandGateway.AFavorite" : "VEMOBILE.Character.CommandGateway.NotAFavorite", intended ? "a favorite" : "not a favorite") }));
  }
  if (intended) await favorites.addFavorite({ type: "item", id: relativeUuid });
  else for (const favoriteId of currentIds) await favorites.removeFavorite(favoriteId);
  return Object.freeze({ itemId: String(item.id), favorite: intended, favouriteIds: Object.freeze(intended ? [relativeUuid] : currentIds) });
}

function favouriteIds(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 64) throw new CommandError("INVALID_INPUT", localizeFoundry("VEMOBILE.Character.CommandGateway.FavouriteIdsMustBeABoundedList", "favouriteIds must be a bounded list."));
  const ids = [...new Set(value.map((entry) => String(entry ?? "").trim()))];
  if (ids.some((id) => !id || id.length > 512)) throw new CommandError("INVALID_INPUT", localizeFoundry("VEMOBILE.Character.CommandGateway.AFavouriteEntryIsInvalid", "A favorite entry is invalid."));
  return ids;
}

async function setSpellPrepared(actor, payload) {
  const item = resolveItem(actor, payload?.itemId);
  const intended = payload?.prepared;
  if (intended !== 0 && intended !== 1) {
    throw new CommandError("INVALID_INPUT", localizeFoundry("VEMOBILE.Character.CommandGateway.SpellPreparationMustBeExplicitlySetToPreparedOr", "Spell preparation must be explicitly set to prepared or unprepared."));
  }
  if (item.type !== "spell" || item.parent !== actor || item.isOwner === false || typeof item.update !== "function") {
    throw new CommandError("CAPABILITY_UNAVAILABLE", localizeFoundry("VEMOBILE.Character.CommandGateway.ThisEmbeddedSpellCannotBePreparedFromTheCharacter", "This embedded spell cannot be prepared from the character sheet."));
  }
  const method = String(item.system?.method ?? "");
  const current = Number(item.system?.prepared);
  const linked = Boolean(item.system?.linkedActivity?.item);
  const cached = Boolean(item.getFlag?.("dnd5e", "cachedFor"));
  const sourceItem = resolveItemSourceItem(actor, item);
  const nonClassItemSourced = Boolean(sourceItem && String(sourceItem.type ?? "").toLowerCase() !== "class");
  if (!PREPARING_SPELL_METHODS.has(method) || ![0, 1].includes(current) || nonClassItemSourced || linked || cached || item.hasRecharge) {
    throw new CommandError("CAPABILITY_UNAVAILABLE", localizeFoundry("VEMOBILE.Character.CommandGateway.ThisSpellSCurrentDDEStateDoes", "This spell's current D&D5e state does not allow preparation changes."));
  }
  if (current === intended) {
    throw new CommandError("STALE_STATE", localizeFoundry("VEMOBILE.Character.CommandGateway.ThisSpellIsAlready", "This spell is already {state}.", { state: localizeFoundry(intended ? "VEMOBILE.Character.CommandGateway.Prepared" : "VEMOBILE.Character.CommandGateway.Unprepared", intended ? "prepared" : "unprepared") }));
  }
  await item.update({ "system.prepared": intended });
  return Object.freeze({ itemId: String(item.id), prepared: intended });
}

function openItemSheet(actor, payload) {
  const item = resolveOwnedEmbeddedItem(actor, payload?.itemId);
  if (typeof item.sheet?.render !== "function") {
    throw new CommandError("CAPABILITY_UNAVAILABLE", localizeFoundry("VEMOBILE.Character.CommandGateway.ThisItemSNativeDDESheetIs", "This item's native D&D5e sheet is unavailable."));
  }
  const editMode = item.sheet.constructor?.MODES?.EDIT ?? 2;
  item.sheet.render({ force: true, mode: editMode });
  return Object.freeze({ itemId: String(item.id), opened: true });
}

function mutableEmbeddedItem(actor, itemId) {
  const item = resolveOwnedEmbeddedItem(actor, itemId);
  if (typeof item.update !== "function") {
    throw new CommandError("CAPABILITY_UNAVAILABLE", localizeFoundry("VEMOBILE.Character.CommandGateway.ThisEmbeddedItemCannotBeChanged", "This embedded item cannot be changed."));
  }
  return item;
}

function resolveOwnedEmbeddedItem(actor, itemId) {
  const item = resolveItem(actor, itemId);
  if (item.parent !== actor || item.isOwner === false) {
    throw new CommandError("CAPABILITY_UNAVAILABLE", localizeFoundry("VEMOBILE.Character.CommandGateway.ThisEmbeddedItemIsNotEditableOnTheSelected", "This embedded item is not editable on the selected actor."));
  }
  return item;
}

function requiredBoolean(value, field) {
  if (typeof value !== "boolean") throw new CommandError("INVALID_INPUT", localizeFoundry("VEMOBILE.Character.CommandGateway.MustBeExplicitlyTrueOrFalse", "{field} must be explicitly true or false.", { field: (field) }));
  return value;
}

function supportsHitDiceEditing(actor) {
  const hasClasses = collectionValues(actor.items).some(item => item?.type === "class" && Number(item.system?.hd?.max ?? item.system?.levels) > 0);
  if (hasClasses) return typeof actor.updateEmbeddedDocuments === "function";
  return Number(actor.system?.attributes?.hd?.max) > 0 && typeof actor.update === "function";
}

async function adjustHitDice(actor, payload) {
  const denomination = String(payload?.denomination ?? "").trim().toLowerCase();
  const direction = String(payload?.direction ?? "");
  if (!/^d\d{1,3}$/u.test(denomination) || !["increase", "decrease"].includes(direction)) {
    throw new CommandError("INVALID_INPUT", localizeFoundry("VEMOBILE.Character.CommandGateway.ChooseAValidHitDieTypeAndAdjustment", "Choose a valid hit-die type and adjustment."));
  }

  const classes = collectionValues(actor.items).filter(item => item?.type === "class"
    && String(item.system?.hd?.denomination ?? "").toLowerCase() === denomination);
  if (classes.length) {
    if (typeof actor.updateEmbeddedDocuments !== "function") {
      throw new CommandError("CAPABILITY_UNAVAILABLE", localizeFoundry("VEMOBILE.Character.CommandGateway.ThisActorSHitDiceCannotBeEdited", "This actor's hit dice cannot be edited."));
    }
    const pools = classes.map(item => {
      const max = Math.max(0, Number(item.system?.hd?.max ?? item.system?.levels) || 0);
      const spent = Math.max(0, Math.min(max, Number(item.system?.hd?.spent) || 0));
      return { item, max, spent };
    });
    const target = direction === "increase"
      ? pools.find(pool => pool.spent > 0)
      : pools.find(pool => pool.spent < pool.max);
    if (!target) throw new CommandError("INVALID_INPUT", direction === "increase" ? localizeFoundry("VEMOBILE.Character.CommandGateway.ThoseHitDiceAreAlreadyFull", "Those hit dice are already full.") : localizeFoundry("VEMOBILE.Character.CommandGateway.NoMoreOfThoseHitDiceAreAvailable", "No more of those hit dice are available."));
    const spent = target.spent + (direction === "increase" ? -1 : 1);
    await actor.updateEmbeddedDocuments("Item", [{ _id: target.item.id, "system.hd.spent": spent }]);
    const max = pools.reduce((total, pool) => total + pool.max, 0);
    const value = pools.reduce((total, pool) => total + pool.max - pool.spent, 0) + (direction === "increase" ? 1 : -1);
    return Object.freeze({ denomination, value, max });
  }

  const hd = actor.system?.attributes?.hd;
  const rawDenomination = String(hd?.denomination ?? "");
  const actorDenomination = rawDenomination.startsWith("d") ? rawDenomination.toLowerCase() : `d${Number(rawDenomination) || 0}`;
  if (!hd || actorDenomination !== denomination || typeof actor.update !== "function") {
    throw new CommandError("CAPABILITY_UNAVAILABLE", localizeFoundry("VEMOBILE.Character.CommandGateway.ThatHitDiePoolIsNoLongerAvailable", "That hit-die pool is no longer available."));
  }
  const max = Math.max(0, Number(hd.max) || 0);
  const current = Math.max(0, Math.min(max, Number(hd.value) || 0));
  const value = current + (direction === "increase" ? 1 : -1);
  if (value < 0 || value > max) throw new CommandError("INVALID_INPUT", value > max ? localizeFoundry("VEMOBILE.Character.CommandGateway.ThoseHitDiceAreAlreadyFull", "Those hit dice are already full.") : localizeFoundry("VEMOBILE.Character.CommandGateway.NoMoreOfThoseHitDiceAreAvailable", "No more of those hit dice are available."));
  await actor.update({ "system.attributes.hd.spent": max - value });
  return Object.freeze({ denomination, value, max });
}

function takeRest(actor, payload) {
  const type = String(payload?.type ?? "");
  if (type === "short" && typeof actor.shortRest === "function") return actor.shortRest();
  if (type === "long" && typeof actor.longRest === "function") return actor.longRest();
  if (!["short", "long"].includes(type)) throw new CommandError("INVALID_INPUT", localizeFoundry("VEMOBILE.Character.CommandGateway.ChooseAValidRestType", "Choose a valid rest type."));
  throw new CommandError("CAPABILITY_UNAVAILABLE", localizeFoundry("VEMOBILE.Character.CommandGateway.ThisActorCannotTakeARest", "This actor cannot take this rest: {type}.", { type: localizeFoundry(type === "short" ? "VEMOBILE.Character.Copy.ShortRest" : "VEMOBILE.Character.Copy.LongRest", type === "short" ? "Short Rest" : "Long Rest") }));
}

function useItem(actor, requestedItemId, requestedActivityId) {
  const item = resolveItem(actor, requestedItemId);
  if (requestedActivityId !== undefined) {
    const activityId = identifier(requestedActivityId, "activityId");
    const activity = item.system?.activities?.get?.(activityId)
      ?? collectionValues(item.system?.activities).find((candidate) => String(candidate?.id ?? "") === activityId);
    if (!activity || !activity.canUse || typeof activity.use !== "function") {
      throw new CommandError("TARGET_MISSING", localizeFoundry("VEMOBILE.Character.CommandGateway.ThatActivityIsNoLongerAvailableOnThisItem", "That activity is no longer available on this item."));
    }
    return activity.use();
  }
  if (typeof item.use !== "function") {
    throw new CommandError("CAPABILITY_UNAVAILABLE", localizeFoundry("VEMOBILE.Character.CommandGateway.ThisItemCannotBeUsedFromTheCharacterSheet", "This item cannot be used from the character sheet."));
  }
  return item.use();
}

function resolveItem(actor, requestedItemId) {
  const itemId = identifier(requestedItemId, "itemId");
  const item = actor.items?.get?.(itemId)
    ?? collectionValues(actor.items).find((candidate) => String(candidate?.id ?? "") === itemId);
  if (!item) throw new CommandError("TARGET_MISSING", localizeFoundry("VEMOBILE.Character.CommandGateway.ThisItemIsNoLongerAvailableOnTheSelected", "This item is no longer available on the selected actor."));
  return item;
}

function wholeNumber(value, field, minimum, maximum) {
  const numeric = Number(value);
  if (!Number.isSafeInteger(numeric) || numeric < minimum || numeric > maximum) {
    throw new CommandError("INVALID_INPUT", localizeFoundry("VEMOBILE.Character.CommandGateway.MustBeAWholeNumberFromTo", "{field} must be a whole number from {minimum} to {maximum}.", { field: (field), minimum: (minimum), maximum: (maximum) }));
  }
  return numeric;
}

function nonNegativeWholeNumber(value, field) {
  const numeric = Number(value);
  if (!Number.isSafeInteger(numeric) || numeric < 0) {
    throw new CommandError("CAPABILITY_UNAVAILABLE", localizeFoundry("VEMOBILE.Character.CommandGateway.TheIsUnavailable", "The {field} is unavailable.", { field: (field) }));
  }
  return numeric;
}
