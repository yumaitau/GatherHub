import * as React from "react";
import { Moon, Sun, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";

type ThemeChoice = "light" | "dark" | "system";

const STORAGE_KEY = "gatherhub:theme";

function readChoice(): ThemeChoice {
  if (typeof localStorage === "undefined") return "system";
  const v = localStorage.getItem(STORAGE_KEY);
  return v === "light" || v === "dark" || v === "system" ? v : "system";
}

function systemPrefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

function applyChoice(choice: ThemeChoice): void {
  const root = document.documentElement;
  const useDark = choice === "dark" || (choice === "system" && systemPrefersDark());
  root.classList.toggle("dark", useDark);
}

export function useTheme() {
  const [choice, setChoice] = React.useState<ThemeChoice>(() => readChoice());

  React.useEffect(() => {
    applyChoice(choice);
    if (choice === "system" && typeof window !== "undefined") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = () => applyChoice("system");
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }
    return undefined;
  }, [choice]);

  const update = React.useCallback((next: ThemeChoice) => {
    setChoice(next);
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, next);
    }
  }, []);

  return { choice, setChoice: update };
}

export function ThemeToggle({ className }: { className?: string }) {
  const { choice, setChoice } = useTheme();

  const next: ThemeChoice =
    choice === "light" ? "dark" : choice === "dark" ? "system" : "light";

  const Icon = choice === "dark" ? Moon : choice === "light" ? Sun : Monitor;
  const labelMap: Record<ThemeChoice, string> = {
    light: "Light theme",
    dark: "Dark theme",
    system: "System theme",
  };

  return (
    <button
      type="button"
      onClick={() => setChoice(next)}
      aria-label={`Switch to ${labelMap[next].toLowerCase()}`}
      title={`Theme: ${labelMap[choice]}. Click for ${labelMap[next].toLowerCase()}.`}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center",
        "rounded-sm text-ink-soft hover:text-ink hover:bg-surface-sunk",
        "transition-colors duration-fast ease-out",
        "focus-visible:outline-none focus-visible:shadow-focus",
        className,
      )}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}
