import { cn } from "@/lib/utils";
import type { Method } from "@/types";

interface MethodTone {
  badge: string;
  text: string;
  dot: string;
}

const TONES: Record<string, MethodTone> = {
  GET: {
    badge: "border-method-get/25 bg-method-get/10 text-method-get",
    text: "text-method-get",
    dot: "bg-method-get",
  },
  POST: {
    badge: "border-method-post/25 bg-method-post/10 text-method-post",
    text: "text-method-post",
    dot: "bg-method-post",
  },
  PUT: {
    badge: "border-method-put/25 bg-method-put/10 text-method-put",
    text: "text-method-put",
    dot: "bg-method-put",
  },
  PATCH: {
    badge: "border-method-patch/25 bg-method-patch/10 text-method-patch",
    text: "text-method-patch",
    dot: "bg-method-patch",
  },
  DELETE: {
    badge: "border-method-delete/25 bg-method-delete/10 text-method-delete",
    text: "text-method-delete",
    dot: "bg-method-delete",
  },
  HEAD: {
    badge: "border-method-head/25 bg-method-head/10 text-method-head",
    text: "text-method-head",
    dot: "bg-method-head",
  },
  OPTIONS: {
    badge: "border-method-options/25 bg-method-options/10 text-method-options",
    text: "text-method-options",
    dot: "bg-method-options",
  },
};

const FALLBACK: MethodTone = {
  badge: "border-border bg-muted text-muted-foreground",
  text: "text-muted-foreground",
  dot: "bg-muted-foreground",
};

export const methodTone = (method: Method | string): MethodTone => TONES[method.toUpperCase()] ?? FALLBACK;

interface MethodBadgeProps {
  method: Method | string;
  size?: "xs" | "sm";
  className?: string;
}

export function MethodBadge({ method, size = "xs", className }: MethodBadgeProps) {
  const tone = methodTone(method);
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center font-mono font-semibold uppercase leading-none tracking-wide",
        size === "xs" ? "min-w-[38px] text-xs" : "min-w-[46px] text-sm",
        tone.text,
        className,
      )}
    >
      {method}
    </span>
  );
}
