import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const without = <T,>(set: Set<T>, value: T) => {
  const next = new Set(set);
  next.delete(value);
  return next;
};
