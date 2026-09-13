import { handler, json, error } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ id: string }> };

/** Called by the agent server (bearer = session secret) to persist the Claude session id for resume. */
export const POST = handler(async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  const auth = req.headers.get("authorization") ?? "";
  const secret = auth.replace(/^Bearer\s+/i, "");
  const { claudeSessionId } = (await req.json()) as { claudeSessionId?: string };
  if (!secret || !claudeSessionId) return error("bad request");
  const admin = createAdminClient();
  const { data: s } = await admin.from("sessions").select("session_secret").eq("id", id).single();
  if (!s || s.session_secret !== secret) return error("unauthorized", 401);
  await admin.from("sessions").update({ claude_session_id: claudeSessionId, last_active_at: new Date().toISOString() }).eq("id", id);
  return json({ ok: true });
});
