const PREFIX = "ve-mobile:controls-invitation:v1";

/** One browser-local receipt per world/user; storage failure is session-stable. */
export function createControlsGuideGateway({ getGame = () => globalThis.game, getStorage = () => globalThis.localStorage } = {}) {
  const presented = new Set();
  const key = () => {
    const game = getGame();
    return game?.world?.id && game?.user?.id
      ? `${PREFIX}:${encodeURIComponent(game.world.id)}:${encodeURIComponent(game.user.id)}` : "";
  };
  return Object.freeze({
    seen() {
      const id = key();
      if (!id) return true;
      if (presented.has(id)) return true;
      try { return getStorage()?.getItem(id) === "seen"; } catch { return false; }
    },
    markPresented() {
      const id = key();
      if (!id) return;
      presented.add(id);
      try { getStorage()?.setItem(id, "seen"); } catch { /* Receipt stays in this session. */ }
    }
  });
}
