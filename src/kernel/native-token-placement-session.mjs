/** Own the mobile presentation for a native D&D5e TokenPlacement request. */
export function createNativeTokenPlacementController({ store, sceneReadiness, sceneGateway,
  presentation, nativeGateway, scope, diagnostics }) {
  let current = null;
  let generation = 0;

  const clear = (session) => {
    if (current !== session) return;
    current = null;
    session.abort.abort();
    session.owner.dispose();
    store.dispatch({ type: "native-token-placement-changed", placement: null });
    // Preserve the user's Character route on Split Screen. On a full-screen
    // handoff, return only if VE still owns the Scene route it opened.
    if (session.navigated && store.state.route === "scene"
      && store.state.routeHistory?.at(-1) === session.originalRoute) {
      store.dispatch({ type: "navigate-back" });
    }
  };

  const cancel = () => {
    if (!current) return false;
    current.adapter.cancel();
    if (current.adapter.phase === "cancelling") current.abort.abort();
    return true;
  };

  const begin = async (adapter) => {
    if (current || scope.disposed || !store.state.snapshot?.scene?.canvasReady
      || store.state.reconnect || store.state.modeTransition || store.state.templatePlacement
      || store.state.actorTokenPlacement) return false;
    const owner = scope.child(`native-token-placement:${++generation}`);
    const abort = new AbortController();
    const session = { adapter, owner, abort, generation, originalRoute: store.state.route,
      sceneId: String(store.state.snapshot.scene.id),
      navigated: !presentation.readSceneInteractionState()?.sceneExposed };
    current = session;
    adapter.onChange((placement) => {
      if (current === session && !owner.disposed) {
        store.dispatch({ type: "native-token-placement-changed", placement });
      }
    });
    adapter.onFinish(() => clear(session));
    try {
      const ready = await sceneReadiness.ensure({ signal: abort.signal });
      if (current !== session || abort.signal.aborted || owner.disposed
        || String(store.state.snapshot?.scene?.id) !== session.sceneId) return false;
      session.navigated = ready.navigated;
      sceneGateway.refreshPresentation(owner);
      return true;
    } catch (error) {
      diagnostics?.record?.("warn", "Native token placement could not reach a ready Scene", error);
      clear(session);
      return false;
    }
  };

  nativeGateway.enable(scope, begin);
  scope.own(store.subscribe((state) => {
    if (!current) return;
    if (state.reconnect || state.modeTransition || state.templatePlacement || state.actorTokenPlacement
      || !state.snapshot?.scene?.canvasReady || String(state.snapshot.scene.id) !== current.sceneId) cancel();
  }, { immediate: false }));
  scope.hook("canvasTearDown", cancel);

  return Object.freeze({
    get active() { return Boolean(current); },
    position: (point) => current?.adapter.position(point) ?? false,
    place: () => current?.adapter.confirm() ?? false,
    cancel,
    stop() {
      if (!current) return;
      current.adapter.cancel();
      clear(current);
    }
  });
}
