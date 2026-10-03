import { localizeFoundry } from "./localization.mjs";
// Foundry 13.351 builds native light shaders through AbstractBaseShader.create
// and PIXI.Program.from. PIXI 7.4.3 caches Programs by the input source pair,
// before it inserts its platform default float precision. Keep the change at
// that boundary so every native shader factory and animation stays intact.
const MIN_PRECISION = 16;
// Foundry's native noise products reach roughly 4.5 million (2^22).
const MIN_RANGE = 22;
const FLOAT_PRECISION = /\bprecision\s+(lowp|mediump|highp)\s+float\s*;/u;
const LIGHTING_KEYS = Object.freeze(["backgroundShader", "colorationShader", "illuminationShader"]);

export function decideNativeLightingPrecision(medium, high) {
  if (!medium || !high) return "unavailable";
  if (medium.precision >= MIN_PRECISION && medium.rangeMin >= MIN_RANGE && medium.rangeMax >= MIN_RANGE) return "unnecessary";
  if (high.precision < MIN_PRECISION || high.rangeMin < MIN_RANGE || high.rangeMax < MIN_RANGE) return "unavailable";
  return "active";
}

export function addNativeLightingHighp(source) {
  if (typeof source !== "string" || source.trimStart().startsWith("#version")) return source;
  const existing = source.match(FLOAT_PRECISION);
  if (existing?.[1] === "highp") return source;
  return `precision highp float;\n${existing ? source.replace(FLOAT_PRECISION, "") : source}`;
}

function precisionRecord(format) {
  if (!format) return null;
  const { precision, rangeMin, rangeMax } = format;
  if (![precision, rangeMin, rangeMax].every(Number.isFinite)) return null;
  return Object.freeze({ precision, rangeMin, rangeMax });
}

function nativeLightingSources(config, shaders) {
  const base = [shaders?.AdaptiveBackgroundShader, shaders?.AdaptiveColorationShader, shaders?.AdaptiveIlluminationShader];
  const nativeClasses = new Set(Object.values(shaders ?? {}));
  const animations = Object.values(config?.Canvas?.lightAnimations ?? {});
  const classes = new Set([...base, ...animations.flatMap(animation => LIGHTING_KEYS.map(key => animation?.[key]))]);
  const pairs = new Map();
  for (const cls of classes) {
    if (!nativeClasses.has(cls) || typeof cls !== "function" || typeof cls.vertexShader !== "string" || typeof cls.fragmentShader !== "string") continue;
    const vertex = cls.vertexShader;
    const fragment = cls.fragmentShader;
    // These signatures describe Foundry's native adaptive light layers, not
    // arbitrary programs that happen to mention a light or a time uniform.
    if (!vertex.includes("attribute vec2 aVertexPosition;") || !vertex.includes("attribute float aDepthValue;")) continue;
    if (!fragment.includes("uniform float time;") || !fragment.includes("uniform sampler2D primaryTexture;") || !fragment.includes("varying vec2 vUvs;") || !fragment.includes("void main()")) continue;
    pairs.set(vertex + fragment, Object.freeze({ vertex, fragment, type: cls.name || "native lighting" }));
  }
  return pairs;
}

export function createNativeLightingPrecisionCompatibility({
  getGame = () => globalThis.game,
  getPixi = () => globalThis.PIXI,
  getConfig = () => globalThis.CONFIG,
  getShaders = () => globalThis.foundry?.canvas?.rendering?.shaders,
  getRenderer = () => globalThis.canvas?.app?.renderer
} = {}) {
  let status = "pending";
  let reason = localizeFoundry("VEMOBILE.Interface.NativeLightingPrecision.WaitingForFoundryCanvas", "Waiting for Foundry Canvas");
  let medium = null;
  let high = null;
  let glVersion = null;
  let patchedPrograms = 0;
  const patchedTypes = new Set();
  const patchedSources = new Set();
  let original = null;
  let wrapper = null;
  let programClass = null;
  let pairs = new Map();

  const measure = () => {
    if (status === "unsupported") return false;
    const gl = getRenderer()?.gl;
    if (!gl?.getShaderPrecisionFormat) return false;
    try {
      medium = precisionRecord(gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.MEDIUM_FLOAT));
      high = precisionRecord(gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT));
      glVersion = String(gl.getParameter?.(gl.VERSION) ?? "unknown");
      status = decideNativeLightingPrecision(medium, high);
      reason = status === "active" ? "Fragment mediump is below native lighting's arithmetic requirement; highp is supported"
        : status === "unnecessary" ? "Fragment mediump already meets the native lighting requirement"
          : "Fragment highp is unavailable or insufficient";
      return true;
    } catch {
      status = "unavailable";
      reason = "Could not read the active Canvas fragment precision";
      return false;
    }
  };

  const snapshot = () => Object.freeze({ status, reason, glVersion, medium, high, patchedPrograms, patchedTypes: [...patchedTypes].sort() });

  const install = scope => {
    if (wrapper) return status;
    const game = getGame();
    const pixi = getPixi();
    programClass = pixi?.Program;
    if (game?.version !== "13.351" || pixi?.VERSION !== "7.4.3" || typeof programClass?.from !== "function") {
      status = "unsupported";
      reason = "Foundry or PIXI shader pathway differs from the supported version";
      return status;
    }
    pairs = nativeLightingSources(getConfig(), getShaders());
    if (!pairs.size) {
      status = "unsupported";
      reason = "Foundry native lighting shader signature is unsupported";
      return status;
    }
    original = programClass.from;
    wrapper = function(vertex, fragment, ...rest) {
      const match = pairs.get(vertex + fragment);
      if (!match || match.vertex !== vertex || match.fragment !== fragment) return original.call(this, vertex, fragment, ...rest);
      if (status === "pending") measure();
      if (status !== "active") return original.call(this, vertex, fragment, ...rest);
      const adapted = addNativeLightingHighp(fragment);
      if (adapted === fragment) return original.call(this, vertex, fragment, ...rest);
      const program = original.call(this, vertex, adapted, ...rest);
      if (!patchedSources.has(fragment)) {
        patchedSources.add(fragment);
        patchedPrograms++;
        patchedTypes.add(match.type);
      }
      return program;
    };
    programClass.from = wrapper;
    scope.own(() => {
      if (programClass.from === wrapper) programClass.from = original;
      wrapper = null;
      original = null;
    });
    return status;
  };

  return Object.freeze({ install, measure, snapshot });
}
