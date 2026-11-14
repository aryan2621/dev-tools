import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { copyWithToast } from "../lib/notify";

export interface CellValue {
  column: string;
  value: string | null;
}

function pretty(value: string) {
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null ? JSON.stringify(parsed, null, 2) : value;
  } catch {
    return value;
  }
}

export function CellViewer({ cell, onClose }: { cell: CellValue | null; onClose: () => void }) {
  const text = cell?.value == null ? "NULL" : pretty(cell.value);
  return (
    <Sheet open={cell !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="flex w-[min(520px,100vw)] flex-col gap-0 p-0 sm:max-w-[520px]">
        <SheetHeader className="space-y-0.5 border-b border-border p-4 pr-12">
          <SheetTitle className="font-mono text-base">{cell?.column}</SheetTitle>
          <SheetDescription>{cell?.value == null ? "NULL" : `${cell.value.length.toLocaleString()} characters`}</SheetDescription>
        </SheetHeader>
        <pre className="min-h-0 flex-1 select-text overflow-auto whitespace-pre-wrap p-4 font-mono text-sm [overflow-wrap:anywhere]">{text}</pre>
        <div className="border-t border-border p-3">
          <Button variant="outline" disabled={cell?.value == null} onClick={() => copyWithToast(text, "Copied value")}>
            <Copy />
            Copy
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
