import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { listSessions } from "@/lib/sessions";
import { NewSessionButton } from "@/components/sidebar/NewSessionDialog";

export default async function Home() {
  const user = await getUser();
  if (!user) redirect("/login");
  const sessions = await listSessions();
  return (
    <div className="h-full flex items-center justify-center p-8">
      <div className="max-w-md text-center space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">{sessions.length ? "Pick a session" : "Start your first session"}</h1>
        <p className="text-muted-foreground text-sm">
          Each session runs a real Claude Code agent in its own cloud sandbox. Invite reviewers with a link; they see the transcript, the plan, and every file change live, and can comment on any line.
        </p>
        {user.isAnonymous ? (
          <p className="text-sm text-muted-foreground">Sessions shared with you are in the sidebar.</p>
        ) : (
          <div className="flex justify-center">
            <NewSessionButton size="default" />
          </div>
        )}
      </div>
    </div>
  );
}
