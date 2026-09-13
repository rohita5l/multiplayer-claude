// Builds packages/agent-server and copies the single-file bundle into apps/web/agent-dist.
import { execSync } from "node:child_process";
import { mkdirSync, copyFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const webDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(webDir, "..", "..");
const src = resolve(root, "packages/agent-server/dist/agent-server.mjs");
try {
  execSync("pnpm --filter agent-server build", { cwd: root, stdio: "inherit" });
} catch (e) {
  if (!existsSync(src)) throw e;
}
mkdirSync(resolve(webDir, "agent-dist"), { recursive: true });
copyFileSync(src, resolve(webDir, "agent-dist/agent-server.mjs"));
console.log("agent bundle copied to agent-dist/");
