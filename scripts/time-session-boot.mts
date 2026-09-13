// Measures each step of a session boot from the snapshot.
import { Sandbox } from "@vercel/sandbox";
import { readFileSync } from "node:fs";
for (const f of [".env.local", "apps/web/.env.local"]) { try { for (const line of readFileSync(f, "utf8").split("\n")) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; } } catch {} }
const t = (l: string, s: number) => console.log(`${l}: ${Date.now() - s} ms`);
const name = `mpc-timing-${Date.now()}`;
const t0 = Date.now();
let s = Date.now();
const sb = await Sandbox.create({ name, source: { type: "snapshot", snapshotId: process.env.SANDBOX_SNAPSHOT_ID! }, ports: [3001], timeout: 10 * 60_000, persistent: true, keepLastSnapshots: { count: 1 }, resources: { vcpus: 2 } } as Parameters<typeof Sandbox.create>[0]);
t("Sandbox.create(snapshot)", s);
s = Date.now(); await sb.runCommand({ cmd: "mkdir", args: ["-p", "/vercel/sandbox"], cwd: "/vercel" }); t("mkdir default cwd", s);
s = Date.now(); const bundle = readFileSync("packages/agent-server/dist/agent-server.mjs"); await sb.writeFiles([{ path: "/vercel/work/agent/agent-server.mjs", content: bundle }]); t("writeFiles(bundle)", s);
s = Date.now(); await sb.runCommand({ cmd: "node", args: ["agent-server.mjs"], cwd: "/vercel/work/agent", detached: true, env: { SESSION_ID: "x", SESSION_SECRET: "y", REPO_DIR: "/vercel/work/repo", PORT: "3001", HOME: "/vercel" } }); t("runCommand(start, detached)", s);
s = Date.now(); const url = sb.domain(3001); let ok = false; while (Date.now() - s < 60000) { try { const r = await fetch(url + "/health", { signal: AbortSignal.timeout(1500) }); if (r.ok) { ok = true; break; } } catch {} await new Promise((r) => setTimeout(r, 200)); } t(`health ok=${ok}`, s);
t("TOTAL", t0);
await sb.stop(); await sb.delete();
