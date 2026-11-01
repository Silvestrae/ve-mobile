import { localizeFoundry } from "./localization.mjs";

/** Keep Auto in Desktop until the browser owner explicitly confirms a mode. */
export function createAutoModeConfirmationGateway({ readPreferences, resolvePolicy, saveMode }) {
  return Object.freeze({
    get pending() { return resolvePolicy(readPreferences()).preference === "auto"; },
    suggestion() { return resolvePolicy(readPreferences()).runtimeMode; },
    // Report whether the current session still requires the first-load Auto-mode choice.
    policy() {
      const policy = resolvePolicy(readPreferences());
      return policy.preference === "auto"
        ? Object.freeze({ ...policy, active: false, runtimeMode: "desktop", formFactor: "desktop" })
        : policy;
    },
    // Persist the user's explicit Auto-mode choice and return the resulting confirmation state.
    async confirm(mode) {
      if (!["phone", "tablet", "desktop"].includes(mode)) throw new Error(localizeFoundry("VEMOBILE.Interface.AutoModeConfirmation.Invalid", "Invalid presentation mode"));
      if (resolvePolicy(readPreferences()).preference !== "auto") throw new Error(localizeFoundry("VEMOBILE.Interface.AutoModeConfirmation.Changed", "Presentation preference changed; reload to use the current choice"));
      await saveMode(mode);
      if (readPreferences().mode !== mode) throw new Error(localizeFoundry("VEMOBILE.Interface.AutoModeConfirmation.Error", "Presentation preference could not be saved"));
    }
  });
}
