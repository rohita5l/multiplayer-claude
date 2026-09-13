"use client";
import { useMemo, useRef, useEffect, useState } from "react";
import { Tree, type NodeApi, type NodeRendererProps } from "react-arborist";
import { ChevronDown, ChevronRight, File, Folder, FolderOpen } from "lucide-react";
import type { DiffFile, FileEntry } from "@mpc/protocol";
import { cn } from "@/lib/utils";
import { basename, statusClass, statusLabel } from "./util";

export interface TreeNode {
  id: string; // full path
  name: string;
  status?: string;
  children?: TreeNode[];
}

function buildTree(files: FileEntry[]): TreeNode[] {
  const root: TreeNode[] = [];
  const dirs = new Map<string, TreeNode>();
  const dirFor = (path: string): TreeNode[] => {
    if (!path) return root;
    let d = dirs.get(path);
    if (d) return d.children!;
    const parentPath = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
    d = { id: path, name: basename(path), children: [] };
    dirs.set(path, d);
    dirFor(parentPath).push(d);
    return d.children!;
  };
  for (const f of files) {
    const parent = f.path.includes("/") ? f.path.slice(0, f.path.lastIndexOf("/")) : "";
    dirFor(parent).push({ id: f.path, name: basename(f.path), status: f.status });
  }
  const sort = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => (a.children ? 0 : 1) - (b.children ? 0 : 1) || a.name.localeCompare(b.name));
    nodes.forEach((n) => n.children && sort(n.children));
  };
  sort(root);
  return root;
}

function Node({ node, style }: NodeRendererProps<TreeNode>) {
  const isDir = !node.isLeaf;
  const st = node.data.status;
  return (
    <div
      style={style}
      className={cn("flex h-full cursor-pointer items-center gap-1 pr-2 text-[13px] leading-6 hover:bg-accent", node.isSelected && "bg-accent")}
      onClick={() => (isDir ? node.toggle() : node.select())}
    >
      {isDir ? (
        <>
          {node.isOpen ? <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />}
          {node.isOpen ? <FolderOpen className="size-3.5 shrink-0 text-muted-foreground" /> : <Folder className="size-3.5 shrink-0 text-muted-foreground" />}
        </>
      ) : (
        <>
          <span className="w-3.5 shrink-0" />
          <File className="size-3.5 shrink-0 text-muted-foreground" />
        </>
      )}
      <span className="truncate">{node.data.name}</span>
      {st && <span className={cn("ml-auto rounded border px-1 text-[10px] font-semibold leading-4", statusClass[st])}>{statusLabel(st)}</span>}
    </div>
  );
}

export function FileTree({
  files, diff, selected, onSelect,
}: { files: FileEntry[]; diff: DiffFile[]; selected: string | null; onSelect: (path: string) => void }) {
  const data = useMemo(() => buildTree(files), [files]);
  const changed = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of files) if (f.status) m.set(f.path, f.status);
    for (const d of diff) if (!m.has(d.path)) m.set(d.path, d.status);
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [files, diff]);

  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 240, h: 400 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // top-level directories open by default
  const initialOpenState = useMemo(() => Object.fromEntries(data.filter((n) => n.children).map((n) => [n.id, true])), [data]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {changed.length > 0 && (
        <div className="shrink-0 border-b">
          <div className="px-2 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Changed · {changed.length}</div>
          <div className="max-h-40 overflow-y-auto pb-1">
            {changed.map(([path, st]) => (
              <div
                key={path}
                title={path}
                onClick={() => onSelect(path)}
                className={cn("flex cursor-pointer items-center gap-1.5 px-2 text-[13px] leading-6 hover:bg-accent", selected === path && "bg-accent")}
              >
                <span className={cn("rounded border px-1 text-[10px] font-semibold leading-4", statusClass[st])}>{statusLabel(st)}</span>
                <span className="truncate text-muted-foreground">{path.includes("/") ? path.slice(0, path.lastIndexOf("/") + 1) : ""}</span>
                <span className="-ml-1.5 truncate">{basename(path)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="px-2 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Files · {files.length}</div>
      <div ref={ref} className="min-h-0 flex-1">
        {files.length === 0 ? (
          <div className="p-3 text-xs text-muted-foreground">Loading file tree…</div>
        ) : (
          <Tree<TreeNode>
            data={data}
            width={size.w}
            height={size.h}
            rowHeight={24}
            indent={12}
            openByDefault={false}
            initialOpenState={initialOpenState}
            selection={selected ?? undefined}
            disableDrag
            disableDrop
            disableEdit
            onSelect={(nodes: NodeApi<TreeNode>[]) => { const n = nodes[0]; if (n && n.isLeaf) onSelect(n.id); }}
          >
            {Node}
          </Tree>
        )}
      </div>
    </div>
  );
}
