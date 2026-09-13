"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FileCode2 } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { SessionSocketState, useSessionSocket } from "@/hooks/useSessionSocket";
import type { useComments } from "@/hooks/useComments";
import { FileTree } from "./FileTree";
import { CodeViewer } from "./CodeViewer";
import { MarkdownViewer } from "./MarkdownViewer";
import { DiffFileList, DiffViewer } from "./DiffViewer";
import { CommentsPanel } from "./CommentsPanel";
import { PlanTab, SummaryTab } from "./PlanSummary";
import { isMarkdown } from "./util";

export interface WorkspaceProps {
  state: SessionSocketState;
  actions: ReturnType<typeof useSessionSocket>["actions"];
  comments: ReturnType<typeof useComments>;
  canComment: boolean;
  isOwner: boolean;
  openFile: { path: string; line?: number; nonce: number } | null;
  onAddressComments: (ids: string[]) => void;
}

type Tab = "files" | "diff" | "plan" | "summary" | "comments";
const EMPTY: never[] = [];

export function Workspace({ state, actions, comments, canComment, isOwner, openFile, onAddressComments }: WorkspaceProps) {
  const [tab, setTab] = useState<Tab>("diff");
  const [selected, setSelected] = useState<string | null>(null);
  const [scrollTo, setScrollTo] = useState<{ line: number; nonce: number } | null>(null);
  const [selectedDiff, setSelectedDiff] = useState<string | null>(null);

  const open = useCallback((path: string, line?: number) => {
    setTab("files");
    setSelected(path);
    if (line) setScrollTo({ line, nonce: Date.now() });
  }, []);

  // a new plan arrived -> show it (derived-state pattern: adjust during render)
  const [seenPlanAt, setSeenPlanAt] = useState(0);
  if (state.plan && state.plan.at !== seenPlanAt) {
    setSeenPlanAt(state.plan.at);
    if (seenPlanAt !== 0 || tab === "diff") setTab("plan");
  }
  // external "open this file" requests (derived-state pattern: adjust during render)
  const [seenNonce, setSeenNonce] = useState(0);
  if (openFile && openFile.nonce !== seenNonce) {
    setSeenNonce(openFile.nonce);
    setTab("files");
    setSelected(openFile.path);
    if (openFile.line) setScrollTo({ line: openFile.line, nonce: openFile.nonce });
  }

  // fetch file content when selected / invalidated
  const cached = selected ? state.fileContents[selected] : undefined;
  useEffect(() => {
    if (selected && !cached) actions.getFile(selected);
  }, [selected, cached, actions]);

  // default diff selection (derived)
  const effectiveDiff = selectedDiff && state.diff.some((f) => f.path === selectedDiff) ? selectedDiff : state.diff[0]?.path ?? null;
  const diffFile = useMemo(() => state.diff.find((f) => f.path === effectiveDiff) ?? null, [state.diff, effectiveDiff]);
  const threadsFor = (path: string | null) => (path ? comments.byFile[path] ?? EMPTY : EMPTY);
  const openCount = comments.open.length;

  const viewerProps = selected && cached && cached.content != null
    ? { path: selected, content: cached.content, threads: threadsFor(selected), repliesOf: comments.repliesOf, canComment, isOwner, onAdd: comments.add, onSetStatus: comments.setStatus, scrollToLine: scrollTo }
    : null;

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="flex h-full min-h-0 flex-col gap-0">
      <div className="shrink-0 border-b px-2 py-1">
        <TabsList variant="line" className="h-8">
          <TabsTrigger value="diff">Diff{state.diff.length > 0 && <Badge variant="secondary" className="h-4 px-1 text-[10px]">{state.diff.length}</Badge>}</TabsTrigger>
          <TabsTrigger value="plan">Plan{state.plan && <span className="size-1.5 rounded-full bg-sky-500" />}</TabsTrigger>
          <TabsTrigger value="summary">Summary</TabsTrigger>
          <TabsTrigger value="comments">Comments{openCount > 0 && <Badge variant="secondary" className="h-4 px-1 text-[10px]">{openCount}</Badge>}</TabsTrigger>
          <TabsTrigger value="files">Files</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="files" className="min-h-0 flex-1">
        <div className="grid h-full min-h-0 grid-cols-[minmax(180px,240px)_1fr]">
          <div className="min-h-0 border-r"><FileTree files={state.files} diff={state.diff} selected={selected} onSelect={(p) => open(p)} /></div>
          <div className="flex min-h-0 flex-col">
            {selected && (
              <div className="flex shrink-0 items-center gap-2 border-b px-3 py-1 font-mono text-xs text-muted-foreground">
                <FileCode2 className="size-3.5" /> <span className="truncate text-foreground">{selected}</span>
                {threadsFor(selected).length > 0 && <Badge variant="outline" className="h-4 px-1 text-[10px]">{threadsFor(selected).length} threads</Badge>}
              </div>
            )}
            <div className="min-h-0 flex-1">
              {!selected ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Select a file to view it.</div>
              ) : !cached ? (
                <div className="space-y-2 p-4">{Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="h-3.5" style={{ width: `${40 + ((i * 37) % 55)}%` }} />)}</div>
              ) : cached.binary || cached.content == null ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Binary file — not shown.</div>
              ) : isMarkdown(selected) ? (
                <MarkdownViewer key={selected} {...viewerProps!} />
              ) : (
                <CodeViewer key={selected} {...viewerProps!} />
              )}
            </div>
          </div>
        </div>
      </TabsContent>

      <TabsContent value="diff" className="min-h-0 flex-1">
        <div className="grid h-full min-h-0 grid-cols-[minmax(180px,240px)_1fr]">
          <div className="min-h-0 border-r"><DiffFileList files={state.diff} selected={effectiveDiff} onSelect={setSelectedDiff} /></div>
          <div className="min-h-0">
            {diffFile ? (
              <DiffViewer key={diffFile.path} file={diffFile} threads={threadsFor(diffFile.path)} repliesOf={comments.repliesOf} canComment={canComment} isOwner={isOwner} onAdd={comments.add} onSetStatus={comments.setStatus} />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No changes yet — the diff appears as Claude edits files.</div>
            )}
          </div>
        </div>
      </TabsContent>

      <TabsContent value="plan" className="min-h-0 flex-1"><PlanTab plan={state.plan} awaitingApproval={state.mode === "plan"} isOwner={isOwner} running={state.agentState === "running"} onApprove={actions.approvePlan} /></TabsContent>
      <TabsContent value="summary" className="min-h-0 flex-1"><SummaryTab summary={state.summary} diff={state.diff} onOpenFile={(p) => open(p)} /></TabsContent>
      <TabsContent value="comments" className="min-h-0 flex-1">
        <CommentsPanel threads={comments.threads} repliesOf={comments.repliesOf} isOwner={isOwner} onOpen={open} onAddressAll={onAddressComments} onSetStatus={comments.setStatus} />
      </TabsContent>
    </Tabs>
  );
}
