"use client";
import { useState } from "react";
import { Check, CornerDownRight, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import type { Comment, NewComment } from "@/hooks/useComments";
import { cn } from "@/lib/utils";
import { timeAgo } from "./util";

export const statusBadge: Record<Comment["status"], string> = {
  open: "bg-amber-100 text-amber-800 border-amber-200",
  addressed: "bg-sky-100 text-sky-800 border-sky-200",
  resolved: "bg-emerald-100 text-emerald-800 border-emerald-200",
};

export function AddCommentForm({
  filePath, line, lineEnd, side = "new", parentId = null, onSubmit, onCancel, placeholder,
}: {
  filePath: string; line: number; lineEnd?: number; side?: "new" | "old"; parentId?: string | null;
  onSubmit: (c: NewComment) => Promise<unknown>; onCancel: () => void; placeholder?: string;
}) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async () => {
    if (!body.trim()) return;
    setBusy(true); setErr(null);
    try {
      await onSubmit({ filePath, lineStart: line, lineEnd: lineEnd ?? line, side, body: body.trim(), parentId });
      setBody("");
      onCancel();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="rounded-md border bg-background p-2 shadow-sm">
      <Textarea
        autoFocus
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void submit(); if (e.key === "Escape") onCancel(); }}
        placeholder={placeholder ?? `Comment on line ${line}…`}
        className="min-h-16 text-sm"
      />
      {err && <div className="mt-1 text-xs text-destructive">{err}</div>}
      <div className="mt-2 flex items-center justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button size="sm" onClick={() => void submit()} disabled={busy || !body.trim()}>{parentId ? "Reply" : "Post"}</Button>
      </div>
    </div>
  );
}

export function CommentThread({
  thread, replies, isOwner, canComment, onReply, onSetStatus, compact,
}: {
  thread: Comment; replies: Comment[]; isOwner: boolean; canComment: boolean;
  onReply: (c: NewComment) => Promise<unknown>; onSetStatus: (ids: string[], status: Comment["status"]) => Promise<unknown>; compact?: boolean;
}) {
  const [replying, setReplying] = useState(false);
  return (
    <div className={cn("rounded-md border bg-background text-sm shadow-sm", compact ? "p-2" : "p-3")}>
      <div className="flex items-center gap-2">
        <span className="font-medium">{thread.author_name ?? "Guest"}</span>
        <span className="text-xs text-muted-foreground">{timeAgo(thread.created_at)}</span>
        <Badge variant="outline" className={cn("ml-auto h-5 px-1.5 text-[10px] uppercase", statusBadge[thread.status])}>{thread.status}</Badge>
      </div>
      <div className="mt-1 whitespace-pre-wrap">{thread.body}</div>
      {replies.length > 0 && (
        <div className="mt-2 space-y-1.5 border-l-2 pl-2">
          {replies.map((r) => (
            <div key={r.id}>
              <span className="font-medium">{r.author_name ?? "Guest"}</span>
              <span className="ml-2 text-xs text-muted-foreground">{timeAgo(r.created_at)}</span>
              <div className="whitespace-pre-wrap">{r.body}</div>
            </div>
          ))}
        </div>
      )}
      <div className="mt-2 flex items-center gap-1">
        {canComment && !replying && (
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setReplying(true)}>
            <CornerDownRight className="size-3" /> Reply
          </Button>
        )}
        {isOwner && thread.status !== "resolved" && (
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => void onSetStatus([thread.id], "resolved")}>
            <Check className="size-3" /> Resolve
          </Button>
        )}
        {isOwner && thread.status === "resolved" && (
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => void onSetStatus([thread.id], "open")}>
            <RotateCcw className="size-3" /> Reopen
          </Button>
        )}
      </div>
      {replying && (
        <div className="mt-2">
          <AddCommentForm filePath={thread.file_path} line={thread.line_start} lineEnd={thread.line_end} side={thread.side} parentId={thread.id} onSubmit={onReply} onCancel={() => setReplying(false)} placeholder="Reply…" />
        </div>
      )}
    </div>
  );
}
