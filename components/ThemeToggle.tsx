"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Prevent hydration mismatch — only render after client mount
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="w-9 h-9" />;

  const isDark = theme === "dark";

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={`
        relative flex items-center justify-center w-9 h-9 rounded-xl
        transition-all duration-300 group
        ${isDark
          ? "bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground"
          : "bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground"
        }
      `}
    >
      {/* Sun icon — shown in dark mode (click to go light) */}
      <Sun
        className={`
          absolute w-[1.1rem] h-[1.1rem] text-amber-500
          transition-all duration-300 ease-spring
          ${isDark ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-0 opacity-0"}
        `}
      />
      {/* Moon icon — shown in light mode (click to go dark) */}
      <Moon
        className={`
          absolute w-[1.1rem] h-[1.1rem] text-violet-500
          transition-all duration-300 ease-spring
          ${isDark ? "rotate-90 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100"}
        `}
      />
      <span className="sr-only">{isDark ? "Switch to light mode" : "Switch to dark mode"}</span>
    </button>
  );
}
