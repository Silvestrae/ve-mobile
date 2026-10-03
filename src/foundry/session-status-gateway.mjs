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
      let last = "";
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

function finiteMetric(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : null;
}

function userColor(user) {
  const value = user?.color?.css ?? user?.color;
  return /^#[0-9a-f]{3,8}$/iu.test(String(value ?? "")) ? String(value) : "#888888";
}
