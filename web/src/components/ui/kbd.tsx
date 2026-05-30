import * as React from "react";
import { cn } from "@/lib/utils";

// Keyboard chip. Used in command palette trigger, sidebar shortcut hints,
// menu items. Mono-ish weight at body size, hairline border.
export const Kbd = React.forwardRef<
  HTMLElement,
  React.HTMLAttributes<HTMLElement>
>(({ className, ...props }, ref) => (
  <kbd
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center min-w-[20px] h-[20px] px-1.5",
      "rounded-xs border border-hairline bg-paper",
      "text-label text-ink-quiet",
      "font-sans tracking-[0.02em]",
      className,
    )}
    {...props}
  />
));
Kbd.displayName = "Kbd";
