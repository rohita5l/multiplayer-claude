// Deletes helper/stale sandboxes (spike, snapshot builders, and any names passed as args).
import { Sandbox } from "@vercel/sandbox";
import { readFileSync } from "node:fs";
for (const f of [".env.local", "apps/web/.env.local"]) { try { for (const line of readFileSync(f, "utf8").split("\n")) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; } } catch {} }
const list = await Sandbox.list({} as never);
const items = ((list as { sandboxes?: { name?: string }[] }).sandboxes ?? (list as unknown as { name?: string }[])).map((s) => s.name!).filter(Boolean);
const targets = items.filter((n) => n.includes("spike") || n.includes("snapshot-builder") || n.includes("timing") || process.argv.slice(2).includes(n));
for (const name of targets) {
  try { const sb = await Sandbox.get({ name, resume: false }); try { await sb.stop(); } catch {} await sb.delete(); console.log("deleted", name); } catch (e) { console.log("failed", name, (e as Error).message); }
}
console.log("remaining:", items.filter((n) => !targets.includes(n)).join(", ") || "(none)");
