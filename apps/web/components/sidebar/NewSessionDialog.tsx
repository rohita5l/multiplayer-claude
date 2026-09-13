"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** One click: creates a session on vercel/shop with a random readable name (rename later). */
export function NewSessionButton({ variant = "default", size = "default", className, hasKey = true }: { variant?: "default" | "outline" | "ghost" | "secondary"; size?: "default" | "sm" | "icon"; className?: string; hasKey?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function create() {
    if (busy) return;
    setBusy(true);
    const t = toast.loading("Starting a sandbox with Claude Code…");
    try {
      const r = await fetch("/api/sessions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) });
      const d = await r.json();
      if (!r.ok) {
        if (r.status === 412) { toast.error(d.error, { id: t }); router.push("/settings/claude"); return; }
        throw new Error(d.error ?? "Failed to create session");
      }
      toast.success("Session ready", { id: t });
      router.push(`/s/${d.id}`);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message, { id: t });
    } finally {
      setBusy(false);
    }
  }

  if (!hasKey) {
    return (
      <Tooltip>
        <TooltipTrigger render={<span className="inline-flex w-full" />}>
          <Button variant={variant} size={size} className={className} disabled aria-disabled>
            <Plus className="size-4" />{size !== "icon" && "New session"}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-56">
          <Link href="/settings/claude" className="underline">Connect your Claude Code token</Link> to start your own sessions. You can still join sessions shared with you.
        </TooltipContent>
      </Tooltip>
    );
  }
  return (
    <Button variant={variant} size={size} className={className} onClick={create} disabled={busy}>
      {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
      {size !== "icon" && (busy ? "Starting…" : "New session")}
    </Button>
  );
}
