import { Check, ChevronsUpDown, Settings2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Command, CommandGroup, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useCourier } from "@/store";

export function EnvironmentSwitcher({ onManage }: { onManage: () => void }) {
  const { environments, activeEnvironment, setActiveEnvironmentId } = useCourier();
  const [open, setOpen] = useState(false);

  const choose = (id: string | null) => {
    setActiveEnvironmentId(id);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          aria-label={`Environment: ${activeEnvironment?.name ?? "No environment"}`}
          className="h-8 max-w-52 shrink-0 gap-1.5 border-border bg-background/70 pl-2 pr-1.5 text-muted-foreground shadow-none hover:text-foreground"
        >
          <span
            aria-hidden="true"
            className={cn("size-1.5 shrink-0 rounded-full", activeEnvironment ? "bg-success" : "bg-muted-foreground/40")}
          />
          <span className="truncate">{activeEnvironment?.name ?? "No environment"}</span>
          <ChevronsUpDown aria-hidden="true" className="size-3.5 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60 p-0">
        <Command>
          <div className="flex items-baseline justify-between border-b px-3 py-2">
            <p className="text-xs font-semibold text-muted-foreground">Environment</p>
            <span className="text-xs tabular-nums text-muted-foreground/70">{environments.length}</span>
          </div>
          <CommandList>
            <CommandGroup>
              <CommandItem onSelect={() => choose(null)}>
                <Check aria-hidden="true" className={cn("size-4", activeEnvironment ? "opacity-0" : "text-primary-ink")} />
                <span className="text-muted-foreground">No environment</span>
              </CommandItem>
              {environments.map((environment) => (
                <CommandItem key={environment.id} onSelect={() => choose(environment.id)}>
                  <Check
                    aria-hidden="true"
                    className={cn("size-4", activeEnvironment?.id === environment.id ? "text-primary-ink" : "opacity-0")}
                  />
                  <span className="truncate">{environment.name}</span>
                  {activeEnvironment?.id === environment.id && (
                    <span className="ml-auto font-mono text-xs text-muted-foreground">
                      {environment.variables.filter((variable) => variable.enabled && variable.key).length}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup>
              <CommandItem
                onSelect={() => {
                  setOpen(false);
                  onManage();
                }}
              >
                <Settings2 aria-hidden="true" />
                Manage environments
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
