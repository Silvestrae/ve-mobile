const EMPTY_RELEASE = () => {};

/**
 * Local, opt-in performance counters for development and deterministic tests.
 * The observer does not persist, transmit, or schedule any work of its own.
 */
export function createPerformanceObserver({
  enabled = false,
  now = () => globalThis.performance?.now?.() ?? Date.now()
} = {}) {
  const counters = new Map();
  const timings = new Map();
  const activeResources = new Map();
  const active = () => typeof enabled === "function" ? Boolean(enabled()) : Boolean(enabled);

  const increment = (name, amount = 1) => {
    if (!active()) return 0;
    const next = (counters.get(name) ?? 0) + Number(amount || 0);
    counters.set(name, next);
    return next;
  };

  const track = (name) => {
    if (!active()) return EMPTY_RELEASE;
    increment(`${name}.created`);
    increment(`${name}.active`);
    activeResources.set(name, (activeResources.get(name) ?? 0) + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const remaining = Math.max(0, (activeResources.get(name) ?? 1) - 1);
      if (remaining) activeResources.set(name, remaining);
      else activeResources.delete(name);
      increment(`${name}.active`, -1);
    };
  };

  const start = (name) => {
    if (!active()) return EMPTY_RELEASE;
    const startedAt = now();
    let finished = false;
    return () => {
      if (finished) return;
      finished = true;
      const elapsed = Math.max(0, Number(now()) - Number(startedAt));
      const current = timings.get(name) ?? { count: 0, total: 0, maximum: 0, last: 0 };
      timings.set(name, {
        count: current.count + 1,
        total: current.total + elapsed,
        maximum: Math.max(current.maximum, elapsed),
        last: elapsed
      });
    };
  };

  return Object.freeze({
    get enabled() { return active(); },
    increment,
    track,
    start,
    reset() {
      counters.clear();
      timings.clear();
      for (const [name, count] of activeResources) counters.set(`${name}.active`, count);
    },
    snapshot() {
      return Object.freeze({
        enabled: active(),
        counters: Object.freeze(Object.fromEntries([...counters].sort(([left], [right]) => left.localeCompare(right)))),
        timings: Object.freeze(Object.fromEntries([...timings].sort(([left], [right]) => left.localeCompare(right)).map(([name, value]) => [name, Object.freeze({ ...value })])))
      });
    }
  });
}
