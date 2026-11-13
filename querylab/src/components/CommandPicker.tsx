import type { LucideIcon } from "lucide-react";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { Keys } from "./Hint";

export interface PickerItem {
  id: string;
  label: string;
  icon?: LucideIcon;
  keys?: string[];
  detail?: string;
  run: () => void;
}

export interface PickerGroup {
  heading: string;
  items: PickerItem[];
}

interface CommandPickerProps {
  open: boolean;
  title: string;
  placeholder: string;
  groups: PickerGroup[];
  onOpenChange: (open: boolean) => void;
}

export function CommandPicker({ open, title, placeholder, groups, onOpenChange }: CommandPickerProps) {
  const choose = (item: PickerItem) => {
    onOpenChange(false);
    item.run();
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title={title}>
      <CommandInput placeholder={placeholder} aria-label={title} />
      <CommandList>
        <CommandEmpty>No matches.</CommandEmpty>
        {groups
          .filter((group) => group.items.length > 0)
          .map((group, position) => (
            <div key={group.heading}>
              {position > 0 && <CommandSeparator />}
              <CommandGroup heading={group.heading}>
                {group.items.map((item) => (
                  <CommandItem key={item.id} value={item.id} keywords={[item.label, item.detail ?? ""]} onSelect={() => choose(item)}>
                    {item.icon && <item.icon aria-hidden className="text-muted-foreground" />}
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.detail && <span className="truncate text-[11px] text-muted-foreground">{item.detail}</span>}
                    {item.keys && <Keys keys={item.keys} />}
                  </CommandItem>
                ))}
              </CommandGroup>
            </div>
          ))}
      </CommandList>
      <div className="flex items-center gap-4 border-t bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Keys keys={["↑", "↓"]} /> Navigate
        </span>
        <span className="flex items-center gap-1.5">
          <Keys keys={["↵"]} /> Select
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          <Keys keys={["esc"]} /> Close
        </span>
      </div>
    </CommandDialog>
  );
}
