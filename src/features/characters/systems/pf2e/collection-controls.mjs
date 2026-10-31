import { icon, node } from "../../../../ui/dom.mjs";
import { localizedText } from "../../../../ui/localized-text.mjs";

export function collectionGroup({ key, label, glyph, children, open = false, extra = null, className = "", dataset = {}, attrs = {} }) {
  return node("details", { className: `ve-sheet-card ve-pf2e-collection-group ${className}`, attrs: {
    open, "data-pf2e-disclosure-key": key, ...attrs
  }, dataset, children: [
    node("summary", { className: "ve-pf2e-group-heading", children: [icon(glyph), node("h3", { text: label }), extra, icon("fa-chevron-down")] }),
    ...children
  ] });
}

/** Presentation-only sorting preserves native item order and all existing row nodes. */
export function listControls(root, commands, scope, { label = "Inventory", stateKey = "inventory-sort", showSort = true } = {}) {
  const t = (key, fallback, values) => localizedText(commands.localize, key, fallback, values);
  const sort = node("select", { attrs: { hidden: true, "data-pf2e-state-key": stateKey, "aria-hidden": "true" }, children:
    ["manual", "alphabetical"].map(value => node("option", { attrs: { value }, text: value })) });
  const sortIcon = icon("fa-arrow-down-short-wide");
  const expansionIcon = icon("fa-angles-down");
  const sortButton = node("button", { attrs: { type: "button" }, children: [sortIcon], on: { click() {
    sort.value = sort.value === "alphabetical" ? "manual" : "alphabetical";
    applySort();
  } } }, scope);
  const expandButton = node("button", { attrs: { type: "button" }, children: [expansionIcon], on: { click() {
    const groups = [...root.querySelectorAll("details.ve-pf2e-collection-group, details.ve-pf2e-container-contents")];
    const expanded = !groups.some(group => group.open);
    for (const group of groups) group.open = expanded;
    updateExpansion();
  } } }, scope);
  function applySort() {
    const alphabetical = sort.value === "alphabetical";
    for (const list of root.querySelectorAll("[data-pf2e-sort-list],.ve-pf2e-item-list,.ve-pf2e-container-contents")) {
      const rows = [...list.children].filter(row => row.hasAttribute("data-pf2e-sort-order"));
      const manual = (a, b) => Number(a.dataset.pf2eSortOrder) - Number(b.dataset.pf2eSortOrder);
      const compare = (a, b) => alphabetical ? a.dataset.pf2eSortName.localeCompare(b.dataset.pf2eSortName, commands.locale, { numeric: true, sensitivity: "base" }) || manual(a, b) : manual(a, b);
      // A granted feat travels with its parent. Sort siblings, never flatten the
      // native feature hierarchy or change prepared spell command identities.
      const trees = new Map(rows.map(row => [row, { row, children: [] }]));
      const byId = new Map(rows.filter(row => row.dataset.itemId).map(row => [row.dataset.itemId, trees.get(row)]));
      const roots = [];
      for (const row of rows.sort(manual)) {
        const tree = trees.get(row);
        const parent = row.dataset.pf2eSortParent && byId.get(row.dataset.pf2eSortParent);
        (parent && manual(parent.row, row) < 0 ? parent.children : roots).push(tree);
      }
      const flatten = trees => trees.sort((a, b) => compare(a.row, b.row)).flatMap(tree => [tree.row, ...flatten(tree.children)]);
      list.append(...flatten(roots));
    }
    sortIcon.className = `fa-solid ${alphabetical ? "fa-arrow-down-a-z" : "fa-arrow-down-short-wide"}`;
    sortButton.title = alphabetical
      ? t("VEMOBILE.Character.Copy.SortedAtoZswitchtoFoundryorder", "Sorted A to Z; switch to Foundry order")
      : t("VEMOBILE.Character.Copy.UsingFoundryorderswitchtoAtoZ", "Using Foundry order; switch to A to Z");
    sortButton.setAttribute("aria-label", sortButton.title);
  }
  function updateExpansion() {
    const anyOpen = [...root.querySelectorAll("details.ve-pf2e-collection-group")].some(group => group.open);
    expansionIcon.className = `fa-solid ${anyOpen ? "fa-angles-down" : "fa-angles-right"}`;
    expandButton.title = t(anyOpen ? "VEMOBILE.Character.Copy.Collapseallcollectionsections" : "VEMOBILE.Character.Copy.Expandallcollectionsections",
      anyOpen ? "Collapse all {collection} sections" : "Expand all {collection} sections", { collection: label });
    expandButton.setAttribute("aria-label", expandButton.title);
  }
  scope.listen(sort, "change", applySort);
  scope.listen(root, "toggle", updateExpansion, { capture: true });
  applySort(); updateExpansion();
  const controls = node("div", { className: "ve-pf2e-inventory-toolbar", children: [sort, node("div", {
    className: "ve-collection-controls", children: [showSort ? sortButton : null, expandButton]
  })] });
  // Like the 5e collection card, keep tools beside an existing heading rather
  // than spending a full row on two buttons. They still operate on this panel.
  scope.listen(controls, "click", event => { event.preventDefault(); event.stopPropagation(); });
  const filterRow = root.querySelector(".ve-pf2e-action-tools,.ve-pf2e-spell-modes");
  const collectionHeading = root.querySelector(".ve-pf2e-collection-heading");
  const heading = root.querySelector(".ve-pf2e-group-heading");
  if (collectionHeading) collectionHeading.append(controls);
  else if (filterRow) filterRow.append(controls);
  else if (heading) {
    heading.insertBefore(controls, heading.lastElementChild);
    heading.classList.add("has-collection-controls");
  }
  return controls;
}

export function inventoryControls(root, commands, scope) {
  return listControls(root, commands, scope, { label: localizedText(commands.localize, "VEMOBILE.Character.Tabs.Inventory", "Inventory") });
}
