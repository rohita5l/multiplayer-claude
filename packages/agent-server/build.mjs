// Bundles the agent server into a single file that is written into the sandbox.
// The Agent SDK is kept external: it is installed inside the sandbox (it ships a native CLI binary).
import { build } from "esbuild";

await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  outfile: "dist/agent-server.mjs",
  external: ["@anthropic-ai/claude-agent-sdk"],
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
  sourcemap: false,
  logLevel: "info",
});
