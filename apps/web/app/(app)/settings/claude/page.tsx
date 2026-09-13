import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { getProfile } from "@/lib/sessions";
import { ConnectClaude } from "@/components/settings/ConnectClaude";

export default async function ClaudeSettingsPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const user = await getUser();
  if (!user) redirect("/login");
  const [profile, sp] = await Promise.all([getProfile(user.id), searchParams]);
  return (
    <div className="h-full overflow-auto">
      <div className="max-w-2xl mx-auto p-8">
        <ConnectClaude last4={profile?.anthropic_key_last4 ?? null} validatedAt={profile?.key_validated_at ?? null} welcome={sp.welcome === "1"} />
      </div>
    </div>
  );
}
