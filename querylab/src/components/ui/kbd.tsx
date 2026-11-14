import * as React from "react"

import { cn } from "@/lib/utils"

function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      className={cn(
        "pointer-events-none inline-flex h-[17px] min-w-[17px] select-none items-center justify-center rounded border border-border/80 bg-muted/70 px-1 font-sans text-xs font-medium leading-none text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

function KbdGroup({ className, ...props }: React.ComponentProps<"span">) {
  return <span className={cn("inline-flex items-center gap-0.5", className)} {...props} />
}

export { Kbd, KbdGroup }
