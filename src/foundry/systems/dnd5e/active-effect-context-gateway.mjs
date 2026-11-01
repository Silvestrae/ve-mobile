import { localizeFoundry } from "../../localization.mjs";
import { resolveActorSource, validSourceUuid } from "../../character-source.mjs";

/** Retrieve D&D5e's own Active Effect descriptors while VE owns mobile menu presentation. */
export function createFoundryActiveEffectContextGateway({
  getGame = () => globalThis.game,
  getDocument = () => globalThis.document,
  getFoundry = () => globalThis.foundry,
  getHooks = () => globalThis.Hooks,
  diagnostics = null
} = {}) {
  let owned = null;
  let sequence = 0;

  return Object.freeze({
    // Build a native effect-context menu from the current Actor and captured session.
    async open(request, expectedSession = {}) {
      const game = getGame();
      assertSession(game, expectedSession);
      const explicitSourceUuid = Boolean(request?.actorSourceUuid);
      const actorSourceUuid = validSourceUuid(request?.actorSourceUuid || (request?.actorId ? `Actor.${request.actorId}` : ""));
      const effectId = identifier(request?.effectId, "effectId");
      const effectUuid = optionalIdentifier(request?.effectUuid, 512);
      const parentId = optionalIdentifier(request?.parentId, 128);
      const resolved = resolveEffect(game, actorSourceUuid, { effectId, effectUuid, parentId });
      if (!resolved) {
        record("stale", actorSourceUuid, effectId);
        return Object.freeze({ ok: true, action: "stale" });
      }
      if (!canOwn(resolved.actor, game.user)) {
        record("forbidden", actorSourceUuid, effectId);
        return Object.freeze({ ok: true, action: "unavailable", effectId });
      }
      record("effect-resolved", actorSourceUuid, effectId);
      await closeOwnedMenu();

      const bridge = createNativeProviderBridge({
        actor: resolved.actor,
        effect: resolved.effect,
        actorSourceUuid,
        effectReference: effectId,
        nativeDataset: resolved.nativeDataset,
        document: getDocument(),
        applications: getFoundry()?.applications?.instances,
        DialogV2: getFoundry()?.applications?.api?.DialogV2
      });
      let descriptors;
      try {
        descriptors = nativeDescriptors(bridge.component, bridge.anchor, resolved.effect, getHooks());
      } catch (error) {
        diagnostics?.record?.("warn", `Active Effect context | provider-error | actor=${actorSourceUuid} effect=${effectId}`, error);
        bridge.cleanup();
        throw error;
      }
      const menuId = `effect-menu-${++sequence}`;
      const options = descriptors.flatMap((descriptor, index) => {
        if (!eligible(descriptor, bridge.anchor)) return [];
        return [Object.freeze({
          id: String(index),
          label: localize(game, descriptor.name),
          icon: String(descriptor.icon ?? ""),
          group: String(descriptor.group ?? "")
        })];
      });
      if (!options.length) {
        record("options-unavailable", actorSourceUuid, effectId, { descriptorCount: descriptors.length });
        bridge.cleanup();
        return Object.freeze({ ok: true, action: "unavailable", effectId });
      }
      record("options-ready", actorSourceUuid, effectId, { descriptorCount: descriptors.length, eligibleCount: options.length });
      owned = {
        menuId, actorSourceUuid, effectId: String(resolved.effect.id),
        effectUuid: String(resolved.effect.uuid ?? ""),
        parentId: String(resolved.nativeDataset.parentId ?? ""), bridge, selecting: false
      };
      record("menu-record-opened", actorSourceUuid, effectId, { menuId });
      return Object.freeze({
        ok: true,
        action: "opened",
        effectId,
        menu: Object.freeze({
          id: menuId,
          ...(explicitSourceUuid ? { actorSourceUuid } : { actorId: String(resolved.actor.id ?? "") }),
          effectId,
          clientX: finiteCoordinate(request?.clientX),
          clientY: finiteCoordinate(request?.clientY),
          options: Object.freeze(options)
        })
      });
    },

    // Re-resolve the selected effect and invoke its native action only if the menu context remains current.
    async select(request, expectedSession = {}) {
      const current = owned;
      if (!current || String(request?.menuId ?? "") !== current.menuId) return Object.freeze({ ok: true, action: "stale" });
      if (current.selecting) return Object.freeze({ ok: true, action: "stale" });
      if (Object.hasOwn(request ?? {}, "actorSourceUuid") && request.actorSourceUuid !== current.actorSourceUuid) {
        await closeOwnedMenu();
        return Object.freeze({ ok: true, action: "stale" });
      }
      const game = getGame();
      assertSession(game, expectedSession);
      const resolved = resolveEffect(game, current.actorSourceUuid, current);
      if (!resolved || resolved.actor !== current.bridge.actor) {
        await closeOwnedMenu();
        return Object.freeze({ ok: true, action: "stale" });
      }
      if (!canOwn(resolved.actor, game.user)) {
        await closeOwnedMenu();
        return Object.freeze({ ok: true, action: "unavailable" });
      }
      const index = Number.parseInt(String(request?.optionId ?? ""), 10);
      const descriptors = nativeDescriptors(current.bridge.component, current.bridge.anchor, resolved.effect, getHooks());
      const descriptor = Number.isInteger(index) ? descriptors[index] : null;
      if (!descriptor || typeof descriptor.callback !== "function" || !eligible(descriptor, current.bridge.anchor)) {
        await closeOwnedMenu();
        return Object.freeze({ ok: true, action: "unavailable" });
      }
      current.selecting = true;
      try {
        await Promise.resolve(descriptor.callback(current.bridge.anchor));
        return Object.freeze({ ok: true, action: "selected", effectId: current.effectId, optionId: String(index) });
      } finally {
        await closeOwnedMenu();
      }
    },

    close: closeOwnedMenu
  });

  // Close the context menu only if it is still owned by this gateway instance.
  async function closeOwnedMenu() {
    const current = owned;
    owned = null;
    current?.bridge?.cleanup?.();
  }

  // Record a bounded diagnostic outcome for the context action.
  function record(phase, actorSourceUuid, effectId, extra = {}) {
    diagnostics?.record?.("debug", `Active Effect context | ${phase} | actor=${actorSourceUuid} effect=${effectId}${Object.keys(extra).length ? ` ${JSON.stringify(extra)}` : ""}`);
  }
}

// Adapt D&D5e’s native context provider while retaining original callbacks and final ownership checks.
function createNativeProviderBridge({ actor, effect, actorSourceUuid, effectReference, nativeDataset, document, applications, DialogV2 }) {
  if (!document?.body?.append || !document?.createElement || typeof applications?.set !== "function") {
    throw new Error(localizeFoundry("VEMOBILE.Character.ActiveEffectContextGateway.DDESNativeActiveEffectProviderIs", "D&D5e's native Active Effect provider is unavailable."));
  }
  const host = document.createElement("section");
  host.id = `ve-mobile-effects-${actorSourceUuid.replaceAll(".", "-")}-${effectReference}`;
  host.className = "application ve-native-effect-provider-bridge";
  host.hidden = true;
  host.setAttribute?.("aria-hidden", "true");
  const component = document.createElement("dnd5e-effects");
  const anchor = document.createElement("span");
  Object.assign(anchor.dataset, nativeDataset);
  anchor.dataset.veEffectContextTarget = "true";
  component.append(anchor);
  const sheet = actor.sheet;
  const bridgeApp = Object.freeze({
    document: actor,
    _concentration: actor.concentration,
    _openDocumentSheet: (nativeDocument) => sheet?._openDocumentSheet?.(nativeDocument),
    // D&D5e calls this for ActiveEffect.deleteDialog({ sheet: this.#app }).
    // Its normal sheet owns _confirmDialog; VE's hidden provider must supply it.
    _confirmDialog: (config) => {
      if (typeof DialogV2?.confirm !== "function") throw new Error(localizeFoundry("VEMOBILE.Character.ActiveEffectContextGateway.FoundrySNativeConfirmationDialogIsUnavailable", "Foundry's native confirmation dialog is unavailable."));
      return DialogV2.confirm(config);
    },
    // The delete hook refreshes VE; a hidden provider must not open a desktop Actor sheet.
    render: () => Promise.resolve()
  });
  applications.set(host.id, bridgeApp);
  let cleaned = false;
  // Remove the provider bridge and restore the previous context-menu state.
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    host.remove?.();
    if (applications.get?.(host.id) === bridgeApp) applications.delete?.(host.id);
  };
  try {
    host.append(component);
    document.body.append(host);
  } catch (error) {
    cleanup();
    throw error;
  }
  return { actor, effect, host, component, anchor, cleanup };
}

// Read native effect menu descriptors for the current Actor and user.
function nativeDescriptors(component, anchor, effect, hooks) {
  if (typeof component?._getContextOptions !== "function") {
    throw new Error(localizeFoundry("VEMOBILE.Character.ActiveEffectContextGateway.DDESNativeActiveEffectOptionsAre", "D&D5e's native Active Effect options are unavailable."));
  }
  const nativeEffect = component.getEffect?.(anchor.dataset) ?? effect;
  const descriptors = component._getContextOptions(nativeEffect);
  hooks?.call?.("dnd5e.getActiveEffectContextOptions", nativeEffect, descriptors);
  return Array.isArray(descriptors) ? descriptors : [];
}

// Check whether this effect and Actor are still eligible for the requested context action.
function eligible(descriptor, anchor) {
  try {
    if (typeof descriptor?.condition === "function") return descriptor.condition(anchor) !== false;
    return descriptor?.condition !== false;
  } catch {
    return false;
  }
}

// Resolve the exact active effect under its parent Actor, including synthetic Actor provenance.
function resolveEffect(game, actorSourceUuid, { effectId, effectUuid = "", parentId = "" }) {
  const actor = resolveActorSource(actorSourceUuid, { game });
  if (!actor) return null;
  const uuidReference = effectUuid || (effectId.includes(".ActiveEffect.") ? effectId : "");
  const embeddedId = uuidReference === effectId ? effectId.slice(effectId.lastIndexOf(".") + 1) : effectId;
  let effect = null;
  let nativeDataset = null;
  if (parentId) {
    const item = actor.items?.get?.(parentId);
    effect = item?.effects?.get?.(embeddedId) ?? null;
    if (effect) nativeDataset = Object.freeze({ effectId: embeddedId, parentId });
  } else {
    effect = actor.effects?.get?.(embeddedId) ?? null;
    if (effect) nativeDataset = Object.freeze({ effectId: embeddedId });
    if (!effect && uuidReference) {
      for (const item of actor.items?.values?.() ?? []) {
        const candidate = item.effects?.get?.(embeddedId);
        if (candidate && String(candidate.uuid ?? "") === uuidReference) {
          effect = candidate;
          nativeDataset = Object.freeze({ effectId: embeddedId, parentId: String(item.id) });
          break;
        }
      }
    }
  }
  if (!effect?.id || String(effect.id) !== embeddedId) return null;
  if (uuidReference && String(effect.uuid ?? "") !== uuidReference) return null;
  return nativeDataset ? { actor, effect, nativeDataset } : null;
}

// Check current Actor ownership and fail closed when permission evaluation throws.
function canOwn(actor, user) {
  if (user?.isGM) return true;
  try {
    return actor.testUserPermission?.(user, "OWNER") ?? false;
  } catch {
    return false;
  }
}

// Resolve an effect action label through Foundry localization with a fallback.
function localize(game, key) {
  const value = typeof game?.i18n?.localize === "function" ? game.i18n.localize(key) : key;
  return String(value ?? key ?? "");
}

// Normalize a required stable Actor or effect identifier.
function identifier(value, field) {
  const id = String(value ?? "").trim();
  if (!id || id.length > 128) throw new Error(localizeFoundry("VEMOBILE.Character.CommandGateway.IsRequired", "{field} is required.", { field: (field) }));
  return id;
}

// Normalize an optional identifier while preserving an absent value.
function optionalIdentifier(value, maximum) {
  const id = String(value ?? "").trim();
  if (id.length > maximum) throw new Error(localizeFoundry("VEMOBILE.Character.ActiveEffectContextGateway.ActiveEffectIdentityIsInvalid", "Active Effect identity is invalid."));
  return id;
}

// Accept finite pointer coordinates for context-menu positioning.
function finiteCoordinate(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

// Reject context actions from a different world, user, or connection generation.
function assertSession(game, expected) {
  if (!game?.user || !game?.world) throw new Error(localizeFoundry("VEMOBILE.Character.ActiveEffectContextGateway.TheFoundrySessionIsUnavailable", "The Foundry session is unavailable."));
  if (expected.worldId && String(game.world.id) !== String(expected.worldId)) throw new Error(localizeFoundry("VEMOBILE.Character.ActiveEffectContextGateway.TheActiveWorldChanged", "The active world changed."));
  if (expected.userId && String(game.user.id) !== String(expected.userId)) throw new Error(localizeFoundry("VEMOBILE.Character.ActiveEffectContextGateway.TheActiveUserChanged", "The active user changed."));
}
