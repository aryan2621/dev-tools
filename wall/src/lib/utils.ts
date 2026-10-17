import { type ClassValue, clsx } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// `text-app-*` are font sizes (tailwind.config.js); without this, twMerge treats them as colors and
// drops e.g. `text-primary-foreground`, leaving button labels invisible.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['app-caption', 'app-label', 'app-body', 'app-title', 'app-heading', 'app-page', 'app-display'] }],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
