"use client";
import { useState, type KeyboardEvent } from "react";
import { ArrowUp, ChevronDown, Cpu, Gauge, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ADDRESS_COMMENTS_RE, EFFORTS, MODELS, type Effort } from "@mpc/protocol";
import { Textarea } from "@/components/ui/textarea";
import type { SessionSocketState } from "@/hooks/useSessionSocket";
import type { useSessionSocket } from "@/hooks/useSessionSocket";

type Actions = ReturnType<typeof useSessionSocket>["actions"];

export function Composer({ state, actions, openCount, onAddressComments }: { state: SessionSocketState; actions: Actions; openCount: number; onAddressComments: (text?: string) => void }) {
  const [text, setText] = useState("");
  const isOwner = state.you?.role === "owner";
  const running = state.agentState === "running";
  const awaitingApproval = Boolean(state.plan) && state.mode === "plan";
  const connected = state.connection === "open";

  const submit = () => {
    const t = text.trim();
    if (!t || !connected) return;
    // "fix the comments" → attach the open review comments from Supabase to the request
    if (openCount > 0 && ADDRESS_COMMENTS_RE.test(t)) { onAddressComments(t); setText(""); return; }
    actions.sendMessage(t);
    setText("");
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
  };

  return (
    <div className="border-t border-border bg-background p-3">
      <div className="rounded-lg border border-border bg-card shadow-xs focus-within:ring-2 focus-within:ring-ring/40">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          placeholder={!connected ? "Connecting to your sandbox…" : awaitingApproval ? "Approve the plan above, or reply with changes…" : "Message Claude… (Enter to send, Shift+Enter for newline)"}
          disabled={!connected}
          rows={2}
          className="min-h-[56px] resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
        />
        <div className="flex items-center gap-1.5 px-2 pb-2">
          {isOwner ? (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs text-muted-foreground" disabled={!connected} />}>
              <Cpu className="size-3.5" /> {MODELS.find((m) => m.id === state.model)?.label ?? state.model} <ChevronDown className="size-3 opacity-60" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs">Model</DropdownMenuLabel>
              {MODELS.map((m) => (
                <DropdownMenuItem key={m.id} onClick={() => actions.setModel(m.id)} className={state.model === m.id ? "bg-accent" : undefined}>
                  <div className="flex flex-col"><span className="text-sm">{m.label}</span><span className="text-[11px] text-muted-foreground">{m.hint}</span></div>
                </DropdownMenuItem>
              ))}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs">Effort {running && <span className="font-normal text-muted-foreground">(available when idle)</span>}</DropdownMenuLabel>
              {EFFORTS.map((e) => (
                <DropdownMenuItem key={e} disabled={running} onClick={() => actions.setEffort(e as Effort)} className={state.effort === e ? "bg-accent" : undefined}>
                  <Gauge className="size-3.5" /> <span className="capitalize">{e}</span>
                </DropdownMenuItem>
              ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          ) : (
            <span className="text-[11px] text-muted-foreground">{MODELS.find((m) => m.id === state.model)?.label ?? state.model}</span>
          )}
          <span className="text-[11px] text-muted-foreground capitalize">{state.effort} effort</span>
          <div className="ml-auto flex items-center gap-1">
            {isOwner && running && (
              <Button size="sm" variant="outline" onClick={() => actions.interrupt()}><Square className="size-3" /> Stop</Button>
            )}
            <Button size="icon-sm" onClick={submit} disabled={!text.trim() || !connected} aria-label="Send"><ArrowUp className="size-4" /></Button>
          </div>
        </div>
      </div>
    </div>
  );
}
