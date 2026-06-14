import * as React from "react";
import { sanitizeHtml } from "@/lib/richtext";
import { cn } from "@/lib/utils";

/**
 * Renders sanitized post HTML. Sanitization happens here (not just at write
 * time) so any stored markup is safe regardless of how it got there.
 */
export function RichText({
  html,
  className,
}: {
  html: string;
  className?: string;
}) {
  const clean = React.useMemo(() => sanitizeHtml(html), [html]);
  return (
    <div
      className={cn("rich-text", className)}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
