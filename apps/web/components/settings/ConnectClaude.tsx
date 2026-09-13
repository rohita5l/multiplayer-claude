"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Copy, KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const CMD = "claude setup-token";

export function ConnectClaude({ last4, validatedAt, welcome }: { last4: string | null; validatedAt: string | null; welcome: boolean }) {
  const router = useRouter();
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const connected = Boolean(last4);

  async function save() {
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/claude-key", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ apiKey: key }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Could not save token");
      toast.success("Claude connected.");
      setKey("");
      router.refresh();
      if (welcome) router.push("/");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    await fetch("/api/claude-key", { method: "DELETE" });
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2"><KeyRound className="size-5" /> Connect Claude Code</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {welcome ? "One last step. " : ""}Sessions you create run Claude Code as you. Reviewers you invite don&apos;t need this.
        </p>
      </div>

      {connected && (
        <Card className="border-green-600/30 bg-green-500/5">
          <CardContent className="flex items-center justify-between gap-4 py-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="size-5 text-green-600" />
              <div>
                <div className="font-medium text-sm">Connected · <span className="font-mono">…{last4}</span></div>
                <div className="text-xs text-muted-foreground">Validated {validatedAt ? new Date(validatedAt).toLocaleString() : ""}. Stored encrypted; only used inside your sandboxes.</div>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={disconnect} disabled={busy}>Disconnect</Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{connected ? "Replace your token" : "Two steps"}</CardTitle>
          <CardDescription>Uses your existing Claude subscription. Takes about 30 seconds.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <ol className="space-y-4 text-sm">
            <li className="flex gap-3"><Badge variant="secondary" className="rounded-full size-6 justify-center shrink-0">1</Badge>
              <div className="flex-1 min-w-0">In your terminal, run this and follow the browser prompt. It prints a long token.
                <div className="mt-2 flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 font-mono text-sm">
                  <span className="text-muted-foreground select-none">$</span><span className="flex-1">{CMD}</span>
                  <Button variant="ghost" size="icon" className="size-7" onClick={() => { navigator.clipboard.writeText(CMD); toast.success("Copied"); }} aria-label="Copy command"><Copy className="size-3.5" /></Button>
                </div>
              </div></li>
            <li className="flex gap-3"><Badge variant="secondary" className="rounded-full size-6 justify-center shrink-0">2</Badge>
              <div className="flex-1 min-w-0">Paste the token here. It starts with <span className="font-mono">sk-ant-oat01-</span>. We make one test call to confirm it works.
                <div className="mt-2 flex gap-2">
                  <Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="sk-ant-oat01-…" className="font-mono" type="password" autoComplete="off" onKeyDown={(e) => e.key === "Enter" && key && save()} />
                  <Button onClick={save} disabled={busy || !key.trim()}>{busy ? <><Loader2 className="size-4 animate-spin" /> Checking…</> : "Connect"}</Button>
                </div>
                {error && <p className="text-sm text-destructive mt-2">{error}</p>}
              </div></li>
          </ol>
          <p className="text-xs text-muted-foreground">
            Don&apos;t have Claude Code installed? <span className="font-mono">npm i -g @anthropic-ai/claude-code</span> first. An Anthropic API key (<span className="font-mono">sk-ant-api03-…</span>) from <a className="underline" href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">the console</a> works here too.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
