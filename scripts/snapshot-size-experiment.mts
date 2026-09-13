// Does snapshot size drive first-command latency? Build a slim snapshot (repo + SDK, no repo deps) and time boot.
import { Sandbox } from "@vercel/sandbox";
import { readFileSync } from "node:fs";
for (const f of [".env.local", "apps/web/.env.local"]) { try { for (const line of readFileSync(f, "utf8").split("\n")) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; } } catch {} }
const t = (l: string, s: number) => console.log(`${l}: ${Date.now() - s} ms`);
async function timeBoot(label: string, snapshotId: string) {
  const name = `mpc-timing-${Date.now()}`;
  let s = Date.now();
  const sb = await Sandbox.create({ name, source: { type: "snapshot", snapshotId }, ports: [3001], timeout: 5 * 60_000, persistent: false } as never);
  t(`${label} create`, s);
  s = Date.now(); await sb.runCommand({ cmd: "true", cwd: "/vercel" }); t(`${label} first command`, s);
  s = Date.now(); await sb.runCommand({ cmd: "true", cwd: "/vercel" }); t(`${label} second command`, s);
  await sb.stop().catch(() => {});
}
console.log("== full snapshot (repo deps installed)");
await timeBoot("full", process.env.SANDBOX_SNAPSHOT_ID!);

console.log("== building slim snapshot (repo clone + agent sdk, no repo deps)");
const b = await Sandbox.create({ name: `mpc-snapshot-builder-${Date.now()}`, image: "vercel/sandbox/universal:latest", timeout: 15 * 60_000, persistent: false } as never);
const r = await b.runCommand({ cmd: "bash", args: ["-lc", "set -e; mkdir -p /vercel/sandbox /vercel/work && cd /vercel/work && git clone -q --depth 50 https://github.com/vercel/shop repo && mkdir agent && cd agent && npm init -y >/dev/null && npm i @anthropic-ai/claude-agent-sdk >/dev/null 2>&1 && du -sh /vercel/work/*"], cwd: "/vercel" });
console.log(await r.output("both"));
const snap = await b.snapshot();
console.log("slim snapshot", snap.snapshotId);
await timeBoot("slim", snap.snapshotId);
