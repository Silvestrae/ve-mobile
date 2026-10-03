import { actionBarPage } from "../kernel/action-bar-model.mjs";

/** Browser presentation memory, scoped to this world and user; no document writes. */
export function createActionBarPreferences({ getGame = () => globalThis.game, getStorage = () => globalThis.localStorage } = {}) {
  const key = () => `ve-mobile:action-bar:v1:${getGame()?.world?.id ?? ""}:${getGame()?.user?.id ?? ""}`;
  let memoryKey = "";
  let memory = {};
  const read = () => {
    const currentKey = key();
    if (memoryKey !== currentKey) {
      memoryKey = currentKey;
      try { memory = JSON.parse(getStorage()?.getItem?.(currentKey) ?? "{}"); } catch { memory = {}; }
      if (!memory || typeof memory !== "object" || Array.isArray(memory)) memory = {};
    }
    return memory;
  };
  const save = () => { try { getStorage()?.setItem?.(key(), JSON.stringify(memory)); } catch { /* Memory remains usable without storage. */ } };
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
