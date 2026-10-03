export const MEMORY_PROFILE_ORDER = Object.freeze(["normal", "balanced", "strong", "maximum"]);

export const MEMORY_PROFILES = Object.freeze({
  normal: Object.freeze({ label: "Normal", labelKey: "VEMOBILE.MemoryProfile.normal.Label", description: "Uses your existing Foundry graphics settings.", descriptionKey: "VEMOBILE.MemoryProfile.maximum.Description", settings: Object.freeze({}), effects: null, dice: null }),
  balanced: Object.freeze({
    label: "Balanced", labelKey: "VEMOBILE.MemoryProfile.balanced.Label",
    description: "Preserves sharp canvas detail and native light animation while applying a modest reduction in rendering pressure with a native 40 FPS cap.", descriptionKey: "VEMOBILE.MemoryProfile.maximum.Description",
    settings: Object.freeze({ "core.performanceMode": 1, "core.maxFPS": 40, "core.pixelRatioResolutionScaling": true, "core.mipmap": false, "core.lightAnimation": true }),
    effects: "balanced",
    dice: null
  }),
  strong: Object.freeze({
    label: "Strong", labelKey: "VEMOBILE.MemoryProfile.strong.Label",
    description: "Uses Low performance, a 30 FPS cap, native light animation, and strict VE effects while keeping high-density canvas rendering.", descriptionKey: "VEMOBILE.MemoryProfile.maximum.Description",
    settings: Object.freeze({ "core.performanceMode": 0, "core.maxFPS": 30, "core.pixelRatioResolutionScaling": true, "core.mipmap": false, "core.lightAnimation": true }),
    effects: "strict",
    dice: "reduced"
  }),
  maximum: Object.freeze({
    label: "Maximum", labelKey: "VEMOBILE.MemoryProfile.maximum.Label",
    description: "Reduces canvas resolution and applies the strongest VE visual safeguards.", descriptionKey: "VEMOBILE.MemoryProfile.maximum.Description",
    settings: Object.freeze({ "core.performanceMode": 0, "core.maxFPS": 20, "core.pixelRatioResolutionScaling": false, "core.mipmap": false, "core.lightAnimation": false }),
    effects: "strict",
    dice: "static"
  })
});

export function memoryProfilePolicy(profile, policy) {
  const normalized = normalizeProfile(profile);
  const staged = MEMORY_PROFILES[normalized];
  // Auto graphics safety is a separate VE reduction. Normal restores native
  // behaviour unless the user explicitly chose a stricter VE setting.
  const requestedEffects = policy?.requestedEffects === "auto" ? "off" : policy?.requestedEffects ?? policy?.effects ?? "off";
  const requestedDice = policy?.requestedDice === "auto" ? "normal" : policy?.requestedDice ?? policy?.dice ?? "normal";
  const effectsOrder = ["off", "balanced", "strict"];
  const diceOrder = ["normal", "reduced", "static"];
  const effects = effectsOrder[Math.max(effectsOrder.indexOf(requestedEffects), effectsOrder.indexOf(staged.effects ?? "off"), 0)];
  const dice = diceOrder[Math.max(diceOrder.indexOf(requestedDice), diceOrder.indexOf(staged.dice ?? "normal"), 0)];
  return Object.freeze({ ...policy, effects, dice,
    diceReason: normalized === "normal" && policy?.requestedDice === "auto" ? "memory-profile-native"
      : normalized === "maximum" ? "memory-profile-maximum" : policy?.diceReason,
    memoryProfile: normalized });
}

export function resolvedProfileSettings(profile, baseline = {}) {
  const normalized = normalizeProfile(profile);
  const configured = MEMORY_PROFILES[normalized].settings;
  if (normalized !== "balanced") return Object.freeze({ ...configured });
  const performanceMode = finiteSetting(baseline["core.performanceMode"], configured["core.performanceMode"]);
  const maxFPS = finiteSetting(baseline["core.maxFPS"], configured["core.maxFPS"]);
  return Object.freeze({
    "core.performanceMode": Math.min(performanceMode, configured["core.performanceMode"]),
    "core.maxFPS": Math.min(maxFPS, configured["core.maxFPS"]),
    "core.pixelRatioResolutionScaling": configured["core.pixelRatioResolutionScaling"],
    "core.mipmap": false,
    "core.lightAnimation": true
  });
}

export function profileLevel(profile) { return Math.max(0, MEMORY_PROFILE_ORDER.indexOf(normalizeProfile(profile))); }

export function settingSatisfiesProfileRequirement(key, current, target) {
  if (key === "core.performanceMode" || key === "core.maxFPS") {
    return typeof current === "number" && Number.isFinite(current) && current <= Number(target);
  }
  if (key === "core.pixelRatioResolutionScaling" || key === "core.mipmap") {
    if (target === true) return current === true;
    return current === false;
  }
  if (key === "core.lightAnimation") return current === target;
  return sameSettingValue(current, target);
}

function normalizeProfile(value) {
  const profile = String(value ?? "").toLowerCase();
  if (!MEMORY_PROFILE_ORDER.includes(profile)) throw new Error("That Memory Protection profile is not supported.");
  return profile;
}

function finiteSetting(value, fallback) { return value !== null && value !== undefined && Number.isFinite(Number(value)) ? Number(value) : Number(fallback); }
function sameSettingValue(left, right) { return left === right || (typeof right === "number" && Number(left) === right); }
