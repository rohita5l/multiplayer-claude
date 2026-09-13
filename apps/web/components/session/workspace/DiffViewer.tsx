"use client";
import { useTheme } from "next-themes";
import { useMemo, useState } from "react";
import { DiffView, DiffModeEnum, SplitSide } from "@git-diff-view/react";
import "@git-diff-view/react/styles/diff-view.css";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { DiffFile } from "@mpc/protocol";
import type { Comment, NewComment } from "@/hooks/useComments";
import { cn } from "@/lib/utils";
import { AddCommentForm, CommentThread } from "./CommentThread";
import { basename, diffLang, statusClass } from "./util";

/** Strip the `diff --git`/index/--- +++ headers; the viewer wants hunk text. */
/** @git-diff-view needs the `--- a/...` / `+++ b/...` header lines in front of the hunks. */
function hunksOf(patch: string): string[] {
  if (!patch.includes("\n@@") && !patch.startsWith("@@")) return [];
  const i = patch.indexOf("\n--- ");
  return [i === -1 ? patch : patch.slice(i + 1)];
}

export function DiffFileList({ files, selected, onSelect }: { files: DiffFile[]; selected: string | null; onSelect: (p: string) => void }) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="px-2 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Changed files · {files.length}</div>
      {files.map((f) => (
        <div key={f.path} title={f.path} onClick={() => onSelect(f.path)} className={cn("flex cursor-pointer items-center gap-1.5 px-2 text-[13px] leading-6 hover:bg-accent", selected === f.path && "bg-accent")}>
          <span className={cn("rounded border px-1 text-[10px] font-semibold leading-4", statusClass[f.status])}>{f.status}</span>
          <span className="truncate">{basename(f.path)}</span>
          <span className="ml-auto shrink-0 font-mono text-[11px]"><span className="text-emerald-700">+{f.additions}</span> <span className="text-red-700">−{f.deletions}</span></span>
        </div>
      ))}
      {files.length === 0 && <div className="p-3 text-xs text-muted-foreground">No changes yet.</div>}
    </div>
  );
}

export function DiffViewer({
  file, threads, repliesOf, canComment, isOwner, onAdd, onSetStatus,
}: {
  file: DiffFile; threads: Comment[]; repliesOf: (id: string) => Comment[]; canComment: boolean; isOwner: boolean;
  onAdd: (c: NewComment) => Promise<unknown>; onSetStatus: (ids: string[], status: Comment["status"]) => Promise<unknown>;
}) {
  const { resolvedTheme } = useTheme();
  const [mode, setMode] = useState<DiffModeEnum>(DiffModeEnum.Unified);
  const hunks = useMemo(() => hunksOf(file.patch), [file.patch]);
  const lang = diffLang(file.path);

  // existing threads keyed by line on the side they were left on
  const extendData = useMemo(() => {
    const newFile: Record<string, { data: Comment[] }> = {};
    const oldFile: Record<string, { data: Comment[] }> = {};
    for (const t of threads) {
      const bucket = t.side === "old" ? oldFile : newFile;
      (bucket[t.line_end] ??= { data: [] }).data.push(t);
    }
    return { newFile, oldFile };
  }, [threads]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b px-2 py-1">
        <span className={cn("rounded border px-1 text-[10px] font-semibold leading-4", statusClass[file.status])}>{file.status}</span>
        <span className="truncate font-mono text-xs">{file.oldPath ? `${file.oldPath} → ` : ""}{file.path}</span>
        <span className="font-mono text-[11px]"><span className="text-emerald-700">+{file.additions}</span> <span className="text-red-700">−{file.deletions}</span></span>
        <ToggleGroup value={[String(mode)]} onValueChange={(v) => { const n = (v as string[])[0]; if (n) setMode(Number(n) as DiffModeEnum); }} size="sm" variant="outline" className="ml-auto">
          <ToggleGroupItem value={String(DiffModeEnum.Unified)} className="h-6 px-2 text-xs">Unified</ToggleGroupItem>
          <ToggleGroupItem value={String(DiffModeEnum.Split)} className="h-6 px-2 text-xs">Split</ToggleGroupItem>
        </ToggleGroup>
      </div>
      <div className="min-h-0 flex-1 overflow-auto text-[12.5px]">
        {hunks.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">{file.status === "D" ? "File deleted." : "Binary or empty change."}</div>
        ) : (
          <DiffView<Comment[]>
            key={file.path + mode}
            data={{ oldFile: { fileName: file.oldPath ?? file.path, fileLang: lang }, newFile: { fileName: file.path, fileLang: lang }, hunks }}
            diffViewMode={mode}
            diffViewTheme={resolvedTheme === "dark" ? "dark" : "light"}
            diffViewHighlight
            diffViewWrap
            diffViewFontSize={12.5}
            diffViewAddWidget={canComment}
            extendData={extendData}
            renderWidgetLine={({ lineNumber, side, onClose }) => (
              <div className="px-3 py-2">
                <AddCommentForm filePath={file.path} line={lineNumber} side={side === SplitSide.old ? "old" : "new"} onSubmit={onAdd} onCancel={onClose} />
              </div>
            )}
            renderExtendLine={({ data }) => (
              <div className="space-y-1.5 bg-muted/40 px-3 py-2">
                {data.map((t) => (
                  <CommentThread key={t.id} thread={t} replies={repliesOf(t.id)} isOwner={isOwner} canComment={canComment} onReply={onAdd} onSetStatus={onSetStatus} compact />
                ))}
              </div>
            )}
          />
        )}
      </div>
    </div>
  );
}
