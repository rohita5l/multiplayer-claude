"use client";
import { useEffect, useState } from "react";
import { createRealtimeClient } from "@/lib/supabase/client";

import type { Role } from "@mpc/protocol";
export interface PresenceUser { userId: string; name: string; initials: string; role: Role }

export function initialsOf(name: string | null | undefined): string {
  const n = (name ?? "").trim();
  if (!n) return "?";
  const parts = n.split(/[\s@._-]+/).filter(Boolean);
  return (parts.length >= 2 ? parts[0][0] + parts[1][0] : n.slice(0, 2)).toUpperCase();
}

function channelName(sessionId: string) { return `presence:session:${sessionId}`; }

/** Announce yourself in a session (call from the session page). */
export function useTrackPresence(sessionId: string, me: PresenceUser | null) {
  useEffect(() => {
    if (!me) return;
    const supabase = createRealtimeClient();
    const ch = supabase.channel(channelName(sessionId), { config: { presence: { key: me.userId } } });
    ch.subscribe(async (status) => { if (status === "SUBSCRIBED") await ch.track({ ...me, online_at: new Date().toISOString() }); });
    return () => { void ch.untrack(); supabase.removeChannel(ch); supabase.realtime.disconnect(); };
  }, [sessionId, me?.userId, me?.name, me?.role]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Live presence for many sessions at once (sidebar). Returns { [sessionId]: PresenceUser[] } */
export function usePresenceMap(sessionIds: string[]) {
  const [map, setMap] = useState<Record<string, PresenceUser[]>>({});
  const key = sessionIds.slice().sort().join(",");
  useEffect(() => {
    const supabase = createRealtimeClient();
    const channels = sessionIds.map((id) => {
      const ch = supabase.channel(channelName(id));
      ch.on("presence", { event: "sync" }, () => {
        const state = ch.presenceState<PresenceUser>();
        const users = Object.values(state).map((arr) => arr[0]).filter(Boolean).map((u) => ({ userId: u.userId, name: u.name, initials: u.initials, role: u.role }));
        setMap((m) => ({ ...m, [id]: users }));
      }).subscribe();
      return ch;
    });
    return () => { channels.forEach((ch) => supabase.removeChannel(ch)); supabase.realtime.disconnect(); };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return map;
}
