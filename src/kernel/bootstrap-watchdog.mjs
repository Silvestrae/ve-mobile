/** Detect a startup which stops reporting lifecycle progress. */
export function createBootstrapWatchdog({
  scope,
  onStall,
  getDocument = () => globalThis.document,
  now = () => Date.now(),
  stallAfterMs = 45_000,
  longBackgroundMs = 10_000,
  resumeGraceMs = 6_000,
  checkEveryMs = 5_000
}) {
  const document = getDocument();
  let lastProgressAt = now();
  let progressVersion = 0;
  let hiddenAt = document?.visibilityState === "hidden" ? now() : null;
  let resumeGraceUntil = 0;
  let stopped = false;

  const stop = () => {
    stopped = true;
  };

  const trigger = (reason) => {
    if (stopped) return;
    stopped = true;
    onStall?.(reason);
  };

  const handleVisible = () => {
    if (hiddenAt === null) return;
    const hiddenDuration = Math.max(0, now() - hiddenAt);
    hiddenAt = null;
    if (hiddenDuration < longBackgroundMs) return;
    const expectedVersion = progressVersion;
    resumeGraceUntil = now() + resumeGraceMs;
    scope.timeout(() => {
      if (stopped || document?.visibilityState === "hidden" || progressVersion !== expectedVersion) return;
      trigger("backgrounded");
    }, resumeGraceMs);
  };

  const reconcileVisibility = () => {
    if (document?.visibilityState === "hidden") {
      if (hiddenAt === null) hiddenAt = now();
      return false;
    }
    handleVisible();
    return true;
  };

  const check = () => {
    if (stopped) return;
    const visible = reconcileVisibility();
    const currentTime = now();
    if (visible && currentTime >= resumeGraceUntil && currentTime - lastProgressAt >= stallAfterMs) {
      trigger("stalled");
      return;
    }
    scope.timeout(check, checkEveryMs);
  };

  scope.listen(document, "visibilitychange", reconcileVisibility);
  scope.timeout(check, checkEveryMs);
  scope.own(stop);

  return Object.freeze({
    progress() {
      if (stopped) return;
      lastProgressAt = now();
      progressVersion += 1;
      resumeGraceUntil = 0;
    },
    stop
  });
}
