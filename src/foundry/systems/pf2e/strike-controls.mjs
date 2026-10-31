/** Stable identity for a freshly prepared native auxiliary action. */
export function auxiliaryActionKey(action) {
  const equipped = action.weapon?.system?.equipped ?? {};
  return JSON.stringify([action.action, action.annotation ?? null, action.hands ?? null, action.carryType ?? null, action.actions,
    equipped.carryType ?? null, equipped.handsHeld ?? null, equipped.inSlot ?? null]);
}

export function strikeControlRecords(strike) {
  return {
    ...(Array.isArray(strike.auxiliaryActions) ? { auxiliaryActions: strike.handsAvailable === false || strike.handsAvailable === 0 ? [] : strike.auxiliaryActions.flatMap((action, index) =>
      typeof action.execute !== "function" ? [] : [{ index, key: auxiliaryActionKey(action), label: String(action.label ?? ""), glyph: String(action.glyph ?? ""),
        options: Object.values(action.options ?? {}).map(option => ({ value: String(option.value), label: String(option.label), selected: Boolean(option.selected) })) }]) } : {}),
    ...(Array.isArray(strike.versatileOptions) ? { versatileOptions: strike.versatileOptions.map(option => ({
      value: String(option.value), label: String(option.label), glyph: String(option.glyph ?? ""), selected: Boolean(option.selected)
    })) } : {})
  };
}
