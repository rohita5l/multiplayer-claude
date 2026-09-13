"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowDown, Eye, Loader2, ClipboardList } from "lucide-react";
import { canDrive } from "@mpc/protocol";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SessionSocketState, useSessionSocket } from "@/hooks/useSessionSocket";
import type { Comment } from "@/hooks/useComments";
import { MessageList } from "./MessageList";
import { Composer } from "./Composer";

export interface ChatPaneProps {
  state: SessionSocketState;
  actions: ReturnType<typeof useSessionSocket>["actions"];
  openComments: Comment[];
  onAddressComments: (text?: string) => void;
  onOpenFile: (path: string, line?: number) => void;
}

function Banner({ tone, children }: { tone: "amber" | "red"; children: React.ReactNode }) {
  return (
    <div className={cn("flex items-center gap-2 border-b px-3 py-1.5 text-xs", tone === "amber" ? "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200" : "border-red-200 bg-red-50 text-red-900 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200")}>
      {children}
    </div>
  );
}

export function ChatPane({ state, actions, openComments, onAddressComments, onOpenFile }: ChatPaneProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(true); // stuck to bottom
  const isOwner = state.you?.role === "owner";
  const items = state.transcript.items;
  const streaming = state.agentState === "running";

  useEffect(() => {
    const el = scrollRef.current;
    if (el && stuck) el.scrollTop = el.scrollHeight;
  }, [items, state.plan, state.summary, stuck]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setStuck(el.scrollHeight - el.scrollTop - el.clientHeight < 40);
  };
  const jump = () => { const el = scrollRef.current; if (el) { el.scrollTop = el.scrollHeight; setStuck(true); } };

  const booting = state.connection === "connecting" || state.connection === "booting";

  return (
    <div className="flex h-full min-h-0 flex-col">
      {state.connection === "reconnecting" && <Banner tone="amber"><Loader2 className="size-3 animate-spin" /> Reconnecting to the sandbox…</Banner>}
      {state.connection === "error" && <Banner tone="red">Connection failed: {state.connectionError ?? "unknown error"}. Retrying…</Banner>}
      {state.lastError && state.connection === "open" && <Banner tone="red">{state.lastError}</Banner>}

      <div className="relative min-h-0 flex-1">
        <div ref={scrollRef} onScroll={onScroll} className="h-full overflow-y-auto px-4 py-4">
          {booting ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> {state.connection === "booting" ? "Connecting to your sandbox…" : "Connecting…"}</div>
              <Skeleton className="h-4 w-2/3" /><Skeleton className="h-4 w-1/2" /><Skeleton className="h-20 w-full" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">
              {isOwner ? "Tell Claude what to build. Everyone in this session watches live." : (state.you && canDrive(state.you.role) ? "You can chat with Claude too, or click any line on the right to comment." : "Click any line on the right to leave a comment.")}
            </div>
          ) : (
            <MessageList items={items} onOpenFile={onOpenFile} />
          )}
          {!booting && (state.plan || state.summary) && (
            <div className="mt-4 space-y-3">
              {state.plan && state.mode === "plan" && (
                <div className="flex items-center gap-2 rounded-md border border-sky-500/30 bg-sky-500/5 px-3 py-2 text-sm">
                  <ClipboardList className="size-4 text-sky-500" />
                  <span>Plan is ready for review in the <b>Plan</b> tab{state.you?.role === "owner" ? " — approve it there to start building." : "."}</span>
                </div>
              )}
            </div>
          )}
          {streaming && !booting && (
            <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="size-3 animate-spin" /> Claude is working…</div>
          )}
        </div>
        {!stuck && (
          <Button size="sm" variant="secondary" onClick={jump} className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full shadow-md">
            <ArrowDown className="size-3.5" /> Jump to latest
          </Button>
        )}
      </div>

      {state.you && !canDrive(state.you.role) ? (
        <div className="border-t border-border bg-muted/40 p-3">
          <div className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
            <Eye className="size-3.5" /> You&apos;re a commenter — click any line on the right to comment. Ask the owner for editor access to chat with Claude.
          </div>
        </div>
      ) : (
        <Composer state={state} actions={actions} openCount={openComments.length} onAddressComments={onAddressComments} />
      )}
    </div>
  );
}
