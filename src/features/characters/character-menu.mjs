import { icon, node } from "../../ui/dom.mjs";
import { localizedText } from "../../ui/localized-text.mjs";
import { bindDetailsDisclosure } from "../../ui/disclosure.mjs";

export function buildCharacterMenuTree(actors) {
  const root = { folders: new Map(), actors: [] };
  for (const actor of actors) {
    let branch = root;
    for (const folder of actor.folderPath ?? []) {
      if (!branch.folders.has(folder.id)) branch.folders.set(folder.id, { folder, folders: new Map(), actors: [] });
      branch = branch.folders.get(folder.id);
    }
    branch.actors.push(actor);
  }
  return root;
}

export function createCharacterMenuController({ actors, selectedActor, commands, onClose, scope, embedded = false, describeActor = actor => actor.type ?? "" }) {
  const root = buildCharacterMenuTree(actors);
  const expandedFolderIds = new Set();
  const selectedDirectoryActor = actors.find((entry) => characterRecordSourceUuid(entry) === characterRecordSourceUuid(selectedActor)) ?? null;
  const element = node("div", {
    className: `ve-character-menu${embedded ? " ve-character-menu-inline" : ""}`,
    attrs: { role: "menu", "aria-label": localizedText(commands.localize, "VEMOBILE.Character.Presenter.AvailableCharacters", "Available characters"), hidden: !embedded }
  });
  let bodyScope = null;

  const unmount = () => {
    bodyScope?.dispose();
    bodyScope = null;
    element.replaceChildren();
  };

  const mount = () => {
    if (bodyScope || scope.disposed) return;
    for (const folder of selectedDirectoryActor?.folderPath ?? []) expandedFolderIds.add(String(folder.id));
    bodyScope = scope.child("character-menu-body");
    const owner = bodyScope;
    const context = { selectedActor, commands, onClose, expandedFolderIds, describeActor };
    const heading = node("header", { className: "ve-character-menu-heading", children: [
      node("strong", { text: localizedText(commands.localize, "VEMOBILE.Character.Presenter.SelectCharacter", "Select character") }),
      node("button", { className: "ve-character-menu-close", attrs: { type: "button", "aria-label": localizedText(commands.localize, "VEMOBILE.Character.Presenter.CloseCharacterSelector", "Close character selector") }, on: { click: onClose }, children: [icon("fa-xmark")] }, owner)
    ] });
    element.replaceChildren(...(embedded ? [] : [heading]), ...renderCharacterMenuBranch(root, context, owner));
    afterCharacterMenuLayout(owner, () => {
      if (bodyScope !== owner) return;
      const current = element.querySelector('[aria-current="true"]');
      if (!current) return;
      if (typeof current.scrollIntoView === "function") current.scrollIntoView({ block: "center", inline: "nearest" });
      else element.scrollTop = Math.max(0, current.offsetTop - (element.clientHeight - current.offsetHeight) / 2);
    });
  };

  scope.own(() => {
    unmount();
    expandedFolderIds.clear();
  });
  return Object.freeze({ element, expandedFolderIds, mount, unmount });
}

function afterCharacterMenuLayout(scope, callback) {
  let cancelled = false;
  const requestFrame = globalThis.requestAnimationFrame;
  if (typeof requestFrame === "function") {
    const frame = requestFrame(() => {
      if (!cancelled && !scope.disposed) callback();
    });
    scope.own(() => {
      cancelled = true;
      globalThis.cancelAnimationFrame?.(frame);
    });
    return;
  }
  scope.own(() => { cancelled = true; });
  queueMicrotask(() => {
    if (!cancelled && !scope.disposed) callback();
  });
}

function renderCharacterMenuBranch(branch, context, scope) {
  const folders = Array.from(branch.folders.values())
    .sort((left, right) => Number(left.folder.sort) - Number(right.folder.sort) || left.folder.name.localeCompare(right.folder.name));
  const actors = [...branch.actors]
    .sort((left, right) => Number(left.sort) - Number(right.sort) || left.name.localeCompare(right.name));
  return [
    ...folders.map((folder) => characterMenuFolder(folder, context, scope)),
    ...actors.map((actor) => characterMenuActor(actor, context.selectedActor, context.commands, context.onClose, scope, context.describeActor))
  ];
}

function characterMenuFolder(branch, context, scope) {
  const folderId = String(branch.folder.id);
  const folderScope = scope.child(`folder:${folderId}`);
  const initiallyOpen = context.expandedFolderIds.has(folderId);
  const chevron = icon("fa-chevron-right");
  const summary = node("summary", {
    attrs: { role: "menuitem", "aria-expanded": String(initiallyOpen) },
    children: [chevron, icon("fa-folder"), node("strong", { text: branch.folder.name }), node("small", { text: characterFolderCount(branch) })]
  });
  const details = node("details", {
    className: "ve-character-menu-folder",
    attrs: { open: initiallyOpen, "data-folder-id": folderId },
    children: [summary]
  });
  let contents = null;
  let contentsScope = null;

  const disposeContents = () => {
    contentsScope?.dispose();
    contentsScope = null;
    contents?.remove();
    contents = null;
  };
  const renderContents = () => {
    if (contents || folderScope.disposed) return;
    contentsScope = folderScope.child("contents");
    contents = node("div", {
      className: "ve-character-menu-folder-contents",
      children: renderCharacterMenuBranch(branch, context, contentsScope)
    });
    details.append(contents);
  };

  folderScope.own(disposeContents);
  bindDetailsDisclosure(details, summary, (nextOpen) => {
    if (nextOpen) {
      context.expandedFolderIds.add(folderId);
      renderContents();
    } else {
      context.expandedFolderIds.delete(folderId);
      disposeContents();
    }
  }, folderScope);
  if (initiallyOpen) renderContents();
  return details;
}

function characterMenuActor(entry, selectedActor, commands, setOpen, scope, describeActor) {
  const active = characterRecordSourceUuid(entry) === characterRecordSourceUuid(selectedActor);
  return node("button", {
    className: `ve-character-menu-actor${active ? " is-active" : ""}`,
    attrs: { type: "button", role: "menuitem", "aria-current": active ? "true" : undefined, "data-actor-source": characterRecordSourceUuid(entry) },
    on: { click: () => {
      setOpen(false);
      commands.selectActor(characterRecordSourceUuid(entry));
    } },
    children: [
      node("span", { className: "ve-character-menu-portrait", children: [node("img", { attrs: { src: entry.img, alt: "", loading: "lazy", decoding: "async" } })] }),
      node("span", { className: "ve-character-menu-copy", children: [node("strong", { text: entry.name }), node("small", { text: describeActor(entry, commands) })] }),
      active ? icon("fa-check") : null
    ]
  }, scope);
}

export function characterFolderCount(branch) {
  return branch.actors.length + Array.from(branch.folders.values()).reduce((total, folder) => total + characterFolderCount(folder), 0);
}

function characterRecordSourceUuid(actor) { return String(actor?.sourceUuid ?? (actor?.id ? `Actor.${actor.id}` : "")); }
