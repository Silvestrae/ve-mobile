export const MOBILE_RECONNECT_GRACE_MS = 5 * 60 * 1000;

/**
 * Replace Foundry 13's five-second reconnect reload with a mobile-sized grace
 * period for exactly one active VE Mobile lifetime.
 */
export function enableMobileConnectionGrace(scope, {
  getSocket = () => game.socket,
  getDocument = () => globalThis.document,
  now = () => Date.now(),
  notify = () => ui.notifications.info(`${CONST.vtt} | Server connection re-established.`),
  onDisconnect = () => {},
  onReconnect = () => {},
  onTrustedResume = () => {},
  graceMs = MOBILE_RECONNECT_GRACE_MS
} = {}) {
  const socket = getSocket();
  const manager = socket?.io;
  if (!socket?.on || !socket?.off || !manager?.on || !manager?.off || !manager?.listeners) return false;

  const coreReconnect = Array.from(manager.listeners("reconnect") ?? []).find(isFoundryReconnectListener);
  if (!coreReconnect) {
    console.warn("VE Mobile | Foundry reconnect handler was not recognized; connection recovery was left unchanged.");
    return false;
  }

  const restoreAttempts = extendReconnectAttempts(manager, graceMs);
  let disconnectedAt = null;
  let generation = 0;
  let hiddenGeneration = null;

  const rememberDisconnect = (reason) => {
    if (disconnectedAt !== null) return;
    disconnectedAt = now();
    generation += 1;
    try {
      onDisconnect(Object.freeze({ generation, reason: String(reason ?? "transport-disconnected") }));
    } catch (error) {
      console.warn("VE Mobile | Could not suspend the mobile view after disconnecting", error);
    }
  };

  const handleReconnect = () => {
    const elapsedMs = disconnectedAt === null ? Number.POSITIVE_INFINITY : Math.max(0, now() - disconnectedAt);
    disconnectedAt = null;

    if (elapsedMs >= graceMs) {
      coreReconnect();
      return;
    }

    notify();
    try {
      onReconnect(Object.freeze({ elapsedMs, recovered: Boolean(socket.recovered), generation }));
    } catch (error) {
      console.warn("VE Mobile | Could not refresh the mobile view after reconnecting", error);
    }
  };

  manager.off("reconnect", coreReconnect);
  socket.on("disconnect", rememberDisconnect);
  manager.on("reconnect", handleReconnect);
  const document = getDocument();
  const onVisibility = () => {
    if (document?.visibilityState === "hidden") hiddenGeneration = generation;
    else if (document?.visibilityState === "visible") {
      if (hiddenGeneration !== null && hiddenGeneration === generation && disconnectedAt === null && socket.connected) {
        onTrustedResume(Object.freeze({ generation }));
      }
      hiddenGeneration = null;
    }
  };
  scope.listen?.(document, "visibilitychange", onVisibility);

  scope.own(() => {
    socket.off("disconnect", rememberDisconnect);
    manager.off("reconnect", handleReconnect);
    if (!Array.from(manager.listeners("reconnect") ?? []).includes(coreReconnect)) {
      manager.on("reconnect", coreReconnect);
    }
    restoreAttempts();
  });

  return true;
}

function isFoundryReconnectListener(listener) {
  if (typeof listener !== "function") return false;
  const source = Function.prototype.toString.call(listener);
  return source.includes("Server connection re-established.") && source.includes("debouncedReload");
}

function extendReconnectAttempts(manager, graceMs) {
  const configuredDelay = Number(manager.reconnectionDelay?.() ?? manager._reconnectionDelay ?? 500);
  const configuredDelayMax = Number(manager.reconnectionDelayMax?.() ?? manager._reconnectionDelayMax ?? configuredDelay);
  const attemptInterval = Math.max(250, configuredDelay, configuredDelayMax);
  const minimumAttempts = Math.max(10, Math.ceil(graceMs / attemptInterval));

  if (typeof manager.reconnectionAttempts === "function") {
    const previous = Number(manager.reconnectionAttempts());
    manager.reconnectionAttempts(Math.max(Number.isFinite(previous) ? previous : 0, minimumAttempts));
    return () => {
      if (Number.isFinite(previous)) manager.reconnectionAttempts(previous);
    };
  }

  const previous = manager._reconnectionAttempts;
  if (Number.isFinite(previous)) manager._reconnectionAttempts = Math.max(previous, minimumAttempts);
  return () => {
    if (Number.isFinite(previous)) manager._reconnectionAttempts = previous;
  };
}
