"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** One click: creates a session on vercel/shop with a random readable name (rename later). */
export function NewSessionButton({ variant = "default", size = "default", className }: { variant?: "default" | "outline" | "ghost" | "secondary"; size?: "default" | "sm" | "icon"; className?: string}) {
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

  return (
    <Button variant={variant} size={size} className={className} onClick={create} disabled={busy}>
      {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
      {size !== "icon" && (busy ? "Starting…" : "New session")}
    </Button>
  );
}
