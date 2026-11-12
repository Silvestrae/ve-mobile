// Pair the fetch and publication steps with the connection-generation.mjs guard.
export function createAuthoritativeResynchronizer({ generation, fetchSnapshot, applySnapshot, onError = () => {} }) {
  let request = 0;
  let disposed = false;
  let activeController = null;
  return Object.freeze({
    // Fetch for this generation and apply only if no newer request or disposal superseded it.
    async run(remoteGeneration) {
      const requestedGeneration = Math.max(0, Number(remoteGeneration) || 0);
      const activeGeneration = generation.matches(requestedGeneration)
        ? requestedGeneration
        : generation.advance(requestedGeneration);
      const activeRequest = ++request;
      // A replacement generation also releases in-flight Foundry listeners while its old transport request settles.
      activeController?.abort();
      const controller = activeController = new AbortController();
      try {
        const context = {
          generation: activeGeneration,
          signal: controller.signal,
          isCurrent: () => !disposed && request === activeRequest && generation.matches(activeGeneration)
        };
        const snapshot = await fetchSnapshot(context);
        if (!context.isCurrent() || snapshot === null) return Object.freeze({ applied: false, generation: activeGeneration });
        await Promise.resolve(applySnapshot(snapshot, activeGeneration, context));
        if (!context.isCurrent()) return Object.freeze({ applied: false, generation: activeGeneration });
        return Object.freeze({ applied: true, generation: activeGeneration });
      } catch (error) {
        if (!disposed && request === activeRequest && generation.matches(activeGeneration)) onError(error, activeGeneration);
        return Object.freeze({ applied: false, generation: activeGeneration, error });
      } finally {
        if (activeController === controller) activeController = null;
      }
    },
    // A disconnect cancels pending I/O without disposing the runtime needed by the next connection generation.
    cancel() { request += 1; activeController?.abort(); activeController = null; },
    dispose() { disposed = true; request += 1; activeController?.abort(); activeController = null; }
  });
}
