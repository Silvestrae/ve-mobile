import { createFoundryTemplatePlacementGateway as createNative } from "../../native-template-placement-gateway.mjs";
export * from "../../native-template-placement-gateway.mjs";
/** D&D5e template-placement adapter over the shared native placement gateway. */
export function createFoundryTemplatePlacementGateway(options = {}) {
  return createNative({ getAbilityTemplateClass: () => globalThis.game?.system?.canvas?.AbilityTemplate, ...options });
}
