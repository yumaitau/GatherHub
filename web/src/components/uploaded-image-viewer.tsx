import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ExternalLink, Maximize2, X } from "lucide-react";
import { cn } from "@/lib/utils";

type UploadedImageViewerProps = {
  src: string;
  alt: string;
  title?: string;
  className?: string;
  imageClassName?: string;
  fit?: "contain" | "cover";
};

export function UploadedImageViewer({
  src,
  alt,
  title,
  className,
  imageClassName,
  fit = "contain",
}: UploadedImageViewerProps) {
  const label = title || alt || "Uploaded image";
  return (
    <DialogPrimitive.Root>
      <DialogPrimitive.Trigger asChild>
        <button
          type="button"
          aria-label={`View ${label} full screen`}
          className={cn(
            "group relative overflow-hidden rounded-xs border border-hairline bg-paper",
            "transition-colors duration-fast ease-out hover:border-border-strong",
            "focus-visible:outline-none focus-visible:shadow-focus",
            className,
          )}
        >
          <img
            src={src}
            alt={alt}
            className={cn(
              "h-full w-full bg-paper",
              fit === "cover" ? "object-cover" : "object-contain",
              imageClassName,
            )}
          />
          <span
            className={cn(
              "absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center",
              "rounded-sm border border-hairline bg-paper/95 text-ink-soft shadow-popover",
              "opacity-0 transition-opacity duration-fast ease-out",
              "group-hover:opacity-100 group-focus-visible:opacity-100",
            )}
            aria-hidden="true"
          >
            <Maximize2 className="h-4 w-4" />
          </span>
        </button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            "fixed inset-0 z-50 bg-ink-strong/90",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "duration-base ease-out",
          )}
        />
        <DialogPrimitive.Content
          className={cn(
            "fixed inset-0 z-50 grid grid-rows-[auto_minmax(0,1fr)]",
            "text-white focus:outline-none",
          )}
        >
          <div className="flex min-w-0 items-center justify-between gap-3 border-b border-white/15 px-4 py-3 sm:px-5">
            <div className="min-w-0">
              <DialogPrimitive.Title className="truncate text-body-strong text-white">
                {label}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="sr-only">
                Full-screen image viewer.
              </DialogPrimitive.Description>
            </div>
            <div className="flex items-center gap-1.5">
              <a
                href={src}
                target="_blank"
                rel="noreferrer"
                title="Open image in a new tab"
                className={cn(
                  "inline-flex h-9 w-9 items-center justify-center rounded-sm",
                  "text-white/80 hover:bg-white/10 hover:text-white",
                  "focus-visible:outline-none focus-visible:shadow-focus",
                )}
              >
                <ExternalLink className="h-4 w-4" />
                <span className="sr-only">Open image in a new tab</span>
              </a>
              <DialogPrimitive.Close
                title="Close"
                className={cn(
                  "inline-flex h-9 w-9 items-center justify-center rounded-sm",
                  "text-white/80 hover:bg-white/10 hover:text-white",
                  "focus-visible:outline-none focus-visible:shadow-focus",
                )}
              >
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </DialogPrimitive.Close>
            </div>
          </div>
          <div className="min-h-0 overflow-auto px-4 py-5 sm:px-6 sm:py-6">
            <div className="flex min-h-full items-center justify-center">
              <div className="inline-flex max-w-full items-center justify-center rounded-sm bg-paper p-3 sm:p-4">
                <img
                  src={src}
                  alt={alt}
                  className="h-auto max-h-[calc(100vh-8rem)] max-w-full object-contain"
                />
              </div>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
