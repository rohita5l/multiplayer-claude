"use client";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <ToggleGroup value={[theme ?? "dark"]} onValueChange={(v) => { const next = v[v.length - 1]; if (next) setTheme(String(next)); }} className="w-full justify-between" aria-label="Theme">
      <ToggleGroupItem value="light" aria-label="Light" className="flex-1"><Sun className="size-4" /></ToggleGroupItem>
      <ToggleGroupItem value="dark" aria-label="Dark" className="flex-1"><Moon className="size-4" /></ToggleGroupItem>
      <ToggleGroupItem value="system" aria-label="System" className="flex-1"><Monitor className="size-4" /></ToggleGroupItem>
    </ToggleGroup>
  );
}
