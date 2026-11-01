import { createNativeTokenPlacementGateway as createNative } from "../../native-token-placement-gateway.mjs";
export * from "../../native-token-placement-gateway.mjs";
/** D&D5e token-placement adapter retaining shared Foundry placement rules. */
export function createNativeTokenPlacementGateway(options = {}) {
  return createNative({ getPlacementClass: () => globalThis.game?.system?.canvas?.TokenPlacement, ...options });
}
