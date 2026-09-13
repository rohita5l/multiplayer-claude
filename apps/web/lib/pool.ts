/**
 * Warm sandbox pool: keeps one pre-booted sandbox (from the snapshot) ready so that
 * "New session" only has to start the agent server (~1 s) instead of restoring a snapshot (~10 s).
 */
import { randomBytes } from "node:crypto";
import { Sandbox } from "@vercel/sandbox";
import { createAdminClient } from "./supabase/admin";
import { createSessionSandbox, deleteSessionSandbox } from "./sandbox";
import { env } from "./env";

const POOL_SIZE = 1;

/** Claim a ready sandbox name from the pool, or null if none. */
export async function claimWarmSandbox(): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin.from("sandbox_pool").select("name").eq("status", "ready").order("created_at").limit(1);
  const name = data?.[0]?.name;
  if (!name) return null;
  const { data: deleted } = await admin.from("sandbox_pool").delete().eq("name", name).select("name");
  if (!deleted?.length) return null; // someone else claimed it
  try {
    await Sandbox.get({ name }); // make sure it still exists
    return name;
  } catch {
    return null;
  }
}

/** Ensure POOL_SIZE sandboxes are booting/ready. Safe to call often; cheap when the pool is full. */
export async function prewarm(): Promise<void> {
  if (!env.snapshotId()) return;
  await trimPool();
  const admin = createAdminClient();
  // Atomic reservation (advisory lock in Postgres): returns null when the pool is already full/booting.
  const name = `mpc-pool-${randomBytes(4).toString("hex")}`;
  const { data: reserved, error } = await admin.rpc("reserve_pool_slot", { p_name: name, p_size: POOL_SIZE });
  if (error || !reserved) return;
  try {
    const t = Date.now();
    await createSessionSandbox(name, env.demoRepo()); // boots + mkdir (blocks until the VM is up)
    await admin.from("sandbox_pool").update({ status: "ready" }).eq("name", name);
    console.log(`prewarm: ${name} ready in ${Date.now() - t} ms`);
  } catch (e) {
    console.error("prewarm failed", e);
    await admin.from("sandbox_pool").delete().eq("name", name);
  }
}

/** Remove surplus ready sandboxes beyond POOL_SIZE (cleanup for races). */
export async function trimPool(): Promise<void> {
  const admin = createAdminClient();
  const { data: rows } = await admin.from("sandbox_pool").select("name, status, created_at").eq("status", "ready").order("created_at");
  const extra = (rows ?? []).slice(POOL_SIZE);
  for (const r of extra) {
    await admin.from("sandbox_pool").delete().eq("name", r.name);
    await deleteSessionSandbox(r.name);
    console.log(`prewarm: trimmed surplus ${r.name}`);
  }
}
