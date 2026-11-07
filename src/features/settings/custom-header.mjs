import { icon, node } from "../../ui/dom.mjs";
import { localizedText } from "../../ui/localized-text.mjs";

// Keep custom image details mounted only while the saved header choice needs them.
export function renderCustomHeaderSettings(commands, scope, initiallyVisible = false) {
  const text = (key, fallback) => localizedText(commands?.localize, `VEMOBILE.Settings.UI.${key}`, fallback);
  const targetLabel = node("span", { text: text("CustomHeaderTarget", "Target actor") });
  const targetName = node("strong", { className: "ve-custom-header-actor" });
  const path = node("code", { className: "ve-custom-header-path" });
  const status = node("p", { className: "ve-custom-header-status", attrs: { role: "status", "aria-live": "polite" } });
  const scopeSelect = node("select", {
    className: "ve-setting-select ve-custom-header-scope",
    attrs: { "aria-label": text("CustomHeaderScopeLabel", "Apply image to") },
    children: [
      node("option", { attrs: { value: "actor" }, text: text("CustomHeaderScopeActor", "This actor") }),
      node("option", { attrs: { value: "user" }, text: text("CustomHeaderScopeUser", "All actors (my user)") })
    ]
  });
  const button = node("button", {
    className: "ve-setting-menu-button ve-custom-header-button",
    attrs: { type: "button" },
    children: [icon("fa-image"), node("span", { text: text("CustomHeaderChoose", "Choose or upload image") })]
  });
  const panel = node("div", {
    className: "ve-custom-header-settings",
    attrs: { hidden: !initiallyVisible },
    children: [
      node("label", { className: "ve-custom-header-target ve-custom-header-scope-row", children: [
        node("span", { text: text("CustomHeaderScopeLabel", "Apply image to") }), scopeSelect
      ] }),
      node("p", { className: "ve-custom-header-target", children: [
        targetLabel, targetName
      ] }),
      node("p", { className: "ve-custom-header-saved", children: [
        node("span", { text: text("CustomHeaderSaved", "Saved image") }), path
      ] }),
      node("p", { className: "ve-custom-header-guidance", text: text("CustomHeaderGuidance", "Use a 1600 × 400 image (4:1). WebP, JPG, and PNG are supported. Keep the focal detail on the right half; cropping varies across phones and tablets. The native picker can upload files when your role permits.") }),
      node("p", { className: "ve-custom-header-guidance ve-custom-header-storage" }),
      button,
      status
    ]
  });
  let visible = false;
  let pickerBusy = false;
  let scopeBusy = false;
  let failure = "";
  let activeScope = null;
  const storage = panel.querySelector(".ve-custom-header-storage");

  // Convert the narrow command record into plain, localized settings copy.
  const update = record => {
    if (scope.disposed || !visible) return;
    const state = record ?? {};
    const userScope = state.scope === "user";
    scopeSelect.value = userScope ? "user" : "actor";
    scopeSelect.disabled = pickerBusy || scopeBusy || state.canChangeScope === false;
    targetLabel.textContent = userScope ? text("CustomHeaderTargetUser", "Target user") : text("CustomHeaderTarget", "Target actor");
    targetName.textContent = userScope
      ? state.userName || text("CustomHeaderNoUser", "Current user")
      : state.actorName || text("CustomHeaderNoActor", "No actor selected");
    path.textContent = state.path || text("CustomHeaderNoImage", "No image (Off)");
    storage.textContent = userScope
      ? text("CustomHeaderUserStorage", "The image path is saved to your user profile and used for all actors when Custom is selected. The image file itself stays in Foundry's data directory.")
      : text("CustomHeaderActorStorage", "The image path is saved to this actor. The image file itself stays in Foundry's data directory.");
    button.disabled = pickerBusy || scopeBusy || state.canChoose !== true;
    if (pickerBusy) status.textContent = text("CustomHeaderOpening", "Opening image picker…");
    else if (scopeBusy) status.textContent = text("CustomHeaderSavingScope", "Saving image scope…");
    else if (state.reason) {
      const reasons = {
        noActor: userScope ? "" : text("CustomHeaderSelectActor", "Select an actor or set a default profile actor first."),
        forbidden: userScope
          ? text("CustomHeaderForbiddenUser", "You do not have permission to change this image.")
          : text("CustomHeaderForbidden", "You need owner permission for this actor to change its header image."),
        noBrowse: text("CustomHeaderNoBrowse", "File browsing is not available to your account."),
        unavailable: text("CustomHeaderUnavailable", "The Foundry image picker is unavailable.")
      };
      status.textContent = reasons[state.reason] ?? text("CustomHeaderUnavailable", "The Foundry image picker is unavailable.");
    } else status.textContent = failure;
  };

  // Keep command failures inside the panel instead of leaking from DOM callbacks.
  const refresh = () => {
    try { update(commands.readCustomHeader()); }
    catch { update({ reason: "unavailable" }); }
  };

  // Change the target scope through its named command and refresh after the save settles.
  scope.listen(scopeSelect, "change", async () => {
    const ownerScope = activeScope;
    if (!visible || pickerBusy || scopeBusy || !ownerScope || ownerScope.disposed || scope.disposed) return;
    const requestedScope = scopeSelect.value;
    scopeBusy = true;
    failure = "";
    scopeSelect.disabled = true;
    button.disabled = true;
    status.textContent = text("CustomHeaderSavingScope", "Saving image scope…");
    try {
      const record = await commands.setCustomHeaderScope(requestedScope, ownerScope);
      if (scope.disposed || !visible || ownerScope.disposed || activeScope !== ownerScope) return;
      update(record);
    } catch (error) {
      if (!scope.disposed && visible && !ownerScope.disposed && activeScope === ownerScope) {
        failure = error?.message || text("CustomHeaderScopeSaveFailed", "Could not save this image scope. Try again.");
      }
    } finally {
      if (!scope.disposed && visible && !ownerScope.disposed && activeScope === ownerScope) {
        scopeBusy = false;
        refresh();
      }
    }
  });

  // Start one scoped read and watcher when the custom option becomes active.
  const start = () => {
    if (scope.disposed || activeScope) return;
    activeScope = scope.child("custom-header-settings");
    const watchScope = activeScope;
    refresh();
    try {
      commands.watchCustomHeader?.(watchScope, record => {
        if (activeScope === watchScope && !watchScope.disposed) update(record);
      });
    }
    catch { update({ reason: "unavailable" }); }
  };

  // Dispose the subscription as soon as the custom option is no longer selected.
  const setVisible = value => {
    visible = value === true;
    panel.hidden = !visible;
    if (visible) start();
    else {
      activeScope?.dispose();
      activeScope = null;
      pickerBusy = false;
      scopeBusy = false;
      failure = "";
    }
  };

  scope.listen(button, "click", async () => {
    if (!visible || pickerBusy || scopeBusy || !activeScope || activeScope.disposed || scope.disposed) return;
    pickerBusy = true;
    failure = "";
    refresh();
    const pickerScope = activeScope;
    try {
      await commands.openCustomHeaderPicker(pickerScope);
    } catch (error) {
      if (!scope.disposed && visible && !pickerScope.disposed) {
        failure = error?.message || text("CustomHeaderFailed", "Could not choose this image. Try again.");
      }
    } finally {
      if (!scope.disposed && visible && !pickerScope.disposed) {
        pickerBusy = false;
        refresh();
      }
    }
  });

  if (initiallyVisible) setVisible(true);
  else setVisible(false);
  return Object.freeze({ element: panel, setVisible });
}
