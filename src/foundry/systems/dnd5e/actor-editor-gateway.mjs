import { createActorEditorGateway as createNativeActorEditorGateway } from "../../native-actor-editor-gateway.mjs";
import { createClassAdvancementGateway } from "./class-advancement-gateway.mjs";

// Share the mobile lifecycle for native editing and advancement while each owns its applications.
export function createActorEditorGateway(options) {
  const editor = createNativeActorEditorGateway(options);
  const advancement = createClassAdvancementGateway(options);
  return Object.freeze({
    ...editor,
    advanceClass: advancement.open,
    listClasses: advancement.listClasses,
    addClass: advancement.addClass,
    closeAll() {
      advancement.closeAll();
      editor.closeAll();
    }
  });
}
