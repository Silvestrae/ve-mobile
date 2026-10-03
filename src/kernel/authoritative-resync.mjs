export function createAuthoritativeResynchronizer({ generation, fetchSnapshot, applySnapshot, onError = () => {} }) {
  let request = 0;
  let disposed = false;
  return Object.freeze({
    async run(remoteGeneration) {
      const requestedGeneration = Math.max(0, Number(remoteGeneration) || 0);
      const activeGeneration = generation.matches(requestedGeneration)
        ? requestedGeneration
        : generation.advance(requestedGeneration);
      const activeRequest = ++request;
      try {
        const context = {
          generation: activeGeneration,
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
      }
    },
    dispose() { disposed = true; request += 1; }
  });
}
