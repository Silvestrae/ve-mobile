const LATENCY_REFRESH_MS = 5_000;
const FPS_REFRESH_MS = 1_000;

/**
 * Low-overhead presentation metrics. Foundry's GameTime already measures
 * one-way server latency, so VE reads that authoritative sample and does not
 * add another socket heartbeat.
 */
export function createMobileMetrics({
  readGame = () => globalThis.game,
  readCanvas = () => globalThis.canvas,
  readDocument = () => globalThis.document,
  now = () => globalThis.performance?.now?.() ?? Date.now(),
  requestFrame = (callback) => globalThis.requestAnimationFrame(callback),
  cancelFrame = (id) => globalThis.cancelAnimationFrame(id),
  setTimer = (callback, delay) => globalThis.setTimeout(callback, delay),
  clearTimer = (id) => globalThis.clearTimeout(id)
} = {}) {
  return Object.freeze({
    watch(scope, onUpdate) {
      let frameId = null;
      let latencyTimer = null;
      let previousFrameAt = null;
      let sampleStartedAt = null;
      let frameCount = 0;
      let metrics = Object.freeze({ latency: null, fps: null });

      const publish = (next) => {
        metrics = Object.freeze({ ...metrics, ...next });
        onUpdate(metrics);
      };
      const visible = () => readDocument()?.visibilityState !== "hidden";
      const sampleLatency = () => {
        latencyTimer = null;
        if (!visible()) return;
        const oneWay = Number(readGame()?.time?.averageLatency);
        publish({ latency: Number.isFinite(oneWay) && oneWay >= 0 ? Math.round(oneWay * 2) : null });
        latencyTimer = setTimer(sampleLatency, LATENCY_REFRESH_MS);
      };
      const frame = (timestamp) => {
        if (!visible()) return;
        const current = Number.isFinite(timestamp) ? timestamp : now();
        if (sampleStartedAt === null) sampleStartedAt = current;
        if (previousFrameAt !== null && current - previousFrameAt < 250) frameCount += 1;
        previousFrameAt = current;
        const elapsed = current - sampleStartedAt;
        if (elapsed >= FPS_REFRESH_MS) {
          const foundrySamples = [...(readCanvas()?.fps?.values ?? [])].map(Number).filter(Number.isFinite);
          const foundryFps = foundrySamples.length
            ? Math.round(foundrySamples.reduce((total, value) => total + value, 0) / foundrySamples.length)
            : null;
          publish({ fps: foundryFps ?? (elapsed > 0 && frameCount > 1 ? Math.round(frameCount * 1000 / elapsed) : null) });
          sampleStartedAt = current;
          frameCount = 0;
        }
        frameId = requestFrame(frame);
      };
      const startFrames = () => {
        if (frameId !== null || !visible()) return;
        previousFrameAt = null;
        sampleStartedAt = null;
        frameCount = 0;
        frameId = requestFrame(frame);
      };
      const stopFrames = () => {
        if (frameId !== null) cancelFrame(frameId);
        frameId = null;
        previousFrameAt = null;
        sampleStartedAt = null;
        frameCount = 0;
      };
      const visibilityChanged = () => {
        if (visible()) {
          if (latencyTimer === null) sampleLatency();
          startFrames();
        } else {
          if (latencyTimer !== null) clearTimer(latencyTimer);
          latencyTimer = null;
          stopFrames();
          publish({ latency: null, fps: null });
        }
      };

      scope.listen(readDocument(), "visibilitychange", visibilityChanged);
      scope.own(() => {
        stopFrames();
        if (latencyTimer !== null) clearTimer(latencyTimer);
        latencyTimer = null;
      });
      sampleLatency();
      startFrames();
      return metrics;
    }
  });
}

export { LATENCY_REFRESH_MS, FPS_REFRESH_MS };
