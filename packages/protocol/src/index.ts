/**
 * Shared wire protocol between the browser and the agent server running inside a sandbox.
 * Kept dependency-free so both sides can import it.
 */

export type Role = "owner" | "editor" | "commenter";
export const ROLE_LABEL: Record<Role, string> = { owner: "Owner", editor: "Editor", commenter: "Commenter" };
export const ROLE_HINT: Record<Role, string> = { owner: "Full control", editor: "Can chat with Claude and comment", commenter: "Can comment on code" };
export const canDrive = (r: Role) => r === "owner" || r === "editor";
/** "fix the comments", "address review comments", "resolve any comments"… */
export const ADDRESS_COMMENTS_RE = /\b(fix|address|resolve|handle|apply|go through|take care of|work through)\b[^.!?\n]{0,60}\b(comments?|feedback|review notes?|suggestions?)\b/i;
export type PermissionMode = "plan" | "acceptEdits" | "bypassPermissions";
export type AgentState = "starting" | "idle" | "running" | "error";
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";
export const MODELS: { id: string; label: string; hint: string }[] = [
  { id: "claude-sonnet-5", label: "Sonnet 5", hint: "fast, great for most changes" },
  { id: "claude-opus-5", label: "Opus 5", hint: "strongest reasoning" },
  { id: "claude-haiku-4-5", label: "Haiku 4.5", hint: "fastest, simple edits" },
];
export const EFFORTS: Effort[] = ["low", "medium", "high", "xhigh", "max"];

/** Signed by the control plane; verified by the agent server on WS upgrade. */
export interface Ticket {
  sessionId: string;
  userId: string;
  name: string;
  role: Role;
  exp: number; // unix seconds
}

export interface FileEntry {
  path: string;
  status?: "M" | "A" | "D" | "R" | "?";
}

export interface DiffFile {
  path: string;
  oldPath?: string;
  status: "M" | "A" | "D" | "R";
  additions: number;
  deletions: number;
  patch: string; // unified diff for this file
}

export interface ReviewComment {
  id: string;
  filePath: string;
  lineStart: number;
  lineEnd: number;
  body: string;
  authorName: string;
}

// ---------- client -> server ----------
export type ClientMessage =
  | { type: "user_message"; text: string; planFirst?: boolean }
  | { type: "interrupt" }
  | { type: "set_mode"; mode: PermissionMode }
  | { type: "set_model"; model: string }
  | { type: "set_effort"; effort: Effort }
  | { type: "approve_plan" }
  | { type: "list_files" }
  | { type: "get_file"; path: string }
  | { type: "get_diff" }
  | { type: "address_comments"; comments: ReviewComment[]; text?: string }
  | { type: "ping" };

// ---------- server -> client ----------
/** A raw Claude Agent SDK message. Typed loosely so the protocol package stays dependency-free. */
export interface AgentEvent {
  type: string;
  subtype?: string;
  session_id?: string;
  uuid?: string;
  [key: string]: unknown;
}

export type ServerMessage =
  | {
      type: "hello";
      sessionId: string;
      claudeSessionId: string | null;
      mode: PermissionMode;
      state: AgentState;
      model: string;
      effort: Effort;
      repoDir: string;
      you: { userId: string; name: string; role: Role };
    }
  | { type: "history"; events: AgentEvent[] }
  | { type: "agent_event"; event: AgentEvent }
  | { type: "state"; state: AgentState; mode: PermissionMode; claudeSessionId: string | null; model: string; effort: Effort }
  | { type: "file_tree"; files: FileEntry[] }
  | { type: "file"; path: string; content: string | null; binary?: boolean }
  | { type: "file_changed"; paths: string[] }
  | { type: "diff"; files: DiffFile[] }
  | { type: "plan"; text: string; at: number }
  | { type: "summary"; text: string; at: number; costUsd?: number; numTurns?: number }
  | { type: "comments_done"; ids: string[] } // Claude finished a turn that addressed these review comments
  | { type: "error"; message: string }
  | { type: "pong" };

export const AGENT_PORT = 3001;
export const WS_PATH = "/ws";
export const SANDBOX_WORK_DIR = "/vercel/work";
export const SANDBOX_REPO_DIR = "/vercel/work/repo";
export const SANDBOX_AGENT_DIR = "/vercel/work/agent";

export function parseClientMessage(raw: string): ClientMessage | null {
  try {
    const m = JSON.parse(raw);
    if (m && typeof m.type === "string") return m as ClientMessage;
  } catch {}
  return null;
}
