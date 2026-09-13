import { handler, json, error, requireUser } from "@/lib/api";
import { encrypt } from "@/lib/crypto";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST { apiKey } -> validates against Anthropic, stores encrypted.
 * Accepts a Claude Code long-lived token from `claude setup-token` (sk-ant-oat01-…) or an API key (sk-ant-api03-…).
 */
export function isOAuthToken(key: string) {
  return key.startsWith("sk-ant-oat");
}
export const POST = handler(async (req: Request) => {
  const user = await requireUser();
  const { apiKey } = (await req.json()) as { apiKey?: string };
  const key = (apiKey ?? "").trim();
  if (!key.startsWith("sk-ant-")) return error("That doesn't look like a Claude token (they start with sk-ant-).");

  const oauth = isOAuthToken(key);
  const r = await fetch("https://api.anthropic.com/v1/models?limit=1", {
    headers: oauth
      ? { authorization: `Bearer ${key}`, "anthropic-beta": "oauth-2025-04-20", "anthropic-version": "2023-06-01" }
      : { "x-api-key": key, "anthropic-version": "2023-06-01" },
    cache: "no-store",
  });
  if (r.status === 401) return error(oauth ? "Anthropic rejected this token. Run `claude setup-token` again and paste the whole thing." : "Anthropic rejected this key. Double-check you copied the whole key.", 400);
  // OAuth tokens may not be scoped for /v1/models; only a 401 is a definite rejection for them.
  if (!oauth && !r.ok) return error(`Could not validate key (Anthropic returned ${r.status}). Try again.`, 502);

  const admin = createAdminClient();
  const { error: dbErr } = await admin.from("profiles").upsert({
    id: user.id,
    email: user.email,
    anthropic_key_ciphertext: encrypt(key),
    anthropic_key_last4: key.slice(-4),
    key_validated_at: new Date().toISOString(),
  });
  if (dbErr) return error(dbErr.message, 500);
  return json({ ok: true, last4: key.slice(-4), kind: oauth ? "oauth" : "api_key" });
});

export const DELETE = handler(async () => {
  const user = await requireUser();
  const admin = createAdminClient();
  await admin.from("profiles").update({ anthropic_key_ciphertext: null, anthropic_key_last4: null, key_validated_at: null }).eq("id", user.id);
  return json({ ok: true });
});
