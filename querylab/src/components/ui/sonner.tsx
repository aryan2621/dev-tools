import { Toaster as Sonner } from "sonner"

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = (props: ToasterProps) => (
  <Sonner
    theme="system"
    className="toaster group"
    toastOptions={{
      classNames: {
        toast:
          "group toast group-[.toaster]:rounded-lg group-[.toaster]:border-border group-[.toaster]:bg-popover group-[.toaster]:text-base group-[.toaster]:text-popover-foreground group-[.toaster]:shadow-dialog",
        description: "group-[.toast]:text-muted-foreground",
        actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
        cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
      },
    }}
    {...props}
  />
)

export { Toaster }
