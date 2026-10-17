import { Toaster as Sonner } from 'sonner';
import { useSettings, isDark } from '../../stores/settings';

export function Toaster() {
  const theme = useSettings((s) => s.theme);
  return (
    <Sonner
      theme={isDark(theme) ? 'dark' : 'light'}
      position="bottom-right"
      duration={1800}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-popover group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:rounded-xl group-[.toaster]:shadow-[0_12px_32px_-8px_hsl(var(--foreground)/0.18)] group-[.toaster]:font-sans',
          description: 'group-[.toast]:text-muted-foreground',
        },
      }}
    />
  );
}
