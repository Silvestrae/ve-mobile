// Page-owned install capability; browser prompts and manifest URLs outlive individual mobile screens.
const manifestUrl = new URL("../../assets/app.webmanifest", import.meta.url);

// Resolve manifest URLs against the static source before a renamed manifest moves to a blob URL.
export function namedAppManifest(template, name, sourceUrl) {
  return {
    ...template, name, short_name: name,
    id: new URL(template.id, sourceUrl).href,
    start_url: new URL(template.start_url, sourceUrl).href,
    scope: new URL(template.scope, sourceUrl).href,
    icons: template.icons.map(icon => ({ ...icon, src: new URL(icon.src, sourceUrl).href }))
  };
}

// Collapse whitespace and bound the app name by Unicode characters rather than splitting surrogate pairs.
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
  let linkConnected = false;
  const storageKey = `ve-mobile.pwa-name:${new URL("../../../", sourceUrl).pathname}`;
  // Read the per-server saved name; blocked browser storage simply leaves the default.
  const readCustomName = () => { try { return cleanName(windowRef.localStorage?.getItem(storageKey)); } catch { return ""; } };
  let customName = readCustomName();
  const abort = new AbortController();
  const listeners = new Set();
  const display = windowRef.matchMedia("(display-mode: standalone), (display-mode: fullscreen)");
  const secure = windowRef.isSecureContext === true;
  // iPadOS may identify as a Mac when requesting desktop sites. Keep device
  // detection in the browser capability so presenters receive plain guidance.
  const navigatorRef = windowRef.navigator ?? {};
  const appleTouch = /iPhone|iPad|iPod/iu.test(String(navigatorRef.userAgent ?? ""))
    || (/Mac/iu.test(String(navigatorRef.platform ?? "")) && Number(navigatorRef.maxTouchPoints ?? 0) > 1);
  const existing = documentRef.querySelector('link[rel~="manifest"]');
  const enabled = secure && !existing;
  // Expose install capability as a plain record without leaking the live browser prompt.
  const snapshot = () => Object.freeze({
    secure, enabled, installed: installed || display.matches,
    canInstall: enabled && !scope.disposed && Boolean(prompt) && !busy && !installed && !display.matches,
    busy, name: appName, defaultName, customName, nameSupported,
    manualInstall: appleTouch ? "share" : "menu"
  });
  // Notify current subscribers only while the page scope still owns this capability.
  const publish = () => { if (!scope.disposed) for (const listener of listeners) listener(snapshot()); };
  scope.own(() => {
    revision++;
    abort.abort();
    if (blobUrl) urlRef.revokeObjectURL(blobUrl);
    prompt = null;
    listeners.clear();
  });
  // Keep one owned link, including when an asynchronous rename temporarily
  // removes it so Chromium cannot start fetching the superseded manifest.
  const connectManifest = () => {
    if (linkConnected || scope.disposed) return;
    documentRef.head.append(link);
    linkConnected = true;
  };
  // Build a renamed manifest, then recheck revision/owner before committing storage and swapping the live URL.
  const prepareName = async (name, isCurrent = () => true, commit = () => {}) => {
    if (!enabled || !nameSupported || scope.disposed || !isCurrent()) return false;
    name = cleanName(name) || defaultName;
    if (name === appName && blobUrl) { commit(); return true; }
    const generation = ++revision;
    // A static-manifest fetch completing after an href change can repopulate
    // Chromium's cache with the old result. Detach before awaiting the template
    // and publish the replacement only once it is ready for the browser to read.
    if (linkConnected) { link.remove(); linkConnected = false; }
    try {
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
      connectManifest();
      if (previous) urlRef.revokeObjectURL(previous);
      publish();
      return true;
    } finally {
      // Failure or cancellation restores the unchanged previous manifest. A
      // newer rename, policy fallback or disposed page owns its own outcome.
      if (!scope.disposed && generation === revision) connectManifest();
    }
  };
  if (enabled) {
    link = documentRef.createElement("link");
    link.rel = "manifest";
    link.href = sourceUrl;
    scope.own(() => { if (linkConnected) link.remove(); linkConnected = false; });
    connectManifest();
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
      connectManifest();
      publish();
    });
  }
  return Object.freeze({
    snapshot,
    async setDefaultName(name) {
      defaultName = cleanName(name) || "VE Mobile";
      return prepareName(customName || defaultName);
    },
    // Save an explicit app name only when the same requesting view still owns the asynchronous rename.
    async setName(name, { isCurrent = () => true } = {}) {
      const value = cleanName(name);
      if (!value || scope.disposed || !isCurrent()) return false;
      return prepareName(value, isCurrent, () => {
        try { windowRef.localStorage.setItem(storageKey, value); }
        catch { throw new Error("pwa-name-storage-failed"); }
        customName = value;
      });
    },
    // Attach a subscriber to its own scope and immediately provide the current plain capability record.
    watch(owner, listener) {
      if (scope.disposed || owner.disposed) return;
      listeners.add(listener);
      owner.own(() => listeners.delete(listener));
      listener(snapshot());
    },
    // Consume one browser install event synchronously from the tap, then report its final choice safely.
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
