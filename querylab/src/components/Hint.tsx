import type { ComponentProps, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function Keys({ keys }: { keys: string[] }) {
  return (
    <KbdGroup>
      {keys.map((key) => (
        <Kbd key={key}>{key}</Kbd>
      ))}
    </KbdGroup>
  );
}

export function Hint({ label, keys, children }: { label: string; keys?: string[]; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent className="flex items-center gap-2">
        {label}
        {keys && <Keys keys={keys} />}
      </TooltipContent>
    </Tooltip>
  );
}

interface IconActionProps extends Omit<ComponentProps<typeof Button>, "size" | "children"> {
  label: string;
  keys?: string[];
  children: ReactNode;
}

export function IconAction({ label, keys, children, variant = "ghost", ...rest }: IconActionProps) {
  return (
    <Hint label={label} keys={keys}>
      <Button size="iconSm" variant={variant} aria-label={label} {...rest}>
        {children}
      </Button>
    </Hint>
  );
}
