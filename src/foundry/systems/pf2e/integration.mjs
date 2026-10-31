import { createActorDirectoryRecord, createActorViewRecord } from "./actor-view.mjs";
import { pf2eActorActions } from "./actor-actions.mjs";
import { pf2eActionMessages } from "./action-messages.mjs";
import { createPf2eActionSessionGateway } from "./action-session-gateway.mjs";
import { createActorEditorGateway } from "../../native-actor-editor-gateway.mjs";
import { createFoundryTemplatePlacementGateway } from "../../native-template-placement-gateway.mjs";
import { createNativeTokenPlacementGateway } from "../../native-token-placement-gateway.mjs";
import { createPf2eBiographyGateway } from "./biography-gateway.mjs";
import { createPf2eItemDetailsGateway } from "./item-details-gateway.mjs";
import { createPf2eQuickbarGateway } from "./quickbar-gateway.mjs";
import { createPf2eHotbarGateway } from "./hotbar-gateway.mjs";
import { CommandError } from "../../command-support.mjs";
import { localizeFoundry } from "../../localization.mjs";

const actorTypes = Object.freeze(["character"]);
const unavailable = () => { throw new CommandError("CAPABILITY_UNAVAILABLE", localizeFoundry("VEMOBILE.PF2E.NativeEditorRequired", "Use the native PF2e sheet for this operation.")); };
export const pf2eIntegration = Object.freeze({
  id: "pf2e",
  assertCompatible(game) {
    const generation = Number(game?.release?.generation ?? String(game?.version ?? "").split(".")[0]);
    if (!Number.isInteger(generation) || generation < 14) throw new CommandError("UNSUPPORTED_CORE", localizeFoundry("VEMOBILE.PF2E.RequiresV14", "PF2e support requires Foundry v14 or later."));
  },
  actors: Object.freeze({
    directory: createActorDirectoryRecord, view: createActorViewRecord,
    references: () => [],
    eligible(actor, user, { canObserve }) {
      if (!actorTypes.includes(actor?.type)) return false;
      return canObserve(actor, user);
    },
    directoryFieldsChanged(fields) { return fields.some(field => /^system\.(?:details\.(?:level|ancestry|heritage)|traits)(?:\.|$)/u.test(field)); },
    directoryItemChanged(item) { return ["class", "ancestry", "heritage"].includes(item?.type); }
  }),
  actions: pf2eActorActions,
  messages: pf2eActionMessages,
  settingsInvalidation(key) {
    return key.startsWith("pf2e.") ? { domains: Object.freeze(["actors", "combat"]), refreshSelectedActor: true } : null;
  },
  initiativeDecimals: () => 0,
  services: Object.freeze({
    actorEditor: options => createActorEditorGateway({ ...options, actorTypes }),
    armorClass: () => Object.freeze({ open: unavailable }),
    activeEffects: () => Object.freeze({ open: unavailable, select: unavailable, close() {} }),
    actionSession: createPf2eActionSessionGateway,
    biography: createPf2eBiographyGateway,
    itemDetails: createPf2eItemDetailsGateway,
    quickbar: createPf2eQuickbarGateway,
    hotbar: createPf2eHotbarGateway,
    templates: options => createFoundryTemplatePlacementGateway({ ...options,
      isRegionTemplate: data => Boolean(data?.flags?.pf2e?.origin && data?.flags?.pf2e?.areaShape && data?.displayMeasurements && data?.highlightMode === "coverage"),
      // VE already exposes separate origin and direction handles. Native PF2e
      // supports Shift-confirm to commit that aimed shape in one step.
      confirmEvent: event => ({ ...event, shiftKey: true }),
      rotationStepForRegion: (shape, canvas) => canvas.grid?.type === 1 ? (shape.type === "cone" ? 45 : shape.type === "line" ? 5 : 1) : 1 }),
    tokenPlacement: createNativeTokenPlacementGateway
  })
});
