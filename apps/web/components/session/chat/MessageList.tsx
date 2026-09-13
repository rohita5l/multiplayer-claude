"use client";
import { useState } from "react";
import { Brain, ChevronRight, User } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { Block, TranscriptItem } from "@/hooks/transcript";
import { Markdown } from "./Markdown";
import { ToolCallCard } from "./ToolCallCard";

function Thinking({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="text-xs text-muted-foreground">
      <CollapsibleTrigger className="flex items-center gap-1 hover:text-foreground">
        <ChevronRight className={cn("size-3 transition-transform", open && "rotate-90")} />
        <Brain className="size-3" /> Thinking…
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-1 whitespace-pre-wrap border-l-2 border-border pl-2 italic">{text || "(hidden)"}</CollapsibleContent>
    </Collapsible>
  );
}

function AssistantBlocks({ blocks, streaming, onOpenFile }: { blocks: Block[]; streaming: boolean; onOpenFile: (p: string, l?: number) => void }) {
  return (
    <div className="space-y-2">
      {blocks.map((b, i) => {
        const last = i === blocks.length - 1;
        if (b.type === "text") return (
          <div key={i} className="relative">
            <Markdown text={b.text} />
            {streaming && last && <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-foreground/70 align-middle" />}
          </div>
        );
        if (b.type === "tool_use") return <ToolCallCard key={b.id} tool={b} streaming={streaming} onOpenFile={onOpenFile} />;
        return <Thinking key={i} text={b.text} />;
      })}
      {streaming && blocks.length === 0 && <span className="inline-block h-3.5 w-1.5 animate-pulse bg-foreground/70" />}
    </div>
  );
}

export function MessageList({ items, onOpenFile }: { items: TranscriptItem[]; onOpenFile: (path: string, line?: number) => void }) {
  return (
    <div className="space-y-3">
      {items.map((it) => {
        switch (it.kind) {
          case "user":
            return it.synthetic ? (
              <div key={it.id} className="flex justify-center"><span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{it.text.slice(0, 120)}</span></div>
            ) : (
              <div key={it.id} className="flex justify-end">
                <div className="flex max-w-[85%] items-start gap-2">
                  <div className="flex flex-col items-end gap-0.5">
                    {it.from?.name && <span className="text-[11px] text-muted-foreground">{it.from.name}</span>}
                    <div className="rounded-2xl rounded-tr-sm bg-muted px-3 py-2 text-sm whitespace-pre-wrap">{it.text}</div>
                  </div>
                  <div className="mt-1 flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary"><User className="size-3.5" /></div>
                </div>
              </div>
            );
          case "assistant":
            return <div key={it.id} className="max-w-[95%]"><AssistantBlocks blocks={it.blocks} streaming={it.streaming} onOpenFile={onOpenFile} /></div>;
          case "result":
            return (
              <div key={it.id} className={cn("flex items-center gap-2 text-[11px]", it.isError ? "text-red-600" : "text-muted-foreground")}>
                <div className="h-px flex-1 bg-border" />
                <span>
                  {it.isError ? "Turn failed" : "Turn finished"}
                  {it.costUsd != null && ` · $${it.costUsd.toFixed(4)}`}
                  {it.numTurns != null && ` · ${it.numTurns} turn${it.numTurns === 1 ? "" : "s"}`}
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>
            );
          case "system":
            return <div key={it.id} className="text-center text-[11px] text-muted-foreground">{it.text}</div>;
        }
      })}
    </div>
  );
}
