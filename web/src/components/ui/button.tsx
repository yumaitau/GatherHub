import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap",
    "rounded-sm font-semi text-body",
    "tracking-[-0.003em]",
    "transition-[background-color,border-color,color,box-shadow]",
    "duration-fast ease-out",
    "focus-visible:outline-none focus-visible:shadow-focus",
    "disabled:cursor-not-allowed disabled:opacity-60",
    "[&_svg]:size-4 [&_svg]:shrink-0",
  ].join(" "),
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-active disabled:bg-border-strong disabled:text-ink-quiet",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 active:bg-destructive/80 disabled:bg-border-strong disabled:text-ink-quiet",
        outline:
          "border border-border bg-surface text-ink hover:bg-surface-sunk hover:border-border-strong active:bg-surface-sunk disabled:text-ink-quiet",
        secondary:
          "bg-surface-sunk text-ink hover:bg-surface-sunk/70 active:bg-surface-sunk disabled:text-ink-quiet",
        ghost:
          "bg-transparent text-ink-soft hover:bg-surface-sunk hover:text-ink active:bg-surface-sunk disabled:text-ink-quiet",
        link: "h-auto px-0 py-0 text-primary underline-offset-4 hover:underline focus-visible:shadow-focus rounded-xs",
      },
      size: {
        default: "h-9 px-3.5",
        sm: "h-8 px-3 text-caption",
        lg: "h-10 px-5",
        icon: "h-9 w-9 px-0",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
