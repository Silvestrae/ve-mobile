// Accept image paths without allowing executable URLs or malformed CSS strings.
// File existence is deliberately left to the asynchronous browser image loader.
export function customHeaderImagePath(value) {
  if (typeof value !== "string") return "";
  const path = value.trim();
  if (!path || path.length > 4096 || /[\u0000-\u001f\u007f]/u.test(path)) return "";
  if (/^[a-z][a-z0-9+.-]*:/iu.test(path) && !/^https?:\/\//iu.test(path)) return "";
  return path;
}
