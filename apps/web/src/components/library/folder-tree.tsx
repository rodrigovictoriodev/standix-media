"use client";

import { useState } from "react";
import type { AssetFolder } from "./types";

export function FolderTree({
  folders,
  activeFolder,
  onSelect,
}: {
  folders: AssetFolder[];
  activeFolder: string;
  onSelect: (id: string) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const children = new Map<string | null, AssetFolder[]>();
  for (const folder of folders) {
    const siblings = children.get(folder.parentId) ?? [];
    siblings.push(folder);
    children.set(folder.parentId, siblings);
  }

  const toggle = (id: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const renderLevel = (parentId: string | null, depth: number) =>
    (children.get(parentId) ?? []).map((folder) => {
      const hasChildren = Boolean(children.get(folder.id)?.length);
      const open = !collapsed.has(folder.id);
      return (
        <li key={folder.id}>
          <div
            className={`flex items-center rounded-lg text-sm transition ${
              activeFolder === folder.id
                ? "bg-primary/15 text-white"
                : "text-muted hover:bg-white/5 hover:text-white"
            }`}
            style={{ paddingLeft: `${4 + depth * 14}px` }}
          >
            <button
              type="button"
              onClick={() => hasChildren && toggle(folder.id)}
              aria-label={open ? "Recolher pasta" : "Expandir pasta"}
              aria-expanded={hasChildren ? open : undefined}
              tabIndex={hasChildren ? 0 : -1}
              className={`flex h-7 w-5 shrink-0 items-center justify-center text-[10px] ${
                hasChildren ? "text-muted hover:text-white" : "invisible"
              }`}
            >
              {open ? "▾" : "▸"}
            </button>
            <button
              type="button"
              onClick={() => onSelect(folder.id)}
              aria-current={activeFolder === folder.id ? "page" : undefined}
              className="flex min-w-0 flex-1 items-center gap-2 py-2 pr-2 text-left"
            >
              <span aria-hidden="true" className="text-amber-200/80">
                ▰
              </span>
              <span className="min-w-0 flex-1 truncate">{folder.name}</span>
              <span className="text-xs text-muted/70">{folder.assetCount}</span>
            </button>
          </div>
          {hasChildren && open && <ul>{renderLevel(folder.id, depth + 1)}</ul>}
        </li>
      );
    });

  return <ul>{renderLevel(null, 0)}</ul>;
}

/** Options for a folder <select>, indented by depth, optionally excluding a subtree. */
export function folderOptions(folders: AssetFolder[], excludeSubtreeOf?: string) {
  const children = new Map<string | null, AssetFolder[]>();
  for (const folder of folders) {
    const siblings = children.get(folder.parentId) ?? [];
    siblings.push(folder);
    children.set(folder.parentId, siblings);
  }
  const options: { id: string; label: string }[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const folder of children.get(parentId) ?? []) {
      if (folder.id === excludeSubtreeOf) continue;
      options.push({ id: folder.id, label: `${"  ".repeat(depth)}${folder.name}` });
      walk(folder.id, depth + 1);
    }
  };
  walk(null, 0);
  return options;
}
