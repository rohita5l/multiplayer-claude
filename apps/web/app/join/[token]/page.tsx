import { JoinSession } from "@/components/join/JoinSession";
import { getUser } from "@/lib/supabase/server";

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await getUser();
  return (
    <div className="min-h-full flex items-center justify-center p-6 bg-muted/30">
      <JoinSession token={token} signedInAs={user ? { email: user.email, name: user.displayName ?? user.email ?? "", isAnonymous: user.isAnonymous } : null} />
    </div>
  );
}
