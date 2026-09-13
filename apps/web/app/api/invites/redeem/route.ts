import { handler, json, error, requireUser } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/** POST { token } -> { sessionId }. Caller must be signed in with the invited email. */
export const POST = handler(async (req: Request) => {
  const user = await requireUser();
  if (user.isAnonymous) return error("Sign in with the invited email to join.", 403);
  const { token } = (await req.json()) as { token?: string };
  if (!token) return error("token required");
  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
  const supabase = await createClient();
  const { data, error: e } = await supabase.rpc("redeem_invite", { p_token: token, p_display_name: profile?.display_name ?? user.displayName ?? user.email ?? null, p_email: user.email });
  if (e) return error(e.message.replace(/^.*?: /, ""), 400);
  return json({ sessionId: data });
});
