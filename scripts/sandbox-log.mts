// Prints the agent log of the most recent session sandbox (debug helper).
import { Sandbox } from "@vercel/sandbox";
import { readFileSync } from "node:fs";
for (const f of [".env.local", "apps/web/.env.local"]) { try { for (const line of readFileSync(f, "utf8").split("\n")) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; } } catch {} }
const list = await Sandbox.list({} as never);
const items = (list as { sandboxes?: { name?: string; status?: string; createdAt?: string | number }[] }).sandboxes ?? (list as unknown as { name?: string; status?: string }[]);
console.log("sandboxes:", items.map((s) => `${s.name}:${s.status}`).join(", "));
const target = process.argv[2] ?? items.filter((s) => s.name?.startsWith("mpc-") && !s.name.includes("spike")).map((s) => s.name!).pop();
if (!target) { console.log("no mpc sandbox"); process.exit(0); }
console.log("target:", target);
const sb = await Sandbox.get({ name: target });
for (const cmd of ["cat /vercel/work/agent.log 2>&1 | tail -40", "ls -la /vercel/work /vercel/work/agent | head -20", "ps aux | grep -c node", "node -v"]) {
  const r = await sb.runCommand({ cmd: "bash", args: ["-lc", cmd] });
  console.log(`\n$ ${cmd}\n${await r.output("both")}`);
}
