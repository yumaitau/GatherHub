import * as React from "react";
import { cn } from "@/lib/utils";

// Surface fill, hairline border. Focus lifts border to accent + adds focus ring.
// Error tints border to danger, not background.
const baseInput = [
  "flex w-full rounded-sm border border-hairline bg-surface",
  "px-2.5 text-body text-ink",
  "placeholder:text-ink-quiet",
  "transition-[border-color,box-shadow,background-color]",
  "duration-fast ease-out",
  "hover:border-border-strong",
  "focus-visible:outline-none focus-visible:border-primary focus-visible:shadow-focus",
  "disabled:cursor-not-allowed disabled:bg-surface-sunk disabled:text-ink-quiet",
  "aria-[invalid=true]:border-danger aria-[invalid=true]:focus-visible:border-danger",
  "file:border-0 file:bg-transparent file:text-body file:font-semi",
].join(" ");

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      className={cn(baseInput, "h-[34px]", className)}
      ref={ref}
      {...props}
    />
  ),
);
Input.displayName = "Input";

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    className={cn(baseInput, "min-h-[88px] py-2 leading-[1.375rem]", className)}
    ref={ref}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export { Input, Textarea };
