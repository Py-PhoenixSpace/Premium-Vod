import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Detect if user is likely from India based on timezone and locale.
 */
export function detectIsIndianUser(): boolean {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    if (tz.startsWith("Asia/Kolkata") || tz.startsWith("Asia/Calcutta")) return true;

    const locale = navigator.language || "";
    if (locale.startsWith("hi") || locale.startsWith("en-IN")) return true;

    return false;
  } catch {
    return false;
  }
}
