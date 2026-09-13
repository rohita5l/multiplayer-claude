/**
 * Phase 0 spike: does a WebSocket server on an exposed Vercel Sandbox port work over wss://,
 * and is the public URL stable across stop -> resume?
 *
 * Run: pnpm spike   (needs VERCEL_OIDC_TOKEN in .env.local; `vercel env pull`)
 */
import { Sandbox } from "@vercel/sandbox";
import { readFileSync } from "node:fs";
import WebSocket from "ws";

// load .env.local manually (no dotenv dependency)
try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}

const NAME = "mpc-spike-ws";
const PORT = 3001;

const server = `
import http from "node:http";
import { WebSocketServer } from "ws";
const srv = http.createServer((req, res) => { res.writeHead(200, {"content-type":"application/json"}); res.end(JSON.stringify({ ok: true, boot: BOOT })); });
const BOOT = new Date().toISOString();
const wss = new WebSocketServer({ server: srv, path: "/ws" });
wss.on("connection", (ws, req) => { ws.send(JSON.stringify({ hello: "from-sandbox", url: req.url, boot: BOOT })); ws.on("message", (m) => ws.send("echo:" + m.toString())); });
srv.listen(${PORT}, () => console.log("listening", ${PORT}));
`;

async function startServer(sb: Sandbox) {
  await sb.writeFiles([{ path: "spike/server.mjs", content: Buffer.from(server) }]);
  const cmd = await sb.runCommand({ cmd: "node", args: ["spike/server.mjs"], cwd: "/vercel", detached: true });
  console.log("server cmdId", cmd.cmdId);
}

async function probe(url: string) {
  const health = await fetch(url + "/").then((r) => r.json()).catch((e) => ({ error: String(e) }));
  console.log("health", health);
  const wsUrl = url.replace(/^https:/, "wss:") + "/ws?ticket=abc";
  await new Promise<void>((resolve) => {
    const ws = new WebSocket(wsUrl);
    const t = setTimeout(() => { console.log("WS TIMEOUT"); ws.terminate(); resolve(); }, 15000);
    ws.on("open", () => { console.log("WS OPEN"); ws.send("ping"); });
    ws.on("message", (m) => { console.log("WS MSG", m.toString()); if (m.toString().startsWith("echo:")) { clearTimeout(t); ws.close(); resolve(); } });
    ws.on("error", (e) => { console.log("WS ERROR", e.message); clearTimeout(t); resolve(); });
  });
}

async function main() {
  try { const old = await Sandbox.get({ name: NAME, resume: false }); await old.delete(); console.log("deleted stale sandbox"); } catch (e) { console.log("no stale sandbox"); }
  console.time("create");
  const sb = await Sandbox.create({
    name: NAME,
    image: "vercel/sandbox/universal:latest",
    ports: [PORT],
    timeout: 10 * 60_000,
    persistent: true,
    keepLastSnapshots: { count: 1 },
  });
  console.timeEnd("create");
  const who = await sb.runCommand({ cmd: "bash", args: ["-lc", "id; pwd; node -v; which claude; npm ls -g --depth=0 2>/dev/null | head -8; df -h / | tail -1"] });
  console.log(await who.stdout());
  await sb.runCommand({ cmd: "bash", args: ["-lc", "mkdir -p spike && cd spike && npm init -y >/dev/null && npm i ws@8 >/dev/null 2>&1 && echo ws-installed"], cwd: "/vercel" }).then(async (c) => console.log(await c.stdout()));
  await startServer(sb);
  await new Promise((r) => setTimeout(r, 2500));
  const url1 = sb.domain(PORT);
  console.log("domain #1", url1);
  await probe(url1);

  console.log("stopping…");
  const stopped = await sb.stop();
  console.log("stop result", JSON.stringify(stopped).slice(0, 200));

  console.time("resume");
  const sb2 = await Sandbox.get({ name: NAME, onResume: async (s) => { console.log("onResume fired"); await startServer(s); } });
  console.timeEnd("resume");
  const url2 = sb2.domain(PORT);
  console.log("domain #2", url2, "same:", url1 === url2);
  await new Promise((r) => setTimeout(r, 2500));
  await probe(url2);

  const files = await sb2.runCommand({ cmd: "ls", args: ["-la", "spike"], cwd: "/vercel" });
  console.log("files after resume:\n" + (await files.stdout()));
  await sb2.stop();
  console.log("done");
}
main().catch((e) => { console.error("FAILED", e); process.exit(1); });
