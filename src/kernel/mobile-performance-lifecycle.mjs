/** Serializes mobile profile ownership across presentation transitions. */
export function createMobilePerformanceLifecycle({ authority, gateway, handoff, readEntryHandoff = () => null, clearEntryHandoff = async () => {}, requestReload = () => {}, onError = () => {} }) {
  let observed = null;
  let sessionBegun = false;
  let transition = Promise.resolve(Object.freeze({ action: "none" }));

  const reconcile = () => {
    const mobile = authority.refresh();
    if (observed === mobile) return transition;
    const fresh = observed === false;
    const entryHandoff = mobile ? readEntryHandoff() : null;
    const entryToken = entryHandoff?.version === 1 ? String(entryHandoff.token ?? "") : "";
    const token = authority.capture();
    observed = mobile;
    transition = transition.catch(onError).then(async () => {
      if (mobile) {
        if (!authority.allows(token)) return Object.freeze({ action: "superseded" });
        await gateway.beginMobileSession({ fresh: fresh || Boolean(entryToken), entryToken });
        sessionBegun = true;
        if (entryToken) await clearEntryHandoff();
        if (!authority.allows(token)) return Object.freeze({ action: "superseded" });
        await gateway.retireLegacyUnlocks();
        const snapshot = gateway.snapshot();
        if (snapshot.profile === "normal" || snapshot.effective) return Object.freeze({ action: "active", snapshot });
        const result = await handoff.apply(snapshot.profile, { source: "mobile-entry" });
        return Object.freeze({ action: result.reloadTriggered ? "reload" : "active", result });
      }
      if (!sessionBegun) return Object.freeze({ action: "desktop" });
      const result = await gateway.restoreForDesktop();
      sessionBegun = false;
      if (result.requiresReload && !authority.active()) await requestReload();
      return Object.freeze({ action: "desktop-restored", result });
    });
    return transition;
  };

  return Object.freeze({ reconcile, whenIdle: () => transition });
}
