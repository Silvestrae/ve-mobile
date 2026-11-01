/** A tiny event store. State transitions stay independent from the renderer. */
export function createSignalStore(initialState, reduce) {
  let state = Object.freeze({ ...initialState });
  const listeners = new Set();

  // Iterate a copy so a listener can unsubscribe during notification without skipping another listener.
  const publish = () => {
    for (const listener of [...listeners]) listener(state);
  };

  return Object.freeze({
    get state() {
      return state;
    },
    // Publish only a real reducer state change and retain identity when the event is a no-op.
    dispatch(event) {
      const next = reduce(state, event);
      if (!next || next === state) return state;
      state = Object.freeze(next);
      publish();
      return state;
    },
    // Deliver the current state when requested and return the exact unsubscribe callback to its owner.
    subscribe(listener, { immediate = true } = {}) {
      listeners.add(listener);
      if (immediate) listener(state);
      return () => listeners.delete(listener);
    }
  });
}
