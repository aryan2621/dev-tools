import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "./cn";

/** A panel that slides in from the right (from localboard's ui/sheet). */
const Sheet = DialogPrimitive.Root;

const SheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { width?: "md" | "lg" | "xl" }
>(({ className, children, width = "md", ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/25 data-[state=open]:animate-overlay-in data-[state=closed]:animate-overlay-out" />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed inset-y-0 right-0 z-50 flex h-full w-full flex-col border-0 border-l border-solid border-border bg-popover text-foreground shadow-lg outline-none data-[state=open]:animate-sheet-in data-[state=closed]:animate-sheet-out",
        width === "xl" ? "max-w-4xl" : width === "lg" ? "max-w-2xl" : "max-w-md",
        className,
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 cursor-pointer rounded-md border-0 bg-transparent p-1 text-muted-foreground transition-colors duration-fast hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
SheetContent.displayName = "SheetContent";

function SheetHeader({ title, description }: { title: React.ReactNode; description?: React.ReactNode }) {
  return (
    <div className="space-y-1 border-0 border-b border-solid border-border px-6 pb-4 pr-12 pt-5">
      <DialogPrimitive.Title className="m-0 text-[17px] font-semibold text-foreground">{title}</DialogPrimitive.Title>
      <DialogPrimitive.Description className={description ? "m-0 text-[12.5px] text-muted-foreground" : "sr-only"}>
        {description ?? "Details"}
      </DialogPrimitive.Description>
    </div>
  );
}

function SheetBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5", className)} {...props} />;
}

function SheetFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex items-center justify-end gap-2 border-0 border-t border-solid border-border px-6 py-3", className)}
      {...props}
    />
  );
}

export { Sheet, SheetContent, SheetHeader, SheetBody, SheetFooter };
