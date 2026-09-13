import { handler, json, error, requireUser } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { deleteSessionSandbox } from "@/lib/sandbox";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handler(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;
  const body = (await req.json()) as { title?: string };
  const title = body.title?.trim();
  if (!title) return error("title required");
  const admin = createAdminClient();
  const { data: s } = await admin.from("sessions").select("owner_id").eq("id", id).single();
  if (!s || s.owner_id !== user.id) return error("not found", 404);
  await admin.from("sessions").update({ title: title.slice(0, 120) }).eq("id", id);
  return json({ ok: true });
});

export const DELETE = handler(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;
  const admin = createAdminClient();
  const { data: s } = await admin.from("sessions").select("owner_id, sandbox_name").eq("id", id).single();
  if (!s || s.owner_id !== user.id) return error("not found", 404);
  if (s.sandbox_name) await deleteSessionSandbox(s.sandbox_name);
  await admin.from("sessions").delete().eq("id", id);
  return json({ ok: true });
});
