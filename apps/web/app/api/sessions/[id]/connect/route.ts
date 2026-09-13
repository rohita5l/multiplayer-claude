import { handler, json, error, requireUser } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlatformCredential } from "@/lib/claude-credential";
import { ensureAgentServer, getSessionSandbox } from "@/lib/sandbox";
import { signTicket } from "@mpc/protocol/ticket";

type Ctx = { params: Promise<{ id: string }> };

/** POST -> ensures the sandbox + agent server are up; returns { wsUrl, ticket, role }. */
export const POST = handler(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;
  const admin = createAdminClient();
  const { data: member } = await admin.from("session_members").select("role, display_name").eq("session_id", id).eq("user_id", user.id).single();
  if (!member) return error("not a member of this session", 403);
  const { data: session } = await admin.from("sessions").select("*").eq("id", id).single();
  if (!session) return error("not found", 404);

  let wsUrl: string;
  let claudeSessionId: string | null = session.claude_session_id;
  try {
    if (!session.sandbox_name) throw new Error("session has no sandbox");
    const sandbox = await getSessionSandbox(session.sandbox_name);
    const r = await ensureAgentServer(sandbox, {
      sessionId: id,
      sessionSecret: session.session_secret,
      anthropicApiKey: getPlatformCredential(),
      claudeSessionId: session.claude_session_id,
    });
    wsUrl = r.url;
    // The agent server also reports its Claude session id here (the sandbox can't always reach the control plane, e.g. localhost).
    if (typeof r.health.claudeSessionId === "string" && r.health.claudeSessionId) claudeSessionId = r.health.claudeSessionId;
  } catch (e) {
    await admin.from("sessions").update({ status: "error" }).eq("id", id);
    return error(`Could not reach the sandbox: ${(e as Error).message}`, 502);
  }
  await admin.from("sessions").update({ ws_url: wsUrl, status: "running", claude_session_id: claudeSessionId, last_active_at: new Date().toISOString() }).eq("id", id);

  const name = member.display_name || user.displayName || user.email || "Guest";
  const ticket = signTicket({ sessionId: id, userId: user.id, name, role: member.role as "owner" | "editor" | "commenter", exp: Math.floor(Date.now() / 1000) + 6 * 3600 }, session.session_secret);
  return json({ wsUrl: wsUrl.replace(/^http/, "ws") + "/ws", ticket, role: member.role, name });
});
