// Kills the agent server inside a sandbox so the next /connect restarts it with the latest bundle (and resumes the Claude session).
import { Sandbox } from "@vercel/sandbox";
import { readFileSync } from "node:fs";
for (const f of [".env.local", "apps/web/.env.local"]) { try { for (const line of readFileSync(f, "utf8").split("\n")) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; } } catch {} }
const sb = await Sandbox.get({ name: process.argv[2]! });
const r = await sb.runCommand({ cmd: "bash", args: ["-lc", "pkill -f agent-server.mjs && echo killed || echo none"], cwd: "/vercel" });
console.log((await r.output("both")).trim());
