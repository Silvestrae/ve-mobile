/**
 * Give Android's close request one VE layer per user-opened surface. Unlike a
 * script-created history entry, a CloseWatcher receives Back before history
 * traversal. Browsers still limit how many requests a page may intercept.
 */
export function createVeCloseWatcherBack({
  scope,
  getWindow = () => globalThis.window,
  isAndroid = () => /\bAndroid\b/u.test(globalThis.navigator?.userAgent ?? ""),
  getLayers,
  onBack,
  trace = () => {}
} = {}) {
  const entries = [];
  let disposed = false;
  let pendingClose = null;
  let lastAction = "none";

  const sync = (layers = getLayers?.() ?? []) => {
    if (disposed || pendingClose !== null || !isAndroid()) return;
    const window = getWindow?.();
    if (typeof window?.CloseWatcher !== "function") return;
    const wanted = [...new Set(layers.map(String).filter(Boolean))];
    let common = 0;
    while (common < entries.length && common < wanted.length
      && entries[common].key === wanted[common] && !entries[common].closed) common += 1;
    while (entries.length > common) entries.pop().watcher.destroy();
    for (const key of wanted.slice(common)) {
      try {
        const watcher = new window.CloseWatcher();
        const entry = { key, watcher, closed: false };
        watcher.addEventListener("close", () => {
          entry.closed = true;
          if (disposed || pendingClose !== null) return;
          // A browser may group watchers created without separate user
          // activations. Let the entire close request finish, then unwind
          // only one VE layer and recreate any still-visible watchers.
          pendingClose = setTimeout(() => {
            pendingClose = null;
            if (disposed) return;
            try { lastAction = String(onBack?.() ?? "none"); }
            catch (error) {
              lastAction = "error";
              trace({ action: "close-watcher-error", error: String(error) });
            }
            sync();
          }, 0);
        });
        entries.push(entry);
      } catch (error) {
        trace({ action: "close-watcher-unavailable", error: String(error) });
        break;
      }
    }
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    if (pendingClose !== null) clearTimeout(pendingClose);
    pendingClose = null;
    while (entries.length) entries.pop().watcher.destroy();
  };
  scope?.own?.(dispose);
  return Object.freeze({
    sync,
    dispose,
    snapshot: () => Object.freeze({
      supported: isAndroid() && typeof getWindow?.()?.CloseWatcher === "function",
      activeLayers: Object.freeze(entries.filter((entry) => !entry.closed).map((entry) => entry.key.split(":", 1)[0])),
      pendingClose: pendingClose !== null,
      lastAction
    })
  });
}

/** Bottom-to-top state-owned Back surfaces; the dispatcher handles DOM layers. */
export function veCloseWatcherLayers(state = {}, { splitActive = false, nativeLayers = [] } = {}) {
  if (state.modeTransition || state.reconnect || state.templatePlacement) return [];
  const layers = [];
  if (state.route && state.route !== "characters") layers.push(`route:${state.route}`);
  if (splitActive) layers.push("split-pane");
  if (state.sceneChooserOpen) layers.push("scene-chooser");
  if (state.route === "journals" && state.journal) layers.push(`journal:${state.journal.id ?? "open"}`);
  if (state.journalMenuOpen) layers.push("journal-page-menu");
  if (state.characterItemId) layers.push(`item:${state.characterItemId}`);
  if (state.journalImage) layers.push(`journal-image:${state.journalImage.src}`);
  if (state.portraitImage) layers.push(`portrait:${state.portraitImage.src}`);
  if (state.xpEditor) layers.push("experience-editor");
  if (state.spellSlotEditor) layers.push("spell-slot-editor");
  if (state.restEditor) layers.push("rest-editor");
  if (state.hitPointEditor) layers.push("hit-point-editor");
  if (state.actionSession) layers.push("action-session");
  if (state.actorTokenPlacement) layers.push("actor-token-placement");
  if (state.nativeTokenPlacement) layers.push("native-token-placement");
  layers.push(...nativeLayers);
  return layers;
}
