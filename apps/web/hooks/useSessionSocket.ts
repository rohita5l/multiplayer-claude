"use client";
import { useCallback, useEffect, useReducer, useRef } from "react";
import type { AgentState, ClientMessage, DiffFile, Effort, FileEntry, PermissionMode, ReviewComment, Role, ServerMessage } from "@mpc/protocol";
import { emptyTranscript, reduceTranscript, type TranscriptState } from "./transcript";

export type ConnectionState = "connecting" | "booting" | "open" | "reconnecting" | "closed" | "error";

export interface SessionSocketState {
  connection: ConnectionState;
  connectionError: string | null;
  you: { userId: string; name: string; role: Role } | null;
  agentState: AgentState;
  mode: PermissionMode;
  model: string;
  effort: Effort;
  claudeSessionId: string | null;
  transcript: TranscriptState;
  files: FileEntry[];
  diff: DiffFile[];
  fileContents: Record<string, { content: string | null; binary?: boolean; at: number }>;
  changedPaths: Set<string>;
  plan: { text: string; at: number } | null;
  summary: { text: string; at: number; costUsd?: number; numTurns?: number } | null;
  lastError: string | null;
  commentsDone: { ids: string[]; at: number } | null;
  seen: Set<string>; // event uuids already applied (guards against duplicate delivery)
}

type Action = { type: "conn"; state: ConnectionState; error?: string | null } | { type: "server"; msg: ServerMessage } | { type: "reset" };

const initial: SessionSocketState = {
  connection: "connecting", connectionError: null, you: null, agentState: "starting", mode: "bypassPermissions", model: "claude-sonnet-5", effort: "medium", claudeSessionId: null,
  transcript: emptyTranscript, files: [], diff: [], fileContents: {}, changedPaths: new Set(), plan: null, summary: null, lastError: null, commentsDone: null, seen: new Set(),
};

function reducer(s: SessionSocketState, a: Action): SessionSocketState {
  switch (a.type) {
    case "conn": return { ...s, connection: a.state, connectionError: a.error ?? (a.state === "open" ? null : s.connectionError) };
    case "reset": return { ...initial, connection: s.connection };
    case "server": {
      const m = a.msg;
      switch (m.type) {
        case "hello": return { ...s, you: m.you, agentState: m.state, mode: m.mode, model: m.model, effort: m.effort, claudeSessionId: m.claudeSessionId, transcript: emptyTranscript, seen: new Set() };
        case "history": {
          const seen = new Set<string>();
          for (const e of m.events) if (typeof e.uuid === "string") seen.add(e.uuid);
          return { ...s, transcript: m.events.reduce(reduceTranscript, emptyTranscript), seen };
        }
        case "agent_event": {
          const id = typeof m.event.uuid === "string" && m.event.type !== "stream_event" ? m.event.uuid : null;
          if (id && s.seen.has(id)) return s;
          const seen = id ? new Set(s.seen).add(id) : s.seen;
          return { ...s, transcript: reduceTranscript(s.transcript, m.event), seen };
        }
        case "state": return { ...s, agentState: m.state, mode: m.mode, model: m.model, effort: m.effort, claudeSessionId: m.claudeSessionId };
        case "file_tree": return { ...s, files: m.files };
        case "file": return { ...s, fileContents: { ...s.fileContents, [m.path]: { content: m.content, binary: m.binary, at: Date.now() } } };
        case "file_changed": {
          const changed = new Set(s.changedPaths); m.paths.forEach((p) => changed.add(p));
          const fileContents = { ...s.fileContents }; m.paths.forEach((p) => delete fileContents[p]);
          return { ...s, changedPaths: changed, fileContents };
        }
        case "diff": return { ...s, diff: m.files };
        case "plan": return { ...s, plan: { text: m.text, at: m.at } };
        case "summary": return { ...s, summary: { text: m.text, at: m.at, costUsd: m.costUsd, numTurns: m.numTurns } };
        case "comments_done": return { ...s, commentsDone: { ids: m.ids, at: Date.now() } };
        case "error": return { ...s, lastError: m.message };
        default: return s;
      }
    }
  }
}

export function useSessionSocket(sessionId: string) {
  const [state, dispatch] = useReducer(reducer, initial);
  const wsRef = useRef<WebSocket | null>(null);
  const closedRef = useRef(false);
  const attemptRef = useRef(0);

  const send = useCallback((m: ClientMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
  }, []);

  useEffect(() => {
    closedRef.current = false;
    let alive = true; // false once this effect instance is cleaned up (StrictMode double-invokes effects)
    let timer: ReturnType<typeof setTimeout> | null = null;

    const cacheKey = `mpc:conn:${sessionId}`;
    function readCache(): { wsUrl: string; ticket: string; exp: number } | null {
      try {
        const c = JSON.parse(sessionStorage.getItem(cacheKey) ?? "null");
        return c && typeof c.wsUrl === "string" && c.exp > Date.now() + 60_000 ? c : null;
      } catch { return null; }
    }
    function writeCache(info: { wsUrl: string; ticket: string }) {
      try { sessionStorage.setItem(cacheKey, JSON.stringify({ ...info, exp: Date.now() + 5 * 3600_000 })); } catch {}
    }

    async function fetchConnectInfo(): Promise<{ wsUrl: string; ticket: string }> {
      const r = await fetch(`/api/sessions/${sessionId}/connect`, { method: "POST" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `connect failed (${r.status})`);
      const info = (await r.json()) as { wsUrl: string; ticket: string };
      writeCache(info);
      return info;
    }

    function open(info: { wsUrl: string; ticket: string }, onFailBeforeOpen: () => void) {
      const ws = new WebSocket(`${info.wsUrl}?ticket=${encodeURIComponent(info.ticket)}`);
      wsRef.current = ws;
      let opened = false;
      ws.onopen = () => { opened = true; attemptRef.current = 0; dispatch({ type: "conn", state: "open" }); };
      ws.onmessage = (ev) => {
        try { dispatch({ type: "server", msg: JSON.parse(ev.data) as ServerMessage }); } catch {}
      };
      ws.onclose = () => {
        if (!alive) return;
        if (!opened) { onFailBeforeOpen(); return; }
        dispatch({ type: "conn", state: "reconnecting" });
        schedule();
      };
      ws.onerror = () => { /* onclose follows */ };
    }

    async function connect() {
      if (!alive) return;
      const first = attemptRef.current === 0;
      // Fast path: a cached ticket for this session -> connect straight to the sandbox, no control-plane round trip.
      const cached = first ? readCache() : null;
      if (cached) {
        dispatch({ type: "conn", state: "connecting" });
        open(cached, () => {
          // sandbox may have timed out (needs resume) or ticket rejected: fall back to the control plane
          try { sessionStorage.removeItem(cacheKey); } catch {}
          void connectViaControlPlane();
        });
        return;
      }
      await connectViaControlPlane();
    }

    async function connectViaControlPlane() {
      if (!alive) return;
      dispatch({ type: "conn", state: attemptRef.current === 0 ? "booting" : "reconnecting" });
      let info: { wsUrl: string; ticket: string };
      try {
        info = await fetchConnectInfo();
      } catch (e) {
        dispatch({ type: "conn", state: "error", error: (e as Error).message });
        schedule();
        return;
      }
      if (!alive) return;
      open(info, () => { dispatch({ type: "conn", state: "reconnecting" }); schedule(); });
    }
    function schedule() {
      if (!alive) return;
      attemptRef.current += 1;
      const delay = Math.min(15_000, 1000 * 2 ** Math.min(attemptRef.current, 4));
      timer = setTimeout(connect, delay);
    }
    void connect();
    const ping = setInterval(() => send({ type: "ping" }), 25_000);
    return () => {
      alive = false;
      closedRef.current = true;
      if (timer) clearTimeout(timer);
      clearInterval(ping);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [sessionId, send]);

  const actions = {
    sendMessage: (text: string, planFirst = false) => send({ type: "user_message", text, planFirst }),
    interrupt: () => send({ type: "interrupt" }),
    setMode: (mode: PermissionMode) => send({ type: "set_mode", mode }),
    setModel: (model: string) => send({ type: "set_model", model }),
    setEffort: (effort: Effort) => send({ type: "set_effort", effort }),
    approvePlan: () => send({ type: "approve_plan" }),
    getFile: (path: string) => send({ type: "get_file", path }),
    refreshFiles: () => send({ type: "list_files" }),
    refreshDiff: () => send({ type: "get_diff" }),
    addressComments: (comments: ReviewComment[], text?: string) => send({ type: "address_comments", comments, text }),
  };
  return { state, actions };
}
