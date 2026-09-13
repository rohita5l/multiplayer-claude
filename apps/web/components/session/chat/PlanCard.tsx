"use client";
import { CheckCircle2, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Markdown } from "./Markdown";
import type { SessionSocketState } from "@/hooks/useSessionSocket";

export function PlanCard({ state, onApprove }: { state: SessionSocketState; onApprove: () => void }) {
  if (!state.plan) return null;
  const isOwner = state.you?.role === "owner";
  const approved = state.mode !== "plan";
  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-xs">
      <div className="mb-2 flex items-center gap-2">
        <ClipboardList className="size-4 text-muted-foreground" />
        <span className="text-sm font-semibold">Plan</span>
        <span className="text-xs text-muted-foreground">{new Date(state.plan.at).toLocaleTimeString()}</span>
        <div className="ml-auto">
          {approved ? (
            <Badge variant="secondary" className="gap-1"><CheckCircle2 className="size-3 text-emerald-600" /> Plan approved</Badge>
          ) : isOwner ? (
            <Button size="sm" onClick={onApprove} disabled={state.agentState === "running"}>Approve &amp; build</Button>
          ) : (
            <Badge variant="outline">Awaiting approval</Badge>
          )}
        </div>
      </div>
      <Markdown text={state.plan.text} />
    </div>
  );
}
