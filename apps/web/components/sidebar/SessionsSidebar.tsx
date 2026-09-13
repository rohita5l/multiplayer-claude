"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
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

export function SessionsSidebar({ sessions, me }: { sessions: SessionListItem[]; me: { id: string; email: string | null; name: string; isAnonymous: boolean } }) {
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
          {!me.isAnonymous && <NewSessionButton size="sm" className="w-full justify-start" variant="outline" />}
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
