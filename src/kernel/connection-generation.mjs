// Share the current connection number with app-kernel.mjs and authoritative-resync.mjs.
export function createConnectionGeneration(initial = 0) {
  let value = Math.max(0, Number(initial) || 0);
  return Object.freeze({
    get current() { return value; },
    // Always move forward, even if the server reports a lower or repeated generation.
    advance(remoteGeneration) {
      const remote = Math.max(0, Number(remoteGeneration) || 0);
      value = Math.max(value + 1, remote);
      return value;
    },
    matches(candidate) { return Number(candidate) === value; }
  });
}
