"use client";
import { useState } from "react";
import { Bot, ChevronRight, ClipboardList, FileText, Globe, Loader2, Pencil, Search, Terminal, Wrench } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { ToolBlock } from "@/hooks/transcript";

const ICONS: Record<string, typeof Wrench> = {
  Read: FileText, Edit: Pencil, Write: Pencil, MultiEdit: Pencil, NotebookEdit: Pencil, Bash: Terminal,
  Grep: Search, Glob: Search, WebFetch: Globe, WebSearch: Globe, Task: Bot, Agent: Bot, ExitPlanMode: ClipboardList,
};

/** Make an absolute sandbox path relative to the repo root. */
export function repoRelative(p: string): string {
  const i = p.indexOf("/repo/");
  if (p.startsWith("/vercel/work/repo/")) return p.slice("/vercel/work/repo/".length);
  if (i >= 0) return p.slice(i + "/repo/".length);
  return p.replace(/^\/+/, "");
}

function str(v: unknown, max = 120): string {
  const s = typeof v === "string" ? v : v == null ? "" : JSON.stringify(v);
  return s.length > max ? s.slice(0, max) + "…" : s;
}

function summary(tool: ToolBlock): string {
  const i = tool.input ?? {};
  switch (tool.name) {
    case "Read": case "Edit": case "Write": case "MultiEdit": case "NotebookEdit":
      return typeof i.file_path === "string" ? repoRelative(i.file_path) : "";
    case "Bash": return str(i.command, 100);
    case "Grep": return str(i.pattern);
    case "Glob": return str(i.pattern);
    case "WebFetch": return str(i.url);
    case "WebSearch": return str(i.query);
    case "Task": case "Agent": return str(i.description ?? i.prompt, 80);
    case "ExitPlanMode": return "Plan ready for review";
    default: return str(Object.values(i)[0], 80);
  }
}

export function ToolCallCard({ tool, streaming, onOpenFile }: { tool: ToolBlock; streaming: boolean; onOpenFile: (path: string, line?: number) => void }) {
  const [open, setOpen] = useState(false);
  const Icon = ICONS[tool.name] ?? Wrench;
  const pending = !tool.result && streaming;
  const status = tool.result ? (tool.result.isError ? "error" : "ok") : pending ? "pending" : "idle";
  const filePath = typeof tool.input?.file_path === "string" ? repoRelative(tool.input.file_path) : null;
  const isEdit = tool.name === "Edit" && typeof tool.input?.old_string === "string";

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-md border border-border bg-card text-xs">
      <CollapsibleTrigger className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-muted/60">
        <ChevronRight className={cn("size-3 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
        <Icon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="font-medium">{tool.name}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-muted-foreground">{summary(tool)}</span>
        {status === "pending" ? (
          <Loader2 className="size-3 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <span className={cn("size-1.5 shrink-0 rounded-full", status === "ok" && "bg-emerald-500", status === "error" && "bg-red-500", status === "idle" && "bg-muted-foreground/40")} />
        )}
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-2 border-t border-border px-2 py-2">
        {filePath && (
          <button type="button" onClick={() => onOpenFile(filePath)} className="font-mono text-primary underline underline-offset-2 hover:opacity-80">
            {filePath}
          </button>
        )}
        {isEdit ? (
          <div className="grid gap-1">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Before</div>
            <pre className="max-h-40 overflow-auto rounded border border-red-200 bg-red-50 p-1.5 font-mono whitespace-pre-wrap dark:border-red-900/50 dark:bg-red-950/30">{String(tool.input.old_string)}</pre>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">After</div>
            <pre className="max-h-40 overflow-auto rounded border border-emerald-200 bg-emerald-50 p-1.5 font-mono whitespace-pre-wrap dark:border-emerald-900/50 dark:bg-emerald-950/30">{String(tool.input.new_string ?? "")}</pre>
          </div>
        ) : (
          <pre className="max-h-40 overflow-auto rounded bg-muted/60 p-1.5 font-mono whitespace-pre-wrap">{tool.partialInput && !Object.keys(tool.input).length ? tool.partialInput : JSON.stringify(tool.input, null, 2)}</pre>
        )}
        {tool.result && (
          <div>
            <div className={cn("text-[10px] uppercase tracking-wide", tool.result.isError ? "text-red-600" : "text-muted-foreground")}>{tool.result.isError ? "Error" : "Result"}</div>
            <pre className="max-h-56 overflow-auto rounded bg-muted/60 p-1.5 font-mono whitespace-pre-wrap">{tool.result.content || "(empty)"}</pre>
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
