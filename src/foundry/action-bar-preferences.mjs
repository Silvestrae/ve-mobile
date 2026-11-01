import { actionBarPage } from "../kernel/action-bar-model.mjs";

/** Browser presentation memory, scoped to this world and user; no document writes. */
export function createActionBarPreferences({ getGame = () => globalThis.game, getStorage = () => globalThis.localStorage } = {}) {
  // Resolve the storage key for the current action-bar preference.
  const key = () => `ve-mobile:action-bar:v1:${getGame()?.world?.id ?? ""}:${getGame()?.user?.id ?? ""}`;
  let memoryKey = "";
  let memory = {};
  // Read and normalize the saved action-bar layout for the current user.
  const read = () => {
    const currentKey = key();
    if (memoryKey !== currentKey) {
      memoryKey = currentKey;
      try { memory = JSON.parse(getStorage()?.getItem?.(currentKey) ?? "{}"); } catch { memory = {}; }
      if (!memory || typeof memory !== "object" || Array.isArray(memory)) memory = {};
    }
    return memory;
  };
  // Persist a validated action-bar layout preference.
  const save = () => { try { getStorage()?.setItem?.(key(), JSON.stringify(memory)); } catch { /* Memory remains usable without storage. */ } };
  // Return the current setting context used to read or write action-bar preferences.
  const context = (source, actorSourceUuid) => source === "foundry" ? "foundry" : `character:${actorSourceUuid ?? ""}`;
  return Object.freeze({
    read(source, actorSourceUuid) {
      const value = read();
      return Object.freeze({ page: actionBarPage(value.pages?.[context(source, actorSourceUuid)]), collapsed: value.collapsed === true });
    },
    setPage(source, actorSourceUuid, page) {
      read();
      memory.pages = { ...(memory.pages ?? {}), [context(source, actorSourceUuid)]: actionBarPage(page) };
      save();
    },
    setCollapsed(collapsed) { read(); memory.collapsed = Boolean(collapsed); save(); }
  });
}
