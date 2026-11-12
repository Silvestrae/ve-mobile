const MAX_REVISION_DEPTH = 16;
const MAX_REVISION_RECORDS = 100_000;
const INDEX_FIELDS = Object.freeze(["_id", "_stats.modifiedTime", "_tombstone"]);
const INVALID_REVISION = Symbol("invalid-revision");

/** Capture only identity and declared-looking descendants before Foundry mutates source data. */
export function captureRevisionSource(source) {
  let records = 0;
  const active = new WeakSet();

  // Keep the snapshot small: arbitrary system and flag bodies never enter the revision tree.
  function captureRecord(record, depth) {
    if (!isPlainObject(record) || depth >= MAX_REVISION_DEPTH || active.has(record)) throw INVALID_REVISION;
    if (++records > MAX_REVISION_RECORDS) throw INVALID_REVISION;
    active.add(record);
    const snapshot = {};
    for (const key of ["_id", "_stats", "_tombstone"]) {
      if (!Object.hasOwn(record, key)) continue;
      const value = record[key];
      if (key === "_stats" && isPlainObject(value)) {
        snapshot[key] = Object.hasOwn(value, "modifiedTime")
          ? { modifiedTime: isRevisionPrimitive(value.modifiedTime) ? value.modifiedTime : null }
          : {};
      } else snapshot[key] = isRevisionPrimitive(value) || value === undefined ? value : null;
    }

    for (const [key, value] of Object.entries(record)) {
      if (key === "_id" || key === "_stats" || key === "_tombstone" || key === "system" || key === "flags") continue;
      if (value === null) {
        snapshot[key] = null;
      } else if (Array.isArray(value)) {
        if (value.length === 0) snapshot[key] = [];
        else if (value.every(item => isPlainObject(item) && typeof item._id === "string" && item._id.trim())) {
          snapshot[key] = value.map(item => captureRecord(item, depth + 1));
        } else if (value.some(item => isPlainObject(item) || item === null)) {
          // Retain an invalid marker so a malformed child array cannot look empty later.
          snapshot[key] = null;
        }
      } else if (isPlainObject(value) && (Object.hasOwn(value, "_id") || Object.hasOwn(value, "_stats"))) {
        snapshot[key] = captureRecord(value, depth + 1);
      }
    }
    active.delete(record);
    return snapshot;
  }

  try {
    return captureRecord(source, 0);
  } catch {
    return null;
  }
}

/** Describe native embedded-document paths without consulting Foundry globals. */
export function createRevisionDescriptor(documentClass) {
  const activeClasses = new Set();
  let fieldCount = 0;

  // Resolve each class through its schema-backed hierarchy and reject unknown field shapes.
  function describeClass(currentClass, depth) {
    if (depth >= MAX_REVISION_DEPTH || typeof currentClass !== "function" || activeClasses.has(currentClass)) return null;
    activeClasses.add(currentClass);
    try {
      const schema = currentClass.schema;
      if (!schema || typeof schema.entries !== "function") return null;
      const hierarchy = currentClass.hierarchy;
      if (!isPlainObject(hierarchy)) return null;
      const schemaFields = new Map(Array.from(schema.entries()));
      const childEntries = [];
      const sortedFields = Object.entries(hierarchy).sort(([left], [right]) => left.localeCompare(right));

      for (const [name, field] of sortedFields) {
        if (!name || name === "__proto__" || name.includes(".") || ["_id", "_stats", "_tombstone"].includes(name)
          || schemaFields.get(name) !== field || !field || typeof field !== "object" || ++fieldCount > MAX_REVISION_RECORDS) return null;
        const isArray = Object.hasOwn(field, "element") || "element" in field;
        const kind = isArray ? "array" : "singleton";
        if (isArray && !field.element) return null;
        let childClass = field.model ?? field.element?.implementation;
        if (typeof childClass !== "function" && childClass && typeof childClass === "object") childClass = childClass.implementation;
        else childClass = childClass?.implementation ?? childClass;
        if (typeof childClass !== "function") return null;
        const childDescriptor = describeClass(childClass, depth + 1);
        if (!childDescriptor) return null;
        childEntries.push({ name, kind, documentName: childDescriptor.documentName, descriptor: childDescriptor });
      }

      const documentName = currentClass.metadata?.documentName ?? currentClass.documentName ?? null;
      if (documentName !== null && (typeof documentName !== "string" || !documentName)) return null;
      const shape = childEntries.map(({ name, kind, descriptor }) => [name, kind, descriptor.shapeKey]);
      const indexFields = [...INDEX_FIELDS];
      for (const child of childEntries) {
        for (const field of child.descriptor.indexFields) indexFields.push(`${child.name}.${field}`);
      }
      return {
        documentName,
        indexFields: [...new Set(indexFields)],
        children: childEntries,
        shapeKey: JSON.stringify([documentName, shape])
      };
    } catch {
      return null;
    } finally {
      activeClasses.delete(currentClass);
    }
  }

  return describeClass(documentClass, 0);
}

/** Fingerprint only declared revision data, preserving descendant order and schema shape. */
export function documentRevisionSignature(source, descriptor) {
  try {
    if (!descriptor || typeof descriptor.shapeKey !== "string" || !Array.isArray(descriptor.children)) return null;
    let records = 0;

    // Every native record needs exact identity and timestamp values; coercion can hide bad data.
    function signatureRecord(record, currentDescriptor, depth) {
      if (!isPlainObject(record) || depth >= MAX_REVISION_DEPTH || ++records > MAX_REVISION_RECORDS
        || typeof record._id !== "string" || !record._id.trim()) return null;
      if (!isPlainObject(record._stats) || !Number.isFinite(record._stats.modifiedTime) || record._stats.modifiedTime < 0) return null;
      if (Object.hasOwn(record, "_tombstone") && typeof record._tombstone !== "boolean") return null;
      const revision = [record._id, record._stats.modifiedTime, record._tombstone === true, []];

      for (const child of currentDescriptor.children) {
        if (!child || typeof child.name !== "string" || !child.descriptor || !Object.hasOwn(record, child.name)) return null;
        const value = record[child.name];
        if (child.kind === "array") {
          if (!Array.isArray(value)) return null;
          const ids = new Set();
          const childSignatures = [];
          for (const childRecord of value) {
            if (!isPlainObject(childRecord) || typeof childRecord._id !== "string" || !childRecord._id.trim() || ids.has(childRecord._id)) return null;
            ids.add(childRecord._id);
            const childSignature = signatureRecord(childRecord, child.descriptor, depth + 1);
            if (childSignature === null) return null;
            childSignatures.push(childSignature);
          }
          revision[3].push([child.name, "array", childSignatures]);
        } else if (child.kind === "singleton") {
          if (value === null) revision[3].push([child.name, "singleton", null]);
          else {
            const childSignature = signatureRecord(value, child.descriptor, depth + 1);
            if (childSignature === null) return null;
            revision[3].push([child.name, "singleton", childSignature]);
          }
        } else return null;
      }
      return revision;
    }

    const revision = signatureRecord(source, descriptor, 0);
    return revision === null ? null : JSON.stringify([descriptor.shapeKey, revision]);
  } catch {
    return null;
  }
}

/** Accept only plain snapshots, so capture never traverses live document instances. */
function isPlainObject(value) {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** Keep malformed revision values detached from their original mutable object graph. */
function isRevisionPrimitive(value) {
  return value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}
