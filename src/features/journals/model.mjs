export function buildJournalTree(journals) {
  const root = branch(null, journals?.[0]?.rootSorting);
  for (const journal of journals ?? []) {
    let current = root;
    for (const folder of journal.folderPath ?? []) {
      if (!current.folders.has(folder.id)) current.folders.set(folder.id, branch(folder, folder.sorting));
      current = current.folders.get(folder.id);
    }
    current.journals.push(journal);
  }
  sortBranch(root);
  return root;
}

function branch(folder, sorting = "m") {
  return { folder, sorting: sorting === "a" ? "a" : "m", folders: new Map(), journals: [] };
}

function sortBranch(current) {
  current.folders = new Map(Array.from(current.folders.entries()).sort(([, left], [, right]) => compare(left.folder, right.folder, current.sorting)));
  current.journals.sort((left, right) => compare(left, right, current.sorting));
  for (const child of current.folders.values()) sortBranch(child);
}

function compare(left, right, sorting) {
  if (sorting === "a") return String(left?.name ?? "").localeCompare(String(right?.name ?? ""));
  return Number(left?.sort ?? 0) - Number(right?.sort ?? 0)
    || String(left?.name ?? "").localeCompare(String(right?.name ?? ""));
}

export function journalBranchCount(current) {
  return current.journals.length + Array.from(current.folders.values()).reduce((total, child) => total + journalBranchCount(child), 0);
}
