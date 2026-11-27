/** Read the tool checks shared by the sheet and roll gateway. Prepared entries
 * take precedence over their legacy counterpart, including rank zero. */
export function readToolChecks(system = {}) {
  const legacyValue = system.traits?.toolProf?.value;
  const legacy = legacyValue?.contents ?? legacyValue;
  // A scalar is malformed legacy data. Iterating it would turn an identifier
  // such as "tinker" into six unrelated tool keys.
  const legacyKeys = typeof legacy === "object" && legacy?.[Symbol.iterator] ? Array.from(legacy) : [];
  const validLegacyKeys = legacyKeys.filter(key => typeof key === "string" && /^[a-z0-9_-]{1,32}$/u.test(key));
  return Object.fromEntries([
    ...validLegacyKeys.map(key => [key, { value: 1 }]),
    ...Object.entries(system.tools ?? {})
  ]);
}
