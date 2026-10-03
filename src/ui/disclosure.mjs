/**
 * Gives a native details element one authoritative click path.
 * Pointer and touch events are deliberately not handled: browsers synthesize
 * the single click that activates the disclosure.
 */
export function bindDetailsDisclosure(details, summary, onChange, scope) {
  const apply = (open) => {
    details.open = Boolean(open);
    summary.setAttribute?.("aria-expanded", String(details.open));
    return details.open;
  };

  apply(details.open);
  scope.listen(summary, "click", (event) => {
    event.preventDefault?.();
    const open = apply(!details.open);
    onChange?.(open);
  });
  return apply;
}
