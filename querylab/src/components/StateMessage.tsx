import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface StateMessageProps {
  icon?: LucideIcon;
  iconClassName?: string;
  title: string;
  hint?: ReactNode;
  className?: string;
  children?: ReactNode;
}

export function StateMessage({ icon: Icon, iconClassName, title, hint, className, children }: StateMessageProps) {
  return (
    <div role="status" className={cn("flex h-full flex-col items-start justify-center gap-1 p-4", className)}>
      {Icon && (
        <span className="mb-2 grid size-8 place-items-center rounded-md border bg-card text-muted-foreground">
          <Icon aria-hidden className={cn("size-4", iconClassName)} />
        </span>
      )}
      <p className="font-medium">{title}</p>
      {hint && <div className="max-w-md text-sm text-muted-foreground">{hint}</div>}
      {children && <div className="mt-2">{children}</div>}
    </div>
  );
}
