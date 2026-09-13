import "server-only";
import { createClient } from "./supabase/server";
export { repoShort } from "./repo";

export interface SessionListItem {
  id: string;
  owner_id: string;
  title: string;
  repo_url: string;
  status: string;
  has_claude_session: boolean;
  created_at: string;
  last_active_at: string;
  session_members: { user_id: string; role: string; display_name: string | null }[];
}

export async function listSessions(): Promise<SessionListItem[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("session_public").select("*, session_members(user_id, role, display_name)").order("last_active_at", { ascending: false });
  return (data ?? []) as SessionListItem[];
}

export async function getProfile(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("profile_public").select("*").eq("id", userId).maybeSingle();
  return data as { id: string; email: string | null; display_name: string | null; anthropic_key_last4: string | null; key_validated_at: string | null } | null;
}

