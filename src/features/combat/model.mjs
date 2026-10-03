export function currentFirstCombatants(combat) {
  const combatants = Array.from(combat?.combatants ?? []);
  if (!combatants.length) return Object.freeze([]);
  const currentIndex = combatants.findIndex((entry) => entry.id === combat?.currentCombatantId || entry.current);
  if (currentIndex <= 0) return Object.freeze(combatants);
  return Object.freeze([...combatants.slice(currentIndex), ...combatants.slice(0, currentIndex)]);
}

export function sceneCombat(combat, sceneId) {
  const currentSceneId = String(sceneId ?? "");
  if (!combat?.started || !combat.currentScene || !currentSceneId) return null;
  const linkedSceneId = String(combat.sceneId ?? "");
  if (linkedSceneId) return linkedSceneId === currentSceneId ? combat : null;
  const combatants = Array.from(combat.combatants ?? []).filter((entry) => String(entry.sceneId ?? "") === currentSceneId);
  if (!combatants.length) return null;
  return Object.freeze({ ...combat, combatants: Object.freeze(combatants) });
}
