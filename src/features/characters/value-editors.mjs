import { localizedNumber, localizedText } from "../../ui/localized-text.mjs";
import { ACTOR_COMMANDS } from "../../kernel/command-names.mjs";
import { icon, node } from "../../ui/dom.mjs";

// Shared presentation only: the supplied command boundary owns system semantics.
const characterRecordSourceUuid = actor => String(actor?.sourceUuid ?? (actor?.id ? `Actor.${actor.id}` : ""));

export function experienceEditor(actor, open, commands, scope) {
  if (!open || !actor.capabilities?.editExperience) return null;
  let pending = false;
  const current = Math.max(0, Math.trunc(Number(actor.header?.experience?.value) || 0));
  const locale = actor.header?.locale ?? commands.readLocale?.() ?? "en";
  const localize = (key, fallback, data) => commands.localize?.(key, fallback, data) ?? fallback;
  const status = node("p", { className: "ve-hp-editor-status", attrs: { role: "status", "aria-live": "polite" } });
  const input = node("input", { className: "ve-hp-editor-amount", attrs: { type: "number", inputmode: "numeric", pattern: "[0-9]*", min: "0", max: "1000000000", step: "1", autocomplete: "off", required: true, placeholder: "0", "aria-label": localize("VEMOBILE.Character.ExperienceAmount", "Experience to add") } });
  const close = node("button", { className: "ve-hp-editor-close", attrs: { type: "button", "aria-label": localize("VEMOBILE.Character.CloseExperience", "Close experience editor") }, on: { click: () => { if (!pending) commands.closeExperienceEditor(); } }, children: [icon("fa-xmark")] }, scope);
  const submit = node("button", { className: "ve-hp-editor-submit", attrs: { type: "submit" }, children: [icon("fa-plus"), node("span", { text: localize("VEMOBILE.Character.AddXp", "Add XP") })] });
  const form = node("form", {
    className: "ve-hp-editor ve-xp-editor",
    attrs: { role: "dialog", "aria-modal": "true", "aria-labelledby": "ve-xp-editor-title" },
    on: { submit: async (event) => {
      event.preventDefault();
      if (pending || !input.reportValidity()) return;
      const amount = Number(input.value);
      if (!Number.isSafeInteger(amount) || amount < 0) {
        status.classList.add("is-error");
        status.textContent = localize("VEMOBILE.Character.ValidExperience", "Enter a whole, non-negative XP amount.");
        return;
      }
      pending = true;
      form.setAttribute("aria-busy", "true");
      input.disabled = submit.disabled = close.disabled = true;
      status.classList.remove("is-error");
      status.textContent = commands.silentValueEditorStatus ? "" : localize("VEMOBILE.Character.AddingExperience", "Adding experience…");
      try {
        await commands.execute(ACTOR_COMMANDS.ADD_EXPERIENCE, { actorSourceUuid: characterRecordSourceUuid(actor), amount });
        if (!scope.disposed) commands.closeExperienceEditor();
      } catch (error) {
        if (!scope.disposed) {
          pending = false;
          form.removeAttribute("aria-busy");
          input.disabled = submit.disabled = close.disabled = false;
          status.classList.add("is-error");
          status.textContent = error?.message ?? localize("VEMOBILE.Character.ExperienceFailed", "Foundry could not add that experience.");
        }
      }
    } },
    children: [
      node("header", { children: [node("span", { className: "ve-hp-editor-heading-icon", children: [icon("fa-star")] }), node("div", { children: [node("small", { text: actor.name }), node("h2", { attrs: { id: "ve-xp-editor-title" }, text: localize("VEMOBILE.Character.AddExperience", "Add experience") })] }), close] }),
      node("div", { className: "ve-hp-editor-summary", children: [node("span", { children: [node("small", { text: localize("VEMOBILE.Character.CurrentXp", "Current XP") }), node("strong", { text: localizedNumber(current, locale) })] })] }),
      node("label", { className: "ve-hp-editor-amount-label", children: [node("span", { text: localize("VEMOBILE.Character.ExperienceAmount", "Experience to add") }), input] }),
      status,
      submit
    ]
  }, scope);
  queueMicrotask(() => { if (!scope.disposed) input.focus?.(); });
  return node("div", { className: "ve-hp-editor-layer", attrs: { role: "presentation" }, children: [form] });
}

export function hitPointEditor(actor, requestedEditor, commands, scope) {
  if (!requestedEditor || !actor.capabilities?.editHitPoints) return null;
  const hp = {
    value: Math.max(0, Math.trunc(Number(actor.hp?.value) || 0)),
    max: Math.max(0, Math.trunc(Number(actor.hp?.max) || 0)),
    temp: Math.max(0, Math.trunc(Number(actor.hp?.temp) || 0))
  };
  let operation = requestedEditor === "temp" ? "set-temp" : "damage";
  let pending = false;
  const modalStatus = node("p", { className: "ve-hp-editor-status", attrs: { role: "status", "aria-live": "polite" } });
  const amountInput = node("input", {
    className: "ve-hp-editor-amount",
    attrs: { type: "number", inputmode: "numeric", pattern: "[0-9]*", step: "1", autocomplete: "off", "aria-label": localizedText(commands.localize, "VEMOBILE.Character.Presenter.Amount", "Amount") },
    on: { input: () => updateSubmitLabel() }
  }, scope);
  const submitLabel = node("span");
  const operationButtons = new Map();
  const editableControls = [];

  const operationChoices = [
    ["damage", "Damage", "fa-heart-crack"],
    ["heal", "Heal", "fa-heart"],
    ["set-hp", "Set HP", "fa-sliders"],
    ["set-temp", "Temp HP", "fa-shield"]
  ];
  const operationPicker = node("div", {
    className: "ve-hp-editor-modes",
    attrs: { role: "tablist", "aria-label": localizedText(commands.localize, "VEMOBILE.Character.Presenter.HitPointOperation", "Hit point operation") },
    children: operationChoices.map(([key, label, iconName]) => {
      const button = node("button", {
        attrs: { type: "button", role: "tab" },
        on: { click: () => setOperation(key, true) },
        children: [icon(iconName), node("span", { text: label })]
      }, scope);
      operationButtons.set(key, button);
      editableControls.push(button);
      return button;
    })
  });
  const decrement = node("button", { className: "ve-hp-editor-step", attrs: { type: "button", "aria-label": localizedText(commands.localize, "VEMOBILE.Character.Presenter.DecreaseAmount", "Decrease amount") }, on: { click: () => stepAmount(-1) }, children: [icon("fa-minus")] }, scope);
  const increment = node("button", { className: "ve-hp-editor-step", attrs: { type: "button", "aria-label": localizedText(commands.localize, "VEMOBILE.Character.Presenter.IncreaseAmount", "Increase amount") }, on: { click: () => stepAmount(1) }, children: [icon("fa-plus")] }, scope);
  editableControls.push(decrement, amountInput, increment);
  const quickAmounts = node("div", { className: "ve-hp-editor-quick", attrs: { "aria-label": localizedText(commands.localize, "VEMOBILE.Character.Presenter.QuickAmounts", "Quick amounts") }, children: [1, 5, 10].map((amount) => {
    const decrease = node("button", { attrs: { type: "button", "aria-label": localizedText(commands.localize, "VEMOBILE.Character.Presenter.DecreaseAmountBy", "Decrease amount by {amount}", { amount: (amount) }) }, on: { click: () => stepAmount(-amount) }, children: [icon("fa-minus")] }, scope);
    const increase = node("button", { attrs: { type: "button", "aria-label": localizedText(commands.localize, "VEMOBILE.Character.Presenter.IncreaseAmountBy", "Increase amount by {amount}", { amount: (amount) }) }, on: { click: () => stepAmount(amount) }, children: [icon("fa-plus")] }, scope);
    editableControls.push(decrease, increase);
    return node("div", { className: "ve-hp-editor-quick-step", attrs: { role: "group", "aria-label": localizedText(commands.localize, "VEMOBILE.Character.Presenter.AdjustAmountBy", "Adjust amount by {amount}", { amount: (amount) }) }, children: [decrease, node("span", { text: amount, attrs: { "aria-hidden": "true" } }), increase] });
  }) });
  const submit = node("button", { className: "ve-hp-editor-submit", attrs: { type: "submit" }, children: [icon("fa-check"), submitLabel] });
  editableControls.push(submit);
  const closeButton = node("button", { className: "ve-hp-editor-close", attrs: { type: "button", "aria-label": localizedText(commands.localize, "VEMOBILE.Character.Presenter.CloseHitPointEditor", "Close hit point editor") }, on: { click: () => { if (!pending) commands.closeHitPointEditor(); } }, children: [icon("fa-xmark")] }, scope);

  const form = node("form", {
    className: "ve-hp-editor",
    attrs: { role: "dialog", "aria-modal": "true", "aria-labelledby": "ve-hp-editor-title" },
    on: { submit: async (event) => {
      event.preventDefault();
      if (pending || !amountInput.reportValidity()) return;
      const amount = Number(amountInput.value);
      if (!Number.isSafeInteger(amount)) return;
      pending = true;
      form.classList.add("is-pending");
      form.setAttribute("aria-busy", "true");
      for (const control of editableControls) control.disabled = true;
      closeButton.disabled = true;
      modalStatus.classList.remove("is-error");
      modalStatus.textContent = commands.silentValueEditorStatus ? "" : operationStatus(operation, amount, commands.localize);
      try {
        await commands.execute(ACTOR_COMMANDS.EDIT_HIT_POINTS, { actorSourceUuid: characterRecordSourceUuid(actor), operation, amount });
        if (!scope.disposed) commands.closeHitPointEditor();
      } catch (error) {
        if (!scope.disposed) {
          modalStatus.classList.add("is-error");
          modalStatus.textContent = error?.message ?? localizedText(commands.localize, "VEMOBILE.Character.Presenter.FoundryCouldNotUpdateTheseHitPoints", "Foundry could not update these hit points.");
        }
      } finally {
        if (!scope.disposed) {
          pending = false;
          form.classList.remove("is-pending");
          form.removeAttribute("aria-busy");
          for (const control of editableControls) control.disabled = false;
          closeButton.disabled = false;
        }
      }
    } },
    children: [
      node("header", { children: [
        node("span", { className: "ve-hp-editor-heading-icon", children: [icon("fa-heart-pulse")] }),
        node("div", { children: [node("small", { text: actor.name }), node("h2", { attrs: { id: "ve-hp-editor-title" }, text: localizedText(commands.localize, "VEMOBILE.Character.Presenter.EditHitPoints", "Edit Hit Points") })] }),
        closeButton
      ] }),
      node("div", { className: "ve-hp-editor-summary", children: [
        node("span", { children: [node("small", { text: localizedText(commands.localize, "VEMOBILE.Character.Header.hitPoints", "Hit Points") }), node("strong", { text: `${hp.value} / ${hp.max}` })] }),
        node("span", { children: [node("small", { text: localizedText(commands.localize, "VEMOBILE.Character.Header.tempHp", "Temp HP") }), node("strong", { text: hp.temp })] })
      ] }),
      operationPicker,
      node("label", { className: "ve-hp-editor-amount-label", children: [node("span", { text: localizedText(commands.localize, "VEMOBILE.Character.Presenter.Amount", "Amount") }), node("div", { children: [decrement, amountInput, increment] })] }),
      quickAmounts,
      modalStatus,
      submit
    ]
  }, scope);

  setOperation(operation, true);
  return node("div", { className: "ve-hp-editor-layer", attrs: { role: "presentation" }, children: [form] });

  function setOperation(next, reset) {
    operation = next;
    for (const [key, button] of operationButtons) {
      const active = key === operation;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
    }
    const minimum = ["damage", "heal"].includes(operation) ? 1 : 0;
    const maximum = operation === "set-hp" ? hp.max : 1_000_000;
    amountInput.min = String(minimum);
    amountInput.max = String(maximum);
    if (reset) setAmount(operation === "set-hp" ? hp.value : operation === "set-temp" ? hp.temp : 1);
    else updateSubmitLabel();
    modalStatus.textContent = "";
    modalStatus.classList.remove("is-error");
  }

  function setAmount(value) {
    const minimum = Number(amountInput.min) || 0;
    const maximum = Number(amountInput.max) || 1_000_000;
    amountInput.value = String(Math.max(minimum, Math.min(maximum, Math.trunc(Number(value) || 0))));
    updateSubmitLabel();
  }

  function stepAmount(delta) {
    setAmount((Number(amountInput.value) || 0) + delta);
  }

  function updateSubmitLabel() {
    const amount = Math.max(0, Math.trunc(Number(amountInput.value) || 0));
    submitLabel.textContent = operationSubmitLabel(operation, amount, commands.localize);
  }
}

function operationSubmitLabel(operation, amount, localize) {
  if (operation === "damage") return localizedText(localize, "VEMOBILE.Character.Presenter.ApplyDamage", "Apply {amount} Damage", { amount });
  if (operation === "heal") return localizedText(localize, "VEMOBILE.Character.Presenter.HealHitPoints", "Heal {amount} HP", { amount });
  if (operation === "set-temp") return localizedText(localize, "VEMOBILE.Character.Presenter.SetTemporaryHitPoints", "Set Temp HP to {amount}", { amount });
  return localizedText(localize, "VEMOBILE.Character.Presenter.SetHitPoints", "Set HP to {amount}", { amount });
}

function operationStatus(operation, amount, localize) {
  if (operation === "damage") return localizedText(localize, "VEMOBILE.Character.Presenter.ApplyingDamage", "Applying {amount} damage…", { amount });
  if (operation === "heal") return localizedText(localize, "VEMOBILE.Character.Presenter.ApplyingHealing", "Applying {amount} healing…", { amount });
  if (operation === "set-temp") return localizedText(localize, "VEMOBILE.Character.Presenter.UpdatingTemporaryHitPoints", "Updating temporary hit points…");
  return localizedText(localize, "VEMOBILE.Character.Presenter.UpdatingHitPoints", "Updating hit points…");
}
