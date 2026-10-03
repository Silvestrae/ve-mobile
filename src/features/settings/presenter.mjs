import { icon, node } from "../../ui/dom.mjs";
import {
  OPTIMIZER_PROFILES,
  OPTIMIZER_SORTS,
  applyVisibleSelection,
  buildOptimizerView,
  formatDecodedSize,
  formatFileSize,
  visibleSelectionState
} from "../../kernel/mobile-asset-optimizer-model.mjs";
import { memoryProfilePolicy, resolvedProfileSettings } from "../../kernel/memory-profile-model.mjs";
import { localizedNumber, localizedText } from "../../ui/localized-text.mjs";

const uiText = (commands, key, fallback, data) => localizedText(commands?.localize, `VEMOBILE.Settings.UI.${key}`, fallback, data);

export function renderSettings({ commands, scope, overlayHost = null }) {
  const host = node("section", { attrs: { "data-ve-settings-presenter-builds": "1", "data-ve-settings-content-builds": "0" } });
  const accordionState = createSettingsAccordionState();
  let contentScope;
  let currentOverlayHost = overlayHost;
  let ownedOverlays = [];
  const syncOverlayHost = nextHost => {
    currentOverlayHost = nextHost;
    const destination = nextHost ?? host.querySelector(".ve-settings");
    const focused = host.ownerDocument?.activeElement;
    const restoreFocus = ownedOverlays.some(element => element.contains(focused));
    if (destination) for (const element of ownedOverlays) if (element.parentNode !== destination) destination.append(element);
    if (restoreFocus && focused?.isConnected) focused.focus?.({ preventScroll: true });
  };
  host.syncOverlayHost = syncOverlayHost;
  const refresh = (requiresReload = false) => {
    if (scope.disposed) return;
    const scrollContainer = host.closest?.(".ve-viewport");
    const scrollTop = Number(scrollContainer?.scrollTop) || 0;
    const focusedId = host.ownerDocument?.activeElement?.id ?? "";
    contentScope?.dispose();
    contentScope = scope.child("settings-content");
    host.replaceChildren(settingsContent({ commands, scope: contentScope, refresh, requiresReload, overlayHost: currentOverlayHost, accordionState, captureOverlays: elements => { ownedOverlays = elements; } }));
    host.dataset.veSettingsContentBuilds = String(Number(host.dataset.veSettingsContentBuilds) + 1);
    if (scrollContainer) scrollContainer.scrollTop = scrollTop;
    if (focusedId) host.querySelector?.(`#${safeId(focusedId)}`)?.focus?.({ preventScroll: true });
  };
  refresh();
  return host;
}

function settingsContent({ commands, scope, refresh, requiresReload, overlayHost, accordionState, captureOverlays }) {
  const preferences = commands.readSettings();
  const labels = preferences.labels ?? {};
  const status = node("div", { className: "ve-settings-status", attrs: { role: "status", "aria-live": "polite" } });
  const reloadPrompt = createReloadPrompt(commands, scope);
  const defaults = createDefaultsPrompt(commands, scope, refresh);
  const reportModal = createDiagnosticReportModal(commands, scope);
  const reportActions = diagnosticsButtons(commands, scope, reportModal);
  const lowMemoryPrompt = createLowMemoryPrompt(commands, scope, refresh);
  const optimizer = preferences.mobileMemory?.assets?.isGm ? createMobileAssetOptimizer(commands, scope) : null;
  const overlays = [reloadPrompt.element, defaults.element, reportModal.element, lowMemoryPrompt.element, optimizer?.element].filter(Boolean);
  captureOverlays(overlays);
  scope.own(() => { for (const element of overlays) element.remove(); });
  if (overlayHost) overlayHost.replaceChildren(...overlays);
  if (requiresReload) reloadPrompt.show({ name: uiText(commands, "DefaultSettings", "Default settings") });
  const fields = [...(preferences.fields ?? []), ...(preferences.performanceMode ? [preferences.performanceMode] : [])];
  const fieldsByKey = new Map(fields.map((field) => [field.key, field]));
  const groups = groupSettings(fields);
  const joystickDetail = node("p", { className: "ve-setting-live-detail", attrs: { "data-ve-joystick-resolved": true } });
  const graphicsDetail = node("p", { className: "ve-setting-live-detail", attrs: { "data-ve-graphics-resolved": true } });
  const diceDetail = node("p", { className: "ve-setting-live-detail", attrs: { "data-ve-dice-resolved": true } });
  let currentLayout = preferences;
  let deviceIdentity = Object.freeze({ label: uiText(commands, "DesktopBrowser", "Desktop browser"), precision: "family" });
  const deviceValue = node("strong", { text: uiText(commands, "DeviceResolving", labels.deviceResolving ?? "Detecting…") });
  const updateNarrowDetails = (layout = commands.readPresentationPreferences()) => {
    currentLayout = Object.freeze({ ...currentLayout, ...layout });
    const followsLayout = currentLayout.joystickSide === "follow";
    joystickDetail.hidden = !followsLayout;
    if (!followsLayout) joystickDetail.textContent = "";
    else {
      const side = currentLayout.joystickResolvedSide === "right" ? (labels.right ?? uiText(commands, "Right", "Right")) : (labels.left ?? uiText(commands, "Left", "Left"));
      joystickDetail.textContent = uiText(commands, "FollowLayoutCurrently", "Follow layout · currently {side}", { side });
    }
    deviceValue.textContent = deviceDetectedText({
      deviceLabel: deviceIdentity.label,
      modePreference: currentLayout.mode,
      resolvedMode: currentLayout.resolvedMode ?? currentLayout.formFactor,
      labels,
      localize: commands.localize
    });
    updateAutoPolicyDetail(graphicsDetail, currentLayout.graphicsSafety, currentLayout.graphicsPolicy?.effects, (value) => choiceLabel(fieldsByKey.get("graphicsSafety"), value), commands.localize);
    updateAutoPolicyDetail(diceDetail, currentLayout.diceRendering, currentLayout.graphicsPolicy?.dice, (value) => choiceLabel(fieldsByKey.get("diceRendering"), value), commands.localize);
  };
  const updateJoystickDetail = (layout = commands.readPresentationPreferences()) => {
    updateNarrowDetails(layout);
  };
  updateNarrowDetails(preferences);
  commands.watchLayoutState?.(scope, updateNarrowDetails);
  commands.watchGraphicsPolicy?.(scope, (graphicsPolicy) => updateNarrowDetails({ graphicsPolicy }));

  const deviceInfo = node("div", { className: "ve-setting ve-device-information", children: [
    node("span", { className: "ve-device-information-label", text: labels.deviceLabel ?? uiText(commands, "DeviceLabel", "Device Detected") }),
    deviceValue
  ] });
  void commands.readDeviceIdentity?.().then((identity) => {
    if (!scope.disposed) {
      deviceIdentity = identity ?? deviceIdentity;
      updateNarrowDetails(currentLayout);
    }
  }).catch(() => {
    if (!scope.disposed) updateNarrowDetails(currentLayout);
  });

  const native = preferences.nativeSettings ?? {};
  return node("section", {
    className: "ve-settings",
      attrs: { "aria-label": uiText(commands, "Settings", "Settings") },
    children: [
      node("section", { className: "ve-settings-primary-section ve-settings-session", attrs: { "aria-labelledby": "ve-settings-session-title" }, children: [
        node("header", { className: "ve-settings-primary-heading ve-settings-session-heading", children: [
          icon("fa-users"),
          node("h2", { text: labels.sessionTitle ?? uiText(commands, "SessionTitle", "Session"), attrs: { id: "ve-settings-session-title" } }),
          logoutButton(preferences.logoutLabel, commands, status, scope)
        ] }),
        sessionStatusPanel(commands, scope, labels)
      ] }),
      node("div", { className: "ve-settings-divider", attrs: { "aria-hidden": "true" } }),
      node("section", { className: "ve-settings-primary-section ve-settings-foundry-section", attrs: { "aria-labelledby": "ve-foundry-settings-title" }, children: [
        node("header", { className: "ve-settings-primary-heading ve-settings-foundry-heading", children: [
          icon("fa-gear"),
          node("h2", { text: native.title ?? uiText(commands, "FoundrySettingsTitle", "Foundry Settings"), attrs: { id: "ve-foundry-settings-title" } })
        ] }),
        foundrySettingsBlock(native, commands, status, scope)
      ] }),
      node("div", { className: "ve-settings-divider", attrs: { "aria-hidden": "true" } }),
      node("section", { className: "ve-settings-primary-section ve-settings-mobile-section", attrs: { "aria-labelledby": "ve-mobile-settings-title" }, children: [
        node("header", { className: "ve-settings-primary-heading ve-settings-mobile-heading", children: [
          icon("fa-mobile-screen-button"),
          node("h2", { text: labels.mobileSettingsTitle ?? uiText(commands, "MobileSettingsTitle", "VE Mobile Settings"), attrs: { id: "ve-mobile-settings-title" } }),
          defaults.button
        ] }),
        node("div", { className: "ve-settings-groups", children: groups.map((group) => {
          const rowsFor = (groupFields) => groupFields.flatMap((field) => {
            const row = settingField(field, commands, status, scope, reloadPrompt, {
              detail: field.key === "joystickSide" ? joystickDetail : field.key === "graphicsSafety" ? graphicsDetail : field.key === "diceRendering" ? diceDetail : null,
              onSaved: ["joystickSide", "mode", "graphicsSafety", "diceRendering"].includes(field.key) ? () => updateJoystickDetail(commands.readPresentationPreferences()) : null
            });
            return field.key === "mode" ? [row, deviceInfo] : [row];
          });
          let children = rowsFor(group.fields);
          if (group.id === "performance") {
            const fieldsFor = (...keys) => group.fields.filter((field) => keys.includes(field.key));
            children = [
              settingsSubsection(uiText(commands, "MobileMemory", "Mobile memory"), [
                ...rowsFor(fieldsFor("mobileOptimizedAssets", "sceneMemoryWarnings")),
                mobileMemorySettings(preferences, commands, scope, status, lowMemoryPrompt, optimizer, refresh)
              ]),
              settingsSubsection(uiText(commands, "DiceEffects", "Dice & effects"), rowsFor(fieldsFor("performanceMode", "noCanvas", "graphicsSafety", "diceRendering"))),
              settingsSubsection(uiText(commands, "RecoveryDiagnostics", "Recovery & diagnostics"), rowsFor(fieldsFor("afterGraphicsFailure")))
            ];
          }
          if (group.id === "overlays") children.push(moduleOverlaySettings(commands, scope, status, labels));
          if (group.id === "support") {
            children.unshift(node("div", { className: "ve-settings-help", children: [node("button", {
              className: "ve-settings-controls-link", attrs: { type: "button" },
              children: [icon("fa-hand-pointer"), node("strong", { text: commands.localize("VEMOBILE.Controls.Title") })],
              on: { click: event => commands.openControlsGuide(event.currentTarget) }
            }, scope)] }));
            reportActions.classList.add("ve-settings-support-actions");
            children.push(reportActions);
          }
          return settingsSection(group.id, localizedText(commands.localize, `VEMOBILE.Settings.UI.Group.${group.id}`, group.title), children, scope, accordionState);
        }) })
      ] }),
      status,
      ...(overlayHost ? [] : overlays)
    ]
  });
}

function foundrySettingsBlock(native, commands, status, scope) {
  const action = nativeSettingsAction({
    name: native.openFoundryLabel ?? uiText(commands, "OpenFoundryLabel", "Open Foundry Settings"),
    hint: native.openFoundryHint ?? uiText(commands, "OpenFoundryHint", "Use Foundry's native settings interface for core, system, and module configuration."),
    iconName: "fa-gears",
    action: () => commands.openFoundrySettings()
  }, status, scope, commands);
  return node("section", { className: "ve-foundry-settings", attrs: { "aria-labelledby": "ve-foundry-settings-title" }, children: [
    node("p", { text: native.openFoundryDescription ?? uiText(commands, "OpenFoundryDescription", "Open core Foundry and module settings here.") }),
    node("p", {
      className: "ve-native-settings-compatibility-note",
      attrs: { role: "note" },
      children: [icon("fa-circle-info"), node("span", {
        text: native.compatibilityHint ?? uiText(commands, "NativeSettingsCompatibility", "Some Foundry and module settings are designed for desktop and may not display correctly on smaller screens. If needed, switch to Desktop mode to access them.")
      })]
    }),
    action
  ] });
}

function nativeSettingsAction({ name, hint, iconName, action }, status, scope, commands) {
  const button = node("button", {
    className: "ve-setting-menu-button ve-button-accent-outline",
    attrs: { type: "button" },
    children: [icon(iconName), node("span", { text: name }), icon("fa-chevron-right")]
  });
  scope.listen(button, "click", async () => {
    if (button.disabled) return;
    button.disabled = true;
    status.textContent = uiText(commands, "Opening", "Opening…");
    try {
      await action();
      status.textContent = "";
    } catch (error) {
      status.textContent = error?.message ?? uiText(commands, "OpenNativeFailed", "That native settings window could not be opened.");
    } finally {
      button.disabled = false;
    }
  });
  return button;
}

function moduleOverlaySettings(commands, scope, globalStatus, labels) {
  const explanation = node("p", {
    className: "ve-module-overlays-copy",
    text: labels.moduleOverlayExplanation ?? uiText(commands, "ModuleOverlayExplanation", "VE Mobile hides most third-party canvas overlays by default. Scan your active modules to find overlays you can optionally show.")
  });
  const warning = node("p", {
    className: "ve-module-overlays-warning",
    children: [icon("fa-flask"), node("span", { text: labels.moduleOverlayWarning ?? uiText(commands, "ModuleOverlayWarning", "Experimental: module overlays use best-effort compatibility and are not guaranteed to work correctly—or at all—on every device or with every module.") })]
  });
  const result = node("p", { className: "ve-module-overlays-result", attrs: { role: "status", "aria-live": "polite" } });
  const list = node("div", { className: "ve-module-overlays-list" });
  const scan = node("button", { className: "ve-module-overlays-scan", attrs: { type: "button" }, children: [icon("fa-magnifying-glass"), node("span")] });
  let listScope = null;

  const render = (snapshot) => {
    scan.querySelector("span").textContent = snapshot.scanned
      ? (labels.moduleOverlayRescan ?? uiText(commands, "ModuleOverlayRescan", "Rescan module overlays"))
      : (labels.moduleOverlayScan ?? uiText(commands, "ModuleOverlayScan", "Scan for module overlays"));
    if (!snapshot.scanned) result.textContent = labels.moduleOverlayNotScanned ?? uiText(commands, "ModuleOverlayNotScanned", "No scan has been run on this device.");
    else if (!snapshot.entries.length) result.textContent = labels.moduleOverlayNone ?? uiText(commands, "ModuleOverlayNone", "No compatible module overlays detected.");
    else result.textContent = `${localizedNumber(snapshot.entries.length, commands.readLocale?.() ?? "en")} ${snapshot.entries.length === 1 ? uiText(commands, "ModuleOverlayDetectedOne", "module overlay detected") : uiText(commands, "ModuleOverlayDetectedMany", "module overlays detected")}`;
    listScope?.dispose();
    listScope = scope.child("module-overlay-list");
    const entries = [...snapshot.entries];
    list.replaceChildren(...entries.map((entry, index) => {
      const control = settingsToggle({
        id: `ve-overlay-${safeId(entry.id)}`,
        checked: entry.visible,
        disabled: !entry.available,
        "aria-label": `${labels.moduleOverlayShow ?? uiText(commands, "ModuleOverlayShow", "Show on Scene")}: ${entry.moduleTitle} — ${entry.overlayName}`
      });
      listScope.listen(control, "change", async () => {
        const requested = control.checked;
        control.disabled = true;
        try {
          await commands.setModuleOverlayVisible(entry.id, requested);
          globalStatus.textContent = requested ? uiText(commands, "ModuleOverlayEnabled", "Overlay enabled") : uiText(commands, "ModuleOverlayHidden", "Overlay hidden");
        } catch (error) {
          control.checked = !requested;
          globalStatus.textContent = error?.message ?? uiText(commands, "ModuleOverlaySaveFailed", "That overlay preference could not be saved.");
        } finally {
          control.disabled = !entry.available;
        }
      });
      const scale = node("select", {
        className: "ve-module-overlay-scale",
        attrs: { "aria-label": `${labels.moduleOverlayScale ?? uiText(commands, "ModuleOverlayScale", "Scale")}: ${entry.moduleTitle} — ${entry.overlayName}`, title: labels.moduleOverlayScale ?? uiText(commands, "ModuleOverlayScale", "Scale") },
        children: [50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100].map((value) => node("option", {
          attrs: { value, selected: value === (entry.scale ?? 100) },
          text: `${value}%`
        }))
      });
      const scaleControl = node("label", { className: "ve-module-overlay-scale-control", children: [node("span", { text: labels.moduleOverlayScale ?? uiText(commands, "ModuleOverlayScale", "Scale") }), scale] });
      const row = node("div", { className: "ve-module-overlay-entry", attrs: { "data-overlay-id": entry.id }, children: [
        scaleControl,
        node("div", { className: "ve-module-overlay-copy", children: [
          node("strong", { text: entry.moduleTitle }),
          node("span", { text: entry.overlayName }),
          !entry.available ? node("small", { text: labels.moduleOverlayUnavailable ?? uiText(commands, "ModuleOverlayUnavailable", "Module unavailable") }) : null
        ] }),
        node("div", { className: "ve-module-overlay-actions", children: [node("label", { attrs: { for: `ve-overlay-${safeId(entry.id)}` }, children: [
          node("span", { text: labels.moduleOverlayShow ?? uiText(commands, "ModuleOverlayShow", "Show on Scene") }),
          control
        ] })] })
      ] });
      listScope.listen(scale, "change", async () => {
        scale.disabled = true;
        try {
          render(await commands.setModuleOverlayScale(entry.id, Number(scale.value)));
          globalStatus.textContent = uiText(commands, "ModuleOverlayScaleSaved", "Overlay scale set to {scale}%", { scale: scale.value });
        } catch (error) {
          globalStatus.textContent = error?.message ?? uiText(commands, "ModuleOverlayScaleFailed", "That overlay scale could not be saved.");
          render(commands.readModuleOverlays());
        }
      });
      return row;
    }));
  };

  render(commands.readModuleOverlays());
  scope.listen(scan, "click", async () => {
    if (scan.disabled) return;
    scan.disabled = true;
    result.textContent = labels.moduleOverlayScanning ?? uiText(commands, "ModuleOverlayScanning", "Scanning active module overlays…");
    try {
      render(await commands.scanModuleOverlays());
    } catch (error) {
      result.textContent = error?.message ?? uiText(commands, "ModuleOverlayScanFailed", "The module overlay scan could not finish.");
    } finally {
      scan.disabled = false;
    }
  });
  scope.own(() => listScope?.dispose());
  return node("div", { className: "ve-module-overlays", children: [explanation, warning, scan, result, list] });
}

function mobileMemorySettings(preferences, commands, scope, status, lowMemoryPrompt, optimizer, refresh) {
  const memory = preferences.mobileMemory ?? {};
  const low = memory.profile ?? memory.lowMemory ?? {};
  const assets = memory.assets ?? {};
  const recommendation = memory.recommendation ?? null;
  const fcs = low.forceClientSettings ?? {};
  const currentProfile = low.profile ?? "normal";
  const profiles = memoryProfileDefinitions(low, preferences.graphicsPolicy, commands.localize, commands.readLocale?.() ?? "en").map(entry => ({
    ...entry,
    label: localizedText(commands.localize, `VEMOBILE.Settings.UI.Profile.${entry.value}.Name`, entry.label),
    description: localizedText(commands.localize, `VEMOBILE.Settings.UI.Profile.${entry.value}.Description`, entry.description)
  }));
  const profile = node("select", {
    className: "ve-memory-profile-select",
    attrs: { "aria-label": uiText(commands, "GraphicsProfile", "Graphics Profile"), "aria-describedby": "ve-memory-profile-description" },
    children: profiles.map((entry) => node("option", {
      attrs: { value: entry.value, selected: currentProfile === entry.value },
      text: `${entry.label}${recommendation?.recommendedMinimumProfile === entry.value ? ` · ${uiText(commands, "Recommended", "Recommended")}` : ""}`
    }))
  });
  profile.value = currentProfile;
  scope.listen(profile, "change", () => {
    const target = profile.value;
    profile.value = currentProfile;
    lowMemoryPrompt.show({ profile: target, preview: commands.previewMemoryProtectionProfile(target) }, profile);
  });
  const selectedProfile = profiles.find((entry) => entry.value === currentProfile) ?? profiles[0];
  const comparisonRows = [
    [uiText(commands, "FoundryGraphicsQuality", "Foundry graphics quality"), "performance"],
    [uiText(commands, "Fps", "FPS"), "fps"],
    [uiText(commands, "SceneResolution", "Scene resolution"), "density"],
    [uiText(commands, "TextureSmoothing", "Texture smoothing"), "mipmaps"],
    [uiText(commands, "MovingLights", "Moving lights"), "lightAnimation"],
    [uiText(commands, "VeAnimatedEffects", "VE animated effects"), "effects"],
    [uiText(commands, "DiceAnimation", "3D dice animation"), "dice"],
    [uiText(commands, "FoundryReload", "Foundry reload"), "reload"]
  ];
  const comparison = node("div", { className: "ve-memory-comparison-scroll", children: [node("table", {
    className: "ve-memory-comparison",
    children: [
      node("thead", { children: [node("tr", { children: [node("th", { text: uiText(commands, "Setting", "Setting") }), ...profiles.map((entry) => node("th", { text: entry.label }))] })] }),
      node("tbody", { children: comparisonRows.map(([label, key]) => node("tr", { children: [
        node("th", { attrs: { scope: "row" }, text: label }),
        ...profiles.map((entry) => node("td", { attrs: { "data-label": entry.label }, text: entry.values[key] }))
      ] })) })
    ]
  })] });
  const comparisonSummary = node("summary", {
    attrs: { "aria-expanded": "false" },
    children: [node("span", { text: uiText(commands, "CompareProfiles", "Compare Profiles") }), icon("fa-chevron-right")]
  });
  const comparisonDetails = node("details", {
    className: "ve-memory-comparison-details",
    children: [
      comparisonSummary,
      comparison,
      node("p", { className: "ve-memory-comparison-note", text: uiText(commands, "ProfileComparisonNote", "Balanced keeps whichever is safer between its limit and your saved Foundry setting. Balanced and Strong keep moving lights on; Maximum turns them off. Normal restores your saved Foundry settings when available.") })
    ]
  });
  scope.listen(comparisonDetails, "toggle", () => comparisonSummary.setAttribute("aria-expanded", String(comparisonDetails.open)));

  const behavior = node("select", { attrs: { "aria-label": uiText(commands, "MemoryBehavior", "Memory Protection Behavior"), "aria-describedby": "ve-memory-protection-behavior-description" }, children: [
    node("option", { attrs: { value: "recommend", selected: preferences.memoryProtectionBehavior === "recommend" }, text: uiText(commands, "RecommendBehavior", "Recommend") }),
    node("option", { attrs: { value: "automatic", selected: preferences.memoryProtectionBehavior === "automatic" }, text: uiText(commands, "AutomaticBehavior", "Automatic") }),
    node("option", { attrs: { value: "off", selected: preferences.memoryProtectionBehavior === "off" }, text: uiText(commands, "Off", "Off") })
  ] });
  scope.listen(behavior, "change", async () => {
    behavior.disabled = true;
    try {
      await commands.updateSetting({ key: "memoryProtectionBehavior", value: behavior.value });
      status.textContent = uiText(commands, "ProfileSet", "Memory Protection Behavior set to {behavior}.", { behavior: behavior.options?.[behavior.selectedIndex]?.text ?? behavior.value });
    } catch (error) { status.textContent = error?.message ?? uiText(commands, "ProfileSaveFailed", "Memory Protection Behavior could not be saved."); }
    finally { behavior.disabled = false; }
  });

  const restore = low.restoreAvailable ? node("button", {
    className: "ve-setting-menu-button ve-button-accent-outline",
    attrs: { type: "button" },
    children: [icon("fa-clock-rotate-left"), node("span", { text: uiText(commands, "RestorePreviousGraphics", "Restore Previous Graphics Settings") }), icon("fa-chevron-right")]
  }) : null;
  if (restore) scope.listen(restore, "click", async () => {
    restore.disabled = true;
    try {
      const result = await commands.restorePreviousGraphicsSettings();
      if (result.requiresReload) {
        if (!result.reloadTriggered) {
          status.textContent = uiText(commands, "GraphicsRestoredReloadFailed", "The graphics settings were restored, but the full Foundry reload could not be started.");
          restore.disabled = false;
        }
      } else refresh();
    } catch (error) {
      status.textContent = error?.message ?? uiText(commands, "GraphicsRestoreFailed", "Previous graphics settings could not be restored.");
      restore.disabled = false;
    }
  });

  const conflictList = (fcs.conflicts ?? []).map(conflict => node("li", { children: [
    node("code", { text: conflict.key }),
    node("span", { text: `${commands.localize("VEMOBILE.Controls.Status.Forced")}: ${String(conflict.forcedValue)} · ${localizedText(commands.localize, "VEMOBILE.Controls.Status.Setting", "Setting")}: ${String(low.current?.[conflict.key])}` })
  ] }));
  const fcsToggleLabel = uiText(commands, "FcsPrecedence", "VE graphics profiles take precedence over Force Client Settings");
  const fcsToggle = assets.isGm ? settingsToggle({
    checked: preferences.fcsAutoSoftOverride !== false, "aria-label": fcsToggleLabel, "aria-describedby": "ve-fcs-guidance"
  }) : null;
  if (fcsToggle) scope.listen(fcsToggle, "change", async () => {
    const requested = fcsToggle.checked;
    fcsToggle.disabled = true;
    try {
      const result = await commands.updateSetting({ key: "fcsAutoSoftOverride", value: requested });
      if (result.requiresReload) commands.reloadApplication();
      else refresh();
    } catch (error) {
      fcsToggle.checked = !requested;
      status.textContent = error?.message ?? uiText(commands, "GraphicsPolicySaveFailed", "The world graphics policy could not be changed.");
    } finally { fcsToggle.disabled = false; }
  });

  const optimizerButton = assets.isGm ? node("button", {
    className: "ve-setting-menu-button ve-button-accent-outline",
    attrs: { type: "button" },
    children: [icon("fa-images"), node("span", { text: uiText(commands, "OpenAssetOptimizer", "Open Mobile Asset Optimizer") }), icon("fa-chevron-right")]
  }) : null;
  if (optimizerButton && optimizer) scope.listen(optimizerButton, "click", () => optimizer.show(optimizerButton));

  return node("section", { className: "ve-mobile-memory-settings", attrs: { "aria-label": uiText(commands, "MobileMemoryProtection", "Mobile memory protection") }, children: [
    node("div", { className: "ve-mobile-memory-heading", children: [
      node("h3", { text: uiText(commands, "MobileMemoryProtection", "Mobile memory protection") }),
      node("p", { text: uiText(commands, "MemoryProtectionIntro", "Before a Scene opens, VE Mobile checks its saved image details and suggests the lightest profile that may help. This can reduce risk but cannot guarantee every Scene will work.") })
    ] }),
    node("div", { className: "ve-mobile-memory-state", children: [
      node("span", { text: uiText(commands, "Configured", "Configured: {profile}", { profile: localizedText(commands.localize, `VEMOBILE.Settings.UI.Profile.${currentProfile}.Name`, profileName(currentProfile)) }) }),
      node("span", { className: !low.effective ? "is-warning" : "", text: uiText(commands, "Status", "Status: {status}", { status: low.status || uiText(commands, low.effective ? "Satisfied" : "Incomplete", low.effective ? "Satisfied" : "Incomplete") }) }),
      node("span", { text: uiText(commands, "ImageDerivatives", "Image derivatives: {status}", { status: mobileAssetStatusLabel(assets.aliasStatus?.status, commands.localize) }) })
    ] }),
    node("label", { className: "ve-memory-profile-picker", children: [
      node("span", { children: [node("strong", { text: uiText(commands, "GraphicsProfile", "Graphics Profile") }), node("small", { text: uiText(commands, "ChooseProfileHint", "Choose how strongly VE Mobile reduces graphics work in this browser.") })] }),
      profile
    ] }),
    node("p", { className: "ve-memory-profile-description", attrs: { id: "ve-memory-profile-description" }, text: selectedProfile.description }),
    (low.unmetSettings?.length ?? 0) ? node("ul", { children: low.unmetSettings.map(entry => node("li", {
      text: `${graphicsSettingLabel(entry.key, commands.localize)} · ${commands.localize("VEMOBILE.Controls.Status.Setting")}: ${graphicsSettingValue(entry.current, commands.localize)}${entry.runtimeMismatch ? ` · ${localizedText(commands.localize, "VEMOBILE.Controls.Status.Runtime", "Runtime")}: ${graphicsSettingValue(entry.runtime, commands.localize)}` : ""} · ${localizedText(commands.localize, "VEMOBILE.Controls.Status.Target", "Target")} (${localizedText(commands.localize, `VEMOBILE.Settings.UI.Profile.${currentProfile}.Name`, profileName(currentProfile))}): ${graphicsSettingValue(entry.target, commands.localize)}`
    })) }) : null,
    comparisonDetails,
    node("label", { className: "ve-setting ve-memory-behavior", children: [
      node("span", { children: [node("strong", { text: uiText(commands, "MemoryBehavior", "Memory Protection Behavior") }), node("small", { attrs: { id: "ve-memory-protection-behavior-description" }, text: uiText(commands, "MemoryBehaviorDescription", "Recommend asks before applying a stronger profile. Automatic applies one when needed. Off never changes the profile automatically; Scene Memory Warnings controls whether a prompt appears.") })] }),
      behavior
    ] }),
    restore,
    fcs.present ? node("details", { className: "ve-fcs-compatibility", children: [
      node("summary", { text: commands.localize("VEMOBILE.Controls.Settings.compatibility") }),
      node("div", { className: "ve-fcs-heading", children: [
        node("strong", { text: uiText(commands, "ForceClientSettingsDetected", "Force Client Settings detected") }),
        fcs.version ? node("small", { text: `v${fcs.version}` }) : null
      ] }),
      conflictList.length ? node("ul", { children: conflictList }) : null,
      fcsToggle ? node("label", { className: "ve-fcs-unlock-row", children: [
        node("span", { text: fcsToggleLabel }), fcsToggle
      ] }) : null,
      node("p", { className: "ve-fcs-guidance", attrs: { id: "ve-fcs-guidance" }, text: uiText(commands, "FcsGuidance", "When a VE graphics profile is active, VE changes only the Foundry graphics settings that profile needs, even if Force Client Settings sets different values. Other forced settings stay as they are.") }),
      node("p", { text: fcs.precedenceEnabled ? uiText(commands, "PrecedenceOn", "World graphics precedence: On") : uiText(commands, "PrecedenceOff", "World graphics precedence: Off") })
    ] }) : null,
    optimizerButton
  ] });
}

function createLowMemoryPrompt(commands, scope, refresh) {
  const rows = node("dl", { className: "ve-low-memory-preview" });
  const feedback = node("p", { attrs: { role: "status", "aria-live": "polite" } });
  const cancel = node("button", { className: "ve-settings-reload-later", attrs: { type: "button" }, text: uiText(commands, "Cancel", "Cancel") });
  const apply = node("button", { className: "ve-settings-reload-now", attrs: { type: "button" }, text: uiText(commands, "Apply", "Apply") });
  const element = node("div", {
    className: "ve-settings-reload ve-low-memory-dialog",
    attrs: { hidden: true, role: "dialog", "aria-modal": "true", "aria-labelledby": "ve-low-memory-title" },
    children: [node("section", { className: "ve-settings-reload-card", children: [
      icon("fa-shield-halved"), node("h2", { id: "ve-low-memory-title", text: uiText(commands, "ChangeProfileTitle", "Change Memory Protection profile?") }),
      node("p", { text: uiText(commands, "ProfileReview", "Review the exact native graphics changes below. A reload is used only when a renderer-construction setting changes.") }),
      rows, feedback,
      node("div", { className: "ve-settings-reload-actions", children: [cancel, apply] })
    ] })]
  });
  let trigger = null;
  let targetProfile = "balanced";
  const dismiss = () => { element.hidden = true; trigger?.focus?.({ preventScroll: true }); };
  scope.listen(cancel, "click", dismiss);
  scope.listen(apply, "click", async () => {
    apply.disabled = cancel.disabled = true;
    feedback.textContent = uiText(commands, "ApplyingProfile", "Applying {profile}…", { profile: localizedText(commands.localize, `VEMOBILE.Settings.UI.Profile.${targetProfile}.Name`, profileName(targetProfile)) });
    try {
      const result = await commands.applyMemoryProtectionProfile(targetProfile);
      if (result.effective === false) feedback.textContent = uiText(commands, "RequirementsIncomplete", "The profile is selected but some graphics requirements remain incomplete.");
      if (result.requiresReload) {
        if (!result.reloadTriggered) {
          feedback.textContent = uiText(commands, "ProfileReloadFailed", "The profile was persisted, but the full Foundry reload could not be started.");
          apply.disabled = cancel.disabled = false;
        }
      } else { dismiss(); refresh(); }
    } catch (error) {
      feedback.textContent = error?.message ?? uiText(commands, "ApplyProfileFailed", "The Memory Protection profile could not be applied.");
      apply.disabled = cancel.disabled = false;
      refresh();
    }
  });
  return Object.freeze({
    element,
    show({ profile, preview }, returnFocus) {
      trigger = returnFocus;
      targetProfile = profile;
      apply.textContent = preview.some((entry) => entry.requiresReload && (!entry.conflict || entry.autoOverride)) ? uiText(commands, "ApplyReload", "Apply & Reload") : uiText(commands, "Apply", "Apply");
      rows.replaceChildren(...preview.flatMap((entry) => [
        node("dt", { text: graphicsSettingLabel(entry.key, commands.localize) }),
        node("dd", { children: [
          node("span", { text: `${graphicsSettingValue(entry.current, commands.localize)} → ${graphicsSettingValue(entry.next, commands.localize)}` }),
          entry.conflict ? node("small", { text: entry.autoOverride
            ? ` ${uiText(commands, "FcsPrecedenceBrowser", "Force Client Settings: {value} · VE profile takes precedence on this browser", { value: graphicsSettingValue(entry.conflict.forcedValue, commands.localize) })}`
            : ` ${uiText(commands, "FcsPrecedenceOff", "Force Client Settings: {value} · World graphics precedence is off or unavailable", { value: graphicsSettingValue(entry.conflict.forcedValue, commands.localize) })}` }) : null
        ] })
      ]));
      feedback.textContent = "";
      apply.disabled = cancel.disabled = false;
      element.hidden = false;
      cancel.focus?.({ preventScroll: true });
    }
  });
}

export function createMobileAssetOptimizer(commands, scope) {
  const filter = node("select", { attrs: { "aria-label": uiText(commands, "AssetFilter", "Asset filter") }, children: [
    ["all", uiText(commands, "AssetAll", "All")], ["high", uiText(commands, "AssetHighRisk", "High Risk")], ["very-high", uiText(commands, "AssetVeryHighRisk", "Very High Risk")], ["missing", uiText(commands, "AssetMissingDerivative", "Missing Derivative")], ["stale", uiText(commands, "AssetStale", "Stale")]
  ].map(([value, label]) => node("option", { attrs: { value }, text: label })) });
  const search = node("input", { attrs: { type: "search", inputmode: "search", autocomplete: "off", placeholder: uiText(commands, "AssetSearchPlaceholder", "Name, path, Scene, role, dimensions or risk"), "aria-label": uiText(commands, "SearchMobileAssets", "Search mobile assets") } });
  const profile = node("select", { attrs: { "aria-label": uiText(commands, "OptimizationProfile", "Optimization profile") }, children: [
    ["balanced", uiText(commands, "AssetBalanced", "Balanced")], ["conservative", uiText(commands, "AssetConservative", "Conservative")], ["custom", uiText(commands, "AssetCustom", "Custom")]
  ].map(([value, label]) => node("option", { attrs: { value }, text: label })) });
  const customEdge = node("input", { attrs: { type: "number", min: 256, max: 8192, step: 64, value: 2048, hidden: true, "aria-label": uiText(commands, "CustomLongEdgePixels", "Custom long edge pixels") } });
  const sort = node("select", { attrs: { "aria-label": uiText(commands, "SortMobileAssets", "Sort mobile assets") }, children: OPTIMIZER_SORTS.map((entry) => node("option", { attrs: { value: entry.key }, text: localizedText(commands.localize, entry.labelKey, entry.label) })) });
  const sortDirection = node("button", { className: "ve-asset-sort-direction", attrs: { type: "button", "aria-label": uiText(commands, "SortDescending", "Sort descending"), title: uiText(commands, "SortDescending", "Sort descending") }, children: [icon("fa-arrow-down-wide-short")] });
  const searchField = node("label", { className: "ve-asset-optimizer-field ve-asset-search-field", children: [node("span", { text: uiText(commands, "Search", "Search") }), search] });
  const filterField = node("label", { className: "ve-asset-optimizer-field", children: [node("span", { text: uiText(commands, "Show", "Show") }), filter] });
  const profileField = node("label", { className: "ve-asset-optimizer-field", children: [node("span", { text: uiText(commands, "ProfileLabel", "Profile") }), profile] });
  const customField = node("label", { className: "ve-asset-optimizer-field", attrs: { hidden: true }, children: [node("span", { text: uiText(commands, "LongEdge", "Long edge") }), customEdge] });
  const sortField = node("label", { className: "ve-asset-optimizer-field ve-asset-sort-field", children: [node("span", { text: uiText(commands, "Sort", "Sort") }), node("span", { className: "ve-asset-sort-controls", children: [sort, sortDirection] })] });
  const list = node("div", { className: "ve-asset-optimizer-list" });
  const progress = node("p", { className: "ve-asset-optimizer-progress", attrs: { role: "status", "aria-live": "polite" } });
  const selectionStatus = node("p", { className: "ve-asset-selection-status", attrs: { role: "status", "aria-live": "polite" }, text: uiText(commands, "SelectedCount", "{count} selected", { count: 0 }) });
  const profileHelp = node("div", { className: "ve-asset-profile-help", attrs: { role: "note" } });
  const scan = node("button", { className: "ve-asset-optimizer-action", attrs: { type: "button" }, children: [icon("fa-magnifying-glass"), node("span", { text: uiText(commands, "ScanRefresh", "Scan / Refresh") })] });
  const generate = node("button", { className: "ve-asset-optimizer-action is-primary", attrs: { type: "button", disabled: true }, children: [icon("fa-wand-magic-sparkles"), node("span", { text: uiText(commands, "GenerateSelected", "Generate Selected") })] });
  const cancelWork = node("button", { className: "ve-asset-optimizer-action", attrs: { type: "button", hidden: true }, text: uiText(commands, "CancelAfterCurrentAsset", "Cancel after current asset") });
  const close = node("button", { className: "ve-settings-reload-later", attrs: { type: "button" }, text: uiText(commands, "Close", "Close") });
  const warningCancel = node("button", { className: "ve-settings-reload-later", attrs: { type: "button" }, text: uiText(commands, "Cancel", "Cancel") });
  const warningContinue = node("button", { className: "ve-settings-reload-now", attrs: { type: "button" }, text: uiText(commands, "ContinueAnyway", "Continue anyway") });
  const warningCard = node("section", { className: "ve-asset-optimizer-mobile-warning", attrs: { hidden: true }, children: [
    icon("fa-triangle-exclamation"),
    node("h2", { id: "ve-asset-optimizer-warning-title", text: uiText(commands, "DesktopRecommended", "Desktop recommended") }),
    node("p", { text: uiText(commands, "AssetMobileWarning", "Scanning and generating derivatives can be memory-intensive and may process many large files. On a phone or tablet, the browser may reload or the operation may fail.") }),
    node("p", { text: uiText(commands, "AssetDesktopHint", "For the most reliable result, open this GM tool from a desktop browser. Originals and Scene documents are never overwritten.") }),
    node("div", { className: "ve-settings-reload-actions", children: [warningCancel, warningContinue] })
  ] });
  const optimizerCard = node("section", { className: "ve-asset-optimizer-card", attrs: { hidden: true }, children: [
    node("header", { children: [
      node("div", { children: [node("h2", { id: "ve-asset-optimizer-title", text: uiText(commands, "MobileAssetOptimizer", "Mobile Asset Optimizer") }), node("small", { text: uiText(commands, "GmDesktopRecommended", "GM tool · Desktop recommended") })] }),
      close
    ] }),
    node("p", { className: "ve-asset-optimizer-intro", text: uiText(commands, "AssetOptimizerIntro", "Review estimated mobile memory risk and create smaller WebP derivatives. Risk estimates are guidance, not a crash guarantee; originals and Scene documents remain unchanged.") }),
    node("div", { className: "ve-asset-optimizer-toolbar", children: [searchField, filterField, profileField, customField, sortField, scan, generate, cancelWork] }),
    profileHelp,
    node("div", { className: "ve-asset-optimizer-summary", children: [progress, selectionStatus] }),
    list
  ] });
  const element = node("div", {
    className: "ve-asset-optimizer",
    attrs: { hidden: true, role: "dialog", "aria-modal": "true", "aria-labelledby": "ve-asset-optimizer-title" },
    children: [warningCard, optimizerCard]
  });
  let returnFocus = null;
  let snapshot = null;
  let controller = null;
  let selected = new Set();
  let sortKey = "risk";
  let sortOrder = "desc";
  let sceneFilterId = "";
  let visibleRows = Object.freeze([]);
  let rowsScope = scope.child("asset-optimizer-rows");
  const busy = (value) => {
    scan.disabled = close.disabled = value;
    generate.disabled = value || selected.size === 0;
    cancelWork.hidden = !value;
  };
  const updateProgress = (entry) => {
    const current = Math.min(entry.index + 1, entry.total);
    const locale = commands.readLocale?.() ?? "en";
    progress.textContent = uiText(commands, entry.phase === "scan" ? "InspectingProgress" : "GeneratingProgress", entry.phase === "scan" ? "Inspecting {current} of {total}: {source}" : "Generating {current} of {total}: {source}", { current: localizedNumber(current, locale), total: localizedNumber(entry.total, locale), source: entry.source ?? "" });
  };
  const refreshSnapshot = () => {
    snapshot = commands.readMobileAssetOptimizer();
    const eligible = new Set(buildOptimizerView(filteredAssets(), {
      profile: profile.value,
      customLongEdge: Number(customEdge.value),
      localize: commands.localize,
      locale: commands.readLocale?.() ?? "en"
    }).filter((row) => row.eligible).map((row) => row.id));
    selected = new Set([...selected].filter((source) => eligible.has(source)));
    renderRows();
  };
  const filteredAssets = () => sceneFilterId
    ? (snapshot?.assets ?? []).filter((asset) => (asset?.scenes ?? []).some((scene) => String(scene?.id ?? "") === sceneFilterId))
    : (snapshot?.assets ?? []);
  const updateProfileHelp = () => {
    const details = OPTIMIZER_PROFILES[profile.value] ?? OPTIMIZER_PROFILES.balanced;
    profileHelp.replaceChildren(
      node("strong", { text: localizedText(commands.localize, details.labelKey ?? details.nameKey, details.label) }),
      node("span", { text: localizedText(commands.localize, details.summaryKey, details.summary) }),
      node("small", { text: uiText(commands, "AssetProfileHint", "{target} · {edge}. Heuristic only; this does not guarantee Scene stability.", { target: localizedText(commands.localize, details.targetKey, details.target), edge: localizedText(commands.localize, details.longEdgeKey, details.longEdge) }) })
    );
  };
  const updateSelection = (headerCheckbox = null) => {
    const state = visibleSelectionState(visibleRows, selected);
    if (headerCheckbox) {
      headerCheckbox.checked = state.checked;
      headerCheckbox.indeterminate = state.indeterminate;
      headerCheckbox.disabled = state.disabled;
      headerCheckbox.setAttribute("aria-label", state.disabled ? uiText(commands, "NoAssetsSelectable", "No visible assets can be selected") : uiText(commands, "SelectAllAssets", "Select all visible eligible assets"));
    }
    const locale = commands.readLocale?.() ?? "en";
    const visibleSuffix = selected.size && state.selectedVisible !== selected.size ? ` · ${uiText(commands, "VisibleAssetsSelected", "{count} visible", { count: localizedNumber(state.selectedVisible, locale) })}` : "";
    selectionStatus.textContent = `${uiText(commands, "SelectedCount", "{count} selected", { count: localizedNumber(selected.size, locale) })}${visibleSuffix}`;
    generate.disabled = Boolean(controller) || selected.size === 0;
  };
  const renderRows = () => {
    rowsScope.dispose();
    rowsScope = scope.child("asset-optimizer-rows");
    visibleRows = buildOptimizerView(filteredAssets(), {
      filter: filter.value,
      query: search.value,
      sortKey,
      sortDirection: sortOrder,
      profile: profile.value,
      customLongEdge: Number(customEdge.value),
      localize: commands.localize,
      locale: commands.readLocale?.() ?? "en"
    });
    const selectAll = node("input", { className: "ve-asset-checkbox", attrs: { type: "checkbox", "aria-label": uiText(commands, "SelectAllAssets", "Select all visible eligible assets") } });
    rowsScope.listen(selectAll, "change", () => {
      selected = applyVisibleSelection(visibleRows, selected, selectAll.checked);
      renderRows();
    });
    const header = (key, label, className = "") => {
      const active = sortKey === key;
      const button = node("button", { attrs: { type: "button" }, children: [node("span", { text: label }), active ? icon(sortOrder === "asc" ? "fa-arrow-up" : "fa-arrow-down") : null] });
      rowsScope.listen(button, "click", () => {
        if (sortKey === key) sortOrder = sortOrder === "asc" ? "desc" : "asc";
        else { sortKey = key; sortOrder = ["name", "scene", "derivative"].includes(key) ? "asc" : "desc"; }
        sort.value = sortKey;
        renderRows();
      });
      return node("th", { className, attrs: { scope: "col", "aria-sort": active ? (sortOrder === "asc" ? "ascending" : "descending") : "none" }, children: [button] });
    };
    const rows = visibleRows.map((row) => {
      const asset = row.asset;
      const checkbox = node("input", { className: "ve-asset-checkbox", attrs: { type: "checkbox", value: row.id, checked: selected.has(row.id), disabled: !row.eligible, "aria-label": row.eligible ? uiText(commands, "SelectAsset", "Select {name}", { name: row.name }) : uiText(commands, "AssetUnavailable", "{name} unavailable: {reason}", { name: row.name, reason: row.unavailableReason }), title: row.eligible ? uiText(commands, "SelectAsset", "Select {name}", { name: row.name }) : row.unavailableReason } });
      checkbox.disabled = !row.eligible;
      rowsScope.listen(checkbox, "change", () => {
        if (checkbox.checked) selected.add(row.id); else selected.delete(row.id);
        updateSelection(selectAll);
      });
      const regenerate = node("button", { attrs: { type: "button", disabled: !row.eligible, title: row.eligible ? "" : row.unavailableReason }, text: asset.derivative ? uiText(commands, "Regenerate", "Regenerate") : uiText(commands, "Generate", "Generate") });
      regenerate.disabled = !row.eligible;
      const toggle = asset.derivative ? node("button", { attrs: { type: "button" }, text: asset.derivative.enabled === false ? uiText(commands, "Enable", "Enable") : uiText(commands, "Disable", "Disable") }) : null;
      const remove = asset.derivative ? node("button", { attrs: { type: "button" }, text: uiText(commands, "Remove", "Remove") }) : null;
      rowsScope.listen(regenerate, "click", () => runGenerate([row.id]));
      if (toggle) rowsScope.listen(toggle, "click", async () => {
        await commands.setMobileAssetMappingEnabled(row.id, asset.derivative.enabled === false);
        refreshSnapshot();
      });
      if (remove) rowsScope.listen(remove, "click", async () => {
        await commands.removeMobileAssetMapping(row.id);
        selected.delete(row.id);
        refreshSnapshot();
      });
      const derivative = asset.derivative;
      const locale = commands.readLocale?.() ?? "en";
      const derivativeCopy = derivative
        ? `${row.derivativeLabel} · ${localizedNumber(derivative.width, locale)} × ${localizedNumber(derivative.height, locale)}`
        : row.derivativeLabel;
      const proposal = row.proposed
        ? `${localizedNumber(row.proposed.width, locale)} × ${localizedNumber(row.proposed.height, locale)} · ${formatDecodedSize(row.proposed.decodedBytes, commands.localize, locale)}`
        : row.unavailableReason;
      return node("tr", { className: `ve-asset-optimizer-row is-${row.risk}`, children: [
        node("td", { className: "ve-asset-select-cell", attrs: { "data-label": uiText(commands, "Select", "Select") }, children: [checkbox] }),
        node("th", { className: "ve-asset-name-cell", attrs: { scope: "row", "data-label": uiText(commands, "Name", "Name") }, children: [node("strong", { text: row.name }), node("small", { text: row.path, title: row.path })] }),
        node("td", { attrs: { "data-label": uiText(commands, "Size", "Size") }, text: formatFileSize(row.fileSize, commands.localize, commands.readLocale?.() ?? "en") }),
        node("td", { attrs: { "data-label": uiText(commands, "Dimensions", "Dimensions") }, text: Number.isFinite(Number(asset.width)) && Number.isFinite(Number(asset.height)) ? `${localizedNumber(asset.width, locale)} × ${localizedNumber(asset.height, locale)}` : row.dimensions }),
        node("td", { attrs: { "data-label": uiText(commands, "Decoded", "Decoded") }, text: formatDecodedSize(row.decodedBytes, commands.localize, commands.readLocale?.() ?? "en") }),
        node("td", { attrs: { "data-label": uiText(commands, "Risk", "Risk") }, children: [node("span", { className: `ve-asset-risk is-${row.risk}`, children: [icon("fa-triangle-exclamation"), node("span", { text: row.riskLabel })] })] }),
        node("td", { className: "ve-asset-location-cell", attrs: { "data-label": uiText(commands, "Location", "Location"), title: row.path }, text: row.path }),
        node("td", { attrs: { "data-label": uiText(commands, "Scene", "Scene"), title: row.scenes.join(", ") }, text: row.sceneLabel }),
        node("td", { className: "ve-asset-role-cell", attrs: { "data-label": uiText(commands, "Role", "Role") }, text: row.roleLabel }),
        node("td", { className: "ve-asset-derivative-cell", attrs: { "data-label": uiText(commands, "Derivative", "Derivative") }, children: [node("span", { text: derivativeCopy }), node("small", { text: uiText(commands, "Proposed", "Proposed: {value}", { value: proposal }) })] }),
        node("td", { attrs: { "data-label": uiText(commands, "Reduction", "Reduction") }, text: row.proposed?.reductionPercent === null || !row.proposed ? uiText(commands, "Unknown", "Unknown") : `${localizedNumber(row.proposed.reductionPercent, locale)}%` }),
        node("td", { className: "ve-asset-actions-cell", attrs: { "data-label": uiText(commands, "Actions", "Actions") }, children: [node("div", { className: "ve-asset-optimizer-actions", children: [regenerate, toggle, remove] })] })
      ] });
    });
  const table = node("table", { className: "ve-asset-optimizer-table", children: [
      node("caption", { text: uiText(commands, "MobileAssetsAndDerivativeStatus", "Mobile assets and derivative status") }),
      node("thead", { children: [node("tr", { children: [
        node("th", { className: "ve-asset-select-cell", attrs: { scope: "col" }, children: [selectAll] }),
        header("name", uiText(commands, "Name", "Name"), "ve-asset-name-cell"), header("size", uiText(commands, "Size", "Size")), header("dimensions", uiText(commands, "Dimensions", "Dimensions")), header("decoded", uiText(commands, "Decoded", "Decoded")), header("risk", uiText(commands, "Risk", "Risk")),
        node("th", { className: "ve-asset-location-cell", attrs: { scope: "col" }, text: uiText(commands, "Location", "Location") }), header("scene", uiText(commands, "Scene", "Scene")), node("th", { className: "ve-asset-role-cell", attrs: { scope: "col" }, text: uiText(commands, "Role", "Role") }),
        header("derivative", uiText(commands, "Derivative", "Derivative"), "ve-asset-derivative-cell"), node("th", { attrs: { scope: "col" }, text: uiText(commands, "Reduction", "Reduction") }), node("th", { className: "ve-asset-actions-cell", attrs: { scope: "col" }, text: uiText(commands, "Actions", "Actions") })
      ] })] }),
      node("tbody", { children: rows })
    ] });
    list.replaceChildren(visibleRows.length ? table : node("p", { className: "ve-asset-empty", text: uiText(commands, "NoAssetsMatch", "No assets match the current search and filter. Scan the world to refresh the catalog.") }));
    const locale = commands.readLocale?.() ?? "en";
    progress.textContent = visibleRows.length ? uiText(commands, "AssetsShown", "{shown} of {total} cataloged assets shown{sceneSuffix}.", { shown: localizedNumber(visibleRows.length, locale), total: localizedNumber(filteredAssets().length, locale), sceneSuffix: sceneFilterId ? uiText(commands, "AssetsForScene", " for this Scene") : "" }) : uiText(commands, "NoMatchingAssets", "No matching assets.");
    updateSelection(selectAll);
  };
  const closeModal = () => {
    if (controller) return;
    element.hidden = true;
    warningCard.hidden = true;
    optimizerCard.hidden = true;
    rowsScope.dispose();
    rowsScope = scope.child("asset-optimizer-rows");
    list.replaceChildren();
    snapshot = null;
    sceneFilterId = "";
    selected.clear();
    returnFocus?.focus?.({ preventScroll: true });
  };
  const openOptimizer = () => {
    warningCard.hidden = true;
    optimizerCard.hidden = false;
    element.setAttribute("aria-labelledby", "ve-asset-optimizer-title");
    renderRows();
    scan.focus?.({ preventScroll: true });
  };
  const runGenerate = async (sources) => {
    const eligible = new Set(buildOptimizerView(filteredAssets(), { profile: profile.value, customLongEdge: Number(customEdge.value), localize: commands.localize, locale: commands.readLocale?.() ?? "en" }).filter((row) => row.eligible).map((row) => row.id));
    const safeSources = sources.filter((source) => eligible.has(source));
    if (!safeSources.length) return;
    controller = new AbortController();
    busy(true);
    try {
      const result = await commands.generateMobileAssetDerivatives({
        sources: safeSources,
        profile: profile.value,
        longEdge: profile.value === "custom" ? Number(customEdge.value) : null,
        signal: controller.signal,
        onProgress: updateProgress
      });
      refreshSnapshot();
      progress.textContent = result.cancelled ? uiText(commands, "GenerationCancelled", "Generation canceled between assets.") : uiText(commands, "GenerationFinished", "Finished {completed} of {total} selected assets.", { completed: result.results.filter((entry) => entry.ok).length, total: result.results.length });
    } catch (error) { progress.textContent = error?.message ?? uiText(commands, "GenerationFailed", "Derivative generation failed."); }
    finally { controller = null; busy(false); }
  };
  scope.listen(search, "input", renderRows);
  scope.listen(filter, "change", renderRows);
  scope.listen(sort, "change", () => { sortKey = sort.value; sortOrder = ["name", "scene", "derivative"].includes(sortKey) ? "asc" : "desc"; renderRows(); });
  scope.listen(sortDirection, "click", () => {
    sortOrder = sortOrder === "asc" ? "desc" : "asc";
    const sortLabel = uiText(commands, sortOrder === "asc" ? "SortAscending" : "SortDescending", `Sort ${sortOrder === "asc" ? "ascending" : "descending"}`);
    sortDirection.setAttribute("aria-label", sortLabel);
    sortDirection.setAttribute("title", sortLabel);
    sortDirection.replaceChildren(icon(sortOrder === "asc" ? "fa-arrow-up-short-wide" : "fa-arrow-down-wide-short"));
    renderRows();
  });
  scope.listen(profile, "change", () => {
    customField.hidden = profile.value !== "custom";
    customEdge.hidden = profile.value !== "custom";
    updateProfileHelp();
    renderRows();
  });
  scope.listen(customEdge, "input", renderRows);
  scope.listen(scan, "click", async () => {
    controller = new AbortController();
    busy(true);
    try {
      const result = await commands.scanMobileAssets({ signal: controller.signal, onProgress: updateProgress });
      progress.textContent = result.cancelled ? uiText(commands, "ScanCancelled", "Scan canceled between assets.") : uiText(commands, "ScanComplete", "Scan complete: {count} unique raster assets inspected.", { count: result.processed });
      refreshSnapshot();
    } catch (error) { progress.textContent = error?.message ?? uiText(commands, "ScanFailed", "The world scan failed."); }
    finally { controller = null; busy(false); }
  });
  scope.listen(generate, "click", () => runGenerate([...selected]));
  scope.listen(cancelWork, "click", () => controller?.abort());
  scope.listen(close, "click", closeModal);
  scope.listen(warningCancel, "click", closeModal);
  scope.listen(warningContinue, "click", openOptimizer);
  scope.own(() => rowsScope.dispose());
  updateProfileHelp();
  return Object.freeze({
    element,
    show(trigger, { sceneId = "", sceneName = "" } = {}) {
      returnFocus = trigger;
      snapshot = commands.readMobileAssetOptimizer();
      if (!snapshot.isGm) return;
      sceneFilterId = String(sceneId ?? "");
      search.value = "";
      filter.value = "all";
      if (sceneFilterId && sceneName) progress.textContent = uiText(commands, "AssetsReferencedByScene", "Showing assets referenced by {scene}.", { scene: sceneName });
      const activeTheme = element.ownerDocument?.querySelector?.(".ve-mobile-app[data-theme]")?.dataset?.theme;
      if (activeTheme) element.dataset.theme = activeTheme;
      element.hidden = false;
      const physicalMobile = ["phone", "tablet"].includes(snapshot.physicalDeviceClass);
      if (physicalMobile) {
        optimizerCard.hidden = true;
        warningCard.hidden = false;
        element.setAttribute("aria-labelledby", "ve-asset-optimizer-warning-title");
        warningCancel.focus?.({ preventScroll: true });
      } else openOptimizer();
    }
  });
}

function graphicsSettingLabel(key, localize = null) {
  const entries = {
    "core.performanceMode": ["Graphics.PerformanceMode", "Performance Mode"],
    "core.maxFPS": ["Graphics.MaximumFps", "Maximum FPS"],
    "core.pixelRatioResolutionScaling": ["Graphics.PixelRatioResolutionScaling", "Pixel-ratio resolution scaling"],
    "core.mipmap": ["Graphics.Mipmaps", "Mipmaps"],
    "core.lightAnimation": ["Graphics.LightSourceAnimation", "Light Source Animation"],
    "ve.effects": ["Graphics.VeEffectsPolicy", "VE effects policy"],
    "ve.dice": ["Graphics.DiceRenderingPolicy", "Dice rendering policy"]
  };
  const entry = entries[key];
  return entry ? localizedText(localize, `VEMOBILE.Settings.UI.${entry[0]}`, entry[1]) : key;
}

function graphicsSettingValue(value, localize = null) {
  const simple = new Map([[true, ["Graphics.On", "On"]], [false, ["Graphics.Off", "Off"]], [0, ["Graphics.Low", "Low"]], [1, ["Graphics.Medium", "Medium"]], [2, ["Graphics.High", "High"]], [3, ["Graphics.Maximum", "Maximum"]]]);
  const string = { off: ["Graphics.Off", "Off"], balanced: ["Graphics.Balanced", "Balanced"], strict: ["Graphics.Minimum", "Minimum"], normal: ["Graphics.Normal", "Normal"], reduced: ["Graphics.Reduced", "Reduced"], static: ["Graphics.Static", "Static"] };
  const entry = simple.get(value) ?? string[String(value)];
  return entry ? localizedText(localize, `VEMOBILE.Settings.UI.${entry[0]}`, entry[1]) : String(value ?? localizedText(localize, "VEMOBILE.Settings.UI.Unknown", "Unknown"));
}

export function memoryProfileDefinitions(low, graphicsPolicy = {}, localize = null, locale = "en") {
  const saved = low?.previous?.original ?? low?.current ?? {};
  const labels = { normal: ["Normal", "Normal"], balanced: ["Balanced", "Balanced"], strong: ["Strong", "Strong"], maximum: ["Maximum", "Maximum"] };
  const descriptions = {
    normal: "Uses and restores your saved Foundry graphics settings.",
    balanced: "Keeps sharp Scene detail and moving lights while modestly reducing graphics work.",
    strong: "Uses Foundry's Low graphics quality and a 30 FPS limit, keeps full Scene detail and moving lights, and limits VE effects.",
    maximum: "Lowers Scene resolution, limits it to 20 FPS, turns off moving lights, and applies the strongest VE graphics safeguards."
  };
  return Object.freeze(["normal", "balanced", "strong", "maximum"].map((value) => {
    const targets = value === "normal" ? saved : resolvedProfileSettings(value, saved);
    const policy = memoryProfilePolicy(value, graphicsPolicy);
    const label = localizedText(localize, `VEMOBILE.Settings.UI.Profile.${value}.Name`, labels[value][0]);
    return Object.freeze({ value, label, description: localizedText(localize, `VEMOBILE.Settings.UI.Profile.${value}.Description`, descriptions[value]), values: Object.freeze({
      performance: presentSaved(targets, "core.performanceMode", localize),
      fps: presentSaved(targets, "core.maxFPS", localize, locale),
      density: presentSaved(targets, "core.pixelRatioResolutionScaling", localize),
      mipmaps: presentSaved(targets, "core.mipmap", localize),
      lightAnimation: presentSaved(targets, "core.lightAnimation", localize),
      effects: graphicsSettingValue(policy?.effects ?? "off", localize),
      dice: graphicsSettingValue(policy?.dice ?? "normal", localize),
      reload: localizedText(localize, `VEMOBILE.Settings.UI.Profile.${value}.Reload`, value === "normal" ? "Only when restoration needs it" : "If renderer settings change")
    }) });
  }));
}

function presentSaved(settings, key, localize = null, locale = "en") {
  if (!Object.hasOwn(settings, key) || settings[key] === null || settings[key] === undefined) return localizedText(localize, "VEMOBILE.Settings.UI.Graphics.SavedNative", "Saved native");
  return key === "core.maxFPS" ? localizedNumber(settings[key], locale) : graphicsSettingValue(settings[key], localize);
}

function mobileAssetStatusLabel(status, localize = null) {
  const values = {
    active: ["Active", "Active"], disabled: ["Off", "Off"], unavailable: ["Unavailable", "Unavailable"],
    "reload-required": ["ReloadRequired", "Reload required"], "reload-recommended": ["ReloadRecommended", "Reload recommended"],
    "not-initialized": ["NotReady", "Not ready"]
  };
  const [key, fallback] = values[String(status ?? "not-initialized")] ?? values["not-initialized"];
  return localizedText(localize, `VEMOBILE.Settings.UI.AssetStatus.${key}`, fallback);
}

function profileName(value) {
  const profile = String(value ?? "normal");
  return profile[0]?.toUpperCase() + profile.slice(1);
}

function sessionStatusPanel(commands, scope, labels) {
  const list = node("div", { className: "ve-session-status-list" });
  const rows = new Map();
  const update = (snapshot) => {
    const users = snapshot?.users ?? [];
    const ids = users.map((user) => String(user.id ?? user.name));
    if (ids.length !== rows.size || ids.some((id) => !rows.has(id))) {
      rows.clear();
      const elements = users.map((user) => {
        const latency = node("span", { className: "ve-session-metric", attrs: { title: labels.latencyTitle ?? uiText(commands, "LatencyTitle", "Local round-trip connection latency") } });
        const fps = node("span", { className: "ve-session-metric", attrs: { title: labels.fpsTitle ?? uiText(commands, "FpsTitle", "Local display frame rate") } });
        const element = node("div", { className: "ve-session-user", children: [
          node("span", { className: "ve-session-user-dot", attrs: { "aria-hidden": "true", style: `--ve-session-user-color:${user.color}` } }),
          node("strong", { text: user.name }), latency, fps
        ] });
        rows.set(String(user.id ?? user.name), { element, latency, fps });
        return element;
      });
      list.replaceChildren(...elements);
    }
    for (const user of users) {
      const row = rows.get(String(user.id ?? user.name));
      if (!row) continue;
      row.latency.textContent = metricText(user.latency, "ms", commands.readLocale?.() ?? "en");
      row.fps.textContent = metricText(user.fps, "FPS", commands.readLocale?.() ?? "en");
    }
  };
  update(commands.readSessionStatus());
  commands.watchSessionStatus?.(scope, update);
  return node("div", { className: "ve-session-status", attrs: { "aria-label": labels.online ?? uiText(commands, "Online", "Online") }, children: [
    node("span", { className: "ve-session-status-online", text: labels.online ?? uiText(commands, "Online", "Online") }),
    list,
    node("p", { className: "ve-session-status-note", text: labels.sessionMetricsNote ?? uiText(commands, "SessionMetricsNote", "Latency and FPS are available for this device only.") })
  ] });
}

function metricText(value, suffix, locale = "en") {
  return Number.isFinite(value) ? `${localizedNumber(value, locale)} ${suffix}` : "—";
}

export function groupSettings(fields) {
  const groups = [
    { id: "device", title: "Device & Power", keys: ["mode", "keepScreenAwake"] },
    { id: "scene", title: "Scene & Controls", keys: ["joystickSide", "recenterAfterMove", "movementRepeatDelay", "quickbarEnabled", "quickbarSource", "quickbarRows", "showActionSummaries", "compactActionSummaries", "combatCarousel"] },
    { id: "appearance", title: "Appearance", keys: ["theme", "colorScheme", "headerArtwork", "headerArtworkOpacity", "protectVeStyling"] },
    { id: "performance", title: "Performance & Memory", keys: ["performanceMode", "noCanvas", "graphicsSafety", "diceRendering", "mobileOptimizedAssets", "afterGraphicsFailure", "sceneMemoryWarnings"] },
    { id: "overlays", title: "Module Overlays (Experimental)", keys: [], always: true },
    { id: "support", title: "Support", keys: ["loggingLevel", "saveDiagnosticsToJournal"], always: true }
  ];
  const known = new Set(groups.flatMap((group) => group.keys));
  const result = groups.map((group) => ({ ...group,
    fields: group.keys.flatMap((key) => fields.filter((field) => field.key === key))
  })).filter((group) => group.fields.length || group.always);
  const remaining = fields.filter((field) => !known.has(field.key));
  if (remaining.length) result.push({ id: "additional", title: "Additional VE Settings", fields: remaining });
  return result;
}

export function createSettingsAccordionState(initiallyOpen = []) {
  const open = new Set(initiallyOpen);
  return Object.freeze({
    isOpen: (id) => open.has(id),
    toggle(id) {
      if (open.has(id)) open.delete(id);
      else open.add(id);
      return open.has(id);
    }
  });
}

function settingsSubsection(title, children) {
  return node("section", { className: "ve-settings-subsection", attrs: { "aria-label": title }, children: [
    node("h3", { text: title }),
    ...children
  ] });
}

function settingsSection(id, title, children, scope, accordionState) {
  const headerId = `ve-settings-${safeId(id)}-header`;
  const bodyId = `ve-settings-${safeId(id)}-body`;
  const expanded = accordionState.isOpen(id);
  const body = node("div", { className: "ve-settings-group-body", attrs: { id: bodyId, hidden: !expanded }, children });
  const button = node("button", {
    className: "ve-settings-group-toggle",
    attrs: { id: headerId, type: "button", "aria-expanded": String(expanded), "aria-controls": bodyId },
    children: [node("span", { text: title }), icon("fa-chevron-down")]
  });
  scope.listen(button, "click", () => {
    const next = accordionState.toggle(id);
    button.setAttribute("aria-expanded", String(next));
    body.hidden = !next;
  });
  return node("section", { className: "ve-settings-group", attrs: { "aria-labelledby": headerId }, children: [
    node("h2", { children: [button] }),
    body
  ] });
}

function createReloadPrompt(commands, scope) {
  const title = node("h2", { text: uiText(commands, "ReloadTitle", "Reload VE Mobile?") });
  const message = node("p", { text: uiText(commands, "FoundryReloadNeeded", "Foundry needs to reload before this setting can take effect.") });
  const later = node("button", { className: "ve-settings-reload-later", attrs: { type: "button" }, text: uiText(commands, "NotNow", "Not now") });
  const reload = node("button", { className: "ve-settings-reload-now", attrs: { type: "button" }, children: [icon("fa-rotate"), node("span", { text: uiText(commands, "ReloadNow", "Reload now") })] });
  const element = node("div", {
    className: "ve-settings-reload",
    attrs: { hidden: true, role: "dialog", "aria-modal": "true", "aria-live": "assertive" },
    children: [node("section", { className: "ve-settings-reload-card", children: [
      icon("fa-arrows-rotate"),
      title,
      message,
      node("p", { className: "ve-settings-reload-note", text: uiText(commands, "ReloadNote", "Your choice has already been saved. You can reload later from your browser if you prefer.") }),
      node("div", { className: "ve-settings-reload-actions", children: [later, reload] })
    ] })]
  });
  scope.listen(later, "click", () => element.setAttribute("hidden", ""));
  scope.listen(reload, "click", () => {
    reload.disabled = true;
    later.disabled = true;
    commands.reloadApplication();
  });
  return Object.freeze({
    element,
    show(field) {
      title.textContent = uiText(commands, "ReloadTitle", "Reload VE Mobile?");
      message.textContent = uiText(commands, "ReloadMessage", "{name} has been saved. Reload to apply it.", { name: field.name });
      reload.disabled = false;
      later.disabled = false;
      element.removeAttribute("hidden");
      reload.focus({ preventScroll: true });
    }
  });
}

function diagnosticsButtons(commands, scope, reportModal) {
  const feedback = node("span", { className: "ve-settings-diagnostics-feedback", attrs: { role: "status", "aria-live": "polite" } });
  const copy = node("button", {
    className: "ve-settings-diagnostics-button ve-button-accent-outline",
    attrs: { type: "button", "aria-label": uiText(commands, "CopyDiagnosticReport", "Copy diagnostic report to clipboard"), title: uiText(commands, "CopyDiagnosticReport", "Copy diagnostic report to clipboard") },
    children: [
      icon("fa-copy"),
      node("strong", { text: uiText(commands, "CopyReport", "Copy report") })
    ]
  });
  const show = node("button", {
    className: "ve-settings-diagnostics-button ve-button-accent-outline",
    attrs: { type: "button", "aria-label": uiText(commands, "ShowDiagnosticReport", "Show diagnostic report"), title: uiText(commands, "ShowDiagnosticReport", "Show diagnostic report") },
    children: [icon("fa-file-lines"), node("strong", { text: uiText(commands, "ShowReport", "Show report") })]
  });
  scope.listen(copy, "click", async () => {
    if (copy.disabled) return;
    copy.disabled = true;
    feedback.textContent = uiText(commands, "Copying", "Copying…");
    try {
      const report = commands.generateDiagnosticReport();
      const result = await commands.copyDiagnostics(report);
      if (!result.ok) throw new Error(uiText(commands, "CopyReportFailed", "This browser could not copy the report. Try again from a secure browser tab."));
      feedback.textContent = uiText(commands, "Copied", "Copied");
    } catch (error) {
      feedback.textContent = error?.message ?? uiText(commands, "CouldNotCopy", "Could not copy");
    } finally {
      copy.disabled = false;
    }
  });
  scope.listen(show, "click", () => {
    reportModal.show(commands.generateDiagnosticReport(), show);
  });
  return node("div", { className: "ve-settings-diagnostics", children: [show, copy, feedback] });
}

function createDiagnosticReportModal(commands, scope) {
  let displayedReport = "";
  let returnFocus = null;
  const report = node("pre", { className: "ve-settings-report-text", attrs: { tabindex: "0" } });
  const feedback = node("span", { className: "ve-settings-diagnostics-feedback", attrs: { role: "status", "aria-live": "polite" } });
  const copyButton = node("button", { className: "ve-settings-reload-now", attrs: { type: "button" }, children: [icon("fa-copy"), node("span", { text: uiText(commands, "CopyReport", "Copy report") })] });
  const close = node("button", { className: "ve-settings-reload-later", attrs: { type: "button" }, text: uiText(commands, "Close", "Close") });
  const element = node("div", {
    className: "ve-settings-report-modal",
    attrs: { hidden: true, role: "dialog", "aria-modal": "true", "aria-labelledby": "ve-settings-report-title" },
    children: [node("section", { className: "ve-settings-report-card", children: [
      node("h2", { text: uiText(commands, "DiagnosticReport", "Diagnostic Report"), attrs: { id: "ve-settings-report-title" } }),
      node("p", { text: uiText(commands, "LiveReportDescription", "This is the same live report used by Copy Report.") }),
      report,
      feedback,
      node("div", { className: "ve-settings-reload-actions", children: [close, copyButton] })
    ] })]
  });
  const dismiss = () => {
    element.hidden = true;
    returnFocus?.focus?.({ preventScroll: true });
  };
  scope.listen(close, "click", dismiss);
  scope.listen(element, "ve-close", dismiss);
  scope.listen(element, "click", (event) => { if (event.target === element) dismiss(); });
  scope.listen(copyButton, "click", async () => {
    if (copyButton.disabled) return;
    copyButton.disabled = true;
    feedback.textContent = uiText(commands, "Copying", "Copying…");
    try {
      const result = await commands.copyDiagnostics(displayedReport);
      if (!result.ok) throw new Error(uiText(commands, "CopyReportFailed", "This browser could not copy the report. Try again from a secure browser tab."));
      feedback.textContent = uiText(commands, "Copied", "Copied");
    } catch (error) {
      feedback.textContent = error?.message ?? uiText(commands, "CouldNotCopy", "Could not copy");
    } finally {
      copyButton.disabled = false;
    }
  });
  return Object.freeze({
    element,
    show(value, trigger) {
      displayedReport = String(value);
      report.textContent = displayedReport;
      feedback.textContent = "";
      returnFocus = trigger ?? null;
      element.hidden = false;
      report.focus({ preventScroll: true });
    }
  });
}

function logoutButton(label, commands, status, scope) {
  const button = node("button", {
    className: "ve-settings-logout",
    attrs: { type: "button" },
    children: [
      icon("fa-right-from-bracket"),
      node("span", { children: [
        node("strong", { text: friendlyLabel(label, localizedText(commands.localize, "MENU.Logout", "Log out")) })
      ] }),
      icon("fa-chevron-right")
    ]
  });
  scope.listen(button, "click", async () => {
    if (button.disabled) return;
    button.disabled = true;
    status.textContent = uiText(commands, "LoggingOut", "Logging out…");
    try {
      await commands.logout();
    } catch (error) {
      button.disabled = false;
      status.textContent = error?.message ?? uiText(commands, "LogoutFailed", "Foundry could not log out.");
    }
  });
  return button;
}

function settingField(field, commands, status, scope, reloadPrompt, { detail = null, onSaved = null } = {}) {
  const controlId = `ve-setting-${safeId(field.namespace)}-${safeId(field.key)}`;
  const hintId = `${controlId}-hint`;
  const control = settingControl(field, controlId, commands);
  if (field.key === "compactActionSummaries" && commands.readActionSummaryPreferences?.().showActionSummaries === false) control.disabled = true;
  const suffix = field.suffix ? node("span", {
    text: field.type === "range" ? rangeLabel(field.value, field.suffix, field.step, commands.readLocale?.() ?? "en") : field.suffix
  }) : null;
  const hint = field.supported === false ? `${field.hint} ${field.unsupported}` : field.hint;
  if (hint) control.setAttribute("aria-describedby", hintId);
  let currentValue = field.value;
  let submittedValue = settingValueKey(currentValue);
  const save = async (requestedValue) => {
    const value = requestedValue === undefined ? controlValue(control, field.type) : requestedValue;
    const valueKey = settingValueKey(value);
    if (valueKey === submittedValue) return;
    const previous = currentValue;
    submittedValue = valueKey;
    control.disabled = true;
    status.textContent = uiText(commands, "Saving", "Saving…");
    try {
      const wakeRequest = field.wakeLock && value ? commands.requestScreenWakeLock() : null;
      const result = await commands.updateSetting({ namespace: field.namespace, key: field.key, value });
      if (wakeRequest && !(await wakeRequest)) {
        await commands.updateSetting({ namespace: field.namespace, key: field.key, value: false });
        throw new Error(field.failure ?? uiText(commands, "WakeLockFailed", "This browser did not grant the screen wake lock."));
      }
      if (field.key === "showActionSummaries") {
        const dependent = control.closest(".ve-settings")?.querySelector('[id="ve-setting-ve-mobile-compactActionSummaries"]');
        if (dependent) dependent.disabled = result.value === false;
      }
      currentValue = result.value;
      submittedValue = settingValueKey(currentValue);
      setControlValue(control, field.type, currentValue);
      if (suffix && field.type === "range") suffix.textContent = rangeLabel(currentValue, field.suffix, field.step, commands.readLocale?.() ?? "en");
      if (result.requiresReload) {
        status.textContent = uiText(commands, "Saved", "Saved");
        reloadPrompt.show(field);
      } else status.textContent = uiText(commands, "Saved", "Saved");
      onSaved?.(result);
      scope.timeout(() => {
        if (status.textContent.startsWith(uiText(commands, "Saved", "Saved"))) status.textContent = "";
      }, 1600);
    } catch (error) {
      submittedValue = settingValueKey(previous);
      setControlValue(control, field.type, previous);
      if (suffix && field.type === "range") suffix.textContent = rangeLabel(previous, field.suffix, field.step, commands.readLocale?.() ?? "en");
      status.textContent = error?.message ?? uiText(commands, "SaveSettingFailed", "That setting could not be saved.");
    } finally {
      control.disabled = field.supported === false || (field.key === "compactActionSummaries" && commands.readActionSummaryPreferences?.().showActionSummaries === false);
    }
  };
  scope.listen(control, "change", () => save());
  if (field.type === "range" && suffix) {
    scope.listen(control, "input", () => {
      suffix.textContent = rangeLabel(control.value, field.suffix, field.step, commands.readLocale?.() ?? "en");
    });
  }
  return node("div", {
    className: `ve-setting ve-setting-${field.type}${field.key === "loggingLevel" ? " ve-setting-logging" : ""}`,
    children: [
      settingCopy({ ...field, hint }, controlId, hintId, detail, commands),
      node("div", { className: "ve-setting-control", children: [control, suffix] })
    ]
  });
}

function defaultLabel(field, commands) {
  if (field.type === "choice") return field.choices.find(choice => String(choice.value) === String(field.defaultValue))?.label ?? String(field.defaultValue);
  if (field.type === "boolean") return field.defaultValue ? uiText(commands, "On", "On") : uiText(commands, "Off", "Off");
  if (field.type === "range") return rangeLabel(field.defaultValue, field.suffix, field.step, commands.readLocale?.() ?? "en");
  return String(field.defaultValue);
}

function createDefaultsPrompt(commands, scope, refresh) {
  const button = node("button", { className: "ve-settings-defaults", attrs: { type: "button" }, text: uiText(commands, "RestoreDefaults", "Restore Defaults") });
  const cancel = node("button", { className: "ve-settings-reload-later", attrs: { type: "button" }, text: uiText(commands, "Cancel", "Cancel") });
  const confirm = node("button", { className: "ve-settings-reload-now", attrs: { type: "button" }, text: uiText(commands, "RestoreDefaults", "Restore Defaults") });
  const feedback = node("p", { attrs: { role: "status", "aria-live": "polite" } });
  const element = node("div", {
    className: "ve-settings-reload",
    attrs: { hidden: true, role: "dialog", "aria-modal": "true", "aria-label": uiText(commands, "RestoreDefaultsLabel", "Restore default settings") },
    children: [node("section", { className: "ve-settings-reload-card", children: [
      icon("fa-rotate-left"),
      node("h2", { text: uiText(commands, "RestoreDefaultsTitle", "Restore default settings?") }),
      node("p", { text: uiText(commands, "RestoreDefaultsMessage", "Reset every setting listed on this tab to its default for this browser? A reload may be needed. Auto-detect may return this device to the desktop interface.") }),
      feedback,
      node("div", { className: "ve-settings-reload-actions", children: [cancel, confirm] })
    ] })]
  });
  scope.listen(button, "click", () => { element.hidden = false; cancel.focus({ preventScroll: true }); });
  scope.listen(cancel, "click", () => { element.hidden = true; button.focus({ preventScroll: true }); });
  scope.listen(confirm, "click", async () => {
    if (confirm.disabled) return;
    confirm.disabled = cancel.disabled = true;
    feedback.textContent = uiText(commands, "RestoringDefaults", "Restoring defaults…");
    try {
      const result = await commands.restoreSettingsDefaults();
      refresh(result.requiresReload);
    } catch (error) {
      feedback.textContent = error?.message ?? uiText(commands, "RestoreDefaultsFailed", "Some settings could not be restored. Please try again.");
      confirm.disabled = cancel.disabled = false;
    }
  });
  return { button, element };
}

function settingCopy(entry, controlId, hintId, detail = null, commands) {
  return node("div", { className: "ve-setting-copy", children: [
    node(controlId ? "label" : "div", { className: "ve-setting-name", text: entry.name, attrs: { for: controlId } }),
    entry.hint ? node("p", { attrs: hintId ? { id: hintId } : {}, text: entry.hint + (entry.defaultValue !== undefined ? ` (${uiText(commands, "Default", "Default: {value}.", { value: defaultLabel(entry, commands) })})` : "") }) : null,
    detail,
    entry.requiresReload || (entry.scope && entry.scope !== "client") ? node("div", {
      className: "ve-setting-meta",
      children: [
        entry.scope && entry.scope !== "client" ? node("span", { text: entry.scope === "world" ? uiText(commands, "World", "World") : uiText(commands, "User", "User") }) : null,
        entry.requiresReload ? node("span", { text: uiText(commands, "ReloadRequired", "Reload required") }) : null
      ]
    }) : null
  ] });
}

function settingControl(field, id, commands) {
  if (field.type === "unsupported") {
    return node("span", { className: "ve-setting-unavailable", text: uiText(commands, "NotEditableHere", "Not editable here") });
  }
  if (field.type === "choice") {
    const select = node("select", {
      className: "ve-setting-select",
      attrs: { id, "aria-label": field.name, disabled: field.supported === false },
      children: field.choices.map((choice) => node("option", {
        text: choice.label,
        attrs: { value: choice.value, selected: String(choice.value) === String(field.value) }
      }))
    });
    select.value = String(field.value);
    return select;
  }
  if (field.type === "range") {
    const range = node("input", {
      attrs: { id, type: "range", value: field.value, min: field.min, max: field.max, step: field.step, "aria-label": field.name }
    });
    range.value = String(field.value);
    return range;
  }
  if (field.type === "boolean") {
    return settingsToggle({
        id,
        "aria-label": field.name,
        checked: field.value,
        disabled: field.supported === false
    });
  }
  return node("input", {
    className: `ve-setting-input ve-setting-input-${field.type}`,
    attrs: {
      id,
      type: field.type === "number" || field.type === "color" ? field.type : "text",
      value: field.value,
      min: field.min,
      max: field.max,
      step: field.step,
      "aria-label": field.name,
      autocomplete: "off",
      disabled: field.supported === false
    }
  });
}

function settingsToggle(attrs) {
  return node("input", { className: "ve-setting-toggle", attrs: { type: "checkbox", role: "switch", ...attrs } });
}

function controlValue(control, type) {
  if (type === "boolean") return Boolean(control.checked);
  if (type === "range" || type === "number") return Number(control.value);
  return control.value;
}

function setControlValue(control, type, value) {
  if (type === "boolean") control.checked = Boolean(value);
  else control.value = String(value);
}

function settingValueKey(value) {
  return `${typeof value}:${String(value)}`;
}

function rangeLabel(value, suffix, step = 1, locale = "en") {
  if (suffix === "%") return `${localizedNumber(Math.round(Number(value) * 100), locale)}%`;
  const decimals = String(step).split(".")[1]?.length ?? 0;
  return `${localizedNumber(Number(value), locale, decimals)} ${suffix}`;
}

function safeId(value) {
  return String(value ?? "setting").replace(/[^a-z0-9_-]+/giu, "-");
}

function friendlyLabel(value, fallback) {
  const label = String(value ?? "").trim();
  return !label || /^[A-Z0-9_.-]+$/u.test(label) ? fallback : label;
}

export function deviceDetectedText({ deviceLabel, modePreference, resolvedMode, labels = {}, localize }) {
  const selected = modePreference !== "auto";
  const mode = selected ? modePreference : resolvedMode;
  const normalized = ["phone", "tablet", "desktop"].includes(mode) ? mode : "phone";
  const suffixKey = `${normalized}Mode${selected ? "Selected" : "Enabled"}`;
  const fallbackMode = localizedText(localize, `VEMOBILE.Settings.UI.${normalized[0].toUpperCase()}${normalized.slice(1)}Mode${selected ? "Selected" : "Enabled"}`, `${normalized[0].toUpperCase()}${normalized.slice(1)} mode ${selected ? "selected" : "enabled"}`);
  const device = String(deviceLabel || uiText({ localize }, "DesktopBrowser", "Desktop browser"));
  return `${device} · ${labels[suffixKey] ?? fallbackMode}`;
}

export function autoResolvedPolicyText(requested, resolved, label = titleCase, localize) {
  return requested === "auto" && resolved ? localizedText(localize, "VEMOBILE.Settings.UI.AutoResolved", "Auto · {value}", { value: label(resolved) }) : "";
}

function updateAutoPolicyDetail(element, requested, resolved, label, localize) {
  element.textContent = autoResolvedPolicyText(requested, resolved, label, localize);
  element.hidden = requested !== "auto" || !resolved;
}

function choiceLabel(field, value) {
  return field?.choices?.find((choice) => String(choice.value) === String(value))?.label ?? titleCase(value);
}

function titleCase(value) {
  const text = String(value ?? "");
  return text ? `${text[0].toUpperCase()}${text.slice(1)}` : "";
}
