import { localizedText, localizedNumber } from "../ui/localized-text.mjs";
import { targetDimensions } from "./mobile-memory-risk.mjs";

const MIB = 1024 * 1024;
const RISK_ORDER = Object.freeze({ unknown: -1, low: 0, moderate: 1, high: 2, "very-high": 3 });
const DERIVATIVE_ORDER = Object.freeze({ none: 0, disabled: 1, stale: 2, active: 3 });

export const OPTIMIZER_PROFILES = Object.freeze({
  balanced: Object.freeze({
    label: "Balanced", labelKey: "VEMOBILE.Optimizer.balanced.Label",
    summary: "Preserves more map detail while moderately reducing texture memory. Suited to most phones and tablets.", summaryKey: "VEMOBILE.Optimizer.derivative.Summary",
    target: "Typical 3:2 output: roughly 20–24 MiB; square outputs can reach 36 MiB", targetKey: "VEMOBILE.Optimizer.derivative.Target",
    longEdge: "Typical long edge: 2560–3072 px", longEdgeKey: "VEMOBILE.Optimizer.derivative.LongEdge"
  }),
  conservative: Object.freeze({
    label: "Conservative", labelKey: "VEMOBILE.Optimizer.conservative.Label",
    summary: "Uses a stronger reduction for complex, multi-layer Scenes or devices that have already had graphics failures.", summaryKey: "VEMOBILE.Optimizer.derivative.Summary",
    target: "Typical 3:2 output: roughly 12–16 MiB; square outputs can reach 25 MiB", targetKey: "VEMOBILE.Optimizer.derivative.Target",
    longEdge: "Typical long edge: 2048–2560 px", longEdgeKey: "VEMOBILE.Optimizer.derivative.LongEdge"
  }),
  custom: Object.freeze({
    label: "Custom", labelKey: "VEMOBILE.Optimizer.custom.Label",
    summary: "Uses the long edge you choose while preserving each asset's aspect ratio and never upscaling it.", summaryKey: "VEMOBILE.Optimizer.derivative.Summary",
    target: "Memory depends on the chosen dimensions", targetKey: "VEMOBILE.Optimizer.derivative.Target",
    longEdge: "Choose a long edge from 256–8192 px", longEdgeKey: "VEMOBILE.Optimizer.derivative.LongEdge"
  })
});

export const OPTIMIZER_SORTS = Object.freeze([
  Object.freeze({ key: "risk", label: "Risk", labelKey: "VEMOBILE.Optimizer.risk.Label" }),
  Object.freeze({ key: "decoded", label: "Decoded memory", labelKey: "VEMOBILE.Optimizer.decodedmemory.Label" }),
  Object.freeze({ key: "size", label: "File size", labelKey: "VEMOBILE.Optimizer.filesize.Label" }),
  Object.freeze({ key: "dimensions", label: "Dimensions", labelKey: "VEMOBILE.Optimizer.dimensions.Label" }),
  Object.freeze({ key: "name", label: "Name", labelKey: "VEMOBILE.Optimizer.name.Label" }),
  Object.freeze({ key: "scene", label: "Scene", labelKey: "VEMOBILE.Optimizer.scene.Label" }),
  Object.freeze({ key: "derivative", label: "Derivative", labelKey: "VEMOBILE.Optimizer.derivative.Label" })
]);

function numericOrNaN(value) {
  if (value === null || value === undefined || value === "") return Number.NaN;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export function optimizerAssetModel(asset, { profile = "balanced", customLongEdge = 2048, localize = null, locale = "en" } = {}) {
  const canonicalSource = String(asset?.canonicalSource ?? "");
  const name = basename(canonicalSource) || localizedText(localize, "VEMOBILE.Optimizer.UnnamedAsset", "Unnamed asset");
  const scenes = Object.freeze([...(asset?.scenes ?? [])].map((scene) => String(scene?.name || localizedText(localize, "VEMOBILE.Optimizer.UnnamedScene", "Unnamed Scene"))));
  const roles = Object.freeze([...(asset?.roles ?? [])].map(role => formatRole(role, localize)));
  const derivativeStatus = asset?.stale
    ? "stale"
    : asset?.derivative?.enabled === false || asset?.derivative?.status === "disabled"
      ? "disabled"
      : asset?.derivative
        ? "active"
        : "none";
  const eligible = asset?.mediaKind === "raster"
    && positive(asset?.width)
    && positive(asset?.height)
    && /^[a-f0-9]{64}$/iu.test(String(asset?.sourceHash ?? ""));
  let proposed = null;
  if (eligible) {
    try {
      const dimensions = targetDimensions(asset.width, asset.height, {
        profile,
        longEdge: profile === "custom" ? customLongEdge : null,
        aggregateDecodedBytes: Number(asset.scenePressure) || 0, localize
      });
      const sourceBytes = Number(asset.decodedBytes);
      proposed = Object.freeze({
        ...dimensions,
        reductionBytes: Number.isFinite(sourceBytes) ? Math.max(0, sourceBytes - dimensions.decodedBytes) : null,
        reductionPercent: Number.isFinite(sourceBytes) && sourceBytes > 0
          ? Math.max(0, Math.round((1 - dimensions.decodedBytes / sourceBytes) * 100))
          : null
      });
    } catch {
      proposed = null;
    }
  }
  const risk = String(asset?.risk ?? "unknown");
  const dimensions = positive(asset?.width) && positive(asset?.height) ? `${asset.width} × ${asset.height}` : localizedText(localize, "VEMOBILE.Optimizer.Unknown", "Unknown");
  const searchable = [name, canonicalSource, ...scenes, ...roles, dimensions, riskLabel(risk, localize), derivativeLabel(derivativeStatus, localize)]
    .join(" ").toLocaleLowerCase();
  return Object.freeze({
    asset,
    id: canonicalSource,
    name,
    path: canonicalSource,
    scenes,
    sceneLabel: sharedSceneLabel(scenes, localize, locale),
    roles,
    roleLabel: roles.join(", ") || localizedText(localize, "VEMOBILE.Optimizer.Unknown", "Unknown"),
    risk,
    riskLabel: riskLabel(risk, localize),
    derivativeStatus,
    derivativeLabel: derivativeLabel(derivativeStatus, localize),
    dimensions,
    pixelArea: (Number(asset?.width) || 0) * (Number(asset?.height) || 0),
    fileSize: numericOrNaN(asset?.fileSize),
    decodedBytes: numericOrNaN(asset?.decodedBytes),
    eligible: Boolean(eligible && proposed),
    unavailableReason: eligible ? localizedText(localize, "VEMOBILE.Optimizer.OutputUnavailable", "A valid output size could not be calculated.") : generationUnavailableReason(asset, localize),
    proposed,
    searchable
  });
}

export function buildOptimizerView(assets, {
  filter = "all",
  query = "",
  sortKey = "risk",
  sortDirection = "desc",
  profile = "balanced",
  customLongEdge = 2048,
  localize = null,
  locale = "en"
} = {}) {
  const needle = normalizeSearch(query);
  const rows = (assets ?? [])
    .map((asset) => optimizerAssetModel(asset, { profile, customLongEdge, localize, locale }))
    .filter((row) => matchesFilter(row, filter) && (!needle || row.searchable.includes(needle)));
  rows.sort(optimizerComparator(sortKey, sortDirection));
  return Object.freeze(rows);
}

export function optimizerComparator(sortKey = "risk", sortDirection = "desc") {
  const direction = sortDirection === "asc" ? 1 : -1;
  return (left, right) => {
    const primary = compareValues(sortValue(left, sortKey), sortValue(right, sortKey)) * direction;
    if (primary) return primary;
    if (sortKey === "risk") {
      const decoded = compareValues(left.decodedBytes, right.decodedBytes) * -1;
      if (decoded) return decoded;
    }
    return left.name.localeCompare(right.name, undefined, { sensitivity: "base", numeric: true });
  };
}

export function visibleSelectionState(rows, selected) {
  const eligibleIds = rows.filter((row) => row.eligible).map((row) => row.id);
  const selectedVisible = eligibleIds.filter((id) => selected.has(id)).length;
  return Object.freeze({
    eligibleIds: Object.freeze(eligibleIds),
    selectedVisible,
    checked: eligibleIds.length > 0 && selectedVisible === eligibleIds.length,
    indeterminate: selectedVisible > 0 && selectedVisible < eligibleIds.length,
    disabled: eligibleIds.length === 0
  });
}

export function applyVisibleSelection(rows, selected, checked) {
  const next = new Set(selected);
  for (const row of rows) {
    if (!row.eligible) continue;
    if (checked) next.add(row.id);
    else next.delete(row.id);
  }
  return next;
}

export function formatFileSize(bytes, localize = null, locale = "en") {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value < 0) return localizedText(localize, "VEMOBILE.Optimizer.Unknown", "Unknown");
  if (value < 1024) return `${localizedNumber(Math.round(value), locale)} B`;
  if (value < MIB) return `${localizedNumber(value / 1024, locale, value < 10 * 1024 ? 1 : 0)} KiB`;
  return `${localizedNumber(value / MIB, locale, 2)} MiB`;
}

export function formatDecodedSize(bytes, localize = null, locale = "en") {
  const value = Number(bytes);
  return Number.isFinite(value) && value >= 0 ? `${localizedNumber(value / MIB, locale, 1)} MiB` : localizedText(localize, "VEMOBILE.Optimizer.Unknown", "Unknown");
}

export function sharedSceneLabel(scenes, localize = null, locale = "en") {
  const names = [...(scenes ?? [])].filter(Boolean);
  if (!names.length) return localizedText(localize, "VEMOBILE.Optimizer.None", "None");
  return names.length === 1 ? names[0] : localizedText(localize, "VEMOBILE.Optimizer.MoreScenes", "{name} + {count} more", { name: names[0], count: localizedNumber(names.length - 1, locale) });
}

export function riskLabel(value, localize = null) {
  const labels = { low: "Low", moderate: "Moderate", high: "High", "very-high": "Very High", unknown: "Unknown" };
  const risk = Object.hasOwn(labels, value) ? value : "unknown";
  return localizedText(localize, `VEMOBILE.Optimizer.Risk.${risk}`, labels[risk]);
}

export function derivativeLabel(value, localize = null) {
  const labels = { none: "None", active: "Active", stale: "Stale", disabled: "Disabled" };
  const status = Object.hasOwn(labels, value) ? value : "none";
  return localizedText(localize, `VEMOBILE.Optimizer.Derivative.${status}`, labels[status]);
}

function matchesFilter(row, filter) {
  if (filter === "high") return ["high", "very-high"].includes(row.risk);
  if (filter === "very-high") return row.risk === "very-high";
  if (filter === "missing") return row.derivativeStatus === "none";
  if (filter === "stale") return row.derivativeStatus === "stale";
  return true;
}

function sortValue(row, key) {
  if (key === "name") return row.name.toLocaleLowerCase();
  if (key === "size") return finiteSort(row.fileSize);
  if (key === "dimensions") return row.pixelArea;
  if (key === "decoded") return finiteSort(row.decodedBytes);
  if (key === "scene") return row.sceneLabel.toLocaleLowerCase();
  if (key === "derivative") return DERIVATIVE_ORDER[row.derivativeStatus] ?? -1;
  return RISK_ORDER[row.risk] ?? -1;
}

function compareValues(left, right) {
  if (typeof left === "string" || typeof right === "string") return String(left).localeCompare(String(right), undefined, { sensitivity: "base", numeric: true });
  return Number(left) - Number(right);
}

function finiteSort(value) { return Number.isFinite(value) ? value : -1; }
function positive(value) { return Number.isFinite(Number(value)) && Number(value) > 0; }
function normalizeSearch(value) { return String(value ?? "").trim().toLocaleLowerCase().replace(/\s+/gu, " "); }
function basename(path) { return String(path ?? "").split("/").filter(Boolean).at(-1) ?? ""; }
function formatRole(role, localize) {
  const labels = { background: "Background", foreground: "Foreground", "fog-overlay": "Fog overlay", tile: "Tile", "video-tile": "Video tile" };
  return localizedText(localize, `VEMOBILE.Optimizer.Role.${role}`, labels[role] ?? String(role ?? ""));
}
function generationUnavailableReason(asset, localize) {
  if (asset?.mediaKind !== "raster") return localizedText(localize, "VEMOBILE.Optimizer.RasterOnly", "Only raster assets can be generated.");
  if (!positive(asset?.width) || !positive(asset?.height)) return localizedText(localize, "VEMOBILE.Optimizer.ScanDimensions", "Scan this asset to read its dimensions.");
  if (!/^[a-f0-9]{64}$/iu.test(String(asset?.sourceHash ?? ""))) return localizedText(localize, "VEMOBILE.Optimizer.ScanSource", "Scan this asset to verify its source.");
  return localizedText(localize, "VEMOBILE.Optimizer.CannotGenerate", "This asset cannot currently be generated.");
}
