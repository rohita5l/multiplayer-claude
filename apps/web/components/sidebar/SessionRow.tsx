"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, MoreHorizontal, Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { SidebarMenuAction, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { PresenceAvatars } from "./PresenceAvatars";
import type { PresenceUser } from "@/hooks/usePresence";
import type { SessionListItem } from "@/lib/sessions";
import { repoShort } from "@/lib/repo";
import { cn } from "@/lib/utils";

const dot: Record<string, string> = { running: "bg-green-500", creating: "bg-amber-400 animate-pulse", stopped: "bg-muted-foreground/40", archived: "bg-muted-foreground/25", error: "bg-red-500" };

export function SessionRow({ session, active, present, isOwner }: { session: SessionListItem; active: boolean; present: PresenceUser[]; isOwner: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(session.title);

  async function rename() {
    const t = title.trim();
    setEditing(false);
    if (!t || t === session.title) { setTitle(session.title); return; }
    const r = await fetch(`/api/sessions/${session.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: t }) });
    if (!r.ok) { toast.error("Rename failed"); setTitle(session.title); return; }
    router.refresh();
  }

  async function remove() {
    if (!confirm(`Delete "${session.title}" and its sandbox?`)) return;
    const r = await fetch(`/api/sessions/${session.id}`, { method: "DELETE" });
    if (!r.ok) { toast.error("Delete failed"); return; }
    toast.success("Session deleted");
    if (active) router.push("/");
    router.refresh();
  }

  return (
    <SidebarMenuItem className="group/row">
      {editing ? (
        <div className="flex items-center gap-1 px-1 py-1">
          <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} className="h-7 text-sm" onKeyDown={(e) => { if (e.key === "Enter") rename(); if (e.key === "Escape") { setEditing(false); setTitle(session.title); } }} onBlur={rename} />
          <button className="p-1 text-muted-foreground hover:text-foreground" onMouseDown={(e) => e.preventDefault()} onClick={rename}><Check className="size-3.5" /></button>
          <button className="p-1 text-muted-foreground hover:text-foreground" onMouseDown={(e) => e.preventDefault()} onClick={() => { setEditing(false); setTitle(session.title); }}><X className="size-3.5" /></button>
        </div>
      ) : (
        <SidebarMenuButton render={<Link href={`/s/${session.id}`} />} isActive={active} className="h-auto py-1.5 items-start" onDoubleClick={() => isOwner && setEditing(true)}>
          <>
            <span className={cn("mt-1.5 size-2 rounded-full shrink-0", dot[session.status] ?? dot.stopped)} />
            <span className="flex-1 min-w-0">
              <span className="block truncate text-sm">{session.title}</span>
              <span className="block truncate text-[11px] text-muted-foreground">{repoShort(session.repo_url)}</span>
            </span>
            <PresenceAvatars users={present} className="mt-0.5" />
          </>
        </SidebarMenuButton>
      )}
      {isOwner && !editing && (
        <DropdownMenu>
          <DropdownMenuTrigger render={<SidebarMenuAction showOnHover />}><MoreHorizontal /></DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="start">
            <DropdownMenuItem onClick={() => setEditing(true)}><Pencil className="size-4" /> Rename</DropdownMenuItem>
            <DropdownMenuItem onClick={remove} className="text-destructive"><Trash2 className="size-4" /> Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </SidebarMenuItem>
  );
}
