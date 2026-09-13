"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/** Signup is gated: either the invite code, or a valid email invite link for this email. */
async function signupAllowed(email: string, code: string, next: string): Promise<string | null> {
  const required = process.env.SIGNUP_INVITE_CODE;
  if (!required) return null; // gate disabled
  if (code && code.trim() === required) return null;
  const m = next.match(/^\/join\/([A-Za-z0-9_-]+)$/);
  if (m) {
    const { data } = await createAdminClient().rpc("invite_info", { p_token: m[1] });
    const row = Array.isArray(data) ? data[0] : data;
    if (row && !row.expired && row.email && row.email.toLowerCase() === email.toLowerCase()) return null;
    return "This invite link doesn't match that email. Sign up with the invited address.";
  }
  return "An invite code is required to create an account.";
}

export type AuthResult = { error?: string };

export async function signIn(_prev: AuthResult, formData: FormData): Promise<AuthResult> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/");
  const supabase = await createClient();
  await supabase.auth.signOut().catch(() => {}); // allow switching accounts from an invite
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: /invalid login credentials/i.test(error.message) ? "No user found with that email and password. Check both, or sign up." : error.message };
  redirect(next.startsWith("/") ? next : "/");
}

export async function signUp(_prev: AuthResult, formData: FormData): Promise<AuthResult> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const displayName = String(formData.get("displayName") ?? "").trim();
  const next = String(formData.get("next") ?? "");
  const code = String(formData.get("inviteCode") ?? "");
  if (password.length < 8) return { error: "Password must be at least 8 characters." };
  const denied = await signupAllowed(email, code, next);
  if (denied) return { error: denied };
  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({ email, password, options: { data: { display_name: displayName || email.split("@")[0] } } });
  if (error) return { error: error.message };
  // Invited users go straight to the session; new authors connect Claude first.
  redirect(next.startsWith("/join/") ? next : "/settings/claude?welcome=1");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
