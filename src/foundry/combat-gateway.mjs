import { localizeFoundry } from "./localization.mjs";
import { cameraTargetForToken, tokenCenter, toggleTokenTarget } from "./token-movement-gateway.mjs";

export class CombatError extends Error {
  constructor(code, message, options = {}) {
    super(message, options);
    this.name = "CombatError";
    this.code = code;
  }
}

/** Permission-safe player combat state and native Foundry combat actions. */
export function createFoundryCombatGateway({
  getGame = () => globalThis.game,
  getCanvas = () => globalThis.canvas,
  getEndCombatDialog = () => globalThis.foundry?.applications?.api?.DialogV2,
  isMobileActive = () => false,
  getLifecycleToken = () => null,
  getConnectionGeneration = () => 0,
  cancelCanvasPan = () => globalThis.foundry?.canvas?.animation?.CanvasAnimation?.terminateAnimation?.("canvas.animatePan"),
  trace = () => {}
} = {}) {
  let progressionActionBusy = false;
  let observedCombat = null;
  let combatInstanceRevision = 0;
  const observeCombat = (combat) => {
    if (combat !== observedCombat) {
      observedCombat = combat;
      combatInstanceRevision += 1;
    }
    return combatInstanceRevision;
  };
  const rollingInitiative = new Set();
  let focusGeneration = 0;
  let focusAnimating = false;

  const cancelPendingFocus = () => {
    focusGeneration += 1;
    if (!focusAnimating) return false;
    cancelCanvasPan();
    focusAnimating = false;
    return true;
  };

  const snapshot = () => {
    const game = getGame();
    const combat = game?.combat ?? null;
    if (!combat) return null;
    const instanceRevision = observeCombat(combat);
    const sceneId = combatSceneId(combat);
    const currentSceneId = String(getCanvas()?.scene?.id ?? game?.scenes?.current?.id ?? "");
    const turns = Array.from(combat.turns ?? []);
    const currentId = String(combat.combatant?.id ?? turns[Number(combat.turn)]?.id ?? "");
    const combatants = turns
      .filter((combatant) => combatant?.visible !== false)
      .map((combatant) => combatantRecord(combatant, currentId, game, currentSceneId, sceneId));
    const currentScene = sceneId
      ? sceneId === currentSceneId
      : combatants.some((combatant) => combatant.sceneId === currentSceneId);
    return Object.freeze({
      id: String(combat.id ?? ""),
      instanceRevision,
      sceneId,
      currentScene: Boolean(currentSceneId && currentScene),
      started: Boolean(combat.started),
      round: Math.max(0, Number(combat.round) || 0),
      turn: Number.isInteger(Number(combat.turn)) ? Number(combat.turn) : null,
      currentCombatantId: currentId,
      initiativeDecimals: initiativeDecimals(game),
      canEndTurn: canAdvanceCombatTurn(combat, game?.user),
      combatants: Object.freeze(combatants)
    });
  };

  const controlsSnapshot = () => {
    const game = getGame();
    const combat = game?.combat ?? null;
    const instanceRevision = combat ? observeCombat(combat) : null;
    const turnCount = Number(combat?.turns?.length ?? 0);
    const hasTurn = Boolean(combat?.started
      && turnCount
      && Number.isInteger(combat.turn)
      && combat.turn >= 0
      && combat.turn < turnCount
      && combat.combatant);
    const combatantCount = Number(combat?.combatants?.size ?? combat?.combatants?.length ?? 0);
    return Object.freeze({
      isGM: Boolean(game?.user?.isGM),
      combatId: combat ? String(combat.id ?? "") : null,
      combatInstanceRevision: instanceRevision,
      started: Boolean(combat?.started),
      round: combat ? Math.max(0, Number(combat.round) || 0) : null,
      turn: combat && Number.isInteger(combat.turn) ? combat.turn : null,
      currentCombatantId: String(combat?.combatant?.id ?? combat?.turns?.[Number(combat?.turn)]?.id ?? ""),
      canStart: Boolean(combat && !combat.started && combatantCount > 0 && canGmMutateCombat(combat, game?.user, "update", { round: 0 }) && typeof combat.startCombat === "function"),
      canEnd: Boolean(combat?.started && canGmMutateCombat(combat, game?.user, "delete") && typeof combat.endCombat === "function" && typeof getEndCombatDialog()?.confirm === "function"),
      canPrevious: Boolean(hasTurn && canGmMutateCombat(combat, game?.user, "update", { round: 0, turn: 0 }) && typeof combat?.previousTurn === "function"),
      canNext: Boolean(hasTurn && canGmMutateCombat(combat, game?.user, "update", { round: 0, turn: 0 }) && typeof combat?.nextTurn === "function")
    });
  };

  const runGmAction = async (action, expected = {}) => {
    if (progressionActionBusy) throw new CombatError("COMMAND_BUSY", localizeFoundry("VEMOBILE.Interface.CombatGateway.ACombatProgressionActionIsAlreadyInProgress", "A combat progression action is already in progress."));
    progressionActionBusy = true;
    try {
      const { game, combat } = resolveGmCombat(expected, getGame, getConnectionGeneration, isMobileActive, getLifecycleToken, observeCombat);
      const initialState = combatTurnState(combat);
      assertExpectedCombatState(combat, expected, initialState, observeCombat);
      await action(combat, game, initialState);
      return Object.freeze({ ok: true, combatId: String(combat.id ?? "") });
    } catch (error) {
      if (error instanceof CombatError) throw error;
      throw new CombatError("COMBAT_FAILED", error?.message ?? localizeFoundry("VEMOBILE.Interface.CombatGateway.FoundryRefusedTheCombatAction", "Foundry refused the combat action."), { cause: error });
    } finally {
      progressionActionBusy = false;
    }
  };

  return Object.freeze({
    snapshot,
    controlsSnapshot,

    cancelPendingFocus,

    async endTurn(expected = {}) {
      const game = getGame();
      assertSession(game, expected, getConnectionGeneration);
      if (progressionActionBusy) throw new CombatError("COMMAND_BUSY", localizeFoundry("VEMOBILE.Interface.CombatGateway.EndingThisTurnIsAlreadyInProgress", "Ending this turn is already in progress."));
      const combat = game.combat;
      if (!combat || String(combat.id ?? "") !== String(expected.combatId ?? "")) {
        throw new CombatError("STALE_COMBAT", localizeFoundry("VEMOBILE.Interface.CombatGateway.TheActiveCombatHasChanged", "The active combat has changed."));
      }
      if (!canAdvanceCombatTurn(combat, game.user)) {
        throw new CombatError("FORBIDDEN", localizeFoundry("VEMOBILE.Interface.CombatGateway.YouCanNoLongerEndThisCombatTurn", "You can no longer end this combat turn."));
      }
      if (typeof combat.nextTurn !== "function") {
        throw new CombatError("CAPABILITY_UNAVAILABLE", localizeFoundry("VEMOBILE.Interface.CombatGateway.FoundryCannotAdvanceThisCombatTurn", "Foundry cannot advance this combat turn."));
      }
      progressionActionBusy = true;
      try {
        await combat.nextTurn();
        assertSession(game, expected, getConnectionGeneration);
        return Object.freeze({ ok: true, combatId: String(combat.id ?? "") });
      } catch (error) {
        if (error instanceof CombatError) throw error;
        throw new CombatError("COMBAT_FAILED", error?.message ?? localizeFoundry("VEMOBILE.Interface.CombatGateway.FoundryRefusedToEndTheTurn", "Foundry refused to end the turn."), { cause: error });
      } finally {
        progressionActionBusy = false;
      }
    },

    startCombat(expected = {}) {
      return runGmAction(async (combat) => {
        if (combat.started || !Array.from(combat.combatants ?? []).length || !canGmMutateCombat(combat, getGame()?.user, "update", { round: 0 })) throw staleCombatAction();
        if (typeof combat.startCombat !== "function") throw unavailableCombatAction();
        await combat.startCombat();
      }, expected);
    },

    async endCombat(expected = {}) {
      if (progressionActionBusy) throw new CombatError("COMMAND_BUSY", localizeFoundry("VEMOBILE.Interface.CombatGateway.ACombatProgressionActionIsAlreadyInProgress", "A combat progression action is already in progress."));
      progressionActionBusy = true;
      try {
        let confirmedDeletion = false;
        const combat = resolveGmCombat(expected, getGame, getConnectionGeneration, isMobileActive, getLifecycleToken, observeCombat).combat;
        assertExpectedCombatState(combat, expected, combatTurnState(combat), observeCombat);
        if (!combat.started || !canGmMutateCombat(combat, getGame()?.user, "delete")) throw staleCombatAction();
        const DialogV2 = getEndCombatDialog();
        if (typeof DialogV2?.confirm !== "function") throw unavailableCombatAction();
        await DialogV2.confirm({
          window: { title: getGame()?.i18n?.localize?.("COMBAT.EndTitle") ?? "" },
          content: `<p>${getGame()?.i18n?.localize?.("COMBAT.EndConfirmation") ?? ""}</p>`,
          yes: { callback: async () => {
            const current = resolveGmCombat(expected, getGame, getConnectionGeneration, isMobileActive, getLifecycleToken, observeCombat).combat;
            assertExpectedCombatState(current, expected, combatTurnState(current), observeCombat);
            if (!current.started || !canGmMutateCombat(current, getGame()?.user, "delete") || typeof current.delete !== "function") throw staleCombatAction();
            await current.delete();
            confirmedDeletion = true;
          } },
          modal: true
        });
        return Object.freeze({ ok: true, combatId: String(combat.id ?? ""), confirmed: confirmedDeletion });
      } catch (error) {
        if (error instanceof CombatError) throw error;
        throw new CombatError("COMBAT_FAILED", error?.message ?? localizeFoundry("VEMOBILE.Interface.CombatGateway.FoundryRefusedTheCombatAction", "Foundry refused the combat action."), { cause: error });
      } finally {
        progressionActionBusy = false;
      }
    },

    previousTurn(expected = {}) {
      return runGmAction(async (combat) => {
        if (!combat.started || !hasAppropriateTurn(combat) || !canGmMutateCombat(combat, getGame()?.user, "update", { round: 0, turn: 0 })) throw unavailableTurnAction();
        if (typeof combat.previousTurn !== "function") throw unavailableCombatAction();
        await combat.previousTurn();
      }, expected);
    },

    nextTurn(expected = {}) {
      return runGmAction(async (combat) => {
        if (!combat.started || !hasAppropriateTurn(combat) || !canGmMutateCombat(combat, getGame()?.user, "update", { round: 0, turn: 0 })) throw unavailableTurnAction();
        if (typeof combat.nextTurn !== "function") throw unavailableCombatAction();
        await combat.nextTurn();
      }, expected);
    },

    async rollInitiative(request, expected = {}) {
      const game = getGame();
      assertSession(game, expected, getConnectionGeneration);
      const combatId = identifier(request.combatId, "combatId");
      const combatantId = identifier(request.combatantId, "combatantId");
      const combat = game.combat;
      if (!combat || String(combat.id ?? "") !== combatId) {
        throw new CombatError("STALE_COMBAT", localizeFoundry("VEMOBILE.Interface.CombatGateway.TheActiveCombatHasChanged", "The active combat has changed."));
      }
      const combatant = combat.combatants?.get?.(combatantId)
        ?? Array.from(combat.turns ?? []).find((entry) => String(entry.id ?? "") === combatantId);
      if (!combatant || combatant.visible === false) {
        throw new CombatError("TARGET_MISSING", localizeFoundry("VEMOBILE.Interface.CombatGateway.TheCombatantIsNoLongerVisible", "The combatant is no longer visible."));
      }
      if (!canRollInitiative(combatant)) {
        throw new CombatError("FORBIDDEN", localizeFoundry("VEMOBILE.Interface.CombatGateway.YouCanNoLongerRollInitiativeForThisCombatant", "You can no longer roll initiative for this combatant."));
      }
      if (typeof combat.rollInitiative !== "function") {
        throw new CombatError("CAPABILITY_UNAVAILABLE", localizeFoundry("VEMOBILE.Interface.CombatGateway.FoundryCannotRollInitiativeForThisCombatant", "Foundry cannot roll initiative for this combatant."));
      }
      if (rollingInitiative.has(combatantId)) {
        throw new CombatError("COMMAND_BUSY", localizeFoundry("VEMOBILE.Interface.CombatGateway.InitiativeIsAlreadyBeingRolledForThisCombatant", "Initiative is already being rolled for this combatant."));
      }
      rollingInitiative.add(combatantId);
      try {
        await combat.rollInitiative([combatantId]);
        assertSession(game, expected, getConnectionGeneration);
        return Object.freeze({ ok: true, combatId, combatantId });
      } catch (error) {
        if (error instanceof CombatError) throw error;
        throw new CombatError("COMBAT_FAILED", error?.message ?? localizeFoundry("VEMOBILE.Interface.CombatGateway.FoundryRefusedToRollInitiative", "Foundry refused to roll initiative."), { cause: error });
      } finally {
        rollingInitiative.delete(combatantId);
      }
    },

    async focusCombatant(request, expected = {}) {
      const game = getGame();
      const { canvas, combatant, token } = resolveCombatant(request, expected, game, getCanvas(), getConnectionGeneration);
      if (combatantOwned(combatant, game.user) && typeof token.object?.control === "function") {
        await token.object.control({ releaseOthers: true });
      }
      return (await centerCombatantCamera(canvas, token, request.viewport)).result;
    },

    async centerCombatant(request, expected = {}) {
      const game = getGame();
      const centered = resolveCombatant(request, expected, game, getCanvas(), getConnectionGeneration);
      const generation = ++focusGeneration;
      focusAnimating = true;
      let completed;
      try {
        ({ completed } = await centerCombatantCamera(centered.canvas, centered.token, request.viewport, {
          trace,
          request,
          expected,
          controlledTokenIds: controlledTokenIds(centered.canvas)
        }));
      } finally {
        if (generation === focusGeneration) focusAnimating = false;
      }
      if (!completed || generation !== focusGeneration) throw new CombatError("SCENE_INTERACTION_CANCELLED", localizeFoundry("VEMOBILE.Interface.CombatGateway.ANewerSceneInteractionReplacedThisFocus", "A newer Scene interaction replaced this focus."));
      // Camera animation is asynchronous, so resolve again before emitting a
      // native ping. This prevents a former Scene/Combatant from producing a
      // stale canvas coordinate after a Scene or Combat change.
      const current = resolveCombatant(request, expected, getGame(), getCanvas(), getConnectionGeneration);
      trace(Object.freeze({
        operation: "ping",
        caller: "combat-gateway.centerCombatant",
        reason: "explicit-combat-focus",
        cameraIntentId: request.cameraIntentId ?? null,
        combatId: request.combatId,
        combatantId: request.combatantId,
        tokenId: String(current.token.id ?? ""),
        target: tokenCenter(current.token),
        connectionGeneration: expected.connectionGeneration,
        controlledTokenIds: controlledTokenIds(current.canvas)
      }));
      await pingCombatantToken(current.canvas, current.token, getGame().user);
      return Object.freeze({ ok: true, tokenId: String(current.token.id ?? ""), pinged: true });
    },

    async targetCombatant(request, expected = {}) {
      const { combatant, token } = resolveCombatant(request, expected, getGame(), getCanvas(), getConnectionGeneration);
      const result = await toggleTokenTarget(token.object, token, getGame().user);
      if (result.action === "none") throw new CombatError("CAPABILITY_UNAVAILABLE", localizeFoundry("VEMOBILE.Interface.CombatGateway.ThisTokenCannotBeTargeted", "This token cannot be targeted."));
      return Object.freeze({ ok: true, targeted: result.action === "targeted", combatantId: String(combatant.id ?? "") });
    }
  });
}

async function centerCombatantCamera(canvas, token, viewport, context = {}) {
  const center = cameraTargetForToken(canvas, token, viewportBounds(viewport));
  if (!center) throw new CombatError("TARGET_MISSING", localizeFoundry("VEMOBILE.Interface.CombatGateway.TheCombatantTokenPositionIsUnavailable", "The combatant token position is unavailable."));
  context.trace?.(Object.freeze({
    operation: "animatePan",
    caller: "combat-gateway.centerCombatant",
    reason: "explicit-combat-focus",
    cameraIntentId: context.request?.cameraIntentId ?? null,
    combatId: context.request?.combatId,
    combatantId: context.request?.combatantId,
    tokenId: String(token.id ?? ""),
    target: Object.freeze({ x: center.x, y: center.y }),
    duration: 250,
    preservesZoom: true,
    connectionGeneration: context.expected?.connectionGeneration,
    controlledTokenIds: context.controlledTokenIds ?? []
  }));
  const completed = typeof canvas.animatePan === "function"
    ? (await canvas.animatePan({ x: center.x, y: center.y, duration: 250 })) !== false
    : true;
  return Object.freeze({ completed, result: Object.freeze({ ok: true, tokenId: String(token.id ?? "") }) });
}

function controlledTokenIds(canvas) {
  return Object.freeze(Array.from(canvas?.tokens?.controlled ?? [])
    .map((token) => String(token?.document?.id ?? token?.id ?? ""))
    .filter(Boolean));
}

async function pingCombatantToken(canvas, token, user) {
  if (!user?.hasPermission?.("PING_CANVAS")) throw new CombatError("FORBIDDEN", localizeFoundry("VEMOBILE.Interface.CombatGateway.YouCannotPingTheCanvas", "You cannot ping the canvas."));
  if (typeof canvas?.ping !== "function") throw new CombatError("CAPABILITY_UNAVAILABLE", localizeFoundry("VEMOBILE.Interface.CombatGateway.FoundryCannotPingThisCanvas", "Foundry cannot ping this canvas."));
  const origin = tokenCenter(token);
  if (!origin) throw new CombatError("TARGET_MISSING", localizeFoundry("VEMOBILE.Interface.CombatGateway.TheCombatantTokenPositionIsUnavailable", "The combatant token position is unavailable."));
  const pinged = await canvas.ping(origin);
  if (!pinged) throw new CombatError("PING_FAILED", localizeFoundry("VEMOBILE.Interface.CombatGateway.FoundryCouldNotPingThatCombatant", "Foundry could not ping that combatant."));
  return true;
}

function combatantRecord(combatant, currentId, game, currentSceneId, linkedSceneId) {
  const token = combatant.token;
  const sceneId = combatantSceneId(combatant, linkedSceneId);
  const onCurrentScene = Boolean(sceneId && sceneId === currentSceneId);
  const owned = combatantOwned(combatant, game?.user);
  return Object.freeze({
    id: String(combatant.id ?? ""),
    sceneId,
    actorId: String(combatant.actorId ?? combatant.actor?.id ?? ""),
    tokenId: String(combatant.tokenId ?? token?.id ?? ""),
    name: String(combatant.name ?? token?.name ?? combatant.actor?.name ?? "Combatant"),
    img: String(combatant.img ?? token?.texture?.src ?? combatant.actor?.img ?? ""),
    initiative: combatant.initiative !== null && combatant.initiative !== undefined && Number.isFinite(Number(combatant.initiative))
      ? Number(combatant.initiative)
      : null,
    current: String(combatant.id ?? "") === currentId,
    defeated: Boolean(combatant.isDefeated ?? combatant.defeated),
    owned,
    canRollInitiative: canRollInitiative(combatant),
    canFocus: Boolean(onCurrentScene && token && !token.hidden && token.object?.visible !== false),
    canTarget: Boolean(onCurrentScene && token && !token.hidden && token.object?.visible !== false)
  });
}

function canRollInitiative(combatant) {
  return Boolean(combatant?.isOwner && combatant.initiative === null);
}

function combatTurnState(combat) {
  const turns = Array.from(combat?.turns ?? []);
  return Object.freeze({
    round: Math.max(0, Number(combat?.round) || 0),
    turn: Number.isInteger(combat?.turn) ? combat.turn : null,
    currentCombatantId: String(combat?.combatant?.id ?? turns[Number(combat?.turn)]?.id ?? "")
  });
}

function assertExpectedCombatState(combat, expected, state = combatTurnState(combat), observeCombat = () => -1) {
  requireCombatExpectation(expected);
  if (expected.combatInstanceRevision !== undefined
    && expected.combatInstanceRevision !== observeCombat(combat)) throw staleCombatAction();
  if (expected.round !== undefined && Number(expected.round) !== state.round) throw staleCombatAction();
  if (expected.turn !== undefined && (expected.turn === null ? state.turn !== null : Number(expected.turn) !== state.turn)) throw staleCombatAction();
  if (expected.currentCombatantId !== undefined && String(expected.currentCombatantId ?? "") !== state.currentCombatantId) throw staleCombatAction();
  return state;
}

function resolveGmCombat(expected, getGame, getConnectionGeneration, isMobileActive, getLifecycleToken, observeCombat) {
  const game = getGame();
  requireCombatExpectation(expected);
  assertSession(game, expected, getConnectionGeneration);
  if (!isMobileActive() || !expected.lifecycleToken || expected.lifecycleToken !== getLifecycleToken()) throw new CombatError("INACTIVE", localizeFoundry("VEMOBILE.Interface.CombatGateway.MobileCombatControlsAreNoLongerActive", "Mobile combat controls are no longer active."));
  if (!game.user.isGM) throw new CombatError("FORBIDDEN", localizeFoundry("VEMOBILE.Interface.CombatGateway.OnlyTheGMCanControlCombatProgression", "Only the GM can control combat progression."));
  const combatId = identifier(expected.combatId, "combatId");
  const combat = game.combat;
  if (!combat || String(combat.id ?? "") !== combatId || combat._deleted === true || combat.deleted === true) throw staleCombatAction();
  const collectionCombat = game.combats?.get?.(combatId);
  if (collectionCombat && collectionCombat !== combat) throw staleCombatAction();
  if (game.combats?.has?.(combatId) === false) throw staleCombatAction();
  if (expected.combatInstanceRevision !== undefined && observeCombat(combat) !== expected.combatInstanceRevision) throw staleCombatAction();
  return { game, combat };
}

function hasAppropriateTurn(combat) {
  const turns = Array.from(combat?.turns ?? []);
  return turns.length > 0 && Number.isInteger(combat.turn) && combat.turn >= 0 && combat.turn < turns.length
    && Boolean(combat.combatant ?? turns[combat.turn]);
}

function canGmMutateCombat(combat, user, action, data) {
  if (!user?.isGM) return false;
  try {
    return typeof combat?.canUserModify === "function"
      ? Boolean(combat.canUserModify(user, action, data))
      : true;
  } catch {
    return false;
  }
}

function staleCombatAction() {
  return new CombatError("STALE_COMBAT", localizeFoundry("VEMOBILE.Interface.CombatGateway.TheActiveCombatOrTurnHasChanged", "The active combat or turn has changed."));
}

function requireCombatExpectation(expected) {
  const required = ["worldId", "userId", "connectionGeneration", "lifecycleToken", "combatId", "combatInstanceRevision", "round", "turn", "currentCombatantId"];
  if (required.some((key) => !Object.hasOwn(expected, key) || expected[key] === undefined || expected[key] === null && !["turn"].includes(key))) {
    throw new CombatError("STALE_COMBAT", localizeFoundry("VEMOBILE.Interface.CombatGateway.TheActiveCombatOrTurnHasChanged", "The active combat or turn has changed."));
  }
}

function unavailableCombatAction() {
  return new CombatError("CAPABILITY_UNAVAILABLE", localizeFoundry("VEMOBILE.Interface.CombatGateway.ThisNativeCombatActionIsUnavailable", "This native combat action is unavailable."));
}

function unavailableTurnAction() {
  return new CombatError("NO_TURN", localizeFoundry("VEMOBILE.Interface.CombatGateway.ThereIsNoAppropriateCombatTurn", "There is no appropriate combat turn."));
}

/** Mirror Foundry 13's Combat Tracker authority for advancing the active turn. */
export function canAdvanceCombatTurn(combat, user) {
  if (!combat?.started || !user) return false;
  const turns = Array.from(combat.turns ?? []);
  if (!turns.length || !Number.isInteger(combat.turn)) return false;
  const current = combat.combatant ?? turns[combat.turn] ?? null;
  if (!current || !turns.some((entry) => entry === current || String(entry?.id ?? "") === String(current.id ?? ""))) return false;

  // Foundry's tracker exposes its turn controls directly to a GM once combat
  // has started. Combat's own update permission likewise grants GMs full
  // authority, independently of combatant ownership or canvas token control.
  if (user.isGM) return true;

  const isPlayerTurn = Array.from(current.players ?? []).includes(user);
  if (!isPlayerTurn) return false;
  try {
    const field = combat.turn > 0 && combat.turn < turns.length - 1
      ? { turn: 0 }
      : { round: 0 };
    return combat.canUserModify?.(user, "update", field) ?? false;
  } catch {
    return false;
  }
}

function initiativeDecimals(game) {
  try {
    return game?.settings?.get?.("dnd5e", "initiativeDexTiebreaker") === true ? 2 : 0;
  } catch {
    return 0;
  }
}

function combatantOwned(combatant, user) {
  if (!combatant || !user) return false;
  if (user.isGM) return true;
  if (Array.from(combatant.players ?? []).includes(user)) return true;
  try {
    if (typeof combatant.testUserPermission === "function") return combatant.testUserPermission(user, "OWNER");
    if (typeof combatant.actor?.testUserPermission === "function") return combatant.actor.testUserPermission(user, "OWNER");
    return Boolean(combatant.isOwner);
  } catch {
    return false;
  }
}

function resolveCombatant(request, expected, game, canvas, getConnectionGeneration) {
  assertSession(game, expected, getConnectionGeneration);
  const combatId = identifier(request.combatId, "combatId");
  const combatantId = identifier(request.combatantId, "combatantId");
  const combat = game.combat;
  if (!combat || String(combat.id ?? "") !== combatId) throw new CombatError("STALE_COMBAT", localizeFoundry("VEMOBILE.Interface.CombatGateway.TheActiveCombatHasChanged", "The active combat has changed."));
  const combatant = combat.combatants?.get?.(combatantId)
    ?? Array.from(combat.turns ?? []).find((entry) => String(entry.id ?? "") === combatantId);
  if (!combatant || combatant.visible === false) throw new CombatError("TARGET_MISSING", localizeFoundry("VEMOBILE.Interface.CombatGateway.TheCombatantIsNoLongerVisible", "The combatant is no longer visible."));
  const sceneId = combatantSceneId(combatant, combatSceneId(combat));
  if (!canvas?.ready || String(canvas.scene?.id ?? "") !== sceneId) throw new CombatError("STALE_SCENE", localizeFoundry("VEMOBILE.Interface.CombatGateway.TheCombatSceneIsNotCurrentlyActive", "The combat scene is not currently active."));
  const tokenId = String(combatant.tokenId ?? combatant.token?.id ?? "");
  const token = canvas.scene?.tokens?.get?.(tokenId)
    ?? Array.from(canvas.scene?.tokens ?? []).find((entry) => String(entry?.id ?? "") === tokenId);
  if (!token || token.hidden || token.object?.visible === false) {
    throw new CombatError("TARGET_MISSING", localizeFoundry("VEMOBILE.Interface.CombatGateway.TheCombatantTokenIsNoLongerVisible", "The combatant token is no longer visible."));
  }
  return { canvas, combatant, token };
}

function assertSession(game, expected, getConnectionGeneration = () => 0) {
  if (!game?.user || !game?.world) throw new CombatError("SESSION_UNAVAILABLE", localizeFoundry("VEMOBILE.Interface.CombatGateway.TheFoundrySessionIsNotReady", "The Foundry session is not ready."));
  if (expected.worldId && expected.worldId !== game.world.id) throw new CombatError("STALE_SESSION", localizeFoundry("VEMOBILE.Interface.CombatGateway.TheActiveFoundryWorldHasChanged", "The active Foundry world has changed."));
  if (expected.userId && expected.userId !== game.user.id) throw new CombatError("STALE_SESSION", localizeFoundry("VEMOBILE.Interface.CombatGateway.TheActiveFoundryUserHasChanged", "The active Foundry user has changed."));
  if (expected.connectionGeneration !== undefined && expected.connectionGeneration !== getConnectionGeneration()) throw new CombatError("STALE_SESSION", localizeFoundry("VEMOBILE.Interface.CombatGateway.TheConnectionChangedWhileThisActionWasRunning", "The connection changed while this action was running."));
}

function identifier(value, field) {
  const id = String(value ?? "").trim();
  if (!id || id.length > 128) throw new CombatError("INVALID_INPUT", localizeFoundry("VEMOBILE.Interface.CharacterSource.IsRequired", "{field} is required.", { field: (field) }));
  return id;
}

function viewportBounds(value) {
  if (value === null || value === undefined) return null;
  const viewport = {
    left: Number(value.left),
    top: Number(value.top),
    width: Number(value.width),
    height: Number(value.height)
  };
  if (![viewport.left, viewport.top, viewport.width, viewport.height].every(Number.isFinite)
    || viewport.width <= 0 || viewport.height <= 0
    || viewport.width > 10000 || viewport.height > 10000
    || Math.abs(viewport.left) > 100000 || Math.abs(viewport.top) > 100000) {
    throw new CombatError("INVALID_INPUT", localizeFoundry("VEMOBILE.Interface.CombatGateway.ViewportMustDescribeAFiniteVisibleSceneRegion", "viewport must describe a finite visible Scene region."));
  }
  return viewport;
}

// Foundry v13 stores the ForeignDocumentField as the Scene id on Combat.
// Retain object/document compatibility for tests and older client shapes.
function combatSceneId(combat) {
  const scene = combat?.scene;
  return String((typeof scene === "string" ? scene : scene?.id) ?? combat?.sceneId ?? "");
}

function combatantSceneId(combatant, fallback = "") {
  const scene = combatant?.scene;
  return [
    combatant?.sceneId,
    typeof scene === "string" ? scene : scene?.id,
    combatant?.token?.parent?.id,
    fallback
  ].map((value) => String(value ?? "")).find(Boolean) ?? "";
}
