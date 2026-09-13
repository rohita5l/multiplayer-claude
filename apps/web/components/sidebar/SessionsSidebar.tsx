"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Settings, AlertTriangle } from "lucide-react";
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarRail } from "@/components/ui/sidebar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NewSessionButton } from "./NewSessionDialog";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { SessionRow } from "./SessionRow";
import { colorFor } from "./PresenceAvatars";
import { usePresenceMap, initialsOf } from "@/hooks/usePresence";
import type { SessionListItem } from "@/lib/sessions";
import { signOut } from "@/app/(auth)/actions";
import { cn } from "@/lib/utils";

export function SessionsSidebar({ sessions, me, keyLast4 }: { sessions: SessionListItem[]; me: { id: string; email: string | null; name: string; isAnonymous: boolean }; keyLast4: string | null }) {
  const pathname = usePathname();
  const activeId = pathname.startsWith("/s/") ? pathname.split("/")[2] : null;
  const presence = usePresenceMap(sessions.map((s) => s.id));
  const mine = sessions.filter((s) => s.owner_id === me.id);
  const shared = sessions.filter((s) => s.owner_id !== me.id);

  return (
    <TooltipProvider delay={200}>
      <Sidebar collapsible="offcanvas">
        <SidebarHeader className="gap-2">
          <Link href="/" className="px-2 pt-1 text-sm font-semibold tracking-tight">Multiplayer Claude</Link>
          {!me.isAnonymous && <NewSessionButton size="sm" className="w-full justify-start" variant="outline" hasKey={Boolean(keyLast4)} />}
        </SidebarHeader>
        <SidebarContent>
          {mine.length > 0 && (
            <SidebarGroup>
              <SidebarGroupLabel>Sessions</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>{mine.map((s) => <SessionRow key={s.id} session={s} active={s.id === activeId} present={presence[s.id] ?? []} isOwner />)}</SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}
          {shared.length > 0 && (
            <SidebarGroup>
              <SidebarGroupLabel>Shared with me</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>{shared.map((s) => <SessionRow key={s.id} session={s} active={s.id === activeId} present={presence[s.id] ?? []} isOwner={false} />)}</SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}
          {sessions.length === 0 && <p className="px-4 py-6 text-xs text-muted-foreground">No sessions yet.</p>}
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            {!me.isAnonymous && (
              <SidebarMenuItem>
                <SidebarMenuButton render={<Link href="/settings/claude" />} size="sm" className={cn("h-auto py-1.5 items-start", keyLast4 ? "text-green-600 dark:text-green-400" : "text-amber-600 dark:text-amber-400")}>
                  <>
                    {keyLast4 ? <span className="mt-1.5 size-2 rounded-full bg-green-500 shrink-0 mx-1" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" />}
                    <span className="min-w-0">
                      <span className="block truncate">{keyLast4 ? "Claude connected" : "Connect your Claude account"}</span>
                      {!keyLast4 && <span className="block text-[11px] font-normal text-muted-foreground">to create new sessions</span>}
                    </span>
                  </>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger render={<SidebarMenuButton size="lg" />}>
                  <>
                    <span className={cn("inline-flex size-7 items-center justify-center rounded-full text-xs font-semibold text-white", colorFor(me.id))}>{initialsOf(me.name)}</span>
                    <span className="flex-1 min-w-0 text-left">
                      <span className="block truncate text-sm">{me.name}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">{me.isAnonymous ? "Guest reviewer" : me.email}</span>
                    </span>
                  </>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top" align="start" className="w-56">
                  {!me.isAnonymous && <DropdownMenuItem render={<Link href="/settings/claude" />}><Settings className="size-4" /> Claude settings</DropdownMenuItem>}
                  {me.isAnonymous && <DropdownMenuItem render={<Link href="/signup" />}>Create an account</DropdownMenuItem>}
                  <DropdownMenuSeparator />
                  <div className="px-1 py-1"><ThemeToggle /></div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => signOut()}><LogOut className="size-4" /> Sign out</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
    </TooltipProvider>
  );
}
