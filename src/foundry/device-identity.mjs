import { localizeFoundry } from "./localization.mjs";
/**
 * Best-effort, page-local device identity for Settings display. This reads
 * browser-provided values only and deliberately does not persist or transmit
 * them, combine entropy sources, or infer a hardware generation.
 */
export function createDeviceIdentityGateway({
  getNavigator = () => globalThis.navigator
} = {}) {
  let cached = null;
  return Object.freeze({
    read() {
      cached ??= resolveDeviceIdentity(getNavigator());
      return cached;
    }
  });
}

export async function resolveDeviceIdentity(navigatorRef = globalThis.navigator) {
  const navigator = navigatorRef ?? {};
  const userAgentData = navigator.userAgentData;
  if (typeof userAgentData?.getHighEntropyValues === "function") {
    try {
      const values = await userAgentData.getHighEntropyValues(["model"]);
      const model = cleanModel(values?.model);
      if (model) return Object.freeze({ label: model, precision: "model" });
    } catch {
      // Privacy policy, browser support, or an unavailable hint can deny this.
    }
  }

  const userAgent = String(navigator.userAgent ?? "");
  const platform = String(userAgentData?.platform ?? navigator.platform ?? "");
  const touchPoints = Number(navigator.maxTouchPoints) || 0;
  if (/iPad/iu.test(userAgent) || /iPad/iu.test(platform) || (/Mac/iu.test(platform) && touchPoints > 1)) {
    return Object.freeze({ label: "iPad", precision: "family" });
  }
  if (/iPhone/iu.test(userAgent) || /iPhone/iu.test(platform)) {
    return Object.freeze({ label: "iPhone", precision: "family" });
  }
  if (/Android/iu.test(userAgent) || /Android/iu.test(platform)) {
    const legacyModel = cleanModel(userAgent.match(/Android[^;)]*;\s*([^;)]+?)(?:\s+Build\/|;|\))/iu)?.[1]);
    return Object.freeze({ label: legacyModel || localizeFoundry("VEMOBILE.Interface.DeviceIdentity.AndroidDevice", "Android device"), precision: legacyModel ? "model" : "family" });
  }
  return Object.freeze({ label: localizeFoundry("VEMOBILE.Interface.DeviceIdentity.DesktopBrowser", "Desktop browser"), precision: "family" });
}

function cleanModel(value) {
  const model = String(value ?? "").replace(/[\u0000-\u001F\u007F]/gu, "").trim();
  if (!model || model.length > 80 || /^(unknown|generic|android)$/iu.test(model)) return "";
  return model;
}
