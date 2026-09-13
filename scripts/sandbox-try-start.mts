import { Sandbox } from "@vercel/sandbox";
import { readFileSync } from "node:fs";
for (const f of [".env.local", "apps/web/.env.local"]) { try { for (const line of readFileSync(f, "utf8").split("\n")) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; } } catch {} }
const sb = await Sandbox.get({ name: process.argv[2]! });
const env = { SESSION_ID: "x", SESSION_SECRET: "y", REPO_DIR: "/vercel/work/repo", PORT: "3001", HOME: "/vercel" };
console.log("== foreground run (8s timeout)");
const fg = await sb.runCommand({ cmd: "bash", args: ["-lc", "cd /vercel/work/agent && timeout 8 node agent-server.mjs; echo exit=$?"], env });
console.log(await fg.output("both"));
console.log("== detached direct node");
const det = await sb.runCommand({ cmd: "node", args: ["agent-server.mjs"], cwd: "/vercel/work/agent", env, detached: true });
await new Promise((r) => setTimeout(r, 3000));
const url = sb.domain(3001);
try { const r = await fetch(url + "/health", { signal: AbortSignal.timeout(3000) }); console.log("health", r.status, await r.text()); } catch (e) { console.log("health failed", (e as Error).message); }
console.log("detached exitCode:", det.exitCode);
await det.kill().catch(() => {});
