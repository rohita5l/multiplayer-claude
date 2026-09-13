"use client";
import { ClipboardList, CheckCircle2, FileCheck2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { DiffFile } from "@mpc/protocol";
import type { SessionSocketState } from "@/hooks/useSessionSocket";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Markdown } from "./Markdown";
import { statusClass, timeAgo } from "./util";

export function PlanTab({ plan, awaitingApproval, isOwner, running, onApprove }: { plan: SessionSocketState["plan"]; awaitingApproval: boolean; isOwner: boolean; running: boolean; onApprove: () => void }) {
  if (!plan) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
        <ClipboardList className="size-5" />
        No plan yet — ask Claude to &ldquo;plan first&rdquo; and it will appear here for approval.
      </div>
    );
  }
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b px-4 py-2">
        <ClipboardList className="size-4 text-muted-foreground" />
        <span className="text-sm font-semibold">Plan</span>
        <span className="text-xs text-muted-foreground">{timeAgo(plan.at)}</span>
        <div className="ml-auto">
          {awaitingApproval ? (
            isOwner ? (
              <Button size="sm" onClick={onApprove} disabled={running}><CheckCircle2 className="size-3.5" /> Approve &amp; build</Button>
            ) : (
              <Badge variant="outline">Awaiting the owner&apos;s approval</Badge>
            )
          ) : (
            <Badge variant="secondary" className="gap-1"><CheckCircle2 className="size-3 text-emerald-600" /> Approved</Badge>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <Markdown text={plan.text} />
      </div>
    </div>
  );
}

export function SummaryTab({ summary, diff, onOpenFile }: { summary: SessionSocketState["summary"]; diff: DiffFile[]; onOpenFile: (path: string) => void }) {
  if (!summary && diff.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
        <FileCheck2 className="size-5" />
        No summary yet — it appears after Claude finishes a turn.
      </div>
    );
  }
  const adds = diff.reduce((n, f) => n + f.additions, 0);
  const dels = diff.reduce((n, f) => n + f.deletions, 0);
  return (
    <div className="h-full overflow-y-auto p-4">
      {summary && (
        <>
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>Latest turn · {timeAgo(summary.at)}</span>
            {summary.numTurns != null && <Badge variant="outline" className="h-5 px-1.5 text-[10px]">{summary.numTurns} turns</Badge>}
            {summary.costUsd != null && <Badge variant="outline" className="h-5 px-1.5 text-[10px]">${summary.costUsd.toFixed(3)}</Badge>}
          </div>
          <Markdown text={summary.text || "_(no text)_"} />
        </>
      )}
      <div className="mt-5">
        <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Changed files · {diff.length}
          <span className="font-mono normal-case tracking-normal"><span className="text-emerald-700">+{adds}</span> <span className="text-red-700">−{dels}</span></span>
        </div>
        {diff.length === 0 && <div className="text-sm text-muted-foreground">No file changes yet.</div>}
        <div className="divide-y rounded-md border">
          {diff.map((f) => (
            <div key={f.path} onClick={() => onOpenFile(f.path)} className="flex cursor-pointer items-center gap-2 px-2 py-1 text-[13px] hover:bg-accent">
              <span className={cn("rounded border px-1 text-[10px] font-semibold leading-4", statusClass[f.status])}>{f.status}</span>
              <span className="truncate font-mono text-xs">{f.path}</span>
              <span className="ml-auto shrink-0 font-mono text-[11px]"><span className="text-emerald-700">+{f.additions}</span> <span className="text-red-700">−{f.deletions}</span></span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
