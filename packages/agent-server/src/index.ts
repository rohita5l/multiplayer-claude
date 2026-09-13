/**
 * Agent server: runs inside a Vercel Sandbox, hosts one Claude Code session (Agent SDK),
 * and fans events out to every connected browser over WebSocket.
 *
 * Env: SESSION_ID, SESSION_SECRET, REPO_DIR, PORT (3001), CLAUDE_SESSION_ID (optional, resume),
 *      CONTROL_PLANE_URL (to report the Claude session id), ANTHROPIC_API_KEY (used by the SDK).
 */
import http from "node:http";
import { appendFile } from "node:fs/promises";
import { WebSocketServer, WebSocket } from "ws";
import { AGENT_PORT, WS_PATH, canDrive, parseClientMessage, type ServerMessage, type Ticket, type AgentEvent, type AgentState } from "@mpc/protocol";
import { verifyTicket } from "@mpc/protocol/ticket";
import { Repo } from "./files.js";
import { watchRepo } from "./watch.js";
import { AgentSession } from "./agent.js";

const SESSION_ID = process.env.SESSION_ID ?? "local";
const SECRET = process.env.SESSION_SECRET ?? "dev-secret";
const REPO_DIR = process.env.REPO_DIR ?? process.cwd();
const PORT = Number(process.env.PORT ?? AGENT_PORT);
const CONTROL_PLANE_URL = process.env.CONTROL_PLANE_URL;
const BOOT = Date.now();

const LOG_FILE = process.env.AGENT_LOG;
const log = (...a: unknown[]) => {
  const line = [new Date().toISOString(), ...a.map((x) => (typeof x === "string" ? x : JSON.stringify(x)))].join(" ");
  console.log(line);
  if (LOG_FILE) appendFile(LOG_FILE, line + "\n").catch(() => {});
};

const repo = new Repo(REPO_DIR);
await repo.captureBase();

type Client = { ws: WebSocket; ticket: Ticket };
const clients = new Set<Client>();

function send(ws: WebSocket, m: ServerMessage) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
}
function broadcast(m: ServerMessage) {
  const data = JSON.stringify(m);
  for (const c of clients) if (c.ws.readyState === WebSocket.OPEN) c.ws.send(data);
}

let diffTimer: NodeJS.Timeout | null = null;
async function pushDiff() {
  try {
    broadcast({ type: "diff", files: await repo.diff() });
  } catch (e) {
    log("diff failed", e);
  }
}
function scheduleDiff() {
  if (diffTimer) clearTimeout(diffTimer);
  diffTimer = setTimeout(() => void pushDiff(), 300);
}

function agentInfo() {
  return { state: agent.state, mode: agent.mode, claudeSessionId: agent.claudeSessionId, model: agent.model, effort: agent.effort };
}
let lastPlan: { text: string; at: number } | null = null;
let lastSummary: { text: string; at: number; costUsd?: number; numTurns?: number } | null = null;

const agent = new AgentSession(REPO_DIR, {
  broadcast: (event: AgentEvent) => broadcast({ type: "agent_event", event }),
  onState: (state: AgentState) => broadcast({ type: "state", ...agentInfo() }),
  onPlan: (text) => { lastPlan = { text, at: Date.now() }; broadcast({ type: "plan", ...lastPlan }); },
  onSummary: (s) => { lastSummary = { ...s, at: Date.now() }; broadcast({ type: "summary", ...lastSummary }); scheduleDiff(); },
  onToolDone: () => scheduleDiff(),
  onCommentsDone: (ids) => broadcast({ type: "comments_done", ids }),
  onSessionId: (id) => {
    log("claude session id", id);
    if (!CONTROL_PLANE_URL) return;
    fetch(`${CONTROL_PLANE_URL}/api/sessions/${SESSION_ID}/claude-session`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${SECRET}` },
      body: JSON.stringify({ claudeSessionId: id }),
    }).catch((e) => log("report session id failed", e));
  },
  log,
}, { resume: process.env.CLAUDE_SESSION_ID || null, mode: "bypassPermissions" });

await agent.loadHistory();
lastPlan = await agent.restorePlan();
agent.start();

watchRepo(REPO_DIR, (paths) => {
  broadcast({ type: "file_changed", paths });
  scheduleDiff();
});

const server = http.createServer((req, res) => {
  if (req.url?.startsWith("/health")) {
    // Details (incl. the Claude session id) only for the control plane, which knows the session secret.
    const authed = (req.headers.authorization ?? "") === `Bearer ${SECRET}`;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(authed ? { ok: true, sessionId: SESSION_ID, state: agent.state, claudeSessionId: agent.claudeSessionId, clients: clients.size, uptimeMs: Date.now() - BOOT } : { ok: true }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url ?? "/", "http://x");
  if (url.pathname !== WS_PATH) { socket.destroy(); return; }
  const ticket = verifyTicket(url.searchParams.get("ticket") ?? "", SECRET);
  if (!ticket || ticket.sessionId !== SESSION_ID) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, ticket));
});

wss.on("connection", async (ws: WebSocket, ticket: Ticket) => {
  const client: Client = { ws, ticket };
  clients.add(client);
  log(`connect ${ticket.name} (${ticket.role}); clients=${clients.size}`);

  ws.on("message", async (raw) => {
    const m = parseClientMessage(raw.toString());
    if (!m) return;
    const isOwner = ticket.role === "owner";
    try {
      switch (m.type) {
        case "ping": send(ws, { type: "pong" }); break;
        case "list_files": send(ws, { type: "file_tree", files: await repo.listFiles() }); break;
        case "get_file": {
          const f = await repo.readFile(m.path).catch(() => ({ content: null, binary: false }));
          send(ws, { type: "file", path: m.path, ...f });
          break;
        }
        case "get_diff": send(ws, { type: "diff", files: await repo.diff() }); break;
        case "user_message":
          if (!canDrive(ticket.role)) return send(ws, { type: "error", message: "Commenters can't message Claude. Ask the owner to make you an editor." });
          // Owners and editors talk to Claude; messages are attributed to the sender.
          await agent.send(m.text, { userId: ticket.userId, name: ticket.name, role: ticket.role }, { planFirst: Boolean(m.planFirst) });
          broadcast({ type: "state", ...agentInfo() });
          break;
        case "address_comments":
          if (!isOwner) return send(ws, { type: "error", message: "Only the session owner can do that." });
          agent.sendReviewComments(m.comments, { userId: ticket.userId, name: ticket.name, role: ticket.role }, m.text);
          break;
        case "interrupt":
          if (!isOwner) return;
          await agent.interrupt();
          break;
        case "set_mode":
          if (!isOwner) return;
          await agent.setMode(m.mode);
          broadcast({ type: "state", ...agentInfo() });
          break;
        case "approve_plan":
          if (!isOwner) return;
          await agent.approvePlan();
          broadcast({ type: "state", ...agentInfo() });
          break;
      }
    } catch (e) {
      send(ws, { type: "error", message: String((e as Error).message ?? e) });
    }
  });

  send(ws, { type: "hello", sessionId: SESSION_ID, claudeSessionId: agent.claudeSessionId, mode: agent.mode, state: agent.state, model: agent.model, effort: agent.effort, repoDir: REPO_DIR, you: { userId: ticket.userId, name: ticket.name, role: ticket.role } });
  send(ws, { type: "history", events: agent.history });
  if (lastPlan) send(ws, { type: "plan", ...lastPlan });
  if (lastSummary) send(ws, { type: "summary", ...lastSummary });
  try { send(ws, { type: "file_tree", files: await repo.listFiles() }); } catch (e) { log("list failed", e); }
  try { send(ws, { type: "diff", files: await repo.diff() }); } catch (e) { log("diff failed", e); }

  ws.on("close", () => {
    clients.delete(client);
    log(`disconnect ${ticket.name}; clients=${clients.size}`);
  });
});

server.listen(PORT, () => log(`agent-server listening on :${PORT} repo=${REPO_DIR} session=${SESSION_ID} resume=${process.env.CLAUDE_SESSION_ID || "-"}`));

process.on("SIGTERM", async () => { await agent.close(); process.exit(0); });
