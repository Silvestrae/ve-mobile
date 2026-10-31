import { createActorDirectoryRecord, createActorViewRecord } from "./actor-view.mjs";
import { collectiveReferenceUuids } from "./collective-actor-view.mjs";
import { dnd5eActorActions } from "./actor-actions.mjs";
import { dnd5eActionMessages } from "./action-messages.mjs";
import { createArmorClassGateway } from "./armor-class-gateway.mjs";
import { createFoundryActiveEffectContextGateway } from "./active-effect-context-gateway.mjs";
import { createFoundryActionSessionGateway } from "./action-session-gateway.mjs";
import { createFoundryBiographyGateway } from "./biography-gateway.mjs";
import { createActorEditorGateway } from "./actor-editor-gateway.mjs";
import { createFoundryQuickbarGateway } from "./quickbar-gateway.mjs";
import { createFoundryHotbarGateway } from "./hotbar-gateway.mjs";
import { createFoundryTemplatePlacementGateway } from "./template-placement-gateway.mjs";
import { createNativeTokenPlacementGateway } from "./native-token-placement-gateway.mjs";

/** Immutable capabilities, not a registry or an owner of runtime resources.
 * Each factory keeps the existing gateway's scope, authority and cleanup rules.
 * The D&D5e 5.3/6.x native differences remain inside their existing implementations. */
export const dnd5eIntegration = Object.freeze({
  id: "dnd5e",
  actors: Object.freeze({
    directory: createActorDirectoryRecord,
    view: createActorViewRecord,
    references: collectiveReferenceUuids,
    eligible(actor, user, { canObserve, canOwn }) {
      if (["character", "group", "vehicle"].includes(actor?.type)) return canObserve(actor, user);
      if (actor?.type === "npc") return Boolean(user?.isGM) || canOwn(actor, user);
      return false;
    },
    directoryFieldsChanged(fields) {
      return fields.some(field => /^system\.(?:details\.(?:level|cr|type)|traits\.size)(?:\.|$)/u.test(field));
    },
    directoryItemChanged(item) { return item?.type === "class"; }
  }),
  actions: dnd5eActorActions,
  messages: dnd5eActionMessages,
  settingsInvalidation(fullKey) {
    if (["dnd5e.levelingMode", "dnd5e.metricLengthUnits", "dnd5e.metricWeightUnits", "dnd5e.metricTravelUnits"].includes(fullKey)) {
      return { domains: Object.freeze(["actors"]), refreshSelectedActor: true };
    }
    if (fullKey === "dnd5e.initiativeDexTiebreaker") return { domains: Object.freeze(["combat"]) };
    return null;
  },
  initiativeDecimals(game) {
    try { return game?.settings?.get?.("dnd5e", "initiativeDexTiebreaker") === true ? 2 : 0; }
    catch { return 0; }
  },
  services: Object.freeze({
    armorClass: createArmorClassGateway,
    activeEffects: createFoundryActiveEffectContextGateway,
    actionSession: createFoundryActionSessionGateway,
    biography: createFoundryBiographyGateway,
    actorEditor: createActorEditorGateway,
    quickbar: createFoundryQuickbarGateway,
    hotbar: createFoundryHotbarGateway,
    templates: createFoundryTemplatePlacementGateway,
    tokenPlacement: createNativeTokenPlacementGateway
  })
});
