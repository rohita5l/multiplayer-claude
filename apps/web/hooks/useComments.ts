"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export interface Comment {
  id: string;
  session_id: string;
  author_id: string;
  author_name: string | null;
  file_path: string;
  line_start: number;
  line_end: number;
  side: "new" | "old";
  body: string;
  status: "open" | "addressed" | "resolved";
  parent_id: string | null;
  created_at: string;
}

export interface NewComment {
  filePath: string;
  lineStart: number;
  lineEnd?: number;
  side?: "new" | "old";
  body: string;
  parentId?: string | null;
}

/** Comments for a session, kept live via Supabase Realtime (postgres_changes). */
export function useComments(sessionId: string) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`/api/sessions/${sessionId}/comments`, { cache: "no-store" });
      const d = await r.json();
      if (d.comments) setComments(d.comments);
    } catch {}
    setLoaded(true);
  }, [sessionId]);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    const initial = setTimeout(() => void refresh(), 0);
    // Fallbacks in case a realtime event is missed: refetch on focus and every 10s.
    const onFocus = () => { if (!cancelled) void refresh(); };
    window.addEventListener("focus", onFocus);
    const poll = setInterval(() => { if (!cancelled && document.visibilityState === "visible") void refresh(); }, 10_000);

    const channel = supabase
      .channel(`comments:${sessionId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "comments", filter: `session_id=eq.${sessionId}` }, (payload) => {
        setComments((prev) => {
          if (payload.eventType === "DELETE") return prev.filter((c) => c.id !== (payload.old as Comment).id);
          const row = payload.new as Comment;
          const i = prev.findIndex((c) => c.id === row.id);
          if (i === -1) return [...prev, row].sort((a, b) => a.created_at.localeCompare(b.created_at));
          const next = prev.slice(); next[i] = row; return next;
        });
      })
      .subscribe();
    return () => { cancelled = true; clearTimeout(initial); window.removeEventListener("focus", onFocus); clearInterval(poll); supabase.removeChannel(channel); };
  }, [sessionId, refresh]);

  const add = useCallback(async (input: NewComment) => {
    const r = await fetch(`/api/sessions/${sessionId}/comments`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error ?? "failed to comment");
    const c = d.comment as Comment;
    setComments((prev) => (prev.some((x) => x.id === c.id) ? prev : [...prev, c]));
    return c;
  }, [sessionId]);

  const setStatus = useCallback(async (ids: string[], status: Comment["status"]) => {
    setComments((prev) => prev.map((c) => (ids.includes(c.id) ? { ...c, status } : c)));
    await fetch(`/api/sessions/${sessionId}/comments`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids, status }) });
  }, [sessionId]);

  const threads = useMemo(() => comments.filter((c) => !c.parent_id), [comments]);
  const repliesOf = useCallback((id: string) => comments.filter((c) => c.parent_id === id), [comments]);
  const byFile = useMemo(() => {
    const m: Record<string, Comment[]> = {};
    for (const c of threads) (m[c.file_path] ??= []).push(c);
    return m;
  }, [threads]);
  const open = useMemo(() => threads.filter((c) => c.status === "open"), [threads]);

  return { comments, threads, byFile, open, repliesOf, add, setStatus, refresh, loaded };
}
