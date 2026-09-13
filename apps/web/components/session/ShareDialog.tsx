"use client";
import { useEffect, useState } from "react";
import { Copy, Loader2, Mail, Share2, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ROLE_HINT, ROLE_LABEL, type Role } from "@mpc/protocol";
import type { PresenceUser } from "@/hooks/usePresence";
import { cn } from "@/lib/utils";

type Member = { userId: string; role: Role; name: string | null; email: string | null };
type Invite = { email: string; role: Role; expires_at: string };

function RolePicker({ value, onChange, disabled }: { value: Role; onChange: (r: Role) => void; disabled?: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs" disabled={disabled} />}>{ROLE_LABEL[value]}</DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {(["editor", "commenter"] as Role[]).map((r) => (
          <DropdownMenuItem key={r} onClick={() => onChange(r)} className={cn(value === r && "bg-accent")}>
            <div className="flex flex-col"><span className="text-sm">{ROLE_LABEL[r]}</span><span className="text-[11px] text-muted-foreground">{ROLE_HINT[r]}</span></div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ShareDialog({ sessionId, present }: { sessionId: string; present: PresenceUser[] }) {
  const [open, setOpen] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("commenter");
  const [busy, setBusy] = useState(false);
  const [lastLink, setLastLink] = useState<{ url: string; email: string } | null>(null);

  async function load() {
    const r = await fetch(`/api/sessions/${sessionId}/members`);
    if (r.ok) { const d = await r.json(); setMembers(d.members); setInvites(d.invites); }
  }
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  async function invite() {
    setBusy(true);
    try {
      const r = await fetch(`/api/sessions/${sessionId}/invite`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, role }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      await navigator.clipboard.writeText(d.url).catch(() => {});
      setLastLink({ url: d.url, email: d.email });
      toast.success(`Invite link for ${d.email} copied`);
      setEmail("");
      await load();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }

  async function setMemberRole(userId: string, r: Role) {
    setMembers((m) => m.map((x) => (x.userId === userId ? { ...x, role: r } : x)));
    const res = await fetch(`/api/sessions/${sessionId}/members`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId, role: r }) });
    if (!res.ok) { toast.error("Could not change role"); void load(); }
  }
  async function remove(body: { userId?: string; email?: string }) {
    const res = await fetch(`/api/sessions/${sessionId}/members`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) toast.error("Could not remove"); else { toast.success(body.email ? "Invite revoked" : "Removed"); void load(); }
  }

  const online = new Set(present.map((p) => p.userId));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}><Share2 className="size-4" /> Share</DialogTrigger>
      <DialogContent className="sm:max-w-lg overflow-hidden">
        <DialogHeader>
          <DialogTitle>Share this session</DialogTitle>
          <DialogDescription>Invites are tied to an email. The person signs in (or signs up) with that email and lands in the session. Links expire in 7 days.</DialogDescription>
        </DialogHeader>

        <div className="min-w-0 space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Invite someone</div>
          <div className="relative min-w-0">
            <Mail className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" type="email" className="w-full pl-8" onKeyDown={(e) => e.key === "Enter" && email && invite()} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">Role <RolePicker value={role} onChange={setRole} /></div>
            <Button size="sm" onClick={invite} disabled={busy || !email.trim()}>{busy ? <Loader2 className="size-4 animate-spin" /> : "Create invite link"}</Button>
          </div>
          {lastLink && (
            <div className="flex min-w-0 items-center gap-2 rounded-md border bg-muted/40 px-2 py-1.5 text-xs">
              <span className="min-w-0 flex-1 truncate font-mono" title={lastLink.url}>{lastLink.url}</span>
              <span className="shrink-0 text-muted-foreground">for {lastLink.email}</span>
              <Button size="icon" variant="ghost" className="size-6 shrink-0" onClick={() => { navigator.clipboard.writeText(lastLink.url); toast.success("Copied"); }} aria-label="Copy link"><Copy className="size-3.5" /></Button>
            </div>
          )}
        </div>

        <div className="min-w-0 space-y-1.5">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">People</div>
          <div className="min-w-0 divide-y rounded-md border">
            {members.map((m) => (
              <div key={m.userId} className="flex min-w-0 items-center gap-2 px-2 py-1.5 text-sm">
                <UserRound className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="truncate">{m.name ?? m.email ?? "Member"} {online.has(m.userId) && <span className="ml-1 inline-block size-1.5 rounded-full bg-green-500 align-middle" />}</div>
                  {m.email && <div className="truncate text-[11px] text-muted-foreground">{m.email}</div>}
                </div>
                {m.role === "owner" ? <Badge variant="secondary">Owner</Badge> : (
                  <>
                    <RolePicker value={m.role} onChange={(r) => setMemberRole(m.userId, r)} />
                    <Button size="icon" variant="ghost" className="size-7 text-muted-foreground" onClick={() => remove({ userId: m.userId })} aria-label="Remove"><Trash2 className="size-3.5" /></Button>
                  </>
                )}
              </div>
            ))}
            {invites.map((i) => (
              <div key={i.email} className="flex min-w-0 items-center gap-2 px-2 py-1.5 text-sm">
                <Mail className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="truncate">{i.email}</div>
                  <div className="text-[11px] text-muted-foreground">Invited · not joined yet</div>
                </div>
                <Badge variant="outline">{ROLE_LABEL[i.role]}</Badge>
                <Button size="icon" variant="ghost" className="size-7 text-muted-foreground" onClick={() => remove({ email: i.email })} aria-label="Revoke invite"><Trash2 className="size-3.5" /></Button>
              </div>
            ))}
            {members.length === 0 && invites.length === 0 && <div className="px-2 py-3 text-xs text-muted-foreground">Loading…</div>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
