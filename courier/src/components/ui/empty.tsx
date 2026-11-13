import * as React from "react"

import { cn } from "@/lib/utils"

function Empty({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex h-full min-h-0 flex-col items-start justify-center gap-3 p-6", className)}
      {...props}
    />
  )
}

function EmptyHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex max-w-sm flex-col gap-1", className)} {...props} />
}

function EmptyMedia({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "grid size-6 shrink-0 place-items-center text-muted-foreground [&_svg]:size-5",
        className
      )}
      {...props}
    />
  )
}

function EmptyTitle({ className, ...props }: React.ComponentProps<"p">) {
  return <p className={cn("text-base font-semibold text-foreground", className)} {...props} />
}

function EmptyDescription({ className, ...props }: React.ComponentProps<"p">) {
  return <p className={cn("select-text break-words text-sm text-muted-foreground", className)} {...props} />
}

function EmptyContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-wrap items-center gap-2", className)} {...props} />
}

export { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent }
