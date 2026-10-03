/**
 * Own one mobile measured-template placement generation. Native Foundry/D&D5e
 * owns preview geometry and settlement; this coordinator owns presentation,
 * readiness, and deterministic restoration.
 */
export function createTemplatePlacementController({
  store,
  sceneReadiness,
  sceneGateway,
  presentation,
  nativeGateway,
  sessionGateway,
  scope,
  diagnostics
}) {
  let current = null;
  let generation = 0;

  const publish = (session, phase = session.phase) => {
    session.phase = phase;
    store.dispatch({
      type: "template-placement-changed",
      placement: Object.freeze({
        id: session.id,
        type: session.adapter.type,
        rotatable: session.adapter.rotatable,
        labels: session.adapter.labels ?? Object.freeze({}),
        phase
      })
    });
  };

  const clear = (session) => {
    if (current !== session) return;
    current = null;
    session.abort.abort();
    session.scope.dispose();
    store.dispatch({ type: "template-placement-ended", id: session.id });
    sessionGateway?.setTargetPublicationDeferred?.(false);
  };

  const restorePresentation = async (session) => {
    if (!session.wasSplitScreen) return;
    const before = presentation.readSceneInteractionState();
    const anchor = sceneGateway.captureViewportAnchor(before.viewport);
    await presentation.setSceneFocusOverride(false, { signal: session.abort.signal });
    sceneGateway.refreshPresentation(session.scope);
    const ready = await sceneReadiness.ensure({ signal: session.abort.signal });
    if (anchor && ready.viewport) sceneGateway.restoreViewportAnchor(anchor, ready.viewport);
  };

  const end = async (session, kind, { nativeAlreadySettled = false } = {}) => {
    if (current !== session) return false;
    if (session.ending) return session.ending;
    session.ending = (async () => {
      publish(session, kind === "place" ? "placing" : "cancelling");
      let failure = null;
      try {
        if (!nativeAlreadySettled) {
          if (kind === "place") await session.adapter.commit();
          else await session.adapter.cancel().catch(() => {});
        }
        // D&D5e places target.count previews sequentially. Yield to the native
        // workflow so an immediately-following preview can join this focused
        // presentation without a Split Screen restore/collapse flicker.
        if (kind === "place") {
          await Promise.resolve();
          if (session.nextAdapter && current === session) {
            session.adapter = session.nextAdapter;
            session.nextAdapter = null;
            session.id = `${session.adapter.id}:${++generation}`;
            session.generation = generation;
            session.ending = null;
            watchNativeSettlement(session);
            watchPreviewRemoval(session, session.adapter);
            publish(session, "awaiting-initial-placement");
            return true;
          }
        }
      } catch (error) {
        failure = error;
      }
      try {
        await restorePresentation(session);
      } catch (error) {
        failure ??= error;
      }
      try {
        if (session.originalControlledTokenIdentity) {
          nativeGateway.restoreControlledToken?.(session.originalControlledTokenIdentity);
        }
      } catch (error) {
        diagnostics?.record?.("warn", "The originally controlled token could not be restored after template placement.", error);
      } finally {
        presentation.setSceneFocusOverride(false, { immediate: true }).catch?.(() => {});
        clear(session);
      }
      if (failure && kind === "place") throw failure;
      return !failure;
    })();
    return session.ending;
  };

  const begin = async (adapter) => {
    if (!adapter?.supported) return false;
    if (current) {
      if (current.phase === "placing" && current.ending && !current.nextAdapter) {
        current.nextAdapter = adapter;
        return true;
      }
      diagnostics?.record?.("warn", "A second measured-template preview was rejected while mobile placement was active.");
      await adapter.cancel().catch(() => {});
      return false;
    }
    const id = `${adapter.id}:${++generation}`;
    const owner = scope.child(`template-placement:${id}`);
    const abort = new AbortController();
    const initialPresentation = presentation.readSceneInteractionState();
    const session = {
      id,
      generation,
      adapter,
      scope: owner,
      abort,
      phase: "preparing",
      wasSplitScreen: Boolean(initialPresentation.splitScreen),
      sceneId: String(store.state.snapshot?.scene?.id ?? ""),
      formFactor: store.state.formFactor,
      orientation: store.state.orientation,
      originalControlledTokenIdentity: adapter.originalControlledTokenIdentity ?? null,
      ending: null
    };
    current = session;
    sessionGateway?.setTargetPublicationDeferred?.(true);
    publish(session);
    watchNativeSettlement(session);
    watchPreviewRemoval(session, adapter);

    try {
      let entryAnchor = null;
      if (session.wasSplitScreen) {
        entryAnchor = sceneGateway.captureViewportAnchor(initialPresentation.viewport);
        await presentation.setSceneFocusOverride(true, { signal: abort.signal });
        sceneGateway.refreshPresentation(owner);
      }
      const ready = await sceneReadiness.ensure({ signal: abort.signal });
      if (entryAnchor && ready.viewport) sceneGateway.restoreViewportAnchor(entryAnchor, ready.viewport);
      if (current !== session || abort.signal.aborted || session.ending) return false;
      publish(session, "awaiting-initial-placement");
      return true;
    } catch (error) {
      diagnostics?.record?.("warn", "Measured-template placement could not reach a ready Scene", error);
      await end(session, "cancel").catch(() => {});
      return false;
    }
  };

  const watchNativeSettlement = (session) => {
    const adapter = session.adapter;
    adapter.settle.then(
      () => { if (current === session && session.adapter === adapter && !session.ending) void end(session, "place", { nativeAlreadySettled: true }); },
      () => { if (current === session && session.adapter === adapter && !session.ending) void end(session, "cancel", { nativeAlreadySettled: true }); }
    );
  };

  const watchPreviewRemoval = (session, adapter) => {
    adapter.watchRemoval?.(session.scope, () => {
      if (current === session && session.adapter === adapter && !session.ending) void end(session, "cancel");
    });
  };

  nativeGateway.enable(scope, begin);

  let observed = {
    sceneId: String(store.state.snapshot?.scene?.id ?? ""),
    formFactor: store.state.formFactor,
    orientation: store.state.orientation
  };
  scope.own(store.subscribe((state) => {
    const next = {
      sceneId: String(state.snapshot?.scene?.id ?? ""),
      formFactor: state.formFactor,
      orientation: state.orientation
    };
    const changed = next.sceneId !== observed.sceneId
      || next.formFactor !== observed.formFactor
      || next.orientation !== observed.orientation;
    observed = next;
    if (changed && current && !current.ending) void end(current, "cancel");
  }));
  scope.hook("canvasTearDown", () => { if (current) void end(current, "cancel"); });

  return Object.freeze({
    get active() { return Boolean(current); },
    setInitialPosition(clientPoint) {
      const session = current;
      if (session?.phase !== "awaiting-initial-placement") return false;
      const positioned = session.adapter.establishInitialOrigin?.(clientPoint) === true;
      if (positioned && current === session && session.phase === "awaiting-initial-placement" && !session.ending) {
        publish(session, "adjusting");
      }
      return positioned;
    },
    place() {
      return current?.phase === "adjusting" ? end(current, "place") : Promise.resolve(false);
    },
    cancel() {
      return current ? end(current, "cancel") : Promise.resolve(false);
    },
    bindGestures(surface, owner, onOverlay) {
      if (current?.phase !== "adjusting") return null;
      return current.adapter.bindGestures(surface, owner, onOverlay);
    },
    stop() {
      const session = current;
      if (!session) return;
      void session.adapter.cancel().catch(() => {});
      void presentation.setSceneFocusOverride(false, { immediate: true });
      clear(session);
    }
  });
}
