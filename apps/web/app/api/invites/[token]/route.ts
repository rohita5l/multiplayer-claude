import { handler, json, error } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

/** GET -> { email, role, sessionTitle, expired } for the join page (token-gated, no auth needed). */
export const GET = handler(async (_req: Request, { params }: { params: Promise<{ token: string }> }) => {
  const { token } = await params;
  const admin = createAdminClient();
  const { data, error: e } = await admin.rpc("invite_info", { p_token: token });
  if (e) return error(e.message, 500);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return error("This invite link is invalid.", 404);
  return json({ email: row.email, role: row.role, sessionTitle: row.session_title, expired: row.expired });
});
