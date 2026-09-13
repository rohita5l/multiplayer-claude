"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Circle, Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ShareDialog } from "./ShareDialog";
import { PresenceAvatars } from "@/components/sidebar/PresenceAvatars";
import type { PresenceUser } from "@/hooks/usePresence";
import type { ConnectionState } from "@/hooks/useSessionSocket";
import type { AgentState } from "@mpc/protocol";
import { repoShort } from "@/lib/repo";
import { cn } from "@/lib/utils";

function StatusPill({ connection, agentState }: { connection: ConnectionState; agentState: AgentState }) {
  const map: Record<string, { label: string; cls: string; spin?: boolean }> = {
    booting: { label: "Connecting", cls: "text-amber-600", spin: true },
    connecting: { label: "Connecting", cls: "text-amber-600", spin: true },
    reconnecting: { label: "Reconnecting", cls: "text-amber-600", spin: true },
    error: { label: "Disconnected", cls: "text-red-600" },
    closed: { label: "Closed", cls: "text-muted-foreground" },
  };
  const c = connection === "open"
    ? agentState === "running" ? { label: "Claude is working", cls: "text-sky-600", spin: true } : agentState === "error" ? { label: "Agent error", cls: "text-red-600" } : { label: "Live", cls: "text-green-600" }
    : map[connection];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", c.cls)}>
      {c.spin ? <Loader2 className="size-3 animate-spin" /> : <Circle className="size-2 fill-current" />}
      {c.label}
    </span>
  );
}

export function SessionHeader({ session, isOwner, connection, agentState, present }: { session: { id: string; title: string; repoUrl: string }; isOwner: boolean; connection: ConnectionState; agentState: AgentState; present: PresenceUser[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(session.title);

  async function rename() {
    setEditing(false);
    const t = title.trim();
    if (!t || t === session.title) { setTitle(session.title); return; }
    const r = await fetch(`/api/sessions/${session.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: t }) });
    if (!r.ok) toast.error("Rename failed"); else router.refresh();
  }


  return (
    <header className="flex items-center gap-3 border-b px-3 h-12 shrink-0">
      <SidebarTrigger className="-ml-1" />
      <div className="flex-1 min-w-0 flex items-center gap-2">
        {editing ? (
          <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} className="h-7 max-w-xs text-sm" onBlur={rename} onKeyDown={(e) => { if (e.key === "Enter") rename(); if (e.key === "Escape") { setEditing(false); setTitle(session.title); } }} />
        ) : (
          <button className="group flex items-center gap-1.5 min-w-0" onClick={() => isOwner && setEditing(true)} disabled={!isOwner}>
            <span className="truncate font-medium text-sm">{title}</span>
            {isOwner && <Pencil className="size-3 text-muted-foreground opacity-0 group-hover:opacity-100" />}
          </button>
        )}
        <Badge variant="outline" className="font-mono text-[10px] hidden sm:inline-flex">{repoShort(session.repoUrl)}</Badge>
        <StatusPill connection={connection} agentState={agentState} />
      </div>
      <PresenceAvatars users={present} size="md" />
      {isOwner && <ShareDialog sessionId={session.id} present={present} />}
    </header>
  );
}
