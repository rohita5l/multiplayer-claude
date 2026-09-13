"use client";
import { useState } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Markdown } from "./Markdown";
import { CodeViewer, type CodeViewerProps } from "./CodeViewer";

export function MarkdownViewer(props: CodeViewerProps) {
  const [mode, setMode] = useState<"rendered" | "raw">("rendered");
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-end border-b px-2 py-1">
        <ToggleGroup value={[mode]} onValueChange={(v) => { const n = (v as string[])[0]; if (n) setMode(n as "rendered" | "raw"); }} size="sm" variant="outline">
          <ToggleGroupItem value="rendered" className="h-6 px-2 text-xs">Rendered</ToggleGroupItem>
          <ToggleGroupItem value="raw" className="h-6 px-2 text-xs">Raw</ToggleGroupItem>
        </ToggleGroup>
      </div>
      {mode === "rendered" ? (
        <div className="min-h-0 flex-1 overflow-auto p-4">
          <Markdown text={props.content} />
          {props.threads.length > 0 && <div className="mt-4 text-xs text-muted-foreground">{props.threads.length} comment thread(s) on this file — switch to Raw to see them inline.</div>}
        </div>
      ) : (
        <div className="min-h-0 flex-1"><CodeViewer {...props} /></div>
      )}
    </div>
  );
}
