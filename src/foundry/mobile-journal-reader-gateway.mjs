/** Route ordinary Foundry Journal sheet reads into VE while mobile owns the UI.
 * Foundry and modules still resolve the document and execute their own action;
 * only the final sheet presentation is substituted. */
export function enableMobileJournalReader(scope, {
  openJournal,
  isActive,
  getGame = () => globalThis.game,
  getFoundry = () => globalThis.foundry,
  report = () => {}
} = {}) {
  const foundry = getFoundry();
  const bases = [foundry?.applications?.api?.ApplicationV2, foundry?.appv1?.api?.Application]
    .filter((type) => typeof type?.prototype?.render === "function");
  for (const Base of new Set(bases)) {
    const isV2 = Base === foundry?.applications?.api?.ApplicationV2;
    const prototype = Base.prototype;
    const original = prototype.render;
    // Own restoration before changing a Foundry prototype.
    scope.own(() => { if (prototype.render === patched) prototype.render = original; });
    function patched(...args) {
      const options = args[0] && typeof args[0] === "object" ? args[0] : args[1] ?? {};
      const target = journalReadTarget(this, options, getGame());
      if (!isActive?.() || !target) return original.apply(this, args);
      void Promise.resolve(openJournal(target.entryId, target)).catch((error) => {
        report(error);
        if (isActive?.()) void Promise.resolve(original.apply(this, args)).catch(report);
      });
      return isV2 ? Promise.resolve(this) : this;
    }
    prototype.render = patched;
  }
}

export function journalReadTarget(application, options = {}, game = globalThis.game) {
  const document = application?.document ?? application?.object;
  const entry = document?.documentName === "JournalEntryPage" ? document.parent : document;
  if (entry?.documentName !== "JournalEntry" || entry.pack || !entry.id) return null;
  if (game?.journal?.get?.(entry.id) !== entry) return null;
  if (options?.veNativeEdit || options?.edit || options?.configure || options?.tempOwnership) return null;
  // A specialised Journal application may provide workflows beyond reading.
  if (application?.constructor?.name?.includes("EnhancedJournal")) return null;
  if (!entry.testUserPermission?.(game.user, "OBSERVER")) return null;
  const visiblePages = [...(entry.pages?.values?.() ?? entry.pages ?? [])].filter((page) => page.testUserPermission?.(game.user, "OBSERVER")
    && (application?.document?.documentName === "JournalEntry" ? application.isPageVisible?.(page) ?? true : true))
    .sort((left, right) => Number(left.sort ?? 0) - Number(right.sort ?? 0));
  const requestedPage = String(options?.pageId ?? (document?.documentName === "JournalEntryPage" ? document.id : ""));
  let pageId = requestedPage;
  if (requestedPage.includes(".")) {
    const matched = visiblePages.find((candidate) => candidate.uuid === requestedPage);
    if (!matched) return null;
    pageId = String(matched.id);
  }
  let page = pageId ? entry.pages?.get?.(pageId) : null;
  if (!pageId && Number.isInteger(options?.pageIndex)) {
    page = visiblePages[options.pageIndex] ?? null;
    if (!page) return null;
    pageId = String(page.id);
  }
  if (!pageId && options?.anchor) {
    page = visiblePages.find((candidate) => Object.hasOwn(candidate.toc ?? {}, String(options.anchor))) ?? null;
    if (!page) return null;
    pageId = String(page.id);
  }
  if (pageId && !page) return null;
  if (page && !page.testUserPermission?.(game.user, "OBSERVER")) return null;
  if (page && ["pdf", "video"].includes(String(page.type))) return null;
  return Object.freeze({
    entryId: String(entry.id),
    pageId,
    pageIndex: Number.isInteger(options?.pageIndex) ? options.pageIndex : null,
    anchor: String(options?.anchor ?? "")
  });
}
