import { localizedText } from "../ui/localized-text.mjs";
/**
 * Serialize responsive presentation changes. A newer request invalidates an
 * older generation, while resize/orientation noise within one animation frame
 * is coalesced into the latest requested policy.
 */
export function createModeTransitionCoordinator({
  readPolicy,
  localize = null,
  capture = () => null,
  apply,
  settle,
  restore = () => {},
  onStart = () => {},
  onProgress = () => {},
  onCheckpoint = () => {},
  onFinish = () => {},
  onError = () => {},
  now = () => globalThis.performance?.now?.() ?? Date.now(),
  watchdogMs = 6000,
  scheduleWatchdog = (callback, delay) => setTimeout(callback, delay),
  cancelWatchdog = (handle) => clearTimeout(handle),
  scheduleFrame = (callback) => globalThis.requestAnimationFrame?.(callback) ?? setTimeout(callback, 0),
  cancelFrame = (handle) => globalThis.cancelAnimationFrame?.(handle) ?? clearTimeout(handle)
}) {
  let requestedGeneration = 0;
  let scheduled = null;
  let running = false;
  let disposed = false;

  const schedule = () => {
    if (disposed || running || scheduled !== null) return;
    scheduled = scheduleFrame(() => {
      scheduled = null;
      void runLatest();
    });
  };

  const runLatest = async () => {
    if (disposed || running) return;
    running = true;
    const generation = requestedGeneration;
    const isCurrent = () => !disposed && generation === requestedGeneration;
    const policy = readPolicy();
    const startedAt = now();
    let checkpoint = "capture";
    let checkpointStartedAt = startedAt;
    let watchdog = null;
    const timings = {};
    const mark = (name, state = "complete", details = {}) => {
      checkpoint = name;
      const markedAt = now();
      const elapsedMs = Math.max(0, Math.round(markedAt - startedAt));
      if (state === "started") checkpointStartedAt = markedAt;
      else if (name === "complete") timings.total = elapsedMs;
      else timings[name] = Math.max(0, Math.round(markedAt - checkpointStartedAt));
      onCheckpoint({ generation, policy, checkpoint: name, state, elapsedMs, details });
    };
    let preserved;
    try {
      preserved = capture({ generation, policy });
      mark("capture");
      if (watchdogMs > 0) watchdog = scheduleWatchdog(() => {
        if (isCurrent()) onCheckpoint({ generation, policy, checkpoint, state: "stalled", elapsedMs: Math.max(0, Math.round(now() - startedAt)), details: {} });
      }, watchdogMs);
      onStart({ generation, policy, preserved, startedAt });
      mark("apply", "started");
      onProgress({ generation, phase: "applying", detail: localizedText(localize, "VEMOBILE.Presentation.Applying", "Applying {mode} presentation", { mode: presentationLabel(policy, localize) }) });
      await Promise.resolve(apply(policy, { generation, isCurrent }));
      mark("apply");
      if (!isCurrent()) return mark("apply", "superseded");
      mark("viewport-settle", "started");
      onProgress({ generation, phase: "settling", detail: localizedText(localize, "VEMOBILE.Presentation.Settling", "Settling the rendered viewport") });
      const bounds = await settle({ generation, policy, isCurrent });
      mark("viewport-settle", "complete", { bounds });
      if (!isCurrent()) return mark("viewport-settle", "superseded", { bounds });
      mark("restore", "started");
      onProgress({ generation, phase: "restoring", detail: localizedText(localize, "VEMOBILE.Presentation.Restoring", "Restoring position and interactions") });
      await Promise.resolve(restore(preserved, bounds, { generation, policy, isCurrent }));
      mark("restore");
      if (!isCurrent()) return mark("restore", "superseded");
      mark("complete");
      onFinish({ generation, policy, bounds, timings: Object.freeze({ ...timings }), startedAt });
    } catch (error) {
      mark(checkpoint, isCurrent() ? "failed" : "superseded", { error: error?.message ?? String(error) });
      if (isCurrent()) onError(error, { generation, policy, checkpoint, timings: Object.freeze({ ...timings }), startedAt });
    } finally {
      if (watchdog !== null) cancelWatchdog(watchdog);
      running = false;
      if (!disposed && requestedGeneration > generation) schedule();
    }
  };

  return Object.freeze({
    request() {
      if (disposed) return 0;
      requestedGeneration += 1;
      schedule();
      return requestedGeneration;
    },
    get generation() {
      return requestedGeneration;
    },
    get pending() {
      return !disposed && (running || scheduled !== null);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      requestedGeneration += 1;
      if (scheduled !== null) cancelFrame(scheduled);
      scheduled = null;
    }
  });
}

export function presentationLabel(policy = {}, localize = null) {
  if (policy.formFactor === "tablet") return policy.orientation === "portrait" ? localizedText(localize, "VEMOBILE.Presentation.TabletPortrait", "Tablet portrait") : localizedText(localize, "VEMOBILE.Presentation.Tablet", "Tablet");
  return policy.formFactor === "phone" ? localizedText(localize, "VEMOBILE.Presentation.Phone", "Phone") : localizedText(localize, "VEMOBILE.Presentation.Mobile", "mobile");
}
