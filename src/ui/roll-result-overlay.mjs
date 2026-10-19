import { localizedText } from "./localized-text.mjs";
import { icon, node } from "./dom.mjs";

const ROLL_RESULT_DIE_ICONS = new Set([4, 6, 8, 10, 12, 20, 100]);

function rollResultExpression(result, localize) {
  if (!result.breakdown?.length) {
    return result.formula ? node("code", { className: "ve-roll-result-expression is-formula-only", text: result.formula }) : null;
  }

  const children = [];
  for (const step of result.breakdown) {
    if (step.kind === "die") {
      if (children.length) children.push(node("span", { className: "ve-roll-result-operator", text: "+" }));
      const faces = String(step.label ?? "").match(/d(\d+)$/iu)?.[1];
      children.push(node("span", {
        className: "ve-roll-result-die",
        attrs: { "aria-label": localizedText(localize, "VEMOBILE.Character.Presenter.DieResult", "{label} rolled {value}", { label: step.label, value: step.value }) },
        children: [
          faces && ROLL_RESULT_DIE_ICONS.has(Number(faces))
            ? node("span", { className: `ve-roll-result-die-icon is-d${faces}`, attrs: { "aria-hidden": "true" } })
            : icon("fa-dice-d20"),
          node("strong", { text: step.value })
        ]
      }));
      continue;
    }
    children.push(node("span", { className: "ve-roll-result-modifier", text: step.label }));
  }

  return node("div", {
    className: "ve-roll-result-expression",
    attrs: { "aria-label": localizedText(localize, "VEMOBILE.Character.Presenter.EvaluatedRoll", "Evaluated roll: {result}", { result: result.formula || result.total }) },
    children
  });
}

export function renderRollResultOverlay(result, commands, scope) {
  if (!result) return null;
  let dismissing = false;
  return node("div", {
    className: "ve-roll-result-layer",
    attrs: { role: "presentation", "data-ve-scene-control": true },
    on: { click: (event) => {
      if (dismissing) return;
      dismissing = true;
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.classList.add("is-dismissing");
      event.currentTarget.setAttribute("aria-hidden", "true");
      // Dismiss the model before a native result or automatic route change can
      // dispose this presenter. A presenter-owned delay can lose that intent.
      commands.dismissRollResult(result.id);
    } },
    children: [node("button", {
      className: "ve-roll-result-overlay",
      attrs: { type: "button", "aria-live": "polite", "aria-label": result.pending ? localizedText(commands.localize, "VEMOBILE.Character.Presenter.RollInProgress", "{label} roll in progress.", { label: (result.label) }) : localizedText(commands.localize, "VEMOBILE.Character.Presenter.ResultTapAnywhereToDismiss", "{label} result {total}{formula}. Tap anywhere to dismiss.", { label: (result.label), total: (result.total), formula: (result.formula ? `, formula ${result.formula}` : "") }) },
      children: [
        icon("fa-dice-d20"),
        node("small", { text: result.label }),
        result.pending
          ? node("div", { className: "ve-roll-result-pending", attrs: { role: "status", "aria-label": localizedText(commands.localize, "VEMOBILE.Character.Presenter.WaitingForDiceAnimation", "Waiting for dice animation") }, children: [node("i"), node("i"), node("i")] })
          : node("strong", { text: result.total }),
        result.pending ? null : rollResultExpression(result, commands.localize),
        node("span", { text: localizedText(commands.localize, "VEMOBILE.Character.Presenter.TapAnywhereToDismiss", "Tap anywhere to dismiss") })
      ]
    })]
  }, scope);
}
