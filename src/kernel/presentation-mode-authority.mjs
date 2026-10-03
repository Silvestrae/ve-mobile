/** The resolved VE presentation, including a page-local Desktop override, owns mobile policy. */
export function isMobilePerformanceAuthorityActive(policyOrReader) {
  const policy = typeof policyOrReader === "function" ? policyOrReader() : policyOrReader;
  return policy?.active === true && (policy.runtimeMode === "phone" || policy.runtimeMode === "tablet");
}

/** A mode generation invalidates asynchronous writes even after a rapid return to mobile. */
export function createMobilePerformanceAuthority(readPolicy, ready = () => true) {
  let active = ready() && isMobilePerformanceAuthorityActive(readPolicy);
  let generation = 0;
  const refresh = () => {
    const next = ready() && isMobilePerformanceAuthorityActive(readPolicy);
    if (next !== active) {
      active = next;
      generation += 1;
    }
    return active;
  };
  return Object.freeze({
    refresh,
    active: () => refresh(),
    capture: () => refresh() ? generation : null,
    allows: (token) => token !== null && refresh() && token === generation,
    get generation() { refresh(); return generation; }
  });
}
