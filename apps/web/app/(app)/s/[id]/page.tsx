import { notFound, redirect } from "next/navigation";
import { getUser, createClient } from "@/lib/supabase/server";
import { SessionWorkspace } from "@/components/session/SessionWorkspace";

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getUser();
  if (!user) redirect(`/login?next=/s/${id}`);
  const supabase = await createClient();
  const { data: session } = await supabase.from("session_public").select("*").eq("id", id).maybeSingle();
  if (!session) notFound();
  const { data: member } = await supabase.from("session_members").select("role, display_name").eq("session_id", id).eq("user_id", user.id).maybeSingle();
  return (
    <SessionWorkspace
      session={{ id: session.id, title: session.title, repoUrl: session.repo_url, ownerId: session.owner_id }}
      me={{ id: user.id, name: member?.display_name ?? user.displayName ?? user.email ?? "Guest", role: (member?.role as "owner" | "editor" | "commenter") ?? "commenter" }}
    />
  );
}
