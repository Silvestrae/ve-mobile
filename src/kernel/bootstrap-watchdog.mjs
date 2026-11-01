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

  // Retire this watchdog; its already-owned timer will become harmless when it fires.
  const stop = () => {
    stopped = true;
  };

  // Report one recovery reason at most, even if several stall checks notice it.
  const trigger = (reason) => {
    if (stopped) return;
    stopped = true;
    onStall?.(reason);
  };

  // Give a long-suspended page a chance to resume before calling startup stuck.
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

  // Remember when the tab hides and start the resume grace period when it returns.
  const reconcileVisibility = () => {
    if (document?.visibilityState === "hidden") {
      if (hiddenAt === null) hiddenAt = now();
      return false;
    }
    handleVisible();
    return true;
  };

  // Recheck progress while visible, then schedule the next check through the owning task scope.
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
    // Record real lifecycle progress and end any resume-grace period.
    progress() {
      if (stopped) return;
      lastProgressAt = now();
      progressVersion += 1;
      resumeGraceUntil = 0;
    },
    stop
  });
}
