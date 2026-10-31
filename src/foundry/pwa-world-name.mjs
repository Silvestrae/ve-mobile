/** The install label is public presentation metadata; it grants no world access. */
export function readPwaWorldName() {
  return String(globalThis.game?.world?.title ?? "").trim();
}
