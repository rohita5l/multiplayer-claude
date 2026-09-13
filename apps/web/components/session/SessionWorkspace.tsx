"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useSessionSocket } from "@/hooks/useSessionSocket";
import { useComments } from "@/hooks/useComments";
import { usePresenceMap, useTrackPresence, initialsOf } from "@/hooks/usePresence";
import { SessionHeader } from "./SessionHeader";
import { ChatPane } from "./chat";
import { Workspace } from "./workspace";
import { TooltipProvider } from "@/components/ui/tooltip";

export function SessionWorkspace({ session, me }: { session: { id: string; title: string; repoUrl: string; ownerId: string }; me: { id: string; name: string; role: "owner" | "editor" | "commenter" } }) {
  const { state, actions } = useSessionSocket(session.id);
  const comments = useComments(session.id);
  const isOwner = me.role === "owner";
  const presenceMe = useMemo(() => ({ userId: me.id, name: me.name, initials: initialsOf(me.name), role: me.role }), [me.id, me.name, me.role]);
  useTrackPresence(session.id, presenceMe);
  const presence = usePresenceMap([session.id]);
  const present = presence[session.id] ?? [];

  // When Claude finishes addressing comments, the owner's client marks them resolved.
  useEffect(() => {
    if (!state.commentsDone || !isOwner) return;
    void comments.setStatus(state.commentsDone.ids, "resolved");
    toast.success(`Resolved ${state.commentsDone.ids.length} comment${state.commentsDone.ids.length === 1 ? "" : "s"}`);
  }, [state.commentsDone]); // eslint-disable-line react-hooks/exhaustive-deps

  const [openFile, setOpenFile] = useState<{ path: string; line?: number; nonce: number } | null>(null);
  const onOpenFile = useCallback((path: string, line?: number) => setOpenFile({ path, line, nonce: Date.now() }), []);

  const addressComments = useCallback((ids?: string[], text?: string) => {
    const targets = (ids ? comments.open.filter((c) => ids.includes(c.id)) : comments.open);
    if (!targets.length) return;
    actions.addressComments(targets.map((c) => ({ id: c.id, filePath: c.file_path, lineStart: c.line_start, lineEnd: c.line_end, body: c.body, authorName: c.author_name ?? "Reviewer" })), text);
    void comments.setStatus(targets.map((c) => c.id), "addressed");
    toast.message(`Asked Claude to address ${targets.length} comment${targets.length === 1 ? "" : "s"}`);
  }, [actions, comments]);

  return (
    <TooltipProvider delay={200}>
      <div className="h-full flex flex-col min-h-0">
        <SessionHeader session={session} isOwner={isOwner} connection={state.connection} agentState={state.agentState} present={present} />
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(360px,42%)_1fr]">
          <div className="min-h-0 border-r flex flex-col">
            <ChatPane state={state} actions={actions} openComments={comments.open} onAddressComments={(text) => addressComments(undefined, text)} onOpenFile={onOpenFile} />
          </div>
          <div className="min-h-0 flex flex-col">
            <Workspace state={state} actions={actions} comments={comments} canComment={state.connection === "open"} isOwner={isOwner} openFile={openFile} onAddressComments={(ids) => addressComments(ids)} />
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
