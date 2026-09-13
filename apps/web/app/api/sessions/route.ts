import { randomBytes } from "node:crypto";
import { handler, json, error, requireUser } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/crypto";
import { after } from "next/server";
import { createSessionSandbox, ensureAgentServer, getSessionSandbox } from "@/lib/sandbox";
import { claimWarmSandbox, prewarm } from "@/lib/pool";
import { env } from "@/lib/env";
import { randomSessionName } from "@/lib/names";

export const GET = handler(async () => {
  await requireUser();
  const supabase = await createClient();
  const { data, error: e } = await supabase
    .from("session_public")
    .select("*, session_members(user_id, role, display_name)")
    .order("last_active_at", { ascending: false });
  if (e) return error(e.message, 500);
  return json({ sessions: data });
});

/** POST { title?, repoUrl? } -> creates the DB row + sandbox and boots the agent server. */
export const POST = handler(async (req: Request) => {
  const user = await requireUser();
  if (user.isAnonymous) return error("Reviewers can't create sessions. Sign up to start your own.", 403);
  const body = (await req.json().catch(() => ({}))) as { title?: string; repoUrl?: string };
  const repoUrl = (body.repoUrl?.trim() || env.demoRepo()).replace(/\.git$/, "");
  if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/.test(repoUrl)) return error("Repo must be a public GitHub URL like https://github.com/org/repo");

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("anthropic_key_ciphertext, display_name, email").eq("id", user.id).single();
  if (!profile?.anthropic_key_ciphertext) return error("Connect your Anthropic API key first.", 412);

  const secret = randomBytes(32).toString("base64url");
  const { data: session, error: insErr } = await admin
    .from("sessions")
    .insert({ owner_id: user.id, title: body.title?.trim() || randomSessionName(), repo_url: repoUrl, session_secret: secret, status: "creating" })
    .select("*")
    .single();
  if (insErr || !session) return error(insErr?.message ?? "insert failed", 500);
  await admin.from("session_members").insert({ session_id: session.id, user_id: user.id, role: "owner", display_name: profile.display_name ?? profile.email ?? "Owner" });

  try {
    // Fast path: a pre-booted sandbox from the warm pool (same snapshot/repo). Fallback: cold boot from snapshot.
    const warm = repoUrl === env.demoRepo() ? await claimWarmSandbox() : null;
    const name = warm ?? `mpc-${session.id}`;
    const sandbox = warm ? await getSessionSandbox(warm) : await createSessionSandbox(name, repoUrl);
    const { url } = await ensureAgentServer(sandbox, { sessionId: session.id, sessionSecret: secret, anthropicApiKey: decrypt(profile.anthropic_key_ciphertext) });
    await admin.from("sessions").update({ sandbox_name: name, ws_url: url, status: "running", last_active_at: new Date().toISOString() }).eq("id", session.id);
    after(() => prewarm()); // refill the pool after responding
  } catch (e) {
    await admin.from("sessions").update({ status: "error" }).eq("id", session.id);
    return error(`Sandbox failed to start: ${(e as Error).message}`, 502);
  }
  return json({ id: session.id });
});
