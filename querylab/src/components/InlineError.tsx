import { CircleAlert } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface InlineErrorProps {
  message: string;
  onRetry?: () => void;
  className?: string;
}

export function InlineError({ message, onRetry, className }: InlineErrorProps) {
  return (
    <Alert variant="destructive" className={cn("max-h-48 overflow-auto", className)}>
      <CircleAlert aria-hidden />
      <AlertDescription className="flex items-start gap-2">
        <pre className="min-w-0 flex-1 cursor-text select-text whitespace-pre-wrap [overflow-wrap:anywhere]">{message}</pre>
        {onRetry && (
          <Button size="sm" variant="outline" className="shrink-0 bg-background text-foreground" onClick={onRetry}>
            Retry
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
