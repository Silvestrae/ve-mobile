import { ACTOR_COMMANDS } from "./command-names.mjs";

export const SCENE_RETURN_COMMANDS = Object.freeze([
  ACTOR_COMMANDS.USE_ITEM, ACTOR_COMMANDS.ROLL_ABILITY, ACTOR_COMMANDS.ROLL_SAVE,
  ACTOR_COMMANDS.ROLL_SKILL, ACTOR_COMMANDS.ROLL_TOOL, ACTOR_COMMANDS.ROLL_INITIATIVE, ACTOR_COMMANDS.ROLL_DEATH_SAVE
]);

/** One local command's navigation intent, independent of native document types.
 * Acceptance is supplied by the authoritative action boundary, never inferred
 * from a successful resource write or a generic command response.
 */
export function createActionSceneReturn({ command, readState, readPreference, readScene,
  readCombat, isCurrent, navigate }) {
  const initial = readState();
  const preference = readPreference();
  const revision = initial.navigationRevision ?? 0;
  const sceneId = initial.snapshot?.scene?.id;
  const levelId = initial.snapshot?.scene?.levelId ?? "";
  const source = initial.selectedActorSourceUuid;
  let consumed = false;
  const enabled = SCENE_RETURN_COMMANDS.includes(command)
    && ["always", "combat"].includes(preference)
    && initial.route === "characters" && !initial.splitScreen;

  return () => {
    if (consumed || !enabled) return false;
    consumed = true;
    const state = readState();
    if (!isCurrent() || state.route !== initial.route || state.sceneChooserOpen
      || (state.navigationRevision ?? 0) !== revision || readPreference() !== preference
      || state.selectedActorSourceUuid !== source || state.formFactor !== initial.formFactor
      || state.orientation !== initial.orientation || state.splitScreen
      || state.reconnect || state.modeTransition || state.templatePlacement || state.nativeTokenPlacement || state.actorTokenPlacement
      || state.canvasAvailable === false) return false;
    const scene = readScene();
    // No-canvas/graphics policy stays authoritative. Leave the current sheet
    // visible instead of sending the user to an unavailable map.
    if (!sceneId || scene?.id !== sceneId || (scene.levelId ?? "") !== levelId
      || !scene.canvasReady || scene.canvasDisabled) return false;
    if (preference === "combat") {
      const combat = readCombat();
      if (!combat?.started || !combat.combatId || (combat.sceneId && combat.sceneId !== sceneId)) return false;
    }
    navigate();
    return true;
  };
}
