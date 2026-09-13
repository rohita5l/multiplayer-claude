import { handler, json, error, requireUser } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler(async (_req: Request, { params }: Ctx) => {
  await requireUser();
  const { id } = await params;
  const supabase = await createClient();
  const { data, error: e } = await supabase.from("comments").select("*").eq("session_id", id).order("created_at");
  if (e) return error(e.message, 500);
  return json({ comments: data });
});

export const POST = handler(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;
  const b = (await req.json()) as { filePath: string; lineStart: number; lineEnd?: number; side?: "new" | "old"; body: string; parentId?: string | null };
  if (!b.filePath || !b.body?.trim() || !Number.isInteger(b.lineStart)) return error("filePath, lineStart and body are required");
  const admin = createAdminClient();
  const { data: member } = await admin.from("session_members").select("display_name").eq("session_id", id).eq("user_id", user.id).single();
  if (!member) return error("not a member", 403);
  const supabase = await createClient();
  const { data, error: e } = await supabase
    .from("comments")
    .insert({ session_id: id, author_id: user.id, author_name: member.display_name ?? user.email ?? "Guest", file_path: b.filePath, line_start: b.lineStart, line_end: b.lineEnd ?? b.lineStart, side: b.side ?? "new", body: b.body.trim(), parent_id: b.parentId ?? null })
    .select("*")
    .single();
  if (e) return error(e.message, 500);
  return json({ comment: data });
});

/** PATCH { ids: string[], status } */
export const PATCH = handler(async (req: Request, { params }: Ctx) => {
  await requireUser();
  const { id } = await params;
  const b = (await req.json()) as { ids: string[]; status: "open" | "addressed" | "resolved" };
  if (!Array.isArray(b.ids) || !["open", "addressed", "resolved"].includes(b.status)) return error("bad request");
  const supabase = await createClient();
  const { error: e } = await supabase.from("comments").update({ status: b.status }).in("id", b.ids).eq("session_id", id);
  if (e) return error(e.message, 500);
  return json({ ok: true });
});
