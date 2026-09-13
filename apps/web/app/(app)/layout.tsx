import { redirect } from "next/navigation";
import { after } from "next/server";
import { prewarm } from "@/lib/pool";
import { getUser } from "@/lib/supabase/server";
import { getProfile, listSessions } from "@/lib/sessions";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { SessionsSidebar } from "@/components/sidebar/SessionsSidebar";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  if (!user) redirect("/login");
  const [sessions, profile] = await Promise.all([listSessions(), getProfile(user.id)]);
  if (!user.isAnonymous && profile?.anthropic_key_last4) after(() => prewarm()); // keep one sandbox pre-booted
  return (
    <SidebarProvider className="h-full">
      <SessionsSidebar
        sessions={sessions}
        me={{ id: user.id, email: user.email, name: profile?.display_name ?? user.displayName ?? user.email ?? "Guest", isAnonymous: user.isAnonymous }}
        keyLast4={profile?.anthropic_key_last4 ?? null}
      />
      <SidebarInset className="h-full min-h-0 overflow-hidden">{children}</SidebarInset>
    </SidebarProvider>
  );
}
