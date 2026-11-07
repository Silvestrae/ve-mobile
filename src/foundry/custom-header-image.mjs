import { customHeaderImagePath } from "../kernel/custom-header-image.mjs";

export const CUSTOM_HEADER_FLAG = "customHeaderImage";
export const CUSTOM_HEADER_SCOPE_FLAG = "customHeaderScope";

// Project only a document's saved image path; reading never browses or loads files.
export function readCustomHeaderImage(document) {
  try {
    return customHeaderImagePath(document?.getFlag?.("ve-mobile", CUSTOM_HEADER_FLAG)
      ?? document?.flags?.["ve-mobile"]?.[CUSTOM_HEADER_FLAG]);
  } catch { return ""; }
}

// The scope and shared path belong to the authenticated user, across devices.
// Existing actors keep their independent paths when the user changes scope.
export function readCustomHeaderUserSettings(user) {
  let scope;
  try { scope = user?.getFlag?.("ve-mobile", CUSTOM_HEADER_SCOPE_FLAG) ?? user?.flags?.["ve-mobile"]?.[CUSTOM_HEADER_SCOPE_FLAG]; }
  catch { scope = null; }
  return Object.freeze({ scope: scope === "user" ? "user" : "actor", image: readCustomHeaderImage(user) });
}
