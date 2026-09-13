"use client";
import { useEffect, useState } from "react";
import { Check, Copy, Loader2, Mail, Share2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ROLE_HINT, ROLE_LABEL, type Role } from "@mpc/protocol";
import { initialsOf, type PresenceUser } from "@/hooks/usePresence";
import { colorFor } from "@/components/sidebar/PresenceAvatars";
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

export function ShareDialog({ sessionId, present, meId }: { sessionId: string; present: PresenceUser[]; meId?: string }) {
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
      <DialogContent className="sm:max-w-md overflow-hidden p-0 gap-0">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle>Share session</DialogTitle>
          <DialogDescription>Invite people by email. They sign in with that address and land right here.</DialogDescription>
        </DialogHeader>

        {/* Invite composer */}
        <div className="px-5 pb-4">
          <div className="flex min-w-0 items-center gap-1.5 rounded-lg border bg-background p-1.5 focus-within:ring-2 focus-within:ring-ring/40">
            <Mail className="ml-1.5 size-4 shrink-0 text-muted-foreground" />
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
              type="email"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              onKeyDown={(e) => e.key === "Enter" && email && invite()}
            />
            <RolePicker value={role} onChange={setRole} />
            <Button size="sm" className="h-7" onClick={invite} disabled={busy || !email.trim()}>{busy ? <Loader2 className="size-4 animate-spin" /> : "Invite"}</Button>
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">{ROLE_HINT[role]}. Links expire in 7 days.</p>
          {lastLink && (
            <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
              <div className="flex items-center gap-2 text-sm"><Check className="size-4 text-emerald-500" /> Invite link ready for <span className="font-medium">{lastLink.email}</span></div>
              <div className="mt-2 flex min-w-0 items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-md bg-background px-2 py-1.5 text-[11px]" title={lastLink.url}>{lastLink.url}</code>
                <Button size="sm" variant="secondary" className="h-8 shrink-0" onClick={() => { navigator.clipboard.writeText(lastLink.url); toast.success("Copied"); }}><Copy className="size-3.5" /> Copy</Button>
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">Send this to them however you like. It only works for that email.</p>
            </div>
          )}
        </div>

        {/* People */}
        <div className="border-t bg-muted/30 px-5 py-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">People</div>
            <div className="text-[11px] text-muted-foreground">{members.length} member{members.length === 1 ? "" : "s"}{invites.length ? ` · ${invites.length} pending` : ""}</div>
          </div>
          <ul className="space-y-1">
            {members.map((m) => (
              <li key={m.userId} className="flex min-w-0 items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-background/60">
                <span className={cn("relative inline-flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white", colorFor(m.userId))}>
                  {initialsOf(m.name ?? m.email)}
                  {online.has(m.userId) && <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full bg-green-500 ring-2 ring-background" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{m.name ?? m.email ?? "Member"}{m.userId === meId && <span className="text-muted-foreground"> (you)</span>}</div>
                  {m.email && <div className="truncate text-[11px] text-muted-foreground">{m.email}</div>}
                </div>
                {m.role === "owner" ? <Badge variant="secondary">Owner</Badge> : (
                  <>
                    <RolePicker value={m.role} onChange={(r) => setMemberRole(m.userId, r)} />
                    <Button size="icon" variant="ghost" className="size-7 text-muted-foreground hover:text-destructive" onClick={() => remove({ userId: m.userId })} aria-label="Remove"><Trash2 className="size-3.5" /></Button>
                  </>
                )}
              </li>
            ))}
            {invites.map((i) => (
              <li key={i.email} className="flex min-w-0 items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-background/60">
                <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-dashed text-muted-foreground"><Mail className="size-3.5" /></span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{i.email}</div>
                  <div className="text-[11px] text-muted-foreground">Invited as {ROLE_LABEL[i.role].toLowerCase()} · not joined yet</div>
                </div>
                <Badge variant="outline" className="text-muted-foreground">Pending</Badge>
                <Button size="icon" variant="ghost" className="size-7 text-muted-foreground hover:text-destructive" onClick={() => remove({ email: i.email })} aria-label="Revoke invite"><Trash2 className="size-3.5" /></Button>
              </li>
            ))}
            {members.length === 0 && invites.length === 0 && <li className="px-2 py-3 text-xs text-muted-foreground">Loading…</li>}
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}
