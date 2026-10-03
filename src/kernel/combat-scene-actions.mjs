import { localizedText } from "../ui/localized-text.mjs";
import { createSceneCameraIntentCoordinator, SceneInteractionCancelledError } from "./scene-interaction-readiness.mjs";

/** Combat-specific consumer of the generic Scene readiness capability. */
export function createCombatSceneActions({
  getSnapshot,
  localize = null,
  getExpectedSession,
  getConnectionGeneration,
  sceneReadiness,
  combatGateway,
  cameraIntents = createSceneCameraIntentCoordinator({ localize })
}) {
  let active = null;
  let generation = 0;

  const run = async (kind, combatId, combatantId) => {
    const capability = kind === "focus" ? "canFocus" : "canTarget";
    const combat = getSnapshot()?.combat;
    const combatant = combat?.combatants?.find((entry) => entry.id === combatantId);
    if (!combat || combat.id !== combatId || !combatant?.[capability]) throw new Error(localizedText(localize, "VEMOBILE.Combat.TokenUnavailable", "That combatant token is no longer available."));
    const identity = Object.freeze({ combatId: combat.id, combatantId: combatant.id });
    const expected = getExpectedSession();
    const requestGeneration = ++generation;
    combatGateway.cancelPendingFocus?.();
    active?.abort(new SceneInteractionCancelledError("A newer Combat Scene action replaced this one.", localize));
    if (kind !== "focus") cameraIntents.cancelExplicit("A non-camera Combat Scene action superseded the pending focus.");
    const cameraIntent = kind === "focus" ? cameraIntents.beginExplicit({
      kind: "combat-focus",
      ...identity,
      connectionGeneration: expected.connectionGeneration
    }) : null;
    const controller = new AbortController();
    active = controller;
    try {
      const ready = await sceneReadiness.ensure({ signal: controller.signal });
      if (cameraIntent && ready.navigated) await cameraIntent.waitForPresentation({ signal: controller.signal });
      if (requestGeneration !== generation || (cameraIntent && !cameraIntent.current)) throw new SceneInteractionCancelledError(undefined, localize);
      const snapshot = getSnapshot();
      if (expected.worldId !== snapshot?.world?.id
        || expected.userId !== snapshot?.user?.id
        || expected.connectionGeneration !== getConnectionGeneration()) {
        throw new SceneInteractionCancelledError("The Foundry session changed before the Scene interaction was ready.", localize);
      }
      if (kind === "focus") return combatGateway.centerCombatant({
        ...identity,
        viewport: ready.viewport,
        cameraIntentId: cameraIntent.id
      }, expected);
      return combatGateway.targetCombatant(identity, expected);
    } finally {
      cameraIntent?.finish();
      if (active === controller) active = null;
    }
  };

  return Object.freeze({
    focus: (combatId, combatantId) => run("focus", combatId, combatantId),
    target: (combatId, combatantId) => run("target", combatId, combatantId),
    cancel(reason = "The Combat Scene action was cancelled.") {
      generation += 1;
      active?.abort(new SceneInteractionCancelledError(reason, localize));
      active = null;
      cameraIntents.cancelExplicit(reason);
    }
  });
}
