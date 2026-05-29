import * as React from "react";
import QRCode from "qrcode";

/** Build the public lookup URL encoded in an asset's QR code. */
export function assetTagUrl(tagId: string): string {
  const base = (
    import.meta.env.VITE_PUBLIC_APP_URL || window.location.origin
  ).replace(/\/$/, "");
  return `${base}/a/${tagId}`;
}

/**
 * Renders a QR code for the given value as an <img>. The QR encodes only the
 * opaque lookup URL — never private asset data. See /docs/kittrace.md.
 */
export function QrCode({
  value,
  size = 192,
  className,
}: {
  value: string;
  size?: number;
  className?: string;
}) {
  const [dataUrl, setDataUrl] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(value, { width: size, margin: 1 })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  if (error) {
    return <p className="text-sm text-destructive">QR error: {error}</p>;
  }
  if (!dataUrl) {
    return (
      <div
        className="animate-pulse rounded bg-muted"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <img
      src={dataUrl}
      width={size}
      height={size}
      alt="Asset QR code"
      className={className}
    />
  );
}
