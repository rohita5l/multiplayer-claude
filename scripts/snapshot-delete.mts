import { Snapshot } from "@vercel/sandbox";
import { readFileSync } from "node:fs";
for (const f of [".env.local", "apps/web/.env.local"]) { try { for (const line of readFileSync(f, "utf8").split("\n")) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; } } catch {} }
for (const id of process.argv.slice(2)) { try { const s = await Snapshot.get({ snapshotId: id } as never); await s.delete(); console.log("deleted", id); } catch (e) { console.log("failed", id, (e as Error).message); } }
