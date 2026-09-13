"use client";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { PresenceUser } from "@/hooks/usePresence";
import { cn } from "@/lib/utils";

const palette = ["bg-sky-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500", "bg-violet-500", "bg-teal-500", "bg-orange-500"];
export function colorFor(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return palette[h % palette.length];
}

export function PresenceAvatars({ users, size = "sm", max = 4, className }: { users: PresenceUser[]; size?: "sm" | "md"; max?: number; className?: string }) {
  if (!users.length) return null;
  const shown = users.slice(0, max);
  const extra = users.length - shown.length;
  const dim = size === "sm" ? "size-5 text-[10px]" : "size-7 text-xs";
  return (
    <div className={cn("flex -space-x-1.5", className)}>
      {shown.map((u) => (
        <Tooltip key={u.userId}>
          <TooltipTrigger render={<span className={cn("inline-flex items-center justify-center rounded-full ring-2 ring-background font-semibold text-white", dim, colorFor(u.userId))} />}>{u.initials}</TooltipTrigger>
          <TooltipContent side="right">{u.name} · {u.role}</TooltipContent>
        </Tooltip>
      ))}
      {extra > 0 && <span className={cn("inline-flex items-center justify-center rounded-full ring-2 ring-background bg-muted text-muted-foreground font-medium", dim)}>+{extra}</span>}
    </div>
  );
}
