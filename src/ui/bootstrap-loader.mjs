import { createElapsedWorkerClock } from "./elapsed-worker-clock.mjs";
import { createLoadingCheckpoints } from "./loading-checkpoints.mjs";
import { localizedText, localizedNumber } from "./localized-text.mjs";

export const BOOTSTRAP_STAGES = Object.freeze([
  Object.freeze({ id: "module", labelKey: "VEMOBILE.Boot.Stage.Module", label: "Starting VE Mobile" }),
  Object.freeze({ id: "init", labelKey: "VEMOBILE.Boot.Stage.Init", label: "Reading your settings" }),
  Object.freeze({ id: "world", labelKey: "VEMOBILE.Boot.Stage.World", label: "Loading your game world" }),
  Object.freeze({ id: "canvas", labelKey: "VEMOBILE.Boot.Stage.Canvas", label: "Preparing the current scene" }),
  Object.freeze({ id: "theme", labelKey: "VEMOBILE.Boot.Stage.Theme", label: "Applying your interface theme" }),
  Object.freeze({ id: "recovery", labelKey: "VEMOBILE.Boot.Stage.Recovery", label: "Checking graphics recovery" }),
  Object.freeze({ id: "session", labelKey: "VEMOBILE.Boot.Stage.Session", label: "Building your mobile session" }),
  Object.freeze({ id: "interface", labelKey: "VEMOBILE.Boot.Stage.Interface", label: "Getting the interface ready" })
]);

/** Navigation startTime and performance.now() share the same monotonic origin. */
export function navigationStartAt(performanceRef = globalThis.performance) {
  const navigation = performanceRef?.getEntriesByType?.("navigation")?.[0];
  return Number.isFinite(navigation?.startTime) && navigation.startTime >= 0 ? navigation.startTime : 0;
}

/** Prevent hidden Foundry text controls from summoning a mobile keyboard. */
export function suppressBootstrapSoftwareKeyboard(scope, surface, {
  getDocument = () => globalThis.document
} = {}) {
  const document = getDocument();
  const blurEditableOutsideBootstrap = (target) => {
    const editable = target?.closest?.("textarea, input, [contenteditable]");
    if (!editable || editable.getAttribute?.("contenteditable") === "false" || surface?.contains?.(editable)) return;
    editable.blur?.();
  };
  blurEditableOutsideBootstrap(document?.activeElement);
  scope.listen(document, "focusin", (event) => blurEditableOutsideBootstrap(event.target), true);
}

/** A dependency-free boot surface which can render before Foundry is ready. */
export function createMobileBootstrap({
  getDocument = () => globalThis.document,
  iconUrl = "",
  now = () => globalThis.performance?.now?.() ?? Date.now(),
  elapsedUpdateMs = 200,
  localize = (_key, fallback) => fallback,
  readLocale = () => "en",
  setTimer = (callback, delay) => globalThis.setTimeout(callback, delay),
  clearTimer = (id) => globalThis.clearTimeout(id)
} = {}) {
  const document = getDocument();
  const text = (key, fallback, data) => localizedText(localize, key, fallback, data);
  const stageLabel = stage => text(stage.labelKey, stage.label);
  const root = document.createElement("section");
  root.className = "ve-mobile-bootstrap";
  root.setAttribute("role", "status");
  root.setAttribute("aria-live", "polite");
  root.setAttribute("aria-label", text("VEMOBILE.Boot.LoadingLabel", "VE Mobile is loading"));

  const content = document.createElement("div");
  content.className = "ve-mobile-bootstrap__content";
  root.append(content);

  const image = document.createElement("img");
  image.className = "ve-mobile-bootstrap__icon";
  image.src = iconUrl;
  image.alt = "VE Mobile";
  image.decoding = "async";
  content.append(image);

  const heading = document.createElement("h1");
  heading.className = "ve-mobile-bootstrap__heading";
  const headingText = document.createElement("span");
  headingText.textContent = text("VEMOBILE.Boot.LoadingGame", "Loading your game");
  const ellipsis = document.createElement("span");
  ellipsis.className = "ve-mobile-bootstrap__ellipsis";
  ellipsis.setAttribute("aria-hidden", "true");
  for (let index = 0; index < 3; index += 1) {
    const dot = document.createElement("span");
    dot.textContent = ".";
    ellipsis.append(dot);
  }
  heading.append(headingText, ellipsis);
  content.append(heading);

  const activity = document.createElement("section");
  activity.className = "ve-mobile-bootstrap__activity";
  activity.setAttribute("aria-label", text("VEMOBILE.Boot.ProgressLabel", "Loading progress"));
  const activityIndicator = document.createElement("span");
  activityIndicator.className = "ve-mobile-bootstrap__activity-indicator";
  activityIndicator.setAttribute("aria-hidden", "true");
  const phase = document.createElement("p");
  phase.className = "ve-mobile-bootstrap__phase";
  phase.textContent = stageLabel(BOOTSTRAP_STAGES[0]);
  const progress = document.createElement("span");
  progress.className = "ve-mobile-bootstrap__phase-progress";
  progress.hidden = true;
  const timing = document.createElement("div");
  timing.className = "ve-mobile-bootstrap__timing";
  const elapsed = document.createElement("span");
  elapsed.className = "ve-mobile-bootstrap__elapsed";
  elapsed.textContent = text("VEMOBILE.Boot.Elapsed", "Elapsed · {duration}", { duration: "0 ms" });
  const previous = document.createElement("span");
  previous.className = "ve-mobile-bootstrap__previous";
  previous.textContent = text("VEMOBILE.Boot.LastFullLoad", "Last full load · {duration}", { duration: "—" });
  timing.append(elapsed, previous);
  const checkpoints = createLoadingCheckpoints(document, BOOTSTRAP_STAGES, { label: "Loading checkpoints", followCurrent: true, localize });
  const elapsedClock = createElapsedWorkerClock(elapsed, { now, elapsedLabel: text("VEMOBILE.Boot.ElapsedLabel", "Elapsed"), locale: readLocale() });
  activity.append(activityIndicator, phase, progress, checkpoints.element, timing);
  content.append(activity);

  const wake = document.createElement("button");
  wake.type = "button";
  wake.className = "ve-mobile-bootstrap__wake";
  wake.setAttribute("role", "checkbox");
  wake.setAttribute("aria-checked", "false");
  wake.hidden = true;
  const wakeBox = document.createElement("span");
  wakeBox.className = "ve-mobile-bootstrap__wake-box";
  wakeBox.setAttribute("aria-hidden", "true");
  const wakeCopy = document.createElement("span");
  wakeCopy.className = "ve-mobile-bootstrap__wake-copy";
  const wakeText = document.createElement("span");
  wakeText.textContent = text("VEMOBILE.Boot.KeepScreenAwake", "KEEP SCREEN AWAKE");
  const wakeWarning = document.createElement("small");
  wakeWarning.textContent = text("VEMOBILE.Boot.KeepAwakeHint", "Prevents your device from sleeping while VE Mobile is open.");
  wakeCopy.append(wakeText, wakeWarning);
  wake.append(wakeBox, wakeCopy);
  content.append(wake);

  const recovery = document.createElement("section");
  recovery.className = "ve-mobile-bootstrap__recovery";
  recovery.hidden = true;
  const recoveryMessage = document.createElement("p");
  const recoveryButton = document.createElement("button");
  recoveryButton.type = "button";
  recovery.append(recoveryMessage, recoveryButton);
  content.append(recovery);

  const wakePrompt = document.createElement("div");
  wakePrompt.className = "ve-mobile-bootstrap__wake-prompt";
  wakePrompt.hidden = true;
  const wakePromptMessage = document.createElement("p");
  wakePromptMessage.textContent = text("VEMOBILE.Boot.WakePrompt", "Keep Awake needs a browser-confirmed tap. Continue to enter VE and activate it.");
  const wakePromptChoice = document.createElement("button");
  wakePromptChoice.type = "button";
  wakePromptChoice.className = "ve-mobile-bootstrap__wake-prompt-choice";
  wakePromptChoice.setAttribute("role", "checkbox");
  wakePromptChoice.setAttribute("aria-checked", "false");
  const wakePromptChoiceBox = document.createElement("span");
  wakePromptChoiceBox.className = "ve-mobile-bootstrap__wake-box";
  wakePromptChoiceBox.setAttribute("aria-hidden", "true");
  const wakePromptChoiceText = document.createElement("span");
  wakePromptChoiceText.textContent = text("VEMOBILE.Boot.KeepScreenAwake", "KEEP SCREEN AWAKE");
  wakePromptChoice.append(wakePromptChoiceBox, wakePromptChoiceText);
  const wakePromptActions = document.createElement("div");
  wakePromptActions.className = "ve-mobile-bootstrap__wake-prompt-actions";
  const wakePromptYes = document.createElement("button");
  wakePromptYes.type = "button";
  wakePromptYes.className = "ve-mobile-bootstrap__wake-prompt-yes";
  wakePromptYes.textContent = text("VEMOBILE.Boot.Continue", "Continue");
  wakePromptActions.append(wakePromptYes);
  wakePrompt.append(wakePromptMessage, wakePromptChoice, wakePromptActions);
  activity.append(wakePrompt);

  let mounted = false;
  let elapsedTimer = null;
  let timerGeneration = 0;
  let startedAt = null;
  let lastSuccessfulMs = null;
  let wakePromptWaiter = null;
  let wakePromptVisible = false;
  let activeStage = BOOTSTRAP_STAGES[0].id;
  let customPhase = "";
  let recoveryCopy = null;

  const updatePolicy = (policy = {}) => {
    root.dataset.theme = policy.theme === "light" || policy.theme === "dark" ? policy.theme : "system";
    root.dataset.formFactor = policy.formFactor === "tablet" ? "tablet" : "phone";
  };

  const cancelElapsedTimer = () => {
    timerGeneration += 1;
    if (elapsedTimer !== null) clearTimer(elapsedTimer);
    elapsedTimer = null;
    elapsedClock.stop();
  };

  const renderTiming = () => {
    const current = Number(startedAt);
    const currentNow = Number(now());
    const elapsedMs = startedAt !== null && startedAt !== undefined && Number.isFinite(current) && Number.isFinite(currentNow)
      ? Math.max(0, currentNow - current)
      : 0;
    elapsed.textContent = text("VEMOBILE.Boot.Elapsed", "Elapsed · {duration}", { duration: formatDuration(elapsedMs, readLocale()) });
    const prior = Number(lastSuccessfulMs);
    const hasPrevious = lastSuccessfulMs !== null && lastSuccessfulMs !== undefined && Number.isFinite(prior) && prior >= 0;
    previous.textContent = text("VEMOBILE.Boot.LastFullLoad", "Last full load · {duration}", { duration: hasPrevious ? formatDuration(prior, readLocale()) : "—" });
  };

  const scheduleElapsedTimer = () => {
    if (!mounted || elapsedTimer !== null) return;
    const generation = timerGeneration;
    elapsedTimer = setTimer(() => {
      elapsedTimer = null;
      if (!mounted || generation !== timerGeneration) return;
      renderTiming();
      scheduleElapsedTimer();
    }, elapsedUpdateMs);
  };

  const setTiming = (timingState = {}) => {
    if (Number.isFinite(Number(timingState.startedAt))) startedAt = Number(timingState.startedAt);
    if (timingState.lastSuccessfulMs === null || timingState.lastSuccessfulMs === undefined) lastSuccessfulMs = null;
    else if (Number.isFinite(Number(timingState.lastSuccessfulMs)) && Number(timingState.lastSuccessfulMs) >= 0) {
      lastSuccessfulMs = Number(timingState.lastSuccessfulMs);
    }
    renderTiming();
    scheduleElapsedTimer();
    elapsedClock.start(startedAt);
  };

  const setPhase = (next = {}) => {
    const value = typeof next === "string" ? { label: next } : next;
    const label = String(value?.label ?? "").trim();
    if (label) { customPhase = label; phase.textContent = label; }
    const parts = [];
    const pct = Number(value?.pct);
    const current = Number(value?.current);
    const total = Number(value?.total);
    if (value?.pct !== null && value?.pct !== undefined && Number.isFinite(pct)) {
      parts.push(`${Math.round(Math.max(0, Math.min(100, pct)))}%`);
    }
    if (value?.current !== null && value?.current !== undefined
      && value?.total !== null && value?.total !== undefined
      && Number.isFinite(current) && Number.isFinite(total) && total > 0) {
      parts.push(text("VEMOBILE.Recovery.Progress", "{current} of {total}", { current: localizedNumber(Math.max(0, current), readLocale()), total: localizedNumber(Math.max(0, total), readLocale()) }));
    }
    progress.textContent = parts.join(" · ");
    progress.hidden = parts.length === 0;
    const activeLabel = stageLabel(BOOTSTRAP_STAGES.find((stage) => stage.id === activeStage) ?? BOOTSTRAP_STAGES[0]);
    const hasExtraDetail = label !== activeLabel || parts.length > 0;
    phase.hidden = !hasExtraDetail;
    activityIndicator.hidden = !hasExtraDetail;
    root.dataset.progress = progress.hidden ? "indeterminate" : "determinate";
    if (value?.pct !== null && value?.pct !== undefined && Number.isFinite(pct)) {
      activity.setAttribute("aria-valuenow", String(Math.round(Math.max(0, Math.min(100, pct)))));
    } else activity.removeAttribute("aria-valuenow");
  };

  const showRecovery = (copy = {}) => {
    recoveryCopy = {
      title: copy.title ?? text("VEMOBILE.Boot.LoadingInterrupted", "Loading interrupted"),
      message: copy.message ?? text("VEMOBILE.Boot.FoundryStopped", "Foundry stopped responding during startup."),
      actionLabel: copy.actionLabel ?? text("VEMOBILE.Boot.RefreshGame", "Refresh game")
    };
    cancelElapsedTimer();
    checkpoints.update(activeStage, { failed: true });
    headingText.textContent = recoveryCopy.title;
    ellipsis.hidden = true;
    recoveryMessage.textContent = recoveryCopy.message;
    recoveryButton.textContent = recoveryCopy.actionLabel;
    recovery.hidden = false;
    root.setAttribute("role", "alertdialog");
    root.setAttribute("aria-label", recoveryCopy.title);
    root.classList.add("is-failed");
  };

  const promptForWakeChoice = () => {
    if (!mounted) return Promise.resolve(null);
    if (wakePromptWaiter) return wakePromptWaiter.promise;
    activity.classList.add("is-wake-prompt");
    headingText.textContent = text("VEMOBILE.Boot.LoadingComplete", "Loading Complete");
    ellipsis.hidden = true;
    wakePromptVisible = true;
    wake.hidden = true;
    wakePrompt.hidden = false;
    wakePromptYes.focus?.();
    const promise = new Promise((resolve) => {
      wakePromptWaiter = { promise: null, resolve };
    });
    wakePromptWaiter.promise = promise;
    return promise;
  };

  const resolveWakePrompt = (keepAwake) => {
    const waiter = wakePromptWaiter;
    if (!waiter) return false;
    wakePromptWaiter = null;
    wakePrompt.hidden = true;
    activity.classList.remove("is-wake-prompt");
    waiter.resolve(Boolean(keepAwake));
    return true;
  };

  setPhase({ label: stageLabel(BOOTSTRAP_STAGES[0]) });

  return Object.freeze({
    get mounted() {
      return mounted;
    },
    get surface() {
      return root;
    },
    get wakeControl() {
      return wake;
    },
    get recoveryControl() {
      return recoveryButton;
    },
    get wakePromptYesControl() {
      return wakePromptYes;
    },
    get wakePromptChoiceControl() {
      return wakePromptChoice;
    },
    mount(policy = {}) {
      if (!root.isConnected) (document.body ?? document.documentElement).append(root);
      document.body?.classList.add("ve-mobile-booting");
      root.setAttribute("role", "status");
      root.setAttribute("aria-label", text("VEMOBILE.Boot.LoadingLabel", "VE Mobile is loading"));
      root.classList.remove("is-complete", "is-failed");
      headingText.textContent = text("VEMOBILE.Boot.LoadingGame", "Loading your game");
      ellipsis.hidden = false;
      recovery.hidden = true;
      activity.classList.remove("is-wake-prompt");
      wakePromptVisible = false;
      wakePrompt.hidden = true;
      activeStage = BOOTSTRAP_STAGES[0].id;
      checkpoints.update(activeStage);
      customPhase = "";
      setPhase({ label: stageLabel(BOOTSTRAP_STAGES[0]) });
      mounted = true;
      if (startedAt === null || startedAt === undefined || !Number.isFinite(Number(startedAt))) startedAt = Number(now());
      updatePolicy(policy);
      renderTiming();
      scheduleElapsedTimer();
      elapsedClock.start(startedAt);
    },
    updatePolicy,
    refreshLocalization() {
      root.setAttribute("aria-label", text("VEMOBILE.Boot.LoadingLabel", "VE Mobile is loading"));
      activity.setAttribute("aria-label", text("VEMOBILE.Boot.ProgressLabel", "Loading progress"));
      wakeText.textContent = text("VEMOBILE.Boot.KeepScreenAwake", "KEEP SCREEN AWAKE");
      wakeWarning.textContent = text("VEMOBILE.Boot.KeepAwakeHint", "Prevents your device from sleeping while VE Mobile is open.");
      wakePromptMessage.textContent = text("VEMOBILE.Boot.WakePrompt", "Keep Awake needs a browser-confirmed tap. Continue to enter VE and activate it.");
      wakePromptChoiceText.textContent = text("VEMOBILE.Boot.KeepScreenAwake", "KEEP SCREEN AWAKE");
      wakePromptYes.textContent = text("VEMOBILE.Boot.Continue", "Continue");
      checkpoints.refreshLabels();
      elapsedClock.setElapsedLabel(text("VEMOBILE.Boot.ElapsedLabel", "Elapsed"));
      elapsedClock.setLocale(readLocale());
      if (mounted && root.classList.contains("is-failed") && recoveryCopy) showRecovery(recoveryCopy);
      else if (mounted && wakePromptVisible) headingText.textContent = text("VEMOBILE.Boot.LoadingComplete", "Loading Complete");
      else if (mounted && !root.classList.contains("is-complete")) {
        headingText.textContent = text("VEMOBILE.Boot.LoadingGame", "Loading your game");
        const stage = BOOTSTRAP_STAGES.find(candidate => candidate.id === activeStage) ?? BOOTSTRAP_STAGES[0];
        if (!customPhase || customPhase === stage.label || customPhase === stageLabel(stage)) setPhase({ label: stageLabel(stage) });
      }
      renderTiming();
    },
    setTiming,
    setPhase,
    advance(stageId) {
      const stage = BOOTSTRAP_STAGES.find((candidate) => candidate.id === stageId);
      if (stage) {
        activeStage = stage.id;
        checkpoints.update(activeStage);
        customPhase = "";
        setPhase({ label: stageLabel(stage) });
      }
    },
    setWakeState(state = "pending", {
      checked = wake.getAttribute("aria-checked") === "true",
      disabled = false,
      visible = true
    } = {}) {
      wake.dataset.state = state;
      wake.setAttribute("aria-checked", String(Boolean(checked)));
      wake.disabled = Boolean(disabled);
      wake.hidden = wakePromptVisible || !visible;
    },
    setWakePromptChecked(checked) {
      wakePromptChoice.setAttribute("aria-checked", String(Boolean(checked)));
    },
    complete({ beforeDismiss } = {}) {
      renderTiming();
      checkpoints.update(activeStage, { complete: true });
      setPhase({ label: text("VEMOBILE.Boot.Ready", "Ready") });
      return Promise.resolve(beforeDismiss?.()).then(() => {
        if (mounted) root.classList.add("is-complete");
        return mounted;
      });
    },
    promptForWakeChoice,
    resolveWakePrompt,
    showRecovery,
    fail(message = text("VEMOBILE.Boot.LoadFailed", "VE Mobile could not finish loading.")) {
      showRecovery({ title: message });
    },
    unmount() {
      cancelElapsedTimer();
      if (wakePromptWaiter) {
        wakePromptWaiter.resolve(null);
        wakePromptWaiter = null;
      }
      wakePrompt.hidden = true;
      wakePromptVisible = false;
      activity.classList.remove("is-wake-prompt");
      document.body?.classList.remove("ve-mobile-booting");
      root.remove();
      root.classList.remove("is-complete", "is-failed");
      mounted = false;
    }
  });
}

export function formatDuration(value, locale = "en") {
  const milliseconds = Math.max(0, Number(value) || 0);
  if (milliseconds < 1_000) return `${localizedNumber(Math.round(milliseconds), locale)} ms`;
  return `${localizedNumber(milliseconds / 1_000, locale, 1)} s`;
}
