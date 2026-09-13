import { handler, json, error, requireUser } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ id: string }> };

async function ownerOnly(id: string, userId: string) {
  const admin = createAdminClient();
  const { data: s } = await admin.from("sessions").select("owner_id").eq("id", id).single();
  if (!s || s.owner_id !== userId) throw new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: { "content-type": "application/json" } });
  return admin;
}

/** GET -> members + pending invites (owner only). */
export const GET = handler(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;
  const admin = await ownerOnly(id, user.id);
  const [{ data: members }, { data: invites }] = await Promise.all([
    admin.from("session_members").select("user_id, role, display_name, joined_at").eq("session_id", id).order("joined_at"),
    admin.from("session_invites").select("email, role, expires_at, uses, created_at").eq("session_id", id).gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }),
  ]);
  const ids = (members ?? []).map((m) => m.user_id);
  const { data: profiles } = ids.length ? await admin.from("profiles").select("id, email").in("id", ids) : { data: [] as { id: string; email: string | null }[] };
  const emailOf = new Map((profiles ?? []).map((p) => [p.id, p.email]));
  return json({
    members: (members ?? []).map((m) => ({ userId: m.user_id, role: m.role, name: m.display_name, email: emailOf.get(m.user_id) ?? null, joinedAt: m.joined_at })),
    invites: (invites ?? []).filter((i) => i.uses === 0),
  });
});

/** PATCH { userId, role } */
export const PATCH = handler(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;
  const admin = await ownerOnly(id, user.id);
  const { userId, role } = (await req.json()) as { userId: string; role: string };
  if (!userId || !["editor", "commenter"].includes(role)) return error("bad request");
  if (userId === user.id) return error("You can't change the owner's role.");
  const { error: e } = await admin.from("session_members").update({ role }).eq("session_id", id).eq("user_id", userId);
  if (e) return error(e.message, 500);
  return json({ ok: true });
});

/** DELETE { userId } or { email } (revokes a pending invite) */
export const DELETE = handler(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;
  const admin = await ownerOnly(id, user.id);
  const { userId, email } = (await req.json()) as { userId?: string; email?: string };
  if (userId) {
    if (userId === user.id) return error("You can't remove the owner.");
    await admin.from("session_members").delete().eq("session_id", id).eq("user_id", userId);
  } else if (email) {
    await admin.from("session_invites").delete().eq("session_id", id).eq("email", email.toLowerCase());
  } else return error("bad request");
  return json({ ok: true });
});
