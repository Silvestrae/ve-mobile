/**
 * Plain, informational session status. Remote performance metrics are absent
 * because Foundry v13 does not expose them; no telemetry is added to obtain them.
 */
export function createFoundrySessionStatusGateway({
  getGame = () => globalThis.game,
  metrics
} = {}) {
  let latestMetrics = Object.freeze({ latency: null, fps: null });

  const snapshot = () => {
    // Status is presentation data only: latency/FPS are attached to this client,
    // while Foundry does not provide corresponding remote-client measurements.
    const game = getGame();
    const currentId = String(game?.user?.id ?? game?.userId ?? "");
    const users = [...(game?.users ?? [])]
      .filter((user) => user?.active)
      .map((user) => Object.freeze({
        id: String(user.id ?? ""),
        name: String(user.name ?? "Player"),
        color: userColor(user),
        isSelf: String(user.id ?? "") === currentId,
        isGM: Boolean(user.isGM),
        latency: String(user.id ?? "") === currentId ? finiteMetric(latestMetrics.latency) : null,
        fps: String(user.id ?? "") === currentId ? finiteMetric(latestMetrics.fps) : null
      }))
      .sort((a, b) => Number(b.isSelf) - Number(a.isSelf) || Number(b.isGM) - Number(a.isGM) || a.name.localeCompare(b.name));
    return Object.freeze({ users: Object.freeze(users) });
  };

  return Object.freeze({
    snapshot,
    watch(scope, onUpdate) {
      // Publish once, then deduplicate user and local-metric events by snapshot
      // content; every hook is owned by the supplied lifecycle scope.
      let last = "";
      // Publish connection and session status changes to the current session owner.
      const publish = () => {
        const next = snapshot();
        const signature = JSON.stringify(next);
        if (signature === last) return;
        last = signature;
        onUpdate(next);
      };
      publish();
      metrics?.watch?.(scope, (value) => {
        latestMetrics = Object.freeze({ latency: finiteMetric(value?.latency), fps: finiteMetric(value?.fps) });
        publish();
      });
      scope.hook?.("userConnected", publish);
      scope.hook?.("updateUser", publish);
      scope.hook?.("deleteUser", publish);
      return snapshot();
    }
  });
}

// Normalize an optional finite session metric for the public status record.
function finiteMetric(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : null;
}

// Resolve a safe display color for the current Foundry user.
function userColor(user) {
  const value = user?.color?.css ?? user?.color;
  return /^#[0-9a-f]{3,8}$/iu.test(String(value ?? "")) ? String(value) : "#888888";
}
