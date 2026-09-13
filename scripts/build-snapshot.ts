/**
 * Builds the prebuilt sandbox snapshot every session starts from:
 *   universal image + demo repo cloned + deps installed + agent-server deps installed.
 * Run: pnpm snapshot:build   → prints SANDBOX_SNAPSHOT_ID to put in apps/web/.env.local and Vercel env.
 */
import { Sandbox } from "@vercel/sandbox";
import { readFileSync } from "node:fs";

for (const f of [".env.local", "apps/web/.env.local"]) {
  try {
    for (const line of readFileSync(f, "utf8").split("\n")) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {}
}

const REPO = process.env.DEMO_REPO_URL ?? "https://github.com/vercel/shop";
const NAME = `mpc-snapshot-builder-${Date.now()}`;
const WORK = "/vercel/work";

async function run(sb: Sandbox, script: string, label: string) {
  console.log(`\n== ${label}`);
  const cmd = await sb.runCommand({ cmd: "bash", args: ["-lc", `set -euo pipefail; ${script}`], cwd: "/vercel" });
  const out = await cmd.output("both");
  console.log(out.trim().split("\n").slice(-25).join("\n"));
  if (cmd.exitCode !== 0) throw new Error(`${label} failed with exit ${cmd.exitCode}`);
}

async function main() {
  console.log("creating builder sandbox…");
  const sb = await Sandbox.create({ name: NAME, image: "vercel/sandbox/universal:latest", timeout: 30 * 60_000, persistent: false, resources: { vcpus: 4 } } as Parameters<typeof Sandbox.create>[0]);
  try {
    await run(sb, `mkdir -p /vercel/sandbox ${WORK} && cd ${WORK} && rm -rf repo && git clone --depth 50 ${REPO} repo && cd repo && git log --oneline -1 && node -v && corepack --version || true`, "clone repo");
    await run(sb, `cd ${WORK}/repo && if [ -f pnpm-lock.yaml ]; then (corepack enable 2>/dev/null || true); (corepack pnpm --version || npm i -g pnpm) >/dev/null; corepack pnpm install --frozen-lockfile 2>&1 | tail -5 || pnpm install 2>&1 | tail -5; elif [ -f package-lock.json ]; then npm ci 2>&1 | tail -3; elif [ -f package.json ]; then npm install 2>&1 | tail -3; fi; echo deps-ok`, "install repo deps");
    await run(sb, `mkdir -p ${WORK}/agent && cd ${WORK}/agent && npm init -y >/dev/null && npm i @anthropic-ai/claude-agent-sdk@latest 2>&1 | tail -2 && node -e "import('@anthropic-ai/claude-agent-sdk').then(m=>console.log('sdk ok', Object.keys(m).length))"`, "install agent sdk");
    await run(sb, `cd ${WORK}/repo && git config user.email bot@multiplayer-claude.dev && git config user.name 'Multiplayer Claude' && git status --short | head -3; du -sh ${WORK}/repo ${WORK}/agent`, "finalize");
    console.log("\nsnapshotting…");
    const snap = await sb.snapshot();
    console.log(`\nSANDBOX_SNAPSHOT_ID=${snap.snapshotId}`);
  } catch (e) {
    console.error(e);
    try { await sb.stop(); } catch {}
    process.exit(1);
  }
}
main();
