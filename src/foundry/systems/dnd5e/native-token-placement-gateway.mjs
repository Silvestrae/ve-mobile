import { createNativeTokenPlacementGateway as createNative } from "../../native-token-placement-gateway.mjs";
export * from "../../native-token-placement-gateway.mjs";
export function createNativeTokenPlacementGateway(options = {}) {
  return createNative({ getPlacementClass: () => globalThis.game?.system?.canvas?.TokenPlacement, ...options });
}
