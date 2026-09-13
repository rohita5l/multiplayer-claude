"use client";
import { useMemo, useState } from "react";
import { Check, MessageSquare, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Comment } from "@/hooks/useComments";
import { cn } from "@/lib/utils";
import { statusBadge } from "./CommentThread";
import { timeAgo } from "./util";

type Filter = "all" | Comment["status"];

export function CommentsPanel({
  threads, repliesOf, isOwner, onOpen, onAddressAll, onSetStatus,
}: {
  threads: Comment[]; repliesOf: (id: string) => Comment[]; isOwner: boolean;
  onOpen: (path: string, line: number) => void; onAddressAll: (ids: string[]) => void; onSetStatus: (ids: string[], status: Comment["status"]) => Promise<unknown>;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const shown = useMemo(() => threads.filter((t) => filter === "all" || t.status === filter), [threads, filter]);
  const byFile = useMemo(() => {
    const m = new Map<string, Comment[]>();
    for (const t of shown) (m.get(t.file_path) ?? m.set(t.file_path, []).get(t.file_path)!).push(t);
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [shown]);
  const openIds = threads.filter((t) => t.status === "open").map((t) => t.id);
  const counts = { all: threads.length, open: openIds.length, addressed: threads.filter((t) => t.status === "addressed").length, resolved: threads.filter((t) => t.status === "resolved").length };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b px-2 py-1.5">
        {(["all", "open", "addressed", "resolved"] as Filter[]).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={cn("rounded-full border px-2 py-0.5 text-xs capitalize", filter === f ? "bg-foreground text-background" : "hover:bg-accent")}>
            {f} <span className="opacity-70">{counts[f]}</span>
          </button>
        ))}
        {isOwner && openIds.length > 0 && (
          <Button size="sm" className="ml-auto h-7 text-xs" onClick={() => onAddressAll(openIds)}>
            <Sparkles className="size-3.5" /> Address all open ({openIds.length})
          </Button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {byFile.length === 0 && (
          <div className="flex h-40 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <MessageSquare className="size-5" />
            {threads.length === 0 ? "No comments yet. Click a line number in a file or the diff to leave one." : "Nothing matches this filter."}
          </div>
        )}
        {byFile.map(([path, ts]) => (
          <div key={path} className="border-b">
            <div className="sticky top-0 bg-muted/60 px-2 py-1 font-mono text-[11px] text-muted-foreground backdrop-blur">{path}</div>
            {ts.map((t) => {
              const replies = repliesOf(t.id);
              return (
                <div key={t.id} className="group flex cursor-pointer items-start gap-2 px-2 py-2 text-sm hover:bg-accent" onClick={() => onOpen(t.file_path, t.line_end)}>
                  <span className="mt-0.5 shrink-0 rounded bg-muted px-1 font-mono text-[11px]">L{t.line_start === t.line_end ? t.line_start : `${t.line_start}-${t.line_end}`}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{t.author_name ?? "Guest"}</span>
                      <span className="text-xs text-muted-foreground">{timeAgo(t.created_at)}</span>
                      {replies.length > 0 && <span className="text-xs text-muted-foreground">· {replies.length} repl{replies.length === 1 ? "y" : "ies"}</span>}
                    </div>
                    <div className="line-clamp-2 text-muted-foreground">{t.body}</div>
                  </div>
                  <Badge variant="outline" className={cn("h-5 shrink-0 px-1.5 text-[10px] uppercase", statusBadge[t.status])}>{t.status}</Badge>
                  {isOwner && t.status !== "resolved" && (
                    <Button size="icon" variant="ghost" className="size-6 shrink-0 opacity-0 group-hover:opacity-100" title="Resolve" onClick={(e) => { e.stopPropagation(); void onSetStatus([t.id], "resolved"); }}>
                      <Check className="size-3.5" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
