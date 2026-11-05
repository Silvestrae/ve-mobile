import { CommandError } from "../../command-support.mjs";
import { localizeFoundry } from "../../localization.mjs";
import { assertCraftingOwner, craftingError } from "./crafting-records.mjs";

/** PF2e 8.6.1's public Craft action returns before its modifier dialog settles.
 * Bridge its callback and observed CheckModifiersDialog cancellation so the
 * shared command lock remains held until success/cancel, with deterministic cleanup.
 * The native action still creates its own crafting-result chat card. */
export function runNativeCraftingCheck(actor, formula, quantity, context) {
  const hooks = globalThis.Hooks;
  const action = globalThis.game?.pf2e?.actions?.craft;
  if (typeof action !== "function" || typeof hooks?.on !== "function" || typeof hooks?.off !== "function") craftingError("CAPABILITY_UNAVAILABLE");
  assertCraftingOwner(actor, context);
  return new Promise((resolve, reject) => {
    let settled = false, invoked = false, cancellation = null, ownedDialog = null, deadline = null;
    const registrations = [];
    const signal = context?.signal;
    // Remove every acquired hook/listener/timer before publishing the terminal result.
    const finish = (error, result = null) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      for (const [name, id] of registrations) hooks.off(name, id);
      signal?.removeEventListener("abort", abort);
      if (error) reject(error); else resolve(result);
    };
    // The startup deadline only covers a native call that never creates a dialog
    // or callback. It is cleared while the player is considering the open dialog.
    const armDeadline = () => {
      clearTimeout(deadline);
      deadline = setTimeout(() => finish(cancellation ?? new CommandError("COMMAND_FAILED", localizeFoundry(
        "VEMOBILE.PF2E.Crafting.CheckUncertain", "The native crafting check did not finish. Check Foundry's result before trying again."))), 30000);
    };
    // A native Craft launches detached asynchronous work. Keep its lock and render
    // observer until a late dialog can be closed, within the existing startup
    // deadline. Removing the observer on abort would abandon that dialog.
    const closeOwnedDialog = () => {
      const dialog = ownedDialog;
      Promise.resolve().then(() => !dialog.isResolved && dialog.close()).catch(error => {
        console.warn("VE Mobile | Crafting dialog cleanup failed", error);
      }).finally(() => finish(cancellation));
    };
    const abort = () => {
      if (settled) return;
      cancellation = signal?.reason instanceof Error ? signal.reason : new CommandError("STALE_VALUE", localizeFoundry(
        "VEMOBILE.PF2E.Crafting.STALE_VALUE", "Crafting changed. Refresh and try again."));
      if (ownedDialog) closeOwnedDialog();
      else if (!invoked) finish(cancellation);
    };
    // Native checks may use a contextual Actor clone. Its exact UUID preserves
    // world/token provenance; action:craft excludes other action kinds. The native
    // API supplies no invocation token, so simultaneous external Craft checks for
    // this same Actor cannot be distinguished. The VE lock prevents another VE
    // Craft from starting during cancellation cleanup.
    const matches = application => {
      const nativeContext = application?.context;
      const nativeActor = nativeContext?.actor ?? nativeContext?.origin?.actor;
      return nativeActor?.uuid === actor.uuid && nativeContext?.options?.has?.("action:craft") === true;
    };
    try {
      registrations.push(["renderCheckModifiersDialog", hooks.on("renderCheckModifiersDialog", application => {
        if (settled || ownedDialog || !matches(application)) return;
        ownedDialog = application;
        clearTimeout(deadline);
        if (!cancellation) {
          try { assertCraftingOwner(actor, context); } catch (error) { cancellation = error; }
        }
        if (cancellation) closeOwnedDialog();
      })]);
      registrations.push(["closeCheckModifiersDialog", hooks.on("closeCheckModifiersDialog", application => {
        if (settled || cancellation || application !== ownedDialog) return;
        if (!application.isResolved) finish(null);
        else armDeadline();
      })]);
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) { abort(); return; }
      armDeadline();
      invoked = true;
      const invocation = action({ actors: actor, item: formula.item, quantity,
        difficultyClass: { value: formula.dc, visible: true, scope: "check" }, free: false,
        callback: result => {
          if (cancellation) { finish(cancellation); return; }
          try { assertCraftingOwner(actor, context); finish(null, result); }
          catch (error) { finish(error); }
        } });
      Promise.resolve(invocation).catch(error => finish(cancellation ?? error));
    } catch (error) { finish(cancellation ?? error); }
  });
}
