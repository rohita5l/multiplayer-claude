"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, LogIn, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Info = { email: string | null; role: string; sessionTitle: string; expired: boolean };

export function JoinSession({ token, signedInAs }: { token: string; signedInAs: { email: string | null; name: string; isAnonymous: boolean } | null }) {
  const router = useRouter();
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const next = `/join/${token}`;

  useEffect(() => {
    fetch(`/api/invites/${token}`).then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error); setInfo(d); }).catch((e) => setError((e as Error).message));
  }, [token]);

  const matches = Boolean(signedInAs && !signedInAs.isAnonymous && info?.email && signedInAs.email?.toLowerCase() === info.email.toLowerCase());

  async function join() {
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/invites/redeem", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Could not join");
      router.replace(`/s/${d.sessionId}`);
    } catch (e) { setError((e as Error).message); setBusy(false); }
  }

  // Signed in with the right account: join immediately.
  useEffect(() => {
    if (!matches) return;
    const t = setTimeout(() => void join(), 0);
    return () => clearTimeout(t);
  }, [matches]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!info && !error) return <Card className="w-full max-w-sm"><CardContent className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Checking your invite…</CardContent></Card>;

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Users className="size-5" /> {info ? `Join “${info.sessionTitle}”` : "Invite"}</CardTitle>
        {info && (
          <CardDescription>
            You&apos;re invited as <Badge variant="secondary" className="capitalize">{info.role}</Badge>{info.email ? <> for <span className="font-mono">{info.email}</span></> : null}.
            {info.role === "editor" ? " You can chat with Claude and comment on code." : " You can comment on any line of code."}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {info?.expired && <p className="text-sm text-destructive">This invite has expired or was already used. Ask the owner for a new one.</p>}
        {info && !info.expired && (
          matches ? (
            <Button className="w-full" onClick={join} disabled={busy}>{busy ? <><Loader2 className="size-4 animate-spin" /> Joining…</> : "Join session"}</Button>
          ) : signedInAs && !signedInAs.isAnonymous ? (
            <div className="space-y-2 text-sm">
              <p className="text-muted-foreground">You&apos;re signed in as <span className="font-mono">{signedInAs.email}</span>, but this invite is for <span className="font-mono">{info.email}</span>.</p>
              <Button variant="outline" className="w-full" render={<Link href={`/login?next=${encodeURIComponent(next)}&email=${encodeURIComponent(info.email ?? "")}&switch=1`} />}><LogIn className="size-4" /> Sign in as {info.email}</Button>
            </div>
          ) : (
            <div className="space-y-2">
              <Button className="w-full" render={<Link href={`/login?next=${encodeURIComponent(next)}&email=${encodeURIComponent(info.email ?? "")}`} />}><LogIn className="size-4" /> Sign in as {info.email}</Button>
              <Button variant="outline" className="w-full" render={<Link href={`/signup?next=${encodeURIComponent(next)}&email=${encodeURIComponent(info.email ?? "")}`} />}><UserPlus className="size-4" /> Create an account</Button>
              <p className="text-xs text-muted-foreground text-center">Use the invited email so we can match you to this invite.</p>
            </div>
          )
        )}
      </CardContent>
    </Card>
  );
}
