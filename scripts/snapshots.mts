// Lists snapshots and (with --prune) deletes those not needed: keeps the base SANDBOX_SNAPSHOT_ID and the latest snapshot of every existing sandbox.
import { Sandbox, Snapshot } from "@vercel/sandbox";
import { readFileSync } from "node:fs";
for (const f of [".env.local", "apps/web/.env.local"]) { try { for (const line of readFileSync(f, "utf8").split("\n")) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; } } catch {} }
const base = process.env.SANDBOX_SNAPSHOT_ID;
const snapsRaw = await Snapshot.list({} as never);
const snaps = ((snapsRaw as { snapshots?: unknown[] }).snapshots ?? (snapsRaw as unknown[])) as Record<string, unknown>[];
const sbRaw = await Sandbox.list({} as never);
const sandboxes = ((sbRaw as { sandboxes?: unknown[] }).sandboxes ?? (sbRaw as unknown[])) as Record<string, unknown>[];
const sandboxIds = new Set(sandboxes.map((s) => String(s.id ?? s.sandboxId ?? "")));
const sandboxNames = new Set(sandboxes.map((s) => String(s.name ?? "")));
console.log("sandboxes:", sandboxes.map((s) => `${s.name}:${s.status}`).join(", "));
let total = 0;
const toDelete: string[] = [];
for (const s of snaps) {
  const id = String(s.id ?? s.snapshotId);
  const size = Number(s.sizeBytes ?? 0); total += size;
  const owner = String(s.sandboxId ?? s.sandboxName ?? s.sourceSandboxId ?? "");
  const keep = id === base || (process.argv.includes("--keep-auto") && (sandboxIds.has(owner) || sandboxNames.has(owner)));
  console.log(`${keep ? "KEEP  " : "DELETE"} ${id} ${(size / 1e9).toFixed(2)} GB status=${s.status} owner=${owner || "-"} created=${s.createdAt ?? ""}`);
  if (!keep) toDelete.push(id);
}
console.log(`total ${(total / 1e9).toFixed(2)} GB across ${snaps.length} snapshots; ${toDelete.length} deletable`);
if (process.argv.includes("--prune")) {
  for (const id of toDelete) { try { const s = await Snapshot.get({ snapshotId: id } as never); await s.delete(); console.log("deleted", id); } catch (e) { console.log("failed", id, (e as Error).message); } }
}
if (process.argv.includes("--raw")) console.log(JSON.stringify(snaps[0], null, 2));
