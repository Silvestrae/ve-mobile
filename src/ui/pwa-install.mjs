const manifestUrl = new URL("../../assets/app.webmanifest", import.meta.url);

export function namedAppManifest(template, name, sourceUrl) {
  return {
    ...template, name, short_name: name,
    id: new URL(template.id, sourceUrl).href,
    start_url: new URL(template.start_url, sourceUrl).href,
    scope: new URL(template.scope, sourceUrl).href,
    icons: template.icons.map(icon => ({ ...icon, src: new URL(icon.src, sourceUrl).href }))
  };
}

const cleanName = value => Array.from(String(value ?? "").replace(/\s+/gu, " ").trim()).slice(0, 80).join("");

/** Page-owned browser capability, independent of mobile presentation and world data.
 * Keep the manifest through Desktop transitions so the installed app has a stable
 * identity. No service worker or authenticated-response cache is registered.
 */
export function createPwaInstall({ scope, windowRef = globalThis.window, documentRef = globalThis.document,
  sourceUrl = manifestUrl.href, fetchRef = globalThis.fetch, urlRef = globalThis.URL }) {
  let prompt = null;
  let busy = false;
  let installed = false;
  let defaultName = "VE Mobile";
  let appName = defaultName;
  let revision = 0;
  let blobUrl = null;
  let templatePromise = null;
  let nameSupported = true;
  let link = null;
  const storageKey = `ve-mobile.pwa-name:${new URL("../../../", sourceUrl).pathname}`;
  const readCustomName = () => { try { return cleanName(windowRef.localStorage?.getItem(storageKey)); } catch { return ""; } };
  let customName = readCustomName();
  const abort = new AbortController();
  const listeners = new Set();
  const display = windowRef.matchMedia("(display-mode: standalone), (display-mode: fullscreen)");
  const secure = windowRef.isSecureContext === true;
  const existing = documentRef.querySelector('link[rel~="manifest"]');
  const enabled = secure && !existing;
  const snapshot = () => Object.freeze({
    secure, enabled, installed: installed || display.matches,
    canInstall: enabled && !scope.disposed && Boolean(prompt) && !busy && !installed && !display.matches,
    busy, name: appName, defaultName, customName, nameSupported
  });
  const publish = () => { if (!scope.disposed) for (const listener of listeners) listener(snapshot()); };
  scope.own(() => {
    revision++;
    abort.abort();
    if (blobUrl) urlRef.revokeObjectURL(blobUrl);
    prompt = null;
    listeners.clear();
  });
  const prepareName = async (name, isCurrent = () => true, commit = () => {}) => {
    if (!enabled || !nameSupported || scope.disposed || !isCurrent()) return false;
    name = cleanName(name) || defaultName;
    if (name === appName && blobUrl) { commit(); return true; }
    const generation = ++revision;
    templatePromise ??= fetchRef(sourceUrl, { signal: abort.signal }).then(response => {
      if (!response.ok) throw new Error("pwa-manifest-load-failed");
      return response.json();
    }).catch(error => { templatePromise = null; throw error; });
    const template = await templatePromise;
    if (scope.disposed || generation !== revision || !isCurrent()) return false;
    const next = urlRef.createObjectURL(new Blob([JSON.stringify(namedAppManifest(template, name, sourceUrl))], { type: "application/manifest+json" }));
    try { commit(); } catch (error) { urlRef.revokeObjectURL(next); throw error; }
    const previous = blobUrl;
    blobUrl = next;
    appName = name;
    prompt = null; // A prompt belongs to the manifest from which it was offered.
    link.href = next;
    if (previous) urlRef.revokeObjectURL(previous);
    publish();
    return true;
  };
  if (enabled) {
    link = documentRef.createElement("link");
    link.rel = "manifest";
    link.href = sourceUrl;
    scope.own(() => link.remove());
    documentRef.head.append(link);
    scope.listen(windowRef, "beforeinstallprompt", event => {
      event.preventDefault();
      prompt = event;
      publish();
    });
    scope.listen(windowRef, "appinstalled", () => {
      installed = true;
      prompt = null;
      publish();
    });
    scope.listen(display, "change", publish);
    scope.listen(documentRef, "securitypolicyviolation", event => {
      if (!blobUrl || !["manifest-src", "default-src"].includes(event.effectiveDirective) || !/^blob(?::|$)/u.test(event.blockedURI)) return;
      revision++;
      nameSupported = false;
      urlRef.revokeObjectURL(blobUrl);
      blobUrl = null;
      appName = "VE Mobile";
      prompt = null;
      link.href = sourceUrl; // Retain the working static install on restrictive hosts.
      publish();
    });
  }
  return Object.freeze({
    snapshot,
    async setDefaultName(name) {
      defaultName = cleanName(name) || "VE Mobile";
      return prepareName(customName || defaultName);
    },
    async setName(name, { isCurrent = () => true } = {}) {
      const value = cleanName(name);
      if (!value || scope.disposed || !isCurrent()) return false;
      return prepareName(value, isCurrent, () => {
        try { windowRef.localStorage.setItem(storageKey, value); }
        catch { throw new Error("pwa-name-storage-failed"); }
        customName = value;
      });
    },
    watch(owner, listener) {
      if (scope.disposed || owner.disposed) return;
      listeners.add(listener);
      owner.own(() => listeners.delete(listener));
      listener(snapshot());
    },
    async install() {
      if (!snapshot().canInstall) return false;
      const current = prompt;
      prompt = null; // Browser install events are single-use, including dismissals.
      busy = true;
      try {
        // Invoke synchronously from the tap, before any await or publication.
        const result = current.prompt();
        publish();
        await result;
        const choice = await current.userChoice;
        return !scope.disposed && choice?.outcome === "accepted";
      } finally {
        busy = false;
        publish();
      }
    }
  });
}
