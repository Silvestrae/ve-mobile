import { pf2eIntegration } from "./systems/pf2e/integration.mjs";
import { dnd5eIntegration } from "./systems/dnd5e/integration.mjs";
import { CommandError } from "./command-support.mjs";
import { localizeFoundry } from "./localization.mjs";

/** Select once in the composition root from the loaded world's system ID.
 * Only explicit integrations are supported. This module owns no live resources,
 * mutable registration, documents or cross-world cache. */
export function selectSystemIntegration(systemId) {
  if (systemId === "dnd5e") return dnd5eIntegration;
  if (systemId === "pf2e") return pf2eIntegration;
  throw new CommandError("UNSUPPORTED_SYSTEM", localizeFoundry("VEMOBILE.System.Unsupported", "VE Mobile does not support this world's game system."));
}

/** Session checks and system dispatch are separate: a retained command gateway
 * cannot execute one system's operations after another system replaces the world.
 * Missing metadata is supported only for historical injected test/embedding games;
 * the production composition root always selects using game.system.id. */
export function assertSystemIntegration(integration, game) {
  integration.assertCompatible?.(game);
  if (game?.system?.id && game.system.id !== integration.id) {
    throw new CommandError("STALE_SYSTEM", localizeFoundry("VEMOBILE.System.Changed", "The world's game system changed. Reload VE Mobile before continuing."));
  }
}
