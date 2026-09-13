/**
 * Keeps sandbox/snapshot usage bounded (Hobby: 15 GB lifetime snapshot storage, ~1.3 GB per snapshot).
 * Sessions idle for longer than IDLE_MS lose their sandbox (and its snapshot) except the KEEP_RECENT
 * most recently active ones. An archived session gets a fresh sandbox the next time it is opened.
 */
import { createAdminClient } from "./supabase/admin";
import { deleteSessionSandbox } from "./sandbox";

const IDLE_MS = 90 * 60_000;
const KEEP_RECENT = 3;

export async function reapIdleSessions(): Promise<void> {
  const admin = createAdminClient();
  const { data: rows } = await admin
    .from("sessions")
    .select("id, sandbox_name, last_active_at, status")
    .not("sandbox_name", "is", null)
    .order("last_active_at", { ascending: false });
  const candidates = (rows ?? []).slice(KEEP_RECENT).filter((r) => Date.now() - new Date(r.last_active_at).getTime() > IDLE_MS);
  for (const r of candidates) {
    try {
      await deleteSessionSandbox(r.sandbox_name!);
      await admin.from("sessions").update({ sandbox_name: null, ws_url: null, status: "archived" }).eq("id", r.id);
      console.log(`reaper: archived session ${r.id} (${r.sandbox_name})`);
    } catch (e) {
      console.error("reaper failed", r.id, e);
    }
  }
}
