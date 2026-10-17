// Small shared presentational pieces for the dashboard window (the same set Murmur uses).
import type { ReactNode } from 'react';
import icon from '../assets/wall-icon.svg';
import { cn } from '../lib/utils';

/** Wall's app icon: clay bricks, full-bleed like the bundle icon, rounded here like macOS does. */
export function AppIcon({ className }: { className?: string }) {
  return <img src={icon} alt="" draggable={false} className={cn('rounded-[24%]', className)} />;
}

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-[6px] border border-b-2 border-border bg-card px-1.5 font-sans text-[11px] font-medium text-foreground/80',
        className,
      )}
    >
      {children}
    </kbd>
  );
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-8 flex items-end justify-between gap-6">
      <div>
        {eyebrow && <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{eyebrow}</div>}
        <h1 className="font-display text-[44px] font-medium leading-[0.95] tracking-[-0.02em]">{title}</h1>
        {description && <p className="mt-3 max-w-xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions}
    </header>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 mt-10 flex items-center justify-between">
      <h2 className="text-[13px] font-semibold tracking-tight">{children}</h2>
      {action}
    </div>
  );
}

/** Rounded card surface used across pages (hairline edge, soft lift). */
export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('rounded-2xl border bg-card shadow-lift', className)}>{children}</div>;
}

export function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="px-6 py-14 text-center">
      <div className="font-display text-2xl font-medium">{title}</div>
      <p className="mt-1 text-sm text-muted-foreground">{children}</p>
    </div>
  );
}
