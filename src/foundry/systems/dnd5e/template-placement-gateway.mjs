import { createFoundryTemplatePlacementGateway as createNative } from "../../native-template-placement-gateway.mjs";
export * from "../../native-template-placement-gateway.mjs";
export function createFoundryTemplatePlacementGateway(options = {}) {
  return createNative({ getAbilityTemplateClass: () => globalThis.game?.system?.canvas?.AbilityTemplate, ...options });
}
