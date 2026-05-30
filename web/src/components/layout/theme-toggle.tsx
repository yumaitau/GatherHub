/* eslint-disable react-refresh/only-export-components */
import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

type ThemeChoice = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

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

function resolve(choice: ThemeChoice): ResolvedTheme {
  if (choice === "dark") return "dark";
  if (choice === "light") return "light";
  return systemPrefersDark() ? "dark" : "light";
}

function applyResolved(resolved: ResolvedTheme): void {
  document.documentElement.classList.toggle("dark", resolved === "dark");
}

export function useTheme() {
  const [choice, setChoice] = React.useState<ThemeChoice>(() => readChoice());
  const [resolved, setResolved] = React.useState<ResolvedTheme>(() =>
    resolve(readChoice()),
  );

  React.useEffect(() => {
    const r = resolve(choice);
    setResolved(r);
    applyResolved(r);
    if (choice === "system" && typeof window !== "undefined") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = () => {
        const next = systemPrefersDark() ? "dark" : "light";
        setResolved(next);
        applyResolved(next);
      };
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

  return { choice, resolved, setChoice: update };
}

export function ThemeToggle({ className }: { className?: string }) {
  const { resolved, setChoice } = useTheme();

  // Binary flip based on what's currently rendered, not on the stored choice.
  // Previously the cycle was light → dark → system → light, which produced a
  // no-op-looking click when "system" happened to resolve to the same theme.
  const nextResolved: ResolvedTheme = resolved === "dark" ? "light" : "dark";
  const Icon = resolved === "dark" ? Moon : Sun;

  return (
    <button
      type="button"
      onClick={() => setChoice(nextResolved)}
      aria-label={`Switch to ${nextResolved} theme`}
      title={`Switch to ${nextResolved} theme`}
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
