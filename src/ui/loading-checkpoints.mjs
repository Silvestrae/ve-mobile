/** Render the same honest checkpoint states for initial loading and resync. */
export function createLoadingCheckpoints(document, definitions, { label, followCurrent = false, localize = (_key, fallback) => fallback }) {
  const element = document.createElement("ol");
  element.className = "ve-loading-checkpoints";
  element.setAttribute("aria-label", label);
  const rows = definitions.map((definition, index) => {
    const row = document.createElement("li");
    row.dataset.checkpoint = definition.id;
    const marker = document.createElement("span");
    marker.className = "ve-loading-checkpoint-marker";
    marker.setAttribute("aria-hidden", "true");
    const text = document.createElement("span");
    text.textContent = localize(definition.labelKey, definition.label);
    row.append(marker, text);
    element.append(row);
    return { row, marker, text, index };
  });

  const update = (id, { failed = false, complete = false } = {}) => {
    const activeIndex = Math.max(0, definitions.findIndex((definition) => definition.id === id));
    for (const { row, marker, index } of rows) {
      const state = complete || index < activeIndex ? "complete"
        : index > activeIndex ? "pending" : failed ? "failed" : "current";
      row.dataset.state = state;
      marker.textContent = state === "complete" ? "✓" : state === "current" ? "…"
        : state === "failed" ? "!" : String(index + 1);
      if (state === "current" || state === "failed") row.setAttribute("aria-current", "step");
      else row.removeAttribute("aria-current");
    }
    if (followCurrent && !complete && element.isConnected) {
      rows[activeIndex]?.row.scrollIntoView?.({ block: "nearest" });
    }
  };
  const refreshLabels = () => {
    for (const { text, index } of rows) {
      const definition = definitions[index];
      text.textContent = localize(definition.labelKey, definition.label);
    }
    element.setAttribute("aria-label", localize("VEMOBILE.Boot.Checkpoints", label));
  };
  element.setAttribute("aria-label", localize("VEMOBILE.Boot.Checkpoints", label));
  update(definitions[0]?.id);
  return Object.freeze({ element, update, refreshLabels });
}
