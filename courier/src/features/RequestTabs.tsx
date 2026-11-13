import { Plus, X } from "lucide-react";
import { IconAction } from "@/components/IconAction";
import { MethodBadge } from "@/components/MethodBadge";
import { cn } from "@/lib/utils";
import { modSymbol } from "@/platform";
import { useCourier } from "@/store";

export function RequestTabs() {
  const { openRequests, selected, select, closeTab, startRequest } = useCourier();
  return (
    <div data-tauri-drag-region className="flex min-w-0 flex-1 items-center gap-1 self-stretch">
      <ul
        aria-label="Open requests"
        className="m-0 flex min-w-0 list-none items-center gap-0.5 overflow-x-auto p-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {openRequests.map((request) => {
          const active = selected?.id === request.id;
          const label = request.name.replace(/^https?:\/\/(www\.)?/, "");
          return (
            <li
              key={request.id}
              className={cn(
                "group flex h-8 max-w-48 shrink-0 items-center rounded-md border transition-colors duration-75",
                active
                  ? "border-border bg-background text-foreground"
                  : "border-transparent text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <button
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() => select(request.id)}
                className="flex h-full min-w-0 items-center gap-1.5 pl-1.5 pr-0.5 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <MethodBadge method={request.method} className="min-w-0" />
                <span className="truncate text-sm">{label}</span>
              </button>
              <IconAction
                icon={X}
                label={`Close ${request.name}`}
                onClick={() => closeTab(request.id)}
                className={cn(
                  "mr-0.5 size-5 shrink-0 text-muted-foreground opacity-0 hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100",
                  active && "opacity-60",
                )}
              />
            </li>
          );
        })}
      </ul>
      <IconAction icon={Plus} label="New request" shortcut={[modSymbol, "N"]} onClick={startRequest} className="ml-0.5 shrink-0" />
    </div>
  );
}
