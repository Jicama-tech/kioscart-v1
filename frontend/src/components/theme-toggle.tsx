import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// The ghost variant hovers to `bg-accent`, which in this theme is red in light
// mode and purple in dark — nothing to do with the brand. Primary is the only
// colour this control should ever show, so the hover is pinned to it here.
// twMerge resolves the conflict in favour of these, and a caller's className
// still wins over both.
const HOVER = "hover:bg-primary/10 hover:text-primary focus-visible:text-primary";

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Stable-sized placeholder until mounted, so the first paint never shows the
  // wrong icon before the system theme resolves.
  if (!mounted) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className={cn(HOVER, className)}
        disabled
        aria-hidden
      />
    );
  }

  const isDark = resolvedTheme === "dark";

  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn(HOVER, className)}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Switch to light theme" : "Switch to dark theme"}
    >
      {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
    </Button>
  );
}
