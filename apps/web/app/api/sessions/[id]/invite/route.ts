import { createHash, randomBytes } from "node:crypto";
import { handler, json, error, requireUser } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";

type Ctx = { params: Promise<{ id: string }> };

/** POST { email, role } -> { url } invite link bound to that email, valid for 7 days. */
export const POST = handler(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;
  const admin = createAdminClient();
  const { data: s } = await admin.from("sessions").select("owner_id").eq("id", id).single();
  if (!s || s.owner_id !== user.id) return error("not found", 404);
  const body = (await req.json().catch(() => ({}))) as { email?: string; role?: string };
  const email = (body.email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return error("Enter a valid email address.");
  const role = body.role === "editor" ? "editor" : "commenter";
  const token = randomBytes(24).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const { error: e } = await admin.from("session_invites").insert({ token_hash: tokenHash, session_id: id, role, email, expires_at: new Date(Date.now() + 7 * 86400_000).toISOString() });
  if (e) return error(e.message, 500);
  return json({ url: `${env.appUrl()}/join/${token}`, email, role });
});
