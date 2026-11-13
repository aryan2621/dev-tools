import type { LucideIcon } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Shortcut } from "./Shortcut";

interface IconActionProps extends Omit<ButtonProps, "children" | "size"> {
  icon: LucideIcon;
  label: string;
  shortcut?: string[];
}

export function IconAction({ icon: Icon, label, shortcut, variant = "ghost", ...rest }: IconActionProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant={variant} size="icon" aria-label={label} {...rest}>
          <Icon aria-hidden="true" />
        </Button>
      </TooltipTrigger>
      <TooltipContent className="flex items-center gap-2">
        {label}
        {shortcut && <Shortcut keys={shortcut} />}
      </TooltipContent>
    </Tooltip>
  );
}
