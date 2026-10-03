/** A tiny event store. State transitions stay independent from the renderer. */
export function createSignalStore(initialState, reduce) {
  let state = Object.freeze({ ...initialState });
  const listeners = new Set();

  const publish = () => {
    for (const listener of [...listeners]) listener(state);
  };

  return Object.freeze({
    get state() {
      return state;
    },
    dispatch(event) {
      const next = reduce(state, event);
      if (!next || next === state) return state;
      state = Object.freeze(next);
      publish();
      return state;
    },
    subscribe(listener, { immediate = true } = {}) {
      listeners.add(listener);
      if (immediate) listener(state);
      return () => listeners.delete(listener);
    }
  });
}
