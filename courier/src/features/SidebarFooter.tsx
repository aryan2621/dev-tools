import { Command, Settings, Sparkles } from "lucide-react";
import { IconAction } from "@/components/IconAction";
import { cn } from "@/lib/utils";
import { modSymbol } from "@/platform";

interface SidebarFooterProps {
  assistantOpen: boolean;
  onAssistant: () => void;
  onSettings: () => void;
  onPalette: () => void;
}

export function SidebarFooter({ assistantOpen, onAssistant, onSettings, onPalette }: SidebarFooterProps) {
  return (
    <div role="toolbar" aria-label="Workspace tools" className="flex shrink-0 items-center gap-0.5 border-t border-border px-2 py-1.5">
      <IconAction icon={Sparkles} label="Assistant" shortcut={[modSymbol, "J"]} aria-pressed={assistantOpen} onClick={onAssistant} className={cn(assistantOpen && "bg-accent")} />
      <IconAction icon={Command} label="Command palette" shortcut={[modSymbol, "K"]} onClick={onPalette} />
      <IconAction icon={Settings} label="Settings" onClick={onSettings} className="ml-auto" />
    </div>
  );
}
