/**
 * Control-plane wrapper around @vercel/sandbox: one persistent sandbox per session,
 * running the agent server from packages/agent-server.
 */
import { Sandbox, Snapshot } from "@vercel/sandbox";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { AGENT_PORT, SANDBOX_AGENT_DIR, SANDBOX_REPO_DIR, SANDBOX_WORK_DIR } from "@mpc/protocol";
import { env } from "./env";

const SESSION_TIMEOUT_MS = 45 * 60_000; // Hobby max

export interface StartEnv {
  sessionId: string;
  sessionSecret: string;
  anthropicApiKey: string;
  claudeSessionId?: string | null;
}

/** The bundled agent server; `scripts/copy-agent.mjs` (prebuild/predev) places it in apps/web/agent-dist. */
async function agentBundle(): Promise<Buffer> {
  try {
    return await readFile(path.join(process.cwd(), "agent-dist", "agent-server.mjs"));
  } catch {
    throw new Error("agent-server bundle not found; run `pnpm agent:build` (apps/web/scripts/copy-agent.mjs)");
  }
}

export async function createSessionSandbox(name: string, repoUrl: string): Promise<Sandbox> {
  const snapshotId = env.snapshotId();
  const sandbox = await Sandbox.create({
    name,
    source: snapshotId ? { type: "snapshot", snapshotId } : undefined,
    image: snapshotId ? undefined : "vercel/sandbox/universal:latest",
    ports: [AGENT_PORT],
    timeout: SESSION_TIMEOUT_MS,
    persistent: true,
    keepLastSnapshots: { count: 1, deleteEvicted: true }, // Hobby: 15 GB lifetime snapshot cap
    resources: { vcpus: 2 },
  } as Parameters<typeof Sandbox.create>[0]);

  // The SDK's default cwd is /vercel/sandbox; make sure it exists (writeFiles relies on it).
  await sandbox.runCommand({ cmd: "mkdir", args: ["-p", "/vercel/sandbox", SANDBOX_WORK_DIR], cwd: "/vercel" });

  if (!snapshotId) {
    // Cold path (no prebuilt snapshot): clone the repo + install the SDK. Slow (~minutes) but works.
    await sandbox.runCommand({
      cmd: "bash",
      args: ["-lc", `set -e; mkdir -p ${SANDBOX_WORK_DIR}; cd ${SANDBOX_WORK_DIR}; [ -d repo ] || git clone --depth 1 ${repoUrl} repo; mkdir -p agent && cd agent && [ -d node_modules/@anthropic-ai/claude-agent-sdk ] || (npm init -y >/dev/null && npm i @anthropic-ai/claude-agent-sdk >/dev/null 2>&1); echo ready`],
    });
  }
  return sandbox;
}

export async function getSessionSandbox(name: string): Promise<Sandbox> {
  return Sandbox.get({ name });
}

export function sandboxUrl(sandbox: Sandbox): string {
  return sandbox.domain(AGENT_PORT);
}

export async function healthy(url: string, timeoutMs = 2500): Promise<Record<string, unknown> | null> {
  try {
    const r = await fetch(`${url}/health`, { signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
    if (!r.ok) return null;
    return (await r.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Writes the latest bundle and starts the agent server (detached). Triggers resume if the sandbox is stopped. */
export async function startAgentServer(sandbox: Sandbox, start: StartEnv): Promise<void> {
  const bundle = await agentBundle();
  await sandbox.writeFiles([{ path: `${SANDBOX_AGENT_DIR}/agent-server.mjs`, content: bundle }]);
  // extend the session clock on every (re)start
  try { await sandbox.extendTimeout(SESSION_TIMEOUT_MS); } catch {}
  // stop any previous instance, then launch node directly as a detached command
  // (a backgrounded `bash … &` does not survive inside the sandbox; a detached node process does)
  await sandbox.runCommand({ cmd: "bash", args: ["-lc", "pkill -f agent-server.mjs || true"], cwd: "/vercel" });
  await sandbox.runCommand({
    cmd: "node",
    args: ["agent-server.mjs"],
    cwd: SANDBOX_AGENT_DIR,
    detached: true,
    env: {
      SESSION_ID: start.sessionId,
      SESSION_SECRET: start.sessionSecret,
      // `claude setup-token` tokens go in CLAUDE_CODE_OAUTH_TOKEN; API keys in ANTHROPIC_API_KEY
      ...(start.anthropicApiKey.startsWith("sk-ant-oat") ? { CLAUDE_CODE_OAUTH_TOKEN: start.anthropicApiKey } : { ANTHROPIC_API_KEY: start.anthropicApiKey }),
      REPO_DIR: SANDBOX_REPO_DIR,
      PORT: String(AGENT_PORT),
      CLAUDE_SESSION_ID: start.claudeSessionId ?? "",
      CONTROL_PLANE_URL: env.appUrl(),
      HOME: "/vercel",
      AGENT_LOG: `${SANDBOX_WORK_DIR}/agent.log`,
      CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1",
    },
  });
}

/** Ensure the sandbox is running with a healthy agent server; returns its public URL and health info. */
export async function ensureAgentServer(sandbox: Sandbox, start: StartEnv): Promise<{ url: string; health: Record<string, unknown> }> {
  const url = sandboxUrl(sandbox);
  const h = await healthy(url);
  if (h) return { url, health: h };
  await startAgentServer(sandbox, start);
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 250));
    const h2 = await healthy(url);
    if (h2) return { url, health: h2 };
  }
  throw new Error("agent server did not become healthy in 60s");
}

/** Stops + deletes a sandbox and the snapshot its stop produced (snapshots outlive sandboxes and count against storage). */
export async function deleteSessionSandbox(name: string) {
  try {
    const sb = await Sandbox.get({ name, resume: false });
    let snapshotId: string | undefined;
    try {
      const r = (await sb.stop()) as { snapshot?: { id?: string } } | undefined;
      snapshotId = r?.snapshot?.id;
    } catch {}
    await sb.delete();
    if (snapshotId) {
      try { const s = await Snapshot.get({ snapshotId } as never); await s.delete(); } catch {}
    }
  } catch {}
}
