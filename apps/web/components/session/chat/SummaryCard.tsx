"use client";
import { CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Markdown } from "./Markdown";
import type { SessionSocketState } from "@/hooks/useSessionSocket";

export function SummaryCard({ state }: { state: SessionSocketState }) {
  const s = state.summary;
  if (!s?.text) return null;
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 dark:border-emerald-900/50 dark:bg-emerald-950/20">
      <div className="mb-2 flex items-center gap-2">
        <CheckCircle2 className="size-4 text-emerald-600" />
        <span className="text-sm font-semibold">Summary</span>
        <span className="text-xs text-muted-foreground">{new Date(s.at).toLocaleTimeString()}</span>
        <div className="ml-auto flex gap-1">
          {s.costUsd != null && <Badge variant="outline">${s.costUsd.toFixed(4)}</Badge>}
          {s.numTurns != null && <Badge variant="outline">{s.numTurns} turn{s.numTurns === 1 ? "" : "s"}</Badge>}
        </div>
      </div>
      <Markdown text={s.text} />
    </div>
  );
}
